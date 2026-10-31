import { AppError } from './errors';
import type { LlmMessage } from './prompts';
import type { Settings, Usage } from './types';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface CompletionOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  onDelta?: (delta: string) => void;
}

export interface CompletionResult {
  content: string;
  usage?: Usage;
}

export function configFromSettings(settings: Settings): LlmConfig {
  return {
    baseUrl: settings.baseUrl.trim(),
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim(),
  };
}

function endpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

function normalizeUsage(raw: unknown): Usage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const prompt = Number(record.prompt_tokens ?? 0);
  const completion = Number(record.completion_tokens ?? 0);
  const total = Number(record.total_tokens ?? prompt + completion);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion) || !Number.isFinite(total)) {
    return undefined;
  }
  return { promptTokens: prompt, completionTokens: completion, totalTokens: total };
}

function addUsage(left: Usage | undefined, right: Usage | undefined): Usage | undefined {
  if (!left) return right;
  if (!right) return left;
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function messageContent(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const content = (message as Record<string, unknown>).content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const text = (part as Record<string, unknown>).text;
          if (typeof text === 'string') return text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function combineSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b]);
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (a.aborted || b.aborted) controller.abort();
  else {
    a.addEventListener('abort', abort, { once: true });
    b.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

function httpError(status: number, body: string): AppError {
  if (status === 401 || status === 403) return new AppError('LLM_AUTH');
  if (status === 402) return new AppError('LLM_QUOTA');
  if (status === 429) return new AppError('LLM_RATE_LIMIT');
  const detail = body.replace(/\s+/g, ' ').slice(0, 300);
  return new AppError('LLM_ERROR', `HTTP ${status}${detail ? `：${detail}` : ''}`);
}

function buildPayload(
  config: LlmConfig,
  messages: LlmMessage[],
  stream: boolean,
  options: CompletionOptions,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.3,
    stream,
  };
  if (stream) payload.stream_options = { include_usage: true };
  if (options.maxTokens) payload.max_tokens = options.maxTokens;
  return payload;
}

async function request(
  config: LlmConfig,
  messages: LlmMessage[],
  stream: boolean,
  options: CompletionOptions,
  signal: AbortSignal,
): Promise<Response> {
  const doFetch = (payload: Record<string, unknown>): Promise<Response> =>
    fetch(endpoint(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal,
    });

  try {
    let response = await doFetch(buildPayload(config, messages, stream, options));
    if (!response.ok) {
      let text = await response.text().catch(() => '');
      if (stream && response.status === 400 && /stream_options/i.test(text)) {
        const fallback = buildPayload(config, messages, stream, options);
        delete fallback.stream_options;
        response = await doFetch(fallback);
        if (!response.ok) {
          text = await response.text().catch(() => '');
          throw httpError(response.status, text);
        }
      } else {
        throw httpError(response.status, text);
      }
    }
    return response;
  } catch (error) {
    if (error instanceof AppError || isAbortError(error)) throw error;
    if (error instanceof TypeError) throw new AppError('NETWORK');
    throw new AppError('LLM_ERROR', error instanceof Error ? error.message : undefined);
  }
}

export async function complete(
  config: LlmConfig,
  messages: LlmMessage[],
  options: CompletionOptions = {},
): Promise<CompletionResult> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const signal = combineSignals(options.signal, controller.signal);

  try {
    const response = await request(config, messages, false, options, signal);
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new AppError('LLM_ERROR', '无法解析模型响应。');
    }
    const record = (json ?? {}) as Record<string, unknown>;
    const choices = Array.isArray(record.choices) ? record.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const content = messageContent(first?.message);
    if (!content) throw new AppError('LLM_ERROR', '模型返回了空内容。');
    return { content, usage: normalizeUsage(record.usage) };
  } catch (error) {
    if (isAbortError(error)) {
      if (options.signal?.aborted) throw new AppError('CANCELLED');
      if (timedOut) throw new AppError('LLM_ERROR', '请求超时，请稍后重试。');
      throw new AppError('CANCELLED');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function completeStream(
  config: LlmConfig,
  messages: LlmMessage[],
  options: CompletionOptions = {},
): Promise<CompletionResult> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const signal = combineSignals(options.signal, controller.signal);

  try {
    const response = await request(config, messages, true, options, signal);
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json') && !contentType.includes('event-stream')) {
      const json = (await response.json()) as Record<string, unknown>;
      const choices = Array.isArray(json.choices) ? json.choices : [];
      const first = choices[0] as Record<string, unknown> | undefined;
      const content = messageContent(first?.message);
      if (!content) throw new AppError('LLM_ERROR', '模型返回了空内容。');
      options.onDelta?.(content);
      return { content, usage: normalizeUsage(json.usage) };
    }

    const body = response.body;
    if (!body) throw new AppError('LLM_ERROR', '响应没有可读流。');
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let usage: Usage | undefined;

    const handleData = (data: string): void => {
      if (!data || data === '[DONE]') return;
      try {
        const json = JSON.parse(data) as Record<string, unknown>;
        const choices = Array.isArray(json.choices) ? json.choices : [];
        const first = choices[0] as Record<string, unknown> | undefined;
        const delta = first?.delta as Record<string, unknown> | undefined;
        const text =
          typeof delta?.content === 'string'
            ? delta.content
            : typeof first?.text === 'string'
              ? first.text
              : '';
        if (text) {
          content += text;
          options.onDelta?.(text);
        }
        const nextUsage = normalizeUsage(json.usage);
        if (nextUsage) usage = addUsage(usage, nextUsage);
      } catch {
        // Ignore keep-alive or malformed chunks.
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        handleData(trimmed.slice(5).trim());
      }
    }
    if (buffer.trim().startsWith('data:')) handleData(buffer.trim().slice(5).trim());

    if (!content) throw new AppError('LLM_ERROR', '模型返回了空内容。');
    return { content, usage };
  } catch (error) {
    if (isAbortError(error)) {
      if (options.signal?.aborted) throw new AppError('CANCELLED');
      if (timedOut) throw new AppError('LLM_ERROR', '请求超时，请稍后重试。');
      throw new AppError('CANCELLED');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(config: LlmConfig): Promise<string> {
  const result = await complete(
    config,
    [
      {
        role: 'user',
        content: '只回复两个字：正常。',
      },
    ],
    { maxTokens: 32, temperature: 0, timeoutMs: 30_000 },
  );
  return result.content.trim();
}
