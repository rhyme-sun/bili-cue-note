import type { AppErrorCode } from '../../shared/types';

export type SessionStatus = 'idle' | 'loading-transcript' | 'summarizing' | 'ready' | 'error';

export type PanelView = 'chat' | 'summary' | 'transcript';

export interface PanelError {
  message: string;
  code?: AppErrorCode;
}
