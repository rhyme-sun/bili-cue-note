import {
  clearAll,
  deleteSummary,
  getChat,
  getSummary,
  getTranscript,
  putChat,
  putSummary,
  putTranscript,
} from '../shared/db';
import { AppError, toAppError } from '../shared/errors';
import { configFromSettings, testConnection } from '../shared/llm';
import { getSettings } from '../shared/settings';
import { generateChatAnswer, generateSummary } from '../shared/summary-engine';
import type { BackgroundRequest, BackgroundResponse, LlmEvent, LlmRequest } from '../shared/types';

async function handleMessage(message: BackgroundRequest): Promise<BackgroundResponse> {
  switch (message.type) {
    case 'fetch-subtitle-json': {
      const url = message.url.startsWith('//') ? `https:${message.url}` : message.url;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new AppError('NETWORK', `字幕下载失败：HTTP ${response.status}`);
      }
      return { ok: true, data: await response.text() };
    }
    case 'db-get-transcript':
      return { ok: true, data: await getTranscript(message.cid) };
    case 'db-put-transcript':
      await putTranscript(message.transcript);
      return { ok: true };
    case 'db-get-summary':
      return { ok: true, data: await getSummary(message.key) };
    case 'db-put-summary':
      await putSummary(message.key, message.value);
      return { ok: true };
    case 'db-delete-summary':
      await deleteSummary(message.key);
      return { ok: true };
    case 'db-get-chat':
      return { ok: true, data: await getChat(message.cid) };
    case 'db-put-chat':
      await putChat(message.cid, message.messages);
      return { ok: true };
    case 'db-clear':
      await clearAll();
      return { ok: true };
    case 'open-options':
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    case 'test-llm': {
      const config = configFromSettings(message.settings);
      const text = await testConnection(config);
      return { ok: true, data: text };
    }
    default:
      return { ok: false, error: '未知的后台请求', code: 'UNKNOWN' };
  }
}

chrome.runtime.onMessage.addListener(
  (message: BackgroundRequest, _sender, sendResponse: (response: BackgroundResponse) => void) => {
    void handleMessage(message).then(
      (response) => sendResponse(response),
      (error: unknown) => {
        const appError = toAppError(error);
        sendResponse({ ok: false, error: appError.message, code: appError.code });
      },
    );
    return true;
  },
);

function postEvent(port: chrome.runtime.Port, event: LlmEvent): void {
  try {
    port.postMessage(event);
  } catch {
    // Port closed; the request will be aborted by the disconnect listener.
  }
}

async function handleLlmRequest(
  port: chrome.runtime.Port,
  message: LlmRequest,
  controllers: Map<string, AbortController>,
): Promise<void> {
  if (message.type !== 'summarize' && message.type !== 'chat') return;
  const requestId = message.requestId;
  const controller = new AbortController();
  controllers.set(requestId, controller);

  try {
    const settings = await getSettings();
    if (!settings.baseUrl.trim() || !settings.apiKey.trim() || !settings.model.trim()) {
      throw new AppError('NO_SETTINGS');
    }

    if (message.type === 'summarize') {
      const result = await generateSummary({
        video: message.video,
        transcript: message.transcript,
        settings,
        length: message.length,
        language: message.language,
        callbacks: {
          signal: controller.signal,
          onProgress: (progress) => postEvent(port, { type: 'progress', requestId, ...progress }),
          onDelta: (text) => postEvent(port, { type: 'delta', requestId, text }),
        },
      });
      postEvent(port, {
        type: 'done',
        requestId,
        summary: result.summary,
        usage: result.usage,
      });
      return;
    }

    const result = await generateChatAnswer({
      video: message.video,
      transcript: message.transcript,
      summary: message.summary,
      history: message.history,
      question: message.question,
      settings,
      callbacks: {
        signal: controller.signal,
        onProgress: (progress) => postEvent(port, { type: 'progress', requestId, ...progress }),
        onDelta: (text) => postEvent(port, { type: 'delta', requestId, text }),
      },
    });
    postEvent(port, {
      type: 'done',
      requestId,
      content: result.content,
      usage: result.usage,
    });
  } catch (error) {
    const appError = toAppError(error);
    postEvent(port, {
      type: 'error',
      requestId,
      code: appError.code,
      message: appError.message,
    });
  } finally {
    controllers.delete(requestId);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'llm') return;
  const controllers = new Map<string, AbortController>();

  port.onMessage.addListener((message: LlmRequest) => {
    if (message.type === 'cancel') {
      controllers.get(message.requestId)?.abort();
      controllers.delete(message.requestId);
      return;
    }
    void handleLlmRequest(port, message, controllers);
  });

  port.onDisconnect.addListener(() => {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
  });
});

chrome.action.onClicked.addListener((tab) => {
  void (async () => {
    if (tab.id !== undefined) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' });
        return;
      } catch {
        // Not a supported page, or the content script is not ready.
      }
    }
    await chrome.runtime.openOptionsPage();
  })();
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.runtime.openOptionsPage();
  }
});
