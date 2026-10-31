import { useEffect, useMemo, useRef, useState } from 'react';
import {
  groupTranscript,
  transcriptToMarkdown,
  transcriptToSrt,
  transcriptToTxt,
} from '../../shared/bilibili';
import type { Transcript, VideoContext } from '../../shared/types';
import { downloadText, safeFileName } from './session';
import type { PanelError, SessionStatus } from './types';
import {
  Button,
  CopyButton,
  DownloadIcon,
  ErrorBanner,
  SearchIcon,
  Spinner,
  TimestampButton,
  errorKind,
} from './ui';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, 'ig'));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="rounded bg-warning-line px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

export function TranscriptTab({
  video,
  transcript,
  status,
  error,
  focus,
  onFetch,
  onSeek,
}: {
  video: VideoContext | null;
  transcript: Transcript | null;
  status: SessionStatus;
  error: PanelError | null;
  focus: { seconds: number; nonce: number } | null;
  onFetch: () => void;
  onSeek: (seconds: number) => void;
}) {
  const [query, setQuery] = useState('');
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const focusSeconds = focus?.seconds;
  const focusNonce = focus?.nonce;

  const paragraphs = useMemo(
    () => (transcript ? groupTranscript(transcript.lines) : []),
    [transcript],
  );
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return paragraphs;
    return paragraphs.filter((paragraph) => paragraph.text.toLowerCase().includes(trimmed));
  }, [paragraphs, query]);

  const highlightStart = useMemo(() => {
    if (focusSeconds === undefined || paragraphs.length === 0) return null;
    let index = paragraphs.findIndex(
      (paragraph) => focusSeconds >= paragraph.start && focusSeconds <= paragraph.end,
    );
    if (index < 0) {
      index = paragraphs.findIndex((paragraph) => paragraph.start >= focusSeconds);
    }
    if (index < 0) index = paragraphs.length - 1;
    return paragraphs[index]?.start ?? null;
  }, [focusSeconds, paragraphs]);

  useEffect(() => {
    if (highlightStart === null) return;
    window.requestAnimationFrame(() => {
      rowRefs.current.get(highlightStart)?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    });
  }, [highlightStart, focusNonce]);

  const busy = status === 'loading-transcript';

  if (!transcript) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="bb-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {error && (
            <div className="mb-3">
              <ErrorBanner message={error.message} kind={errorKind(error.code)} onRetry={onFetch} />
            </div>
          )}
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            {busy ? (
              <>
                <Spinner className="text-brand" />
                <p className="text-sm text-fg-muted">正在获取字幕…</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-fg">还没有字幕</p>
                <p className="max-w-[270px] text-xs leading-5 text-fg-muted">
                  先读取 B 站字幕。需要登录 B 站，且视频有字幕轨。
                </p>
                <Button variant="brand" size="sm" onClick={onFetch}>
                  获取字幕
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const duration = video?.duration ?? transcript.duration;
  const txt = transcriptToTxt(transcript.lines);
  const srt = transcriptToSrt(transcript.lines);
  const markdown = transcriptToMarkdown(transcript.lines, {
    title: video?.title ?? transcript.title,
    bvid: video?.bvid ?? transcript.bvid,
    p: video?.p ?? 1,
  });
  const baseName = safeFileName(
    video?.title ?? transcript.title,
    video?.bvid ?? transcript.bvid,
    'txt',
  ).replace(/\.txt$/, '');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-line px-3 py-2">
        <div className="flex h-8 items-center rounded-lg border border-line bg-surface transition-colors focus-within:border-brand">
          <SearchIcon className="ml-2.5 shrink-0 text-fg-subtle" width={14} height={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索字幕…"
            className="h-full min-w-0 flex-1 bg-transparent pl-1.5 pr-3 text-xs text-fg outline-none placeholder:text-fg-subtle"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-auto text-[10px] text-fg-subtle">
            {query.trim()
              ? `匹配 ${filtered.length} / ${paragraphs.length} 段`
              : `${transcript.lines.length} 行 · ${paragraphs.length} 段`}
          </span>
          <CopyButton text={txt} label="复制" size="xs" className="!px-2" />
          <Button variant="outline" size="xs" onClick={() => downloadText(`${baseName}.txt`, txt)}>
            <DownloadIcon width={12} height={12} />
            TXT
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => downloadText(`${baseName}.srt`, srt, 'application/x-subrip')}
          >
            <DownloadIcon width={12} height={12} />
            SRT
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => downloadText(`${baseName}.md`, markdown, 'text/markdown;charset=utf-8')}
          >
            <DownloadIcon width={12} height={12} />
            MD
          </Button>
        </div>
      </div>

      <div className="bb-scroll min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-xs text-fg-subtle">没有匹配的字幕</p>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((paragraph, index) => (
              <div
                key={`${paragraph.start}-${index}`}
                ref={(element) => {
                  if (element) rowRefs.current.set(paragraph.start, element);
                  else rowRefs.current.delete(paragraph.start);
                }}
                className={`flex items-start gap-2.5 rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2 transition-colors hover:border-line hover:bg-surface-muted/60 ${
                  highlightStart !== null && paragraph.start === highlightStart
                    ? 'bb-highlight'
                    : ''
                }`}
              >
                <TimestampButton
                  seconds={paragraph.start}
                  duration={duration}
                  onSeek={onSeek}
                  className="mt-0.5 shrink-0 tabular-nums"
                />
                <p className="min-w-0 flex-1 text-xs leading-5 text-fg-muted">
                  <Highlighted text={paragraph.text} query={query} />
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
