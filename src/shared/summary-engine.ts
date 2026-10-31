import {
  estimateTokens,
  extractTimestamps,
  fallbackSummary,
  linesAroundTimestamps,
  mergeSubtitleLines,
  parseSummaryJson,
  retrieveLines,
  splitTranscriptByChars,
  transcriptToChatPromptText,
  transcriptToPromptText,
} from './bilibili';
import { OUTPUT_RESERVE_TOKENS, SUMMARY_CONTEXT_RATIO } from './constants';
import { AppError } from './errors';
import { complete, completeStream, configFromSettings } from './llm';
import {
  buildChatMessages,
  buildChunkSummaryMessages,
  buildMergeMessages,
  buildSummaryMessages,
} from './prompts';
import type {
  ChatMessage,
  LlmProgress,
  OutputLanguage,
  Settings,
  SubtitleLine,
  SummaryLength,
  Transcript,
  Usage,
  VideoContext,
  VideoSummary,
} from './types';

export interface EngineCallbacks {
  onProgress?: (progress: LlmProgress) => void;
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface SummaryResult {
  summary: VideoSummary;
  usage?: Usage;
}

export interface ChatResult {
  content: string;
  usage?: Usage;
}

function contextWindowOf(settings: Settings): number {
  return Number.isFinite(settings.contextWindow) && settings.contextWindow > 0
    ? settings.contextWindow
    : 128_000;
}

function budgetFor(settings: Settings): number {
  const context = contextWindowOf(settings);
  return Math.max(4_000, Math.floor(context * SUMMARY_CONTEXT_RATIO) - OUTPUT_RESERVE_TOKENS);
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

function sampleLines(lines: SubtitleLine[], maxChars: number): SubtitleLine[] {
  const totalChars = lines.reduce((sum, line) => sum + line.content.length, 0);
  if (totalChars <= maxChars) return lines;
  const step = Math.max(1, Math.ceil(totalChars / maxChars));
  const sampled: SubtitleLine[] = [];
  let size = 0;
  for (let index = 0; index < lines.length; index += step) {
    const line = lines[index];
    if (!line) continue;
    sampled.push(line);
    size += line.content.length;
    if (size >= maxChars) break;
  }
  return sampled;
}

async function summarizeSinglePass(args: {
  video: VideoContext;
  transcriptText: string;
  settings: Settings;
  length: SummaryLength;
  language: OutputLanguage;
  callbacks: EngineCallbacks;
}): Promise<SummaryResult> {
  const config = configFromSettings(args.settings);
  const messages = buildSummaryMessages({
    video: args.video,
    transcriptText: args.transcriptText,
    length: args.length,
    language: args.language,
  });
  const result = await completeStream(config, messages, {
    signal: args.callbacks.signal,
    temperature: 0.2,
    timeoutMs: 300_000,
    onDelta: args.callbacks.onDelta,
  });
  return {
    summary: parseSummaryJson(result.content) ?? fallbackSummary(result.content),
    usage: result.usage,
  };
}

async function mergeSummaries(args: {
  video: VideoContext;
  partials: VideoSummary[];
  settings: Settings;
  length: SummaryLength;
  language: OutputLanguage;
  callbacks: EngineCallbacks;
  stream: boolean;
  depth: number;
}): Promise<SummaryResult> {
  const config = configFromSettings(args.settings);
  const budget = budgetFor(args.settings);
  const messages = buildMergeMessages({
    video: args.video,
    partials: args.partials,
    length: args.length,
    language: args.language,
  });
  const estimated = estimateTokens(JSON.stringify(args.partials));

  if (args.stream || args.partials.length <= 2 || estimated <= budget || args.depth >= 4) {
    const result = args.stream
      ? await completeStream(config, messages, {
          signal: args.callbacks.signal,
          temperature: 0.2,
          timeoutMs: 300_000,
          onDelta: args.callbacks.onDelta,
        })
      : await complete(config, messages, {
          signal: args.callbacks.signal,
          temperature: 0.2,
          timeoutMs: 240_000,
        });
    return {
      summary: parseSummaryJson(result.content) ?? fallbackSummary(result.content),
      usage: result.usage,
    };
  }

  let usage: Usage | undefined;
  const next: VideoSummary[] = [];
  const groupSize = Math.max(2, Math.ceil(args.partials.length / 4));
  for (let index = 0; index < args.partials.length; index += groupSize) {
    const group = args.partials.slice(index, index + groupSize);
    const merged = await mergeSummaries({
      ...args,
      partials: group,
      stream: false,
      depth: args.depth + 1,
    });
    usage = addUsage(usage, merged.usage);
    next.push(merged.summary);
    args.callbacks.onProgress?.({ stage: 'merge' });
  }

  const final = await mergeSummaries({
    ...args,
    partials: next,
    stream: true,
    depth: args.depth + 1,
  });
  return { summary: final.summary, usage: addUsage(usage, final.usage) };
}

export async function generateSummary(args: {
  video: VideoContext;
  transcript: Transcript;
  settings: Settings;
  length: SummaryLength;
  language: OutputLanguage;
  callbacks: EngineCallbacks;
}): Promise<SummaryResult> {
  const transcriptText = transcriptToPromptText(args.transcript.lines);
  if (!transcriptText.trim()) throw new AppError('NO_SUBTITLE');

  const budget = budgetFor(args.settings);
  const estimated = estimateTokens(transcriptText) + 1_500;

  if (estimated <= budget) {
    return summarizeSinglePass({
      video: args.video,
      transcriptText,
      settings: args.settings,
      length: args.length,
      language: args.language,
      callbacks: args.callbacks,
    });
  }

  const maxChars = Math.max(4_000, Math.floor(budget * 1.4));
  const chunks = splitTranscriptByChars(args.transcript.lines, maxChars);
  if (chunks.length <= 1) {
    return summarizeSinglePass({
      video: args.video,
      transcriptText,
      settings: args.settings,
      length: args.length,
      language: args.language,
      callbacks: args.callbacks,
    });
  }

  const config = configFromSettings(args.settings);
  let usage: Usage | undefined;
  const partials: VideoSummary[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!chunk) continue;
    args.callbacks.onProgress?.({ stage: 'map', index: index + 1, total: chunks.length });
    const messages = buildChunkSummaryMessages({
      video: args.video,
      chunkText: chunk.text,
      index,
      total: chunks.length,
      start: chunk.start,
      end: chunk.end,
      language: args.language,
    });
    const result = await complete(config, messages, {
      signal: args.callbacks.signal,
      temperature: 0.2,
      timeoutMs: 240_000,
    });
    usage = addUsage(usage, result.usage);
    partials.push(parseSummaryJson(result.content) ?? fallbackSummary(result.content));
  }

  args.callbacks.onProgress?.({ stage: 'merge' });
  const merged = await mergeSummaries({
    video: args.video,
    partials,
    settings: args.settings,
    length: args.length,
    language: args.language,
    callbacks: args.callbacks,
    stream: true,
    depth: 0,
  });

  return { summary: merged.summary, usage: addUsage(usage, merged.usage) };
}

export async function generateChatAnswer(args: {
  video: VideoContext;
  transcript: Transcript;
  summary: VideoSummary | null;
  history: ChatMessage[];
  question: string;
  settings: Settings;
  callbacks: EngineCallbacks;
}): Promise<ChatResult> {
  const config = configFromSettings(args.settings);
  const budget = budgetFor(args.settings);
  const fullText = transcriptToChatPromptText(args.transcript.lines, args.video.duration);
  const historyTokens = args.history.reduce(
    (sum, message) => sum + estimateTokens(message.content),
    0,
  );
  const summaryTokens = args.summary ? estimateTokens(JSON.stringify(args.summary)) : 0;
  const fullTokens =
    estimateTokens(fullText) +
    estimateTokens(args.question) +
    historyTokens +
    summaryTokens +
    1_500;

  let transcriptText = fullText;
  if (fullTokens > budget) {
    const lines = args.transcript.lines;
    // Follow-up questions often depend on earlier turns ("那它的缺点呢？").
    // Retrieve with the recent questions as well, and pin the lines cited by
    // the previous answer so the model keeps referring to the same material.
    const recentQuestions = args.history
      .filter((message) => message.role === 'user')
      .slice(-3)
      .map((message) => message.content)
      .join(' ');
    const query = [recentQuestions, args.question].filter(Boolean).join(' ');

    const retrieved = retrieveLines(lines, query, { limit: 30, window: 2 });
    const lastAnswer = [...args.history].reverse().find((message) => message.role === 'assistant');
    const cited = lastAnswer ? extractTimestamps(lastAnswer.content).slice(-3) : [];
    const pinned = linesAroundTimestamps(lines, cited, 3);
    const merged = mergeSubtitleLines(retrieved, pinned);
    const selected =
      merged.length > 0 ? merged : sampleLines(lines, Math.max(2_000, Math.floor(budget * 1.2)));
    transcriptText = transcriptToChatPromptText(selected, args.video.duration);
  }

  args.callbacks.onProgress?.({ stage: 'chat' });
  const messages = buildChatMessages({
    video: args.video,
    transcriptText,
    summary: args.summary,
    history: args.history,
    question: args.question,
  });
  const result = await completeStream(config, messages, {
    signal: args.callbacks.signal,
    temperature: 0.3,
    timeoutMs: 180_000,
    onDelta: args.callbacks.onDelta,
  });
  return { content: result.content, usage: result.usage };
}
