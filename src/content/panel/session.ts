import {
  normalizeSubtitle,
  pickSubtitleInfo,
  sanitizeSubtitleUrl,
  selectSubtitleTracks,
} from '../../shared/bilibili';
import { PROMPT_VERSION } from '../../shared/constants';
import { AppError } from '../../shared/errors';
import { newRequestId, sendBackground } from '../../shared/messaging';
import type {
  ChatMessage,
  LlmEvent,
  LlmProgress,
  LlmRequest,
  OutputLanguage,
  Settings,
  StoredSummary,
  SummaryLength,
  Transcript,
  VideoContext,
} from '../../shared/types';
import type { PageBridge } from '../bridge';

export async function getCachedTranscript(cid: number): Promise<Transcript | null> {
  const response = await sendBackground<Transcript | null>({ type: 'db-get-transcript', cid });
  return response.ok ? (response.data ?? null) : null;
}

function mapPlayerError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);
  if (/412|-352|风控/.test(message)) return new AppError('RISK_CONTROL');
  if (/登录|need_login/i.test(message)) return new AppError('LOGIN_REQUIRED');
  if (/超时|timeout|通信/.test(message)) return new AppError('NETWORK', message);
  return new AppError('NETWORK', message);
}

function playerDataError(code: number): AppError {
  if (code === -352 || code === -412) return new AppError('RISK_CONTROL');
  if (code === -101) return new AppError('LOGIN_REQUIRED');
  return new AppError('NETWORK', `播放器接口返回错误码 ${code}`);
}

export async function acquireTranscript(
  bridge: PageBridge,
  video: VideoContext,
): Promise<Transcript> {
  const cached = await getCachedTranscript(video.cid);
  if (cached) return cached;

  let fromPassive = true;
  let player = bridge.getPlayerData(video.cid);
  if (!player) {
    fromPassive = false;
    try {
      player = await bridge.fetchPlayer(video.bvid, video.cid);
    } catch (error) {
      throw mapPlayerError(error);
    }
  }

  if (player.code !== 0) throw playerDataError(player.code);

  let subtitles = player.data?.subtitle?.subtitles ?? [];
  let { usable, generating } = selectSubtitleTracks(subtitles);

  // Captured data can be stale (e.g. the player fetched it before AI subtitles
  // finished). Refetch once so a valid subtitle_url is not missed.
  if (usable.length === 0 && fromPassive) {
    try {
      const fresh = await bridge.fetchPlayer(video.bvid, video.cid);
      if (fresh.code === 0) {
        player = fresh;
        subtitles = fresh.data?.subtitle?.subtitles ?? [];
        ({ usable, generating } = selectSubtitleTracks(subtitles));
      }
    } catch (error) {
      const mapped = mapPlayerError(error);
      if (mapped.code === 'RISK_CONTROL') throw mapped;
    }
  }

  if (subtitles.length === 0) {
    if (player.data?.need_login_subtitle) throw new AppError('LOGIN_REQUIRED');
    throw new AppError('NO_SUBTITLE');
  }

  if (usable.length === 0) {
    if (generating) throw new AppError('SUBTITLE_GENERATING');
    throw new AppError('NO_SUBTITLE');
  }

  const track = pickSubtitleInfo(usable);
  if (!track) throw new AppError('NO_SUBTITLE');

  const url = sanitizeSubtitleUrl(track.subtitle_url);
  let response = await sendBackground<string>({ type: 'fetch-subtitle-json', url });
  if (!response.ok) {
    try {
      const text = await bridge.fetchSubtitleJson(url);
      response = { ok: true, data: text };
    } catch {
      // Keep the original background error below.
    }
  }
  if (!response.ok) {
    throw new AppError(response.code ?? 'NETWORK', response.error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.data ?? '');
  } catch {
    throw new AppError('NO_SUBTITLE', '字幕文件解析失败。');
  }

  const lines = normalizeSubtitle(parsed);
  if (lines.length === 0) throw new AppError('NO_SUBTITLE');

  const transcript: Transcript = {
    cid: video.cid,
    bvid: video.bvid,
    title: video.title,
    duration: video.duration,
    lines,
    source: fromPassive ? 'player' : 'active',
    fetchedAt: Date.now(),
  };

  await sendBackground({ type: 'db-put-transcript', transcript });
  return transcript;
}

export function summaryCacheKey(
  cid: number,
  settings: Settings,
  length: SummaryLength,
  language: OutputLanguage,
): string {
  return [cid, settings.model, PROMPT_VERSION, length, language].join(':');
}

export async function getCachedSummary(key: string): Promise<StoredSummary | null> {
  const response = await sendBackground<StoredSummary | null>({ type: 'db-get-summary', key });
  return response.ok ? (response.data ?? null) : null;
}

export async function saveSummary(key: string, value: StoredSummary): Promise<void> {
  await sendBackground({ type: 'db-put-summary', key, value });
}

export async function deleteSummary(key: string): Promise<void> {
  await sendBackground({ type: 'db-delete-summary', key });
}

export async function getChatHistory(cid: number): Promise<ChatMessage[]> {
  const response = await sendBackground<ChatMessage[]>({ type: 'db-get-chat', cid });
  return response.ok ? (response.data ?? []) : [];
}

export async function saveChatHistory(cid: number, messages: ChatMessage[]): Promise<void> {
  await sendBackground({ type: 'db-put-chat', cid, messages });
}

export interface LlmStreamCallbacks {
  onDelta?: (text: string) => void;
  onProgress?: (progress: LlmProgress) => void;
}

export interface LlmStream {
  promise: Promise<Extract<LlmEvent, { type: 'done' }>>;
  cancel: () => void;
}

type LlmStartRequest =
  | Omit<Extract<LlmRequest, { type: 'summarize' }>, 'requestId'>
  | Omit<Extract<LlmRequest, { type: 'chat' }>, 'requestId'>;

export function startLlm(request: LlmStartRequest, callbacks: LlmStreamCallbacks): LlmStream {
  const requestId = newRequestId();
  let settled = false;
  let rejectFn: (error: Error) => void = () => undefined;
  let port: chrome.runtime.Port | null = null;

  const promise = new Promise<Extract<LlmEvent, { type: 'done' }>>((resolve, reject) => {
    rejectFn = reject;
    try {
      port = chrome.runtime.connect({ name: 'llm' });
    } catch {
      settled = true;
      reject(new AppError('UNKNOWN', '无法连接后台，请刷新页面或重新加载扩展。'));
      return;
    }

    port.onMessage.addListener((event: LlmEvent) => {
      if (event.requestId !== requestId) return;
      switch (event.type) {
        case 'delta':
          callbacks.onDelta?.(event.text);
          return;
        case 'progress':
          callbacks.onProgress?.({
            stage: event.stage,
            index: event.index,
            total: event.total,
          });
          return;
        case 'done':
          if (settled) return;
          settled = true;
          try {
            port?.disconnect();
          } catch {
            // ignore
          }
          resolve(event);
          return;
        case 'error':
          if (settled) return;
          settled = true;
          try {
            port?.disconnect();
          } catch {
            // ignore
          }
          reject(new AppError(event.code, event.message));
          return;
        default:
          return;
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      settled = true;
      reject(new AppError('UNKNOWN', '与后台的连接中断，请重试。'));
    });

    port.postMessage({ ...request, requestId });
  });

  const cancel = (): void => {
    if (settled) return;
    settled = true;
    try {
      port?.postMessage({ type: 'cancel', requestId });
      port?.disconnect();
    } catch {
      // ignore
    }
    rejectFn(new AppError('CANCELLED'));
  };

  return { promise, cancel };
}

export function openOptions(): void {
  void sendBackground({ type: 'open-options' });
}

const PLAYER_VIDEO_SELECTORS = [
  '.bpx-player-video-wrap video',
  '.bilibili-player-video video',
  '#bilibili-player video',
  '.bwp-video video',
];

export function getVideoElement(): HTMLVideoElement | null {
  for (const selector of PLAYER_VIDEO_SELECTORS) {
    const video = document.querySelector<HTMLVideoElement>(selector);
    if (video) return video;
  }

  const videos = Array.from(document.querySelectorAll('video'));
  let best: HTMLVideoElement | null = null;
  let bestScore = -1;
  for (const video of videos) {
    const rect = video.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 ? 1_000_000 : 0;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const score = visible + duration;
    if (score > bestScore) {
      best = video;
      bestScore = score;
    }
  }
  return best;
}

export function seekTo(seconds: number): void {
  const video = getVideoElement();
  if (!video) return;

  const target = Math.max(0, seconds);
  const apply = (): void => {
    try {
      video.currentTime = target;
      // Match Bilibili's own timestamp behaviour: seek and resume playback.
      if (video.paused) void video.play().catch(() => undefined);
      video.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {
      // ignore
    }
  };

  if (video.readyState === 0) {
    video.addEventListener('loadedmetadata', apply, { once: true });
  } else {
    apply();
  }
}

export function downloadText(
  filename: string,
  content: string,
  mime = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function safeFileName(title: string, bvid: string, extension: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `BiliCueNote_${cleaned || bvid}_${bvid}.${extension}`;
}
