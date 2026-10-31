import { newRequestId } from '../shared/messaging';
import type {
  ContentToMainMessage,
  MainToContentMessage,
  PagelistResponse,
  PlayerV2Response,
  VideoContext,
} from '../shared/types';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
};

function cidFromUrl(url: string): number | null {
  try {
    const parsed = new URL(url, location.href);
    const value = Number(parsed.searchParams.get('cid'));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export class PageBridge {
  private readonly pending = new Map<string, Pending>();
  private readonly playerDataByCid = new Map<number, PlayerV2Response>();
  private readonly playerDataListeners = new Set<
    (data: PlayerV2Response, cid: number | null) => void
  >();
  private readonly contextListeners = new Set<(context: VideoContext | null) => void>();
  private readonly routeListeners = new Set<(url: string) => void>();
  private lastContext: VideoContext | null = null;
  private destroyed = false;

  constructor() {
    window.addEventListener('message', this.onMessage);
    this.requestSnapshot();
    window.setTimeout(() => this.requestSnapshot(), 600);
    window.setTimeout(() => this.requestSnapshot(), 1_800);
  }

  private requestSnapshot(): void {
    if (this.destroyed) return;
    this.post({ source: 'bili-cue-note-content', type: 'request-video-context' });
    this.post({ source: 'bili-cue-note-content', type: 'request-player-data' });
  }

  private post(message: ContentToMainMessage): void {
    window.postMessage(message, '*');
  }

  private onMessage = (event: MessageEvent): void => {
    if (event.source !== window) return;
    const message = event.data as MainToContentMessage | undefined;
    if (!message || message.source !== 'bili-cue-note-main') return;

    switch (message.type) {
      case 'player-data': {
        const cid = cidFromUrl(message.url);
        if (cid !== null) this.playerDataByCid.set(cid, message.data);
        for (const listener of this.playerDataListeners) listener(message.data, cid);
        return;
      }
      case 'video-context': {
        this.lastContext = message.context;
        for (const listener of this.contextListeners) listener(message.context);
        return;
      }
      case 'route-change': {
        this.playerDataByCid.clear();
        for (const listener of this.routeListeners) listener(message.url);
        window.setTimeout(() => this.requestSnapshot(), 400);
        window.setTimeout(() => this.requestSnapshot(), 1_500);
        return;
      }
      case 'fetch-result': {
        const pending = this.pending.get(message.requestId);
        if (!pending) return;
        window.clearTimeout(pending.timer);
        this.pending.delete(message.requestId);
        if (message.ok) pending.resolve(message.data);
        else pending.reject(new Error(message.error ?? '页面请求失败'));
        return;
      }
      default:
        return;
    }
  };

  getPlayerData(cid: number): PlayerV2Response | undefined {
    return this.playerDataByCid.get(cid);
  }

  getLastContext(): VideoContext | null {
    return this.lastContext;
  }

  requestVideoContext(): void {
    this.post({ source: 'bili-cue-note-content', type: 'request-video-context' });
  }

  fetchPlayer(bvid: string, cid: number, timeoutMs = 25_000): Promise<PlayerV2Response> {
    const requestId = newRequestId();
    const message: ContentToMainMessage = {
      source: 'bili-cue-note-content',
      type: 'fetch-player',
      requestId,
      bvid,
      cid,
    };
    return this.request<PlayerV2Response>(message, timeoutMs);
  }

  fetchPagelist(bvid: string, timeoutMs = 10_000): Promise<PagelistResponse> {
    const requestId = newRequestId();
    const message: ContentToMainMessage = {
      source: 'bili-cue-note-content',
      type: 'fetch-pagelist',
      requestId,
      bvid,
    };
    return this.request<PagelistResponse>(message, timeoutMs);
  }

  fetchSubtitleJson(url: string, timeoutMs = 20_000): Promise<string> {
    const requestId = newRequestId();
    const message: ContentToMainMessage = {
      source: 'bili-cue-note-content',
      type: 'fetch-subtitle',
      requestId,
      url,
    };
    return this.request<string>(message, timeoutMs);
  }

  private request<T>(
    message: Extract<ContentToMainMessage, { requestId: string }>,
    timeoutMs: number,
  ): Promise<T> {
    const requestId = message.requestId;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('与页面通信超时，请刷新页面后重试。'));
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.post(message);
    });
  }

  onPlayerData(listener: (data: PlayerV2Response, cid: number | null) => void): () => void {
    this.playerDataListeners.add(listener);
    return () => this.playerDataListeners.delete(listener);
  }

  onContext(listener: (context: VideoContext | null) => void): () => void {
    this.contextListeners.add(listener);
    return () => this.contextListeners.delete(listener);
  }

  onRouteChange(listener: (url: string) => void): () => void {
    this.routeListeners.add(listener);
    return () => this.routeListeners.delete(listener);
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('message', this.onMessage);
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error('页面桥已关闭'));
    }
    this.pending.clear();
    this.playerDataByCid.clear();
    this.playerDataListeners.clear();
    this.contextListeners.clear();
    this.routeListeners.clear();
  }
}
