import SparkMD5 from 'spark-md5';
import { isPlayerApi, parseBvid, parsePageNumber } from '../shared/bilibili';
import { MAX_RETRIES } from '../shared/constants';
import type {
  ContentToMainMessage,
  MainToContentMessage,
  PageEntry,
  PagelistResponse,
  PlayerV2Response,
  VideoContext,
} from '../shared/types';

declare global {
  interface Window {
    __BILI_BRIEF_INJECTED__?: boolean;
    __INITIAL_STATE__?: InitialState;
  }
}

interface InitialState {
  bvid?: string;
  aid?: number;
  cid?: number;
  p?: number;
  videoData?: {
    bvid?: string;
    aid?: number;
    cid?: number;
    p?: number;
    title?: string;
    duration?: number;
    pages?: PageEntry[];
  };
}

const SOURCE_MAIN = 'bili-cue-note-main';
const SOURCE_CONTENT = 'bili-cue-note-content';

const playerDataByCid = new Map<number, { url: string; data: PlayerV2Response }>();

function post(message: MainToContentMessage): void {
  window.postMessage(message, '*');
}

function parseCidFromUrl(url: string): number | null {
  try {
    const parsed = new URL(url, location.href);
    const value = Number(parsed.searchParams.get('cid'));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function capturePlayerData(url: string, data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const response = data as PlayerV2Response;
  if (typeof response.code !== 'number') return;
  const cid = parseCidFromUrl(url);
  if (cid !== null) {
    playerDataByCid.set(cid, { url, data: response });
    if (playerDataByCid.size > 10) {
      const oldest = playerDataByCid.keys().next().value;
      if (oldest !== undefined) playerDataByCid.delete(oldest);
    }
  }
  post({ source: SOURCE_MAIN, type: 'player-data', url, data: response });
}

function installFetchHook(): void {
  const originalFetch = window.fetch;
  window.fetch = function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const promise = originalFetch.call(window, input, init);
    if (isPlayerApi(url)) {
      promise
        .then((response) => {
          response
            .clone()
            .json()
            .then((data: unknown) => capturePlayerData(url, data))
            .catch(() => undefined);
        })
        .catch(() => undefined);
    }
    return promise;
  } as typeof fetch;
}

function installXhrHook(): void {
  type PatchedXhr = XMLHttpRequest & { __bbUrl?: string };
  const proto = XMLHttpRequest.prototype as unknown as {
    open: (method: string, url: string | URL, ...args: unknown[]) => void;
    send: (...args: unknown[]) => void;
  };
  const originalOpen = proto.open;
  const originalSend = proto.send;

  proto.open = function patchedOpen(
    this: PatchedXhr,
    method: string,
    url: string | URL,
    ...args: unknown[]
  ): void {
    this.__bbUrl = typeof url === 'string' ? url : url.href;
    originalOpen.call(this, method, url, ...args);
  };

  proto.send = function patchedSend(this: PatchedXhr, ...args: unknown[]): void {
    this.addEventListener('load', () => {
      const url = this.__bbUrl ?? '';
      if (!isPlayerApi(url)) return;
      try {
        const raw: unknown = this.responseType === 'json' ? this.response : this.responseText;
        capturePlayerData(url, typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw);
      } catch {
        // Ignore non-JSON responses.
      }
    });
    originalSend.call(this, ...args);
  };
}

function readVideoContext(): VideoContext | null {
  const state = window.__INITIAL_STATE__;
  const url = location.href;
  const bvid = state?.bvid ?? state?.videoData?.bvid ?? parseBvid(url);
  if (!bvid) return null;

  const p = state?.p ?? state?.videoData?.p ?? parsePageNumber(url);
  const pages = state?.videoData?.pages;
  const currentPage = pages?.find((page) => page.page === p) ?? pages?.[0];
  const cid = state?.videoData?.cid ?? state?.cid ?? currentPage?.cid;
  if (!cid) return null;

  const rawTitle = state?.videoData?.title ?? document.title;
  const title = rawTitle.replace(/_哔哩哔哩_bilibili$/i, '').trim();
  const duration =
    currentPage?.duration ??
    (typeof state?.videoData?.duration === 'number' ? state.videoData.duration : 0);

  return {
    bvid,
    aid: state?.aid ?? state?.videoData?.aid,
    cid,
    p,
    title,
    duration,
    url,
  };
}

function postVideoContext(): void {
  post({ source: SOURCE_MAIN, type: 'video-context', context: readVideoContext() });
}

let contextRetries = 0;

function tryPostVideoContext(): void {
  const context = readVideoContext();
  if (context) {
    post({ source: SOURCE_MAIN, type: 'video-context', context });
    contextRetries = 0;
    return;
  }
  if (contextRetries < 20) {
    contextRetries += 1;
    window.setTimeout(tryPostVideoContext, 250);
  }
}

let routeTimer: number | undefined;

function queueRouteChange(): void {
  if (routeTimer !== undefined) window.clearTimeout(routeTimer);
  routeTimer = window.setTimeout(() => {
    post({ source: SOURCE_MAIN, type: 'route-change', url: location.href });
    tryPostVideoContext();
    window.setTimeout(tryPostVideoContext, 800);
  }, 120);
}

function installRouteHook(): void {
  const originalPush = history.pushState.bind(history);
  const originalReplace = history.replaceState.bind(history);
  history.pushState = function patchedPushState(...args: Parameters<History['pushState']>): void {
    originalPush(...args);
    queueRouteChange();
  };
  history.replaceState = function patchedReplaceState(
    ...args: Parameters<History['replaceState']>
  ): void {
    originalReplace(...args);
    queueRouteChange();
  };
  window.addEventListener('popstate', queueRouteChange);
}

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

let wbiKeys: { imgKey: string; subKey: string } | null = null;
let wbiKeysExpireAt = 0;

function extractKey(url: string): string {
  const filename = url.split('/').pop() ?? '';
  return filename.split('.')[0] ?? '';
}

async function getWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  if (wbiKeys && Date.now() < wbiKeysExpireAt) return wbiKeys;
  const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    credentials: 'include',
  });
  if (response.status === 412) throw new Error('B 站风控拦截（412）');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = (await response.json()) as {
    data?: { wbi_img?: { img_url?: string; sub_url?: string } };
  };
  const imgUrl = json.data?.wbi_img?.img_url ?? '';
  const subUrl = json.data?.wbi_img?.sub_url ?? '';
  const imgKey = extractKey(imgUrl);
  const subKey = extractKey(subUrl);
  if (!imgKey || !subKey) throw new Error('无法获取 B 站 WBI 签名密钥');
  wbiKeys = { imgKey, subKey };
  wbiKeysExpireAt = Date.now() + 30 * 60 * 1000;
  return wbiKeys;
}

function getMixinKey(original: string): string {
  return MIXIN_KEY_ENC_TAB.map((index) => original[index] ?? '')
    .join('')
    .slice(0, 32);
}

function encodeParams(params: Record<string, string | number>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&');
}

async function signWbi(params: Record<string, string | number>): Promise<string> {
  const { imgKey, subKey } = await getWbiKeys();
  const mixinKey = getMixinKey(imgKey + subKey);
  const wts = Math.round(Date.now() / 1000);
  const query = encodeParams({ ...params, wts });
  const wRid = SparkMD5.hash(query + mixinKey);
  return `${query}&w_rid=${wRid}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchPlayer(bvid: string, cid: number): Promise<PlayerV2Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const query = await signWbi({ bvid, cid });
      const response = await fetch(`https://api.bilibili.com/x/player/wbi/v2?${query}`, {
        credentials: 'include',
      });
      if (response.status === 412) {
        lastError = new Error('B 站风控拦截（412）');
        if (attempt < MAX_RETRIES) {
          await sleep(1_000 * (attempt + 1));
          continue;
        }
        throw lastError;
      }
      const json = (await response.json()) as PlayerV2Response;
      if (json.code === -352) {
        lastError = new Error('B 站风控拦截（-352）');
        if (attempt < MAX_RETRIES) {
          await sleep(1_000 * (attempt + 1));
          continue;
        }
        throw lastError;
      }
      return json;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= MAX_RETRIES) break;
      await sleep(1_000 * (attempt + 1));
    }
  }
  throw lastError ?? new Error('获取播放器信息失败');
}

async function fetchPagelist(bvid: string): Promise<PagelistResponse> {
  const response = await fetch(
    `https://api.bilibili.com/x/player/pagelist?bvid=${encodeURIComponent(bvid)}`,
    { credentials: 'include' },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as PagelistResponse;
}

function postFetchResult(requestId: string, ok: boolean, data?: unknown, error?: string): void {
  post({ source: SOURCE_MAIN, type: 'fetch-result', requestId, ok, data, error });
}

async function handleContentMessage(message: ContentToMainMessage): Promise<void> {
  switch (message.type) {
    case 'request-player-data': {
      for (const entry of playerDataByCid.values()) {
        post({ source: SOURCE_MAIN, type: 'player-data', url: entry.url, data: entry.data });
      }
      return;
    }
    case 'request-video-context': {
      postVideoContext();
      return;
    }
    case 'fetch-player': {
      try {
        const data = await fetchPlayer(message.bvid, message.cid);
        postFetchResult(message.requestId, true, data);
      } catch (error) {
        postFetchResult(
          message.requestId,
          false,
          undefined,
          error instanceof Error ? error.message : String(error),
        );
      }
      return;
    }
    case 'fetch-pagelist': {
      try {
        const data = await fetchPagelist(message.bvid);
        postFetchResult(message.requestId, true, data);
      } catch (error) {
        postFetchResult(
          message.requestId,
          false,
          undefined,
          error instanceof Error ? error.message : String(error),
        );
      }
      return;
    }
    case 'fetch-subtitle': {
      try {
        const response = await fetch(message.url, { credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        postFetchResult(message.requestId, true, await response.text());
      } catch (error) {
        postFetchResult(
          message.requestId,
          false,
          undefined,
          error instanceof Error ? error.message : String(error),
        );
      }
      return;
    }
    default:
      return;
  }
}

function installContentBridge(): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const message = event.data as ContentToMainMessage | undefined;
    if (!message || message.source !== SOURCE_CONTENT) return;
    void handleContentMessage(message);
  });
}

function boot(): void {
  if (window.__BILI_BRIEF_INJECTED__) return;
  window.__BILI_BRIEF_INJECTED__ = true;

  installFetchHook();
  installXhrHook();
  installRouteHook();
  installContentBridge();

  post({ source: SOURCE_MAIN, type: 'ready' });
  tryPostVideoContext();
  window.setTimeout(tryPostVideoContext, 1_000);
  window.setTimeout(tryPostVideoContext, 2_500);
}

boot();
