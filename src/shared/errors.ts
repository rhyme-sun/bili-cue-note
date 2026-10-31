import type { AppErrorCode } from './types';

const MESSAGES: Record<AppErrorCode, string> = {
  LOGIN_REQUIRED: '请先登录 B 站，再生成摘要。',
  NO_SUBTITLE:
    '该视频没有可用字幕。可能是 UP 主未开启 AI 字幕，或视频本身没有字幕轨；若 AI 字幕仍在生成，请稍后再试。',
  SUBTITLE_GENERATING: 'B 站正在生成该视频的 AI 字幕，请稍后再试。',
  RISK_CONTROL: 'B 站风控拦截了请求，已重试 2 次，请稍后再试。',
  NETWORK: '网络请求失败，请检查网络后重试。',
  LLM_AUTH: 'API Key 无效或无权访问该模型，请检查设置。',
  LLM_QUOTA: '账户余额不足或额度用尽。',
  LLM_RATE_LIMIT: '请求过于频繁，请稍后再试。',
  LLM_ERROR: '模型调用失败。',
  NO_SETTINGS: '请先在设置页填写 Base URL、API Key 和模型。',
  CANCELLED: '已取消。',
  UNKNOWN: '发生未知错误。',
};

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
  }
}

export function errorMessage(code: AppErrorCode, detail?: string): string {
  if (code === 'LLM_ERROR' && detail) return `${MESSAGES[code]}${detail}`;
  return MESSAGES[code];
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    if (/API key|unauthorized|401|403/i.test(error.message)) return new AppError('LLM_AUTH');
    if (/429|rate limit/i.test(error.message)) return new AppError('LLM_RATE_LIMIT');
    if (/402|quota|balance/i.test(error.message)) return new AppError('LLM_QUOTA');
    return new AppError('UNKNOWN', error.message);
  }
  return new AppError('UNKNOWN');
}
