import { SUBTITLE_PRIORITY } from './constants';
import type {
  PageEntry,
  SubtitleInfo,
  SubtitleLine,
  SummaryChapter,
  SummaryTerm,
  VideoSummary,
} from './types';

export interface TranscriptChunk {
  lines: SubtitleLine[];
  start: number;
  end: number;
  text: string;
}

export interface TranscriptParagraph {
  start: number;
  end: number;
  lines: SubtitleLine[];
  text: string;
}

export function isVideoPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.bilibili.com' && parsed.pathname.startsWith('/video/');
  } catch {
    return false;
  }
}

export function parseBvid(url: string): string | null {
  const match = /\/video\/(BV[0-9A-Za-z]+)/.exec(url);
  return match?.[1] ?? null;
}

export function parsePageNumber(url: string): number {
  try {
    const parsed = new URL(url);
    const value = Number(parsed.searchParams.get('p') ?? '1');
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
  } catch {
    return 1;
  }
}

export function pickCidFromPagelist(pages: PageEntry[] | undefined, p: number): number | null {
  if (!pages || pages.length === 0) return null;
  const page = pages.find((item) => item.page === p) ?? pages[0];
  return page?.cid ?? null;
}

export function pickSubtitleInfo(subtitles: SubtitleInfo[] | undefined): SubtitleInfo | null {
  if (!subtitles || subtitles.length === 0) return null;
  for (const lang of SUBTITLE_PRIORITY) {
    const hit = subtitles.find((item) => item.lan.toLowerCase() === lang.toLowerCase());
    if (hit) return hit;
  }
  return subtitles[0] ?? null;
}

export function isUsableSubtitle(info: SubtitleInfo): boolean {
  return Boolean(info.subtitle_url?.trim());
}

export function isAiSubtitle(info: SubtitleInfo): boolean {
  return /^ai-/i.test(info.lan) || /自动生成|AI/i.test(info.lan_doc ?? '');
}

/**
 * A track is usable only when Bilibili actually returned a subtitle_url.
 * `ai_status` is unreliable across docs: the official sample and real-world
 * tools show `2` on a *ready* AI track (with a URL), so it must never be used
 * to reject a track that has a URL. `ai_status === 1` is treated as
 * "generating" only when the track has no URL at all.
 */
export function selectSubtitleTracks(subtitles: SubtitleInfo[] | undefined): {
  usable: SubtitleInfo[];
  generating: boolean;
} {
  const list = subtitles ?? [];
  const usable = list.filter(isUsableSubtitle);
  const generating =
    usable.length === 0 && list.some((item) => isAiSubtitle(item) && item.ai_status === 1);
  return { usable, generating };
}

export function sanitizeSubtitleUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
}

export function isPlayerApi(url: string): boolean {
  return (
    url.includes('/x/player/wbi/v2') ||
    url.includes('/x/player/v2') ||
    url.includes('/x/player/pagelist')
  );
}

export function normalizeSubtitle(raw: unknown): SubtitleLine[] {
  if (!raw || typeof raw !== 'object') return [];
  const body = (raw as { body?: unknown }).body;
  if (!Array.isArray(body)) return [];

  const lines: SubtitleLine[] = [];
  for (const item of body) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const from = Number(record.from);
    const to = Number(record.to);
    const content = typeof record.content === 'string' ? record.content.trim() : '';
    if (!Number.isFinite(from) || !Number.isFinite(to) || !content) continue;
    if (to <= from) continue;
    lines.push({ from, to, content });
  }

  lines.sort((a, b) => a.from - b.from);

  const deduped: SubtitleLine[] = [];
  for (const line of lines) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.from === line.from && previous.content === line.content) continue;
    deduped.push(line);
  }
  return deduped;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(secs)}`;
  return `${pad2(minutes)}:${pad2(secs)}`;
}

/**
 * Format a timestamp the way Bilibili's progress bar does:
 * - videos under one hour: `mm:ss`
 * - videos one hour or longer: `h:mm:ss` for every position, even under 1h
 *   (e.g. 9 seconds in a 4h video -> `0:00:09`)
 */
export function formatTimestampForDuration(seconds: number, duration: number): string {
  if (Number.isFinite(duration) && duration >= 3600) {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return `${hours}:${pad2(minutes)}:${pad2(secs)}`;
  }
  return formatTimestamp(seconds);
}

export function formatSrtTimestamp(seconds: number): string {
  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const millis = Math.floor((total - Math.floor(total)) * 1000);
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)},${String(millis).padStart(3, '0')}`;
}

export function parseTimestampValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.max(0, Number(trimmed));
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const millis = Number((match[4] ?? '0').padEnd(3, '0'));
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/**
 * Parse a timestamp token as it appears in model output or transcript lines:
 * `[03:21]`, `【03:21】`, `[1:02:03]`, `[17.6s]`, `[17.6秒]`, `17.6s`, ...
 */
export function parseTimestampToken(token: string): number | null {
  const value = token
    .trim()
    .replace(/^(?:\[|【)/, '')
    .replace(/(?:\]|】)$/, '')
    .trim();
  const secondsMatch = /^(\d+(?:\.\d+)?)\s*(?:s|秒)$/i.exec(value);
  if (secondsMatch) {
    const seconds = Number(secondsMatch[1]);
    return Number.isFinite(seconds) ? Math.max(0, seconds) : null;
  }
  return parseTimestampValue(value);
}

export function buildTimestampLink(bvid: string, p: number, seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const page = p > 1 ? `&p=${p}` : '';
  return `https://www.bilibili.com/video/${bvid}?t=${t}${page}`;
}

export function transcriptToPromptText(lines: SubtitleLine[]): string {
  return lines.map((line) => `[${line.from.toFixed(1)}s] ${line.content}`).join('\n');
}

/**
 * Chat context uses the same timestamp format as the player progress bar so
 * the model is likely to cite `[mm:ss]` / `[h:mm:ss]` instead of copying the
 * raw `[17.6s]` format.
 */
export function transcriptToChatPromptText(lines: SubtitleLine[], duration: number): string {
  return lines
    .map((line) => `[${formatTimestampForDuration(line.from, duration)}] ${line.content}`)
    .join('\n');
}

export function transcriptToTxt(lines: SubtitleLine[]): string {
  return lines.map((line) => `[${formatTimestamp(line.from)}] ${line.content}`).join('\n');
}

export function transcriptToSrt(lines: SubtitleLine[]): string {
  return lines
    .map(
      (line, index) =>
        `${index + 1}\n${formatSrtTimestamp(line.from)} --> ${formatSrtTimestamp(line.to)}\n${line.content}\n`,
    )
    .join('\n');
}

export function transcriptToMarkdown(
  lines: SubtitleLine[],
  meta: { title?: string; bvid?: string; p?: number },
): string {
  const header = meta.title ? `# ${meta.title}\n\n` : '';
  const rows = lines.map((line) => {
    const label = formatTimestamp(line.from);
    const time = meta.bvid
      ? `[${label}](${buildTimestampLink(meta.bvid, meta.p ?? 1, line.from)})`
      : `[${label}]`;
    return `- ${time} ${line.content}`;
  });
  return `${header}${rows.join('\n')}\n`;
}

export function summaryToMarkdown(
  summary: VideoSummary,
  meta: { title?: string; bvid?: string; p?: number },
): string {
  const parts: string[] = [];
  if (meta.title) parts.push(`# ${meta.title}`);
  parts.push('## 总览', summary.overview);

  if (summary.chapters.length > 0) {
    parts.push('## 章节');
    for (const chapter of summary.chapters) {
      const label = formatTimestamp(chapter.start);
      const time = meta.bvid
        ? `[${label}](${buildTimestampLink(meta.bvid, meta.p ?? 1, chapter.start)})`
        : `[${label}]`;
      parts.push(`### ${time} ${chapter.title}`, chapter.summary);
    }
  }

  if (summary.keyPoints.length > 0) {
    parts.push('## 关键要点', ...summary.keyPoints.map((point) => `- ${point}`));
  }

  if (summary.terms.length > 0) {
    parts.push(
      '## 术语',
      ...summary.terms.map((term) => `- **${term.term}**：${term.explanation}`),
    );
  }

  return `${parts.join('\n\n')}\n`;
}

const CJK_RE = /[㐀-鿿豈-﫿]/;

export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (CJK_RE.test(char)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk * 0.7 + other / 4);
}

export function splitTranscriptByChars(lines: SubtitleLine[], maxChars: number): TranscriptChunk[] {
  if (lines.length === 0) return [];
  const limit = Math.max(1_000, maxChars);
  const chunks: TranscriptChunk[] = [];
  let current: SubtitleLine[] = [];
  let size = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    const first = current[0];
    const last = current[current.length - 1];
    chunks.push({
      lines: current,
      start: first?.from ?? 0,
      end: last?.to ?? 0,
      text: transcriptToPromptText(current),
    });
    current = [];
    size = 0;
  };

  for (const line of lines) {
    const lineSize = line.content.length + 16;
    if (current.length > 0 && size + lineSize > limit) flush();
    current.push(line);
    size += lineSize;
  }
  flush();
  return chunks;
}

export function groupTranscript(
  lines: SubtitleLine[],
  gapSeconds = 2,
  maxLines = 6,
): TranscriptParagraph[] {
  const paragraphs: TranscriptParagraph[] = [];
  let current: SubtitleLine[] = [];

  const flush = (): void => {
    if (current.length === 0) return;
    const first = current[0];
    const last = current[current.length - 1];
    paragraphs.push({
      start: first?.from ?? 0,
      end: last?.to ?? 0,
      lines: current,
      text: current.map((line) => line.content).join(''),
    });
    current = [];
  };

  for (const line of lines) {
    const previous = current[current.length - 1];
    if (previous && (line.from - previous.to > gapSeconds || current.length >= maxLines)) {
      flush();
    }
    current.push(line);
  }
  flush();
  return paragraphs;
}

function tokenizeQuery(query: string): string[] {
  const lower = query.toLowerCase();
  const latin = lower.match(/[a-z0-9_]{2,}/g) ?? [];
  const chars = [...lower].filter((char) => CJK_RE.test(char));
  const bigrams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    const left = chars[index];
    const right = chars[index + 1];
    if (left && right) bigrams.push(left + right);
  }
  const singles = chars.length === 1 ? chars : [];
  return [...new Set([...latin, ...bigrams, ...singles])];
}

export function retrieveLines(
  lines: SubtitleLine[],
  query: string,
  options: { limit?: number; window?: number } = {},
): SubtitleLine[] {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];
  const limit = options.limit ?? 24;
  const windowSize = options.window ?? 2;

  const scored: Array<{ index: number; score: number }> = [];
  lines.forEach((line, index) => {
    const text = line.content.toLowerCase();
    let score = 0;
    for (const term of terms) {
      let position = text.indexOf(term);
      while (position !== -1) {
        score += 1 + term.length * 0.1;
        position = text.indexOf(term, position + term.length);
      }
    }
    if (score > 0) scored.push({ index, score });
  });

  scored.sort((a, b) => b.score - a.score);
  const selected = new Set<number>();
  for (const item of scored.slice(0, limit)) {
    for (let offset = -windowSize; offset <= windowSize; offset += 1) {
      const index = item.index + offset;
      if (index >= 0 && index < lines.length) selected.add(index);
    }
  }

  return [...selected]
    .sort((a, b) => a - b)
    .map((index) => lines[index])
    .filter((line): line is SubtitleLine => Boolean(line));
}

const TIMESTAMP_TOKEN_SOURCE = String.raw`(?:\d{1,2}:\d{2}(?::\d{2})?|\d+(?:\.\d+)?\s*(?:s|秒))`;

/** Collect timestamp citations (`[03:21]`, `【03:21】`, bare `03:21`, `17.6s`). */
export function extractTimestamps(text: string): number[] {
  const regex = new RegExp(TIMESTAMP_TOKEN_SOURCE, 'gi');
  const found = new Set<number>();
  for (const match of text.matchAll(regex)) {
    const seconds = parseTimestampToken(match[0]);
    if (seconds !== null) found.add(Math.round(seconds));
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Pick the subtitle lines around each timestamp so a follow-up question keeps
 * the material it is referring to in context.
 */
export function linesAroundTimestamps(
  lines: SubtitleLine[],
  timestamps: number[],
  windowLines = 3,
): SubtitleLine[] {
  if (lines.length === 0 || timestamps.length === 0) return [];
  const selected = new Set<number>();

  for (const timestamp of timestamps) {
    let index = lines.findIndex((line) => timestamp >= line.from && timestamp <= line.to);
    if (index < 0) {
      const next = lines.findIndex((line) => line.from >= timestamp);
      index = next < 0 ? lines.length - 1 : next;
    }
    for (let offset = -windowLines; offset <= windowLines; offset += 1) {
      const target = index + offset;
      if (target >= 0 && target < lines.length) selected.add(target);
    }
  }

  return [...selected]
    .sort((a, b) => a - b)
    .map((index) => lines[index])
    .filter((line): line is SubtitleLine => Boolean(line));
}

export function mergeSubtitleLines(...groups: SubtitleLine[][]): SubtitleLine[] {
  const seen = new Set<SubtitleLine>();
  for (const group of groups) {
    for (const line of group) seen.add(line);
  }
  return [...seen].sort((a, b) => a.from - b.from);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function coerceChapter(value: unknown): SummaryChapter | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const start = parseTimestampValue(record.start ?? record.time ?? record.from);
  const title = asString(record.title ?? record.heading);
  const summary = asString(record.summary ?? record.content ?? record.description);
  if (start === null || !title) return null;
  return { start, title, summary };
}

function coerceTerm(value: unknown): SummaryTerm | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const term = asString(record.term ?? record.name);
  const explanation = asString(record.explanation ?? record.definition ?? record.description);
  if (!term || !explanation) return null;
  return { term, explanation };
}

export function coerceSummary(value: unknown): VideoSummary | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const overview = asString(record.overview ?? record.summary ?? record.tldr ?? record.oneLiner);
  if (!overview) return null;

  const rawChapters = record.chapters ?? record.sections ?? record.outline;
  const chapters = Array.isArray(rawChapters)
    ? rawChapters
        .map(coerceChapter)
        .filter((chapter): chapter is SummaryChapter => Boolean(chapter))
        .sort((a, b) => a.start - b.start)
    : [];

  const rawTerms = record.terms ?? record.glossary;
  const terms = Array.isArray(rawTerms)
    ? rawTerms.map(coerceTerm).filter((term): term is SummaryTerm => Boolean(term))
    : [];

  return {
    overview,
    chapters,
    keyPoints: asStringArray(record.keyPoints ?? record.key_points ?? record.points),
    terms,
  };
}

export function parseSummaryJson(raw: string): VideoSummary | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  const candidate = cleaned.slice(start, end + 1);

  const attempts = [candidate, candidate.replace(/,\s*([}\]])/g, '$1')];
  for (const attempt of attempts) {
    try {
      const parsed = coerceSummary(JSON.parse(attempt));
      if (parsed) return parsed;
    } catch {
      // try next
    }
  }
  return null;
}

export function fallbackSummary(raw: string): VideoSummary {
  return {
    overview: raw.trim().slice(0, 2_000),
    chapters: [],
    keyPoints: [],
    terms: [],
  };
}
