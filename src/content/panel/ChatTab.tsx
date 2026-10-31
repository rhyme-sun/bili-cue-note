import { useEffect, useMemo, useRef, useState } from 'react';
import { formatTimestampForDuration } from '../../shared/bilibili';
import type { ChatMessage, Transcript, VideoSummary } from '../../shared/types';
import { usePlaybackClock } from './hooks';
import { followUpSuggestions, welcomeSuggestions } from './suggestions';
import type { PanelError } from './types';
import {
  ArrowUpIcon,
  Button,
  ChatMarkdown,
  CheckIcon,
  CopyIcon,
  ErrorBanner,
  MessageIcon,
  PlayIcon,
  RefreshIcon,
  SparklesIcon,
  Spinner,
  StopIcon,
  TrashIcon,
  errorKind,
} from './ui';

const DEEPEN_PROMPT = '请把上一条回答展开讲得更详细一些，保留时间戳引用。';

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <Button variant="ghost" size="xs" onClick={() => void copy()} aria-label="复制回答">
      {copied ? <CheckIcon width={12} height={12} /> : <CopyIcon width={12} height={12} />}
      {copied ? '已复制' : '复制'}
    </Button>
  );
}

function SuggestionChips({
  items,
  onPick,
  disabled,
}: {
  items: string[];
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          disabled={disabled}
          onClick={() => onPick(item)}
          className="bb-focus-ring rounded-full border border-line bg-surface-muted px-3 py-1 text-left text-xs leading-4 text-fg-muted transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-fg disabled:pointer-events-none disabled:opacity-50"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function PlaybackChip({
  duration,
  disabled,
  onInsert,
}: {
  duration: number;
  disabled: boolean;
  onInsert: (token: string) => void;
}) {
  const { seconds } = usePlaybackClock();
  if (seconds <= 0) return null;
  const label = formatTimestampForDuration(seconds, duration);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onInsert(`[${label}] `)}
      className="bb-focus-ring mb-1.5 inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-medium text-fg-muted transition-colors hover:border-brand/40 hover:text-fg disabled:pointer-events-none disabled:opacity-50"
      title="把当前播放位置插入提问"
    >
      <PlayIcon width={9} height={9} />
      引用 {label}
    </button>
  );
}

function ClearChatAction({ disabled, onClear }: { disabled: boolean; onClear: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!confirming) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setConfirming(false);
      triggerRef.current?.focus();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [confirming]);

  const close = (): void => {
    setConfirming(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setConfirming(true)}
        aria-label="清空对话"
        aria-haspopup="dialog"
        className="bb-focus-ring mb-1.5 ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-danger-bg hover:text-danger-fg disabled:pointer-events-none disabled:opacity-40"
      >
        <TrashIcon width={14} height={14} />
      </button>

      {confirming && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[1px]"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="确认清空对话"
            className="w-full max-w-[260px] rounded-2xl border border-danger-line bg-surface-raised p-4 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-start gap-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger-fg">
                <TrashIcon width={15} height={15} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">清空当前对话？</p>
                <p className="mt-1 text-xs leading-5 text-fg-muted">
                  将删除本视频在本机的全部对话记录，此操作不可撤销。
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={close} autoFocus>
                取消
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setConfirming(false);
                  onClear();
                }}
              >
                清空
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ChatTab({
  messages,
  streamingText,
  busy,
  error,
  hasTranscript,
  hasSettings,
  transcriptLoading,
  transcript,
  summary,
  duration,
  onSend,
  onFetchTranscript,
  onOpenSettings,
  onSeek,
  onLocate,
  onRegenerate,
  onCancel,
  onClearChat,
}: {
  messages: ChatMessage[];
  streamingText: string;
  busy: boolean;
  error: PanelError | null;
  hasTranscript: boolean;
  hasSettings: boolean;
  transcriptLoading: boolean;
  transcript: Transcript | null;
  summary: VideoSummary | null;
  duration: number;
  onSend: (question: string) => void;
  onFetchTranscript: () => void;
  onOpenSettings: () => void;
  onSeek: (seconds: number) => void;
  onLocate: (seconds: number) => void;
  onRegenerate: () => void;
  onCancel: () => void;
  onClearChat: () => void;
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, streamingText, busy]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  }, [draft]);

  const canSend = hasTranscript && hasSettings && !busy && draft.trim().length > 0;
  const lastIndex = messages.length - 1;
  const lastMessage = messages[lastIndex];
  const showFollowUps = !busy && Boolean(lastMessage && lastMessage.role === 'assistant');
  const suggestions = useMemo(
    () =>
      messages.length === 0
        ? welcomeSuggestions(summary)
        : followUpSuggestions({ messages, summary, duration }),
    [messages, summary, duration],
  );

  const submit = (): void => {
    if (!canSend) return;
    const question = draft.trim();
    setDraft('');
    onSend(question);
  };

  const insertTimestamp = (token: string): void => {
    setDraft((previous) => (previous.trim() ? `${previous.trimEnd()} ${token}` : token));
    textareaRef.current?.focus();
  };

  const empty = messages.length === 0 && !streamingText && !busy;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="bb-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!hasTranscript ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            {transcriptLoading ? (
              <>
                <Spinner className="text-brand" />
                <p className="text-sm text-fg-muted">正在获取字幕…</p>
              </>
            ) : (
              <>
                <div className="rounded-full bg-brand-soft p-3 text-brand-strong">
                  <MessageIcon width={22} height={22} />
                </div>
                <p className="text-sm font-medium text-fg">对话需要先获取字幕</p>
                <p className="max-w-[260px] text-xs leading-5 text-fg-muted">
                  字幕是回答的唯一依据，不会凭空生成内容。需要登录 B 站，且视频有字幕轨。
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="brand" size="sm" onClick={onFetchTranscript}>
                    获取字幕
                  </Button>
                  {!hasSettings && (
                    <Button variant="outline" size="sm" onClick={onOpenSettings}>
                      配置模型
                    </Button>
                  )}
                </div>
                {error && (
                  <div className="mt-1 w-full max-w-[300px]">
                    <ErrorBanner message={error.message} kind={errorKind(error.code)} />
                  </div>
                )}
              </>
            )}
          </div>
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="rounded-full bg-brand-soft p-3 text-brand-strong">
              <SparklesIcon width={22} height={22} />
            </div>
            <div>
              <p className="text-sm font-medium text-fg">围绕这个视频提问</p>
              <p className="mt-1 max-w-[270px] text-xs leading-5 text-fg-muted">
                回答会标注字幕时间戳；点击即可跳转，悬停可核对原文。
              </p>
            </div>
            {!hasSettings && (
              <div className="w-full max-w-[300px] text-left">
                <ErrorBanner
                  message="还没有配置模型。请先填写 Base URL、API Key 和模型。"
                  onSettings={onOpenSettings}
                />
              </div>
            )}
            <div className="w-full max-w-[300px]">
              <SuggestionChips
                items={suggestions}
                onPick={onSend}
                disabled={!hasSettings || busy}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) =>
              message.role === 'user' ? (
                <div key={`${message.createdAt}-${index}`} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-surface-muted px-3.5 py-2 text-sm leading-6 text-fg">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={`${message.createdAt}-${index}`} className="bb-message flex gap-2.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
                    <SparklesIcon width={13} height={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <ChatMarkdown
                      text={message.content}
                      lines={transcript?.lines ?? null}
                      duration={duration}
                      onSeek={onSeek}
                      onLocate={onLocate}
                    />
                    <div className="bb-message-actions mt-1 flex flex-wrap items-center gap-0.5">
                      <CopyAction text={message.content} />
                      {index === lastIndex && (
                        <>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={onRegenerate}
                            disabled={busy}
                            aria-label="重新生成回答"
                          >
                            <RefreshIcon width={12} height={12} />
                            重新生成
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => onSend(DEEPEN_PROMPT)}
                            disabled={busy || !hasSettings}
                            aria-label="展开这条回答"
                          >
                            <SparklesIcon width={12} height={12} />
                            再展开
                          </Button>
                        </>
                      )}
                    </div>
                    {index === lastIndex && showFollowUps && suggestions.length > 0 && (
                      <div className="mt-2">
                        <SuggestionChips
                          items={suggestions}
                          onPick={onSend}
                          disabled={!hasSettings}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}

            {busy && (
              <div className="flex gap-2.5">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
                  <SparklesIcon width={13} height={13} />
                </div>
                <div className="min-w-0 flex-1">
                  {streamingText ? (
                    <>
                      <ChatMarkdown
                        text={streamingText}
                        lines={transcript?.lines ?? null}
                        duration={duration}
                        onSeek={onSeek}
                        onLocate={onLocate}
                      />
                      <span className="bb-caret mt-1 inline-block h-3.5 w-1.5 rounded-sm bg-brand align-middle" />
                    </>
                  ) : (
                    <span className="flex items-center gap-2 py-0.5 text-xs text-fg-muted">
                      <Spinner className="h-3.5 w-3.5 text-brand" />
                      正在结合字幕思考…
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-surface-sunken px-3 pb-3 pt-2.5">
        {error && hasTranscript && (
          <div className="mb-2">
            <ErrorBanner message={error.message} kind={errorKind(error.code)} />
          </div>
        )}

        <div className="flex items-center gap-2">
          <PlaybackChip
            duration={duration}
            disabled={!hasTranscript || !hasSettings}
            onInsert={insertTimestamp}
          />
          {hasTranscript && messages.length > 0 && (
            <ClearChatAction disabled={busy} onClear={onClearChat} />
          )}
        </div>

        <div className="rounded-2xl border border-line bg-surface p-2 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.14)] transition focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/10">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            disabled={!hasTranscript || !hasSettings || busy}
            placeholder={
              !hasSettings ? '请先配置模型' : !hasTranscript ? '请先获取字幕' : '问点什么…'
            }
            className="bb-scroll block max-h-[120px] w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm leading-6 text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="flex items-center justify-end gap-2 px-0.5 pb-0.5">
            {busy ? (
              <Button variant="secondary" size="icon-sm" onClick={onCancel} aria-label="停止生成">
                <StopIcon width={13} height={13} />
              </Button>
            ) : (
              <Button
                variant="brand"
                size="icon-sm"
                onClick={submit}
                disabled={!canSend}
                aria-label="发送"
                title="发送（Enter）"
              >
                <ArrowUpIcon width={14} height={14} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
