export type SummaryLength = 'short' | 'medium' | 'long';
export type OutputLanguage = 'auto' | 'zh' | 'en' | 'ja' | 'ko';
export type ThemePreference = 'auto' | 'light' | 'dark';

export interface SubtitleInfo {
  id?: number | string;
  lan: string;
  lan_doc?: string;
  subtitle_url: string;
  ai_status?: number;
  ai_type?: number;
}

export interface PlayerV2Data {
  need_login_subtitle?: boolean;
  subtitle?: {
    subtitles?: SubtitleInfo[];
    lan?: string;
    lan_doc?: string;
  };
  login_mid?: number;
  [key: string]: unknown;
}

export interface BiliEnvelope<T> {
  code: number;
  message?: string;
  data: T;
}

export type PlayerV2Response = BiliEnvelope<PlayerV2Data>;

export interface PageEntry {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

export interface PagelistData {
  pages?: PageEntry[];
}

export type PagelistResponse = BiliEnvelope<PagelistData>;

export interface SubtitleLine {
  from: number;
  to: number;
  content: string;
}

export interface Transcript {
  cid: number;
  bvid: string;
  title: string;
  duration: number;
  lines: SubtitleLine[];
  source: 'player' | 'active';
  fetchedAt: number;
}

export interface VideoContext {
  bvid: string;
  aid?: number;
  cid: number;
  p: number;
  title: string;
  duration: number;
  url: string;
}

export interface SummaryChapter {
  start: number;
  title: string;
  summary: string;
}

export interface SummaryTerm {
  term: string;
  explanation: string;
}

export interface VideoSummary {
  overview: string;
  chapters: SummaryChapter[];
  keyPoints: string[];
  terms: SummaryTerm[];
}

export interface Settings {
  baseUrl: string;
  apiKey: string;
  model: string;
  contextWindow: number;
  outputLanguage: OutputLanguage;
  summaryLength: SummaryLength;
  theme: ThemePreference;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface StoredSummary {
  summary: VideoSummary;
  meta: {
    cid: number;
    model: string;
    promptVersion: string;
    length: SummaryLength;
    language: OutputLanguage;
    createdAt: number;
  };
}

export interface StoredChat {
  cid: number;
  messages: ChatMessage[];
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type AppErrorCode =
  | 'LOGIN_REQUIRED'
  | 'NO_SUBTITLE'
  | 'SUBTITLE_GENERATING'
  | 'RISK_CONTROL'
  | 'NETWORK'
  | 'LLM_AUTH'
  | 'LLM_QUOTA'
  | 'LLM_RATE_LIMIT'
  | 'LLM_ERROR'
  | 'NO_SETTINGS'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface LlmProgress {
  stage: 'transcript' | 'map' | 'merge' | 'chat';
  index?: number;
  total?: number;
}

export type MainToContentMessage =
  | { source: 'bili-cue-note-main'; type: 'player-data'; url: string; data: PlayerV2Response }
  | { source: 'bili-cue-note-main'; type: 'video-context'; context: VideoContext | null }
  | { source: 'bili-cue-note-main'; type: 'route-change'; url: string }
  | {
      source: 'bili-cue-note-main';
      type: 'fetch-result';
      requestId: string;
      ok: boolean;
      data?: unknown;
      error?: string;
    }
  | { source: 'bili-cue-note-main'; type: 'ready' };

export type ContentToMainMessage =
  | { source: 'bili-cue-note-content'; type: 'request-player-data' }
  | { source: 'bili-cue-note-content'; type: 'request-video-context' }
  | {
      source: 'bili-cue-note-content';
      type: 'fetch-player';
      requestId: string;
      bvid: string;
      cid: number;
    }
  | { source: 'bili-cue-note-content'; type: 'fetch-pagelist'; requestId: string; bvid: string }
  | { source: 'bili-cue-note-content'; type: 'fetch-subtitle'; requestId: string; url: string };

export type LlmRequest =
  | {
      type: 'summarize';
      requestId: string;
      video: VideoContext;
      transcript: Transcript;
      length: SummaryLength;
      language: OutputLanguage;
    }
  | {
      type: 'chat';
      requestId: string;
      video: VideoContext;
      transcript: Transcript;
      summary: VideoSummary | null;
      history: ChatMessage[];
      question: string;
    }
  | { type: 'cancel'; requestId: string };

export type LlmEvent =
  | { type: 'delta'; requestId: string; text: string }
  | ({ type: 'progress'; requestId: string } & LlmProgress)
  | {
      type: 'done';
      requestId: string;
      summary?: VideoSummary;
      content?: string;
      usage?: Usage;
    }
  | { type: 'error'; requestId: string; code: AppErrorCode; message: string };

export type BackgroundRequest =
  | { type: 'fetch-subtitle-json'; url: string }
  | { type: 'db-get-transcript'; cid: number }
  | { type: 'db-put-transcript'; transcript: Transcript }
  | { type: 'db-get-summary'; key: string }
  | { type: 'db-put-summary'; key: string; value: StoredSummary }
  | { type: 'db-delete-summary'; key: string }
  | { type: 'db-get-chat'; cid: number }
  | { type: 'db-put-chat'; cid: number; messages: ChatMessage[] }
  | { type: 'db-clear' }
  | { type: 'open-options' }
  | { type: 'test-llm'; settings: Settings };

export type BackgroundResponse<T = unknown> =
  { ok: true; data?: T } | { ok: false; error: string; code?: AppErrorCode };
