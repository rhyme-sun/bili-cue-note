import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { formatTimestampForDuration } from '../../shared/bilibili';
import { PROMPT_VERSION } from '../../shared/constants';
import { AppError } from '../../shared/errors';
import type {
  ChatMessage,
  LlmProgress,
  OutputLanguage,
  Settings,
  SummaryLength,
  Transcript,
  VideoContext,
  VideoSummary,
} from '../../shared/types';
import type { PageBridge } from '../bridge';
import { ChatTab } from './ChatTab';
import {
  acquireTranscript,
  getCachedSummary,
  getCachedTranscript,
  getChatHistory,
  openOptions,
  saveChatHistory,
  saveSummary,
  seekTo,
  startLlm,
  summaryCacheKey,
  type LlmStream,
} from './session';
import { BrandMarkIcon } from '../../shared/BrandMarkIcon';
import { SummaryTab } from './SummaryTab';
import { TranscriptTab } from './TranscriptTab';
import type { PanelError, PanelView, SessionStatus } from './types';
import {
  Button,
  CaptionsIcon,
  ChevronDownIcon,
  CloseIcon,
  ErrorBanner,
  FileTextIcon,
  IconButton,
  MessageIcon,
  MoonIcon,
  ProgressBar,
  SettingsIcon,
  SparklesIcon,
  Spinner,
  SunIcon,
  Tooltip,
  errorKind,
} from './ui';
import {
  clampRect,
  defaultRect,
  loadPanelRect,
  savePanelRect,
  type PanelRect,
} from './window-state';

const VIEW_TABS = [
  { value: 'chat' as const, label: '对话', Icon: MessageIcon },
  { value: 'summary' as const, label: '摘要', Icon: FileTextIcon },
  { value: 'transcript' as const, label: '字幕', Icon: CaptionsIcon },
];

function describeError(error: unknown): PanelError {
  if (error instanceof AppError) return { message: error.message, code: error.code };
  if (error instanceof Error) return { message: error.message };
  return { message: '发生未知错误。' };
}

function stripProgressLabel(status: SessionStatus, progress: LlmProgress | null): string {
  if (status === 'loading-transcript') return '正在获取 B 站字幕…';
  if (progress?.stage === 'map') {
    return `正在总结第 ${progress.index ?? 1}/${progress.total ?? 1} 段…`;
  }
  if (progress?.stage === 'merge') return '正在合并分段摘要…';
  if (status === 'summarizing') return '正在生成摘要…';
  return '正在处理…';
}

function stripProgressValue(progress: LlmProgress | null): number | undefined {
  if (progress?.stage === 'map' && progress.total && progress.total > 0) {
    return Math.min(1, (progress.index ?? 0) / progress.total);
  }
  return undefined;
}

function OverviewStrip({
  summary,
  status,
  error,
  progress,
  hasSettings,
  onGenerate,
  onCancel,
  onOpenSettings,
}: {
  summary: VideoSummary | null;
  status: SessionStatus;
  error: PanelError | null;
  progress: LlmProgress | null;
  hasSettings: boolean;
  onGenerate: () => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const busy = status === 'loading-transcript' || status === 'summarizing';

  if (busy) {
    return (
      <div className="shrink-0 border-b border-line bg-surface px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] text-fg-muted">
          <Spinner className="h-3 w-3 text-brand" />
          <span className="truncate">{stripProgressLabel(status, progress)}</span>
          <button
            type="button"
            onClick={onCancel}
            className="bb-focus-ring ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-fg-subtle hover:bg-surface-muted hover:text-fg"
          >
            停止
          </button>
        </div>
        <div className="mt-1.5">
          <ProgressBar value={stripProgressValue(progress)} />
        </div>
      </div>
    );
  }

  if (summary) {
    return (
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={expanded ? '收起摘要概览' : '展开摘要概览'}
        className="bb-focus-ring group flex w-full shrink-0 items-start gap-2 border-b border-line bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-muted/60"
      >
        <SparklesIcon className="mt-0.5 shrink-0 text-brand-strong" width={13} height={13} />
        <span
          className={`min-w-0 flex-1 text-[11px] leading-4 text-fg-muted ${expanded ? '' : 'line-clamp-2'}`}
        >
          {summary.overview}
        </span>
        <ChevronDownIcon
          className={`mt-0.5 shrink-0 text-fg-subtle transition-transform duration-150 group-hover:text-fg ${
            expanded ? 'rotate-180' : ''
          }`}
          width={13}
          height={13}
        />
      </button>
    );
  }

  if (error) {
    return (
      <div className="shrink-0 border-b border-line px-3 py-2">
        <ErrorBanner
          message={error.message}
          kind={errorKind(error.code)}
          onRetry={onGenerate}
          onSettings={error.code === 'NO_SETTINGS' ? onOpenSettings : undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
      <SparklesIcon className="shrink-0 text-brand-strong" width={13} height={13} />
      <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">
        生成摘要，快速把握全片结构
      </span>
      <Button variant="outline" size="xs" onClick={onGenerate} disabled={!hasSettings}>
        生成摘要
      </Button>
    </div>
  );
}

export function Panel({
  bridge,
  video,
  settings,
  dark,
  onToggleTheme,
  onClose,
}: {
  bridge: PageBridge;
  video: VideoContext;
  settings: Settings;
  dark: boolean;
  onToggleTheme: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<PanelView>('chat');
  const [length, setLength] = useState<SummaryLength>(settings.summaryLength);
  const [language, setLanguage] = useState<OutputLanguage>(settings.outputLanguage);

  const [status, setStatus] = useState<SessionStatus>('idle');
  const [error, setError] = useState<PanelError | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [summary, setSummary] = useState<VideoSummary | null>(null);
  const [progress, setProgress] = useState<LlmProgress | null>(null);
  const [transcriptFocus, setTranscriptFocus] = useState<{
    seconds: number;
    nonce: number;
  } | null>(null);

  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<PanelError | null>(null);
  const [chatStream, setChatStream] = useState('');

  const [rect, setRect] = useState<PanelRect>(() => defaultRect());
  const rectRef = useRef(rect);

  const summaryStreamRef = useRef<LlmStream | null>(null);
  const chatStreamRef = useRef<LlmStream | null>(null);
  const runRef = useRef(0);
  const chatRunRef = useRef(0);
  const focusNonceRef = useRef(0);

  const hasSettings = Boolean(
    settings.baseUrl.trim() && settings.apiKey.trim() && settings.model.trim(),
  );
  const summaryKey = summaryCacheKey(video.cid, settings, length, language);

  useEffect(() => {
    rectRef.current = rect;
  }, [rect]);

  useEffect(() => {
    let cancelled = false;
    void loadPanelRect().then((stored) => {
      if (!cancelled && stored) setRect(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onResize = (): void => {
      setRect((previous) => clampRect(previous));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cancelActive = useCallback(() => {
    runRef.current += 1;
    chatRunRef.current += 1;
    summaryStreamRef.current?.cancel();
    chatStreamRef.current?.cancel();
    summaryStreamRef.current = null;
    chatStreamRef.current = null;
  }, []);

  useEffect(() => () => cancelActive(), [cancelActive]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cachedTranscript, cachedChat] = await Promise.all([
        getCachedTranscript(video.cid),
        getChatHistory(video.cid),
      ]);
      if (cancelled) return;
      if (cachedTranscript) setTranscript(cachedTranscript);
      setChat(cachedChat);
    })();
    return () => {
      cancelled = true;
    };
  }, [video.cid]);

  useEffect(() => {
    let cancelled = false;
    void getCachedSummary(summaryKey).then((stored) => {
      if (cancelled) return;
      if (stored) {
        setSummary(stored.summary);
        setError(null);
        setStatus('ready');
      } else {
        setSummary(null);
        setError(null);
        setStatus((previous) =>
          previous === 'summarizing' || previous === 'loading-transcript' ? previous : 'idle',
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [summaryKey]);

  const ensureTranscript = useCallback(async (): Promise<Transcript> => {
    if (transcript) return transcript;
    const cached = await getCachedTranscript(video.cid);
    if (cached) {
      setTranscript(cached);
      return cached;
    }
    const acquired = await acquireTranscript(bridge, video);
    setTranscript(acquired);
    return acquired;
  }, [transcript, video, bridge]);

  const handleGenerate = useCallback(async () => {
    if (!hasSettings) {
      setError({ message: '请先在设置页填写 Base URL、API Key 和模型。', code: 'NO_SETTINGS' });
      setStatus('error');
      return;
    }

    const runId = ++runRef.current;
    setError(null);
    setProgress(null);
    setStatus('loading-transcript');

    try {
      const activeTranscript = await ensureTranscript();
      if (runRef.current !== runId) return;
      setStatus('summarizing');

      const stream = startLlm(
        {
          type: 'summarize',
          video,
          transcript: activeTranscript,
          length,
          language,
        },
        {
          onProgress: (value) => {
            if (runRef.current === runId) setProgress(value);
          },
        },
      );
      summaryStreamRef.current = stream;
      const done = await stream.promise;
      if (runRef.current !== runId) return;
      if (!done.summary) throw new AppError('LLM_ERROR', '模型没有返回可解析的摘要。');

      setSummary(done.summary);
      setStatus('ready');
      try {
        await saveSummary(summaryKey, {
          summary: done.summary,
          meta: {
            cid: video.cid,
            model: settings.model,
            promptVersion: PROMPT_VERSION,
            length,
            language,
            createdAt: Date.now(),
          },
        });
      } catch {
        // The summary is still usable even if caching fails.
      }
    } catch (caught) {
      if (runRef.current !== runId) return;
      if (caught instanceof AppError && caught.code === 'CANCELLED') return;
      setError(describeError(caught));
      setStatus('error');
    } finally {
      if (runRef.current === runId) {
        setProgress(null);
        summaryStreamRef.current = null;
      }
    }
  }, [hasSettings, ensureTranscript, video, length, language, summaryKey, settings.model]);

  const handleCancelSummary = useCallback(() => {
    runRef.current += 1;
    summaryStreamRef.current?.cancel();
    summaryStreamRef.current = null;
    setProgress(null);
    setStatus(summary ? 'ready' : 'idle');
  }, [summary]);

  const handleFetchTranscript = useCallback(async () => {
    summaryStreamRef.current?.cancel();
    summaryStreamRef.current = null;
    const runId = ++runRef.current;
    setError(null);
    setChatError(null);
    setStatus('loading-transcript');
    try {
      const loaded = await ensureTranscript();
      if (runRef.current !== runId) return;
      setStatus(summary ? 'ready' : 'idle');
      if (loaded.lines.length === 0) setError({ message: '字幕内容为空。', code: 'NO_SUBTITLE' });
    } catch (caught) {
      if (runRef.current !== runId) return;
      if (caught instanceof AppError && caught.code === 'CANCELLED') return;
      const panelError = describeError(caught);
      setError(panelError);
      setChatError(panelError);
      setStatus('error');
    }
  }, [ensureTranscript, summary]);

  const runChat = useCallback(
    async (question: string, baseHistory: ChatMessage[]) => {
      if (chatBusy) return;
      const trimmed = question.trim();
      if (!trimmed) return;
      if (!hasSettings) {
        setChatError({ message: '请先在设置页配置模型。', code: 'NO_SETTINGS' });
        return;
      }

      const runId = ++chatRunRef.current;
      setChatError(null);

      let activeTranscript = transcript;
      if (!activeTranscript) {
        try {
          activeTranscript = await ensureTranscript();
        } catch (caught) {
          setChatError(describeError(caught));
          return;
        }
      }
      if (chatRunRef.current !== runId || !activeTranscript) return;

      const userMessage: ChatMessage = {
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      };
      const nextMessages = [...baseHistory, userMessage];
      setChat(nextMessages);
      setChatBusy(true);
      setChatStream('');

      try {
        void saveChatHistory(video.cid, nextMessages);
        const stream = startLlm(
          {
            type: 'chat',
            video,
            transcript: activeTranscript,
            summary,
            history: baseHistory,
            question: trimmed,
          },
          {
            onDelta: (text) => {
              if (chatRunRef.current === runId) {
                setChatStream((previous) => previous + text);
              }
            },
          },
        );
        chatStreamRef.current = stream;
        const done = await stream.promise;
        if (chatRunRef.current !== runId) return;
        if (!done.content) throw new AppError('LLM_ERROR', '模型没有返回内容。');

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: done.content,
          createdAt: Date.now(),
        };
        const finalMessages = [...nextMessages, assistantMessage];
        setChat(finalMessages);
        void saveChatHistory(video.cid, finalMessages);
      } catch (caught) {
        if (chatRunRef.current !== runId) return;
        if (caught instanceof AppError && caught.code === 'CANCELLED') return;
        setChatError(describeError(caught));
      } finally {
        if (chatRunRef.current === runId) {
          setChatBusy(false);
          setChatStream('');
          chatStreamRef.current = null;
        }
      }
    },
    [chatBusy, hasSettings, transcript, ensureTranscript, video, summary],
  );

  const handleSend = useCallback(
    (question: string) => {
      setView('chat');
      void runChat(question, chat);
    },
    [runChat, chat],
  );

  const handleRegenerate = useCallback(() => {
    if (chatBusy) return;
    if (!hasSettings) {
      setChatError({ message: '请先在设置页配置模型。', code: 'NO_SETTINGS' });
      return;
    }
    const lastIndex = chat.length - 1;
    const last = chat[lastIndex];
    if (!last || last.role !== 'assistant') return;

    let userIndex = -1;
    for (let index = lastIndex - 1; index >= 0; index -= 1) {
      if (chat[index]?.role === 'user') {
        userIndex = index;
        break;
      }
    }
    if (userIndex < 0) return;

    const question = chat[userIndex]?.content ?? '';
    const baseHistory = chat.slice(0, userIndex);
    void runChat(question, baseHistory);
  }, [chat, chatBusy, hasSettings, runChat]);

  const handleCancelChat = useCallback(() => {
    chatRunRef.current += 1;
    chatStreamRef.current?.cancel();
    chatStreamRef.current = null;
    setChatBusy(false);
    setChatStream('');
  }, []);

  const handleClearChat = useCallback(() => {
    chatRunRef.current += 1;
    chatStreamRef.current?.cancel();
    chatStreamRef.current = null;
    setChatBusy(false);
    setChat([]);
    setChatError(null);
    setChatStream('');
    void saveChatHistory(video.cid, []);
  }, [video.cid]);

  const handleAskChapter = useCallback(
    (chapter: { start: number; title: string }) => {
      const label = formatTimestampForDuration(chapter.start, video.duration);
      handleSend(`请详细讲讲 [${label}] 开始的「${chapter.title}」这一部分。`);
    },
    [handleSend, video.duration],
  );

  const handleLocate = useCallback((seconds: number) => {
    seekTo(seconds);
    focusNonceRef.current += 1;
    setTranscriptFocus({ seconds, nonce: focusNonceRef.current });
    setView('transcript');
  }, []);

  const startWindowDrag = (
    event: ReactPointerEvent<HTMLElement>,
    mode: 'move' | 'resize',
  ): void => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (mode === 'move' && target.closest('button, a, input, select, textarea')) return;

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = rectRef.current;

    const onMove = (moveEvent: PointerEvent): void => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      if (mode === 'move') {
        setRect(clampRect({ ...origin, x: origin.x + deltaX, y: origin.y + deltaY }));
      } else {
        setRect(
          clampRect({
            ...origin,
            width: origin.width + deltaX,
            height: origin.height + deltaY,
          }),
        );
      }
    };

    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      savePanelRect(rectRef.current);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <section
      data-bb-panel=""
      className="bb-window pointer-events-auto fixed z-[2147483646] flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_64px_-12px_rgba(0,0,0,0.35)]"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
      aria-label="BiliCueNote 视频助手"
    >
      <header
        onPointerDown={(event) => startWindowDrag(event, 'move')}
        className="flex h-11 shrink-0 cursor-grab select-none items-center gap-2 border-b border-line bg-surface-sunken px-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:cursor-grabbing"
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand">
          <BrandMarkIcon width={13} height={13} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-semibold uppercase leading-3 tracking-[0.14em] text-brand-strong">
            BiliCueNote
          </div>
          <p className="truncate text-[12px] font-medium leading-4 text-fg" title={video.title}>
            {video.title}
          </p>
        </div>
        <Tooltip label={dark ? '切换为浅色' : '切换为深色'}>
          <IconButton label={dark ? '切换为浅色' : '切换为深色'} onClick={onToggleTheme}>
            {dark ? <SunIcon width={15} height={15} /> : <MoonIcon width={15} height={15} />}
          </IconButton>
        </Tooltip>
        <Tooltip label="设置">
          <IconButton label="设置" onClick={openOptions}>
            <SettingsIcon width={15} height={15} />
          </IconButton>
        </Tooltip>
        <Tooltip label="关闭">
          <IconButton label="关闭" onClick={onClose}>
            <CloseIcon width={15} height={15} />
          </IconButton>
        </Tooltip>
      </header>

      <div
        role="tablist"
        aria-label="面板视图"
        className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-surface-sunken px-2"
      >
        {VIEW_TABS.map(({ value, label, Icon }) => {
          const active = view === value;
          return (
            <Tooltip key={value} label={label}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={label}
                onClick={() => setView(value)}
                className={`bb-focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  active
                    ? 'bg-brand-soft text-brand-strong'
                    : 'text-fg-muted hover:bg-surface-muted/70 hover:text-fg'
                }`}
              >
                <Icon width={14} height={14} />
              </button>
            </Tooltip>
          );
        })}
      </div>

      {view === 'chat' && (
        <OverviewStrip
          summary={summary}
          status={status}
          error={error}
          progress={progress}
          hasSettings={hasSettings}
          onGenerate={() => void handleGenerate()}
          onCancel={handleCancelSummary}
          onOpenSettings={openOptions}
        />
      )}

      <div className="relative min-h-0 flex-1">
        <div className={view === 'chat' ? 'flex h-full min-h-0 flex-col' : 'hidden'}>
          <ChatTab
            messages={chat}
            streamingText={chatStream}
            busy={chatBusy}
            error={chatError}
            hasTranscript={Boolean(transcript)}
            hasSettings={hasSettings}
            transcriptLoading={status === 'loading-transcript'}
            transcript={transcript}
            summary={summary}
            duration={video.duration}
            onSend={handleSend}
            onFetchTranscript={() => void handleFetchTranscript()}
            onOpenSettings={openOptions}
            onSeek={seekTo}
            onLocate={handleLocate}
            onRegenerate={handleRegenerate}
            onCancel={handleCancelChat}
            onClearChat={handleClearChat}
          />
        </div>

        {view === 'summary' && (
          <div className="absolute inset-0 bg-surface">
            <SummaryTab
              video={video}
              summary={summary}
              status={status}
              error={error}
              progress={progress}
              length={length}
              language={language}
              hasSettings={hasSettings}
              onLengthChange={setLength}
              onLanguageChange={setLanguage}
              onGenerate={() => void handleGenerate()}
              onCancel={handleCancelSummary}
              onOpenSettings={openOptions}
              onSeek={seekTo}
              onAskChapter={handleAskChapter}
            />
          </div>
        )}

        {view === 'transcript' && (
          <div className="absolute inset-0 bg-surface">
            <TranscriptTab
              video={video}
              transcript={transcript}
              status={status}
              error={error}
              focus={transcriptFocus}
              onFetch={() => void handleFetchTranscript()}
              onSeek={seekTo}
            />
          </div>
        )}
      </div>

      <div
        onPointerDown={(event) => startWindowDrag(event, 'resize')}
        className="absolute bottom-0 right-0 z-20 h-4 w-4 cursor-nwse-resize"
        aria-hidden="true"
        title="拖动调整窗口大小"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          className="text-fg-subtle/70"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        >
          <path d="M10.5 14.5 14.5 10.5M6.5 14.5 14.5 6.5" />
        </svg>
      </div>
    </section>
  );
}
