import { summaryToMarkdown } from '../../shared/bilibili';
import type {
  LlmProgress,
  OutputLanguage,
  SummaryLength,
  VideoContext,
  VideoSummary,
} from '../../shared/types';
import type { PanelError, SessionStatus } from './types';
import {
  Button,
  CopyButton,
  ErrorBanner,
  InlineTimestampText,
  ProgressBar,
  SkeletonLines,
  SparklesIcon,
  Spinner,
  StopIcon,
  TimestampButton,
  errorKind,
} from './ui';

const LENGTH_OPTIONS: Array<{ value: SummaryLength; label: string }> = [
  { value: 'short', label: '简' },
  { value: 'medium', label: '中' },
  { value: 'long', label: '详' },
];

const LANGUAGE_OPTIONS: Array<{ value: OutputLanguage; label: string }> = [
  { value: 'auto', label: '跟随视频' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
];

function progressLabel(status: SessionStatus, progress: LlmProgress | null): string {
  if (status === 'loading-transcript') return '正在获取 B 站字幕…';
  if (progress?.stage === 'map') {
    return `正在总结第 ${progress.index ?? 1}/${progress.total ?? 1} 段…`;
  }
  if (progress?.stage === 'merge') return '正在合并分段摘要…';
  if (status === 'summarizing') return '正在生成摘要…';
  return '正在处理…';
}

function progressValue(progress: LlmProgress | null): number | undefined {
  if (progress?.stage === 'map' && progress.total && progress.total > 0) {
    return Math.min(1, (progress.index ?? 0) / progress.total);
  }
  return undefined;
}

const selectClass =
  'rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg outline-none transition-colors focus:border-brand disabled:opacity-50';

export function SummaryTab({
  video,
  summary,
  status,
  error,
  progress,
  length,
  language,
  hasSettings,
  onLengthChange,
  onLanguageChange,
  onGenerate,
  onCancel,
  onOpenSettings,
  onSeek,
  onAskChapter,
}: {
  video: VideoContext | null;
  summary: VideoSummary | null;
  status: SessionStatus;
  error: PanelError | null;
  progress: LlmProgress | null;
  length: SummaryLength;
  language: OutputLanguage;
  hasSettings: boolean;
  onLengthChange: (value: SummaryLength) => void;
  onLanguageChange: (value: OutputLanguage) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
  onSeek: (seconds: number) => void;
  onAskChapter: (chapter: { start: number; title: string }) => void;
}) {
  const busy = status === 'loading-transcript' || status === 'summarizing';
  const duration = video?.duration ?? 0;
  const markdown =
    summary && video
      ? summaryToMarkdown(summary, { title: video.title, bvid: video.bvid, p: video.p })
      : '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <label className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
          长度
          <select
            value={length}
            disabled={busy}
            onChange={(event) => onLengthChange(event.target.value as SummaryLength)}
            className={selectClass}
          >
            {LENGTH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
          语言
          <select
            value={language}
            disabled={busy}
            onChange={(event) => onLanguageChange(event.target.value as OutputLanguage)}
            className={selectClass}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          {summary && <CopyButton text={markdown} label="复制 MD" size="xs" className="!px-2" />}
          {busy ? (
            <Button variant="secondary" size="xs" onClick={onCancel}>
              <StopIcon width={11} height={11} />
              停止
            </Button>
          ) : (
            <Button variant="brand" size="xs" onClick={onGenerate} disabled={!hasSettings}>
              <SparklesIcon width={12} height={12} />
              {summary ? '重新生成' : '生成摘要'}
            </Button>
          )}
        </div>
      </div>

      <div className="bb-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!hasSettings && (
          <div className="mb-3">
            <ErrorBanner
              message="还没有配置模型。请先填写 Base URL、API Key 和模型。"
              onSettings={onOpenSettings}
            />
          </div>
        )}

        {error && (
          <div className="mb-3">
            <ErrorBanner
              message={error.message}
              kind={errorKind(error.code)}
              onRetry={onGenerate}
              onSettings={onOpenSettings}
            />
          </div>
        )}

        {busy && (
          <div className="mb-3 rounded-xl border border-line bg-surface-raised p-3.5">
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <Spinner className="h-3.5 w-3.5 text-brand" />
              <span>{progressLabel(status, progress)}</span>
              {progress?.stage === 'map' && progress.total ? (
                <span className="ml-auto font-mono text-[10px] text-fg-subtle">
                  {progress.index ?? 0}/{progress.total}
                </span>
              ) : null}
            </div>
            <div className="mt-2.5">
              <ProgressBar value={progressValue(progress)} />
            </div>
            <div className="mt-3">
              <SkeletonLines lines={3} />
            </div>
            <p className="mt-2.5 text-[10px] text-fg-subtle">
              长视频会自动分段总结，请保持页面打开。
            </p>
          </div>
        )}

        {!summary && !busy && (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center">
            <div className="rounded-full bg-brand-soft p-3 text-brand-strong">
              <SparklesIcon width={24} height={24} />
            </div>
            <p className="text-sm font-medium text-fg">生成这段视频的摘要</p>
            <p className="max-w-[270px] text-xs leading-5 text-fg-muted">
              先读取 B 站字幕，再交给你的模型总结。摘要带时间戳，点击即可跳转。
            </p>
            <Button variant="brand" size="sm" onClick={onGenerate} disabled={!hasSettings}>
              <SparklesIcon width={13} height={13} />
              开始生成
            </Button>
          </div>
        )}

        {summary && (
          <div className={`space-y-5 ${busy ? 'opacity-70' : ''}`}>
            <section>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                总览
              </h3>
              <p className="rounded-xl border border-line bg-surface-raised p-3 text-sm leading-6 text-fg">
                <InlineTimestampText text={summary.overview} duration={duration} onSeek={onSeek} />
              </p>
            </section>

            {summary.chapters.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                  章节
                </h3>
                <div className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface-raised">
                  {summary.chapters.map((chapter, index) => (
                    <div key={`${chapter.start}-${index}`} className="group/chapter p-3">
                      <div className="flex items-start gap-2">
                        <TimestampButton
                          seconds={chapter.start}
                          duration={duration}
                          onSeek={onSeek}
                          className="mt-0.5 shrink-0"
                        />
                        <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-fg">
                          {chapter.title}
                        </p>
                        <button
                          type="button"
                          onClick={() => onAskChapter(chapter)}
                          className="bb-focus-ring shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-fg-subtle opacity-70 transition-opacity hover:bg-surface-muted hover:text-fg group-hover/chapter:opacity-100 focus-visible:opacity-100"
                          title="就这一章提问"
                        >
                          问这章
                        </button>
                      </div>
                      {chapter.summary && (
                        <p className="mt-1.5 text-xs leading-5 text-fg-muted">
                          <InlineTimestampText
                            text={chapter.summary}
                            duration={duration}
                            onSeek={onSeek}
                          />
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {summary.keyPoints.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                  关键要点
                </h3>
                <ul className="space-y-1.5">
                  {summary.keyPoints.map((point, index) => (
                    <li
                      key={`${index}-${point.slice(0, 12)}`}
                      className="rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2 text-xs leading-5 text-fg-muted"
                    >
                      <InlineTimestampText text={point} duration={duration} onSeek={onSeek} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {summary.terms.length > 0 && (
              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                  术语
                </h3>
                <dl className="space-y-1.5">
                  {summary.terms.map((term, index) => (
                    <div
                      key={`${term.term}-${index}`}
                      className="rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2"
                    >
                      <dt className="text-xs font-semibold text-fg">{term.term}</dt>
                      <dd className="mt-0.5 text-xs leading-5 text-fg-muted">
                        <InlineTimestampText
                          text={term.explanation}
                          duration={duration}
                          onSeek={onSeek}
                        />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <p className="border-t border-line pt-3 text-[10px] leading-5 text-fg-subtle">
              摘要由模型根据字幕生成，可能有误。请用时间戳核对原文。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
