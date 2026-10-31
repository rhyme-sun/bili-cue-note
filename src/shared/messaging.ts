import type { BackgroundRequest, BackgroundResponse } from './types';

export async function sendBackground<T = unknown>(
  message: BackgroundRequest,
): Promise<BackgroundResponse<T>> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as
      BackgroundResponse<T> | undefined;
    if (!response) {
      return { ok: false, error: '后台没有响应', code: 'UNKNOWN' };
    }
    return response;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    return { ok: false, error: text, code: 'UNKNOWN' };
  }
}

export function newRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
