import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SVGProps,
} from 'react';
import { createPortal } from 'react-dom';
import { formatTimestampForDuration, parseTimestampToken } from '../../shared/bilibili';
import type { AppErrorCode, SubtitleLine } from '../../shared/types';

type IconProps = SVGProps<SVGSVGElement>;

function baseIcon(props: IconProps): IconProps {
  return {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  };
}

export function SparklesIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="M9.9 2.6 11.5 8l5.4 1.6-5.4 1.6-1.6 5.4L8.3 11.2 2.9 9.6 8.3 8Z" />
      <path d="M18 3v4M20 5h-4M17 17v4M19 19h-4" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5M12 15V3" />
    </svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="M3 12a9 9 0 0 1 15.5-6.4L21 8" />
      <path d="M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function FileTextIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </svg>
  );
}

export function CaptionsIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M7 12h3M14 12h3M7 15h3M14 15h3" />
    </svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function LocateIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="m7 4 13 8-13 8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MessageIcon(props: IconProps) {
  return (
    <svg {...baseIcon(props)}>
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />
    </svg>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

type ButtonVariant = 'default' | 'brand' | 'outline' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'icon' | 'icon-sm' | 'xs';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default: 'bg-fg text-surface hover:bg-fg/90',
  brand: 'bg-brand text-on-brand hover:bg-brand-strong',
  outline: 'border border-line bg-surface text-fg hover:bg-surface-muted',
  secondary: 'bg-surface-muted text-fg hover:bg-line',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  destructive: 'bg-danger-fg text-surface hover:bg-danger-fg/90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-md px-2.5 text-xs',
  md: 'h-9 rounded-lg px-3.5 text-sm',
  icon: 'h-9 w-9 rounded-lg p-0',
  'icon-sm': 'h-7 w-7 rounded-md p-0',
  xs: 'h-7 rounded-md px-2 text-[11px]',
};

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type="button"
      className={`bb-focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className = '',
  size = 'icon-sm',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  size?: ButtonSize;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`bb-focus-ring inline-flex shrink-0 items-center justify-center text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:pointer-events-none disabled:opacity-40 ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Tooltip({
  label,
  side = 'bottom',
  children,
}: {
  label: string;
  side?: 'bottom' | 'left' | 'top' | 'right';
  children: ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);
  const position =
    side === 'left'
      ? 'right-full top-1/2 mr-2 -translate-y-1/2'
      : side === 'right'
        ? 'left-full top-1/2 ml-2 -translate-y-1/2'
        : side === 'top'
          ? 'bottom-full left-1/2 mb-2 -translate-x-1/2'
          : 'left-1/2 top-full mt-2 -translate-x-1/2';

  return (
    <span
      className="group/tt relative inline-flex"
      onPointerDown={() => setDismissed(true)}
      onPointerLeave={() => setDismissed(false)}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[2147483646] whitespace-nowrap rounded-md bg-fg px-2 py-1 text-[11px] font-medium text-surface opacity-0 shadow-md transition-opacity duration-150 group-has-[:focus-visible]/tt:opacity-100 ${dismissed ? '' : 'group-hover/tt:opacity-100'} ${position}`}
      >
        {label}
      </span>
    </span>
  );
}

export function ProgressBar({ value }: { value?: number }) {
  const percent =
    value === undefined ? undefined : Math.min(100, Math.max(0, Math.round(value * 100)));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-muted">
      {percent === undefined ? (
        <div className="bb-progress-indeterminate h-full w-1/4 rounded-full bg-brand" />
      ) : (
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
}

export function SkeletonLines({ lines = 4 }: { lines?: number }) {
  const widths = ['92%', '78%', '85%', '64%', '88%', '72%'];
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="h-2.5 animate-pulse rounded-full bg-surface-muted"
          style={{ width: widths[index % widths.length] }}
        />
      ))}
    </div>
  );
}

export function TimestampButton({
  seconds,
  duration = 0,
  onSeek,
  className = '',
}: {
  seconds: number;
  duration?: number;
  onSeek: (seconds: number) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSeek(seconds)}
      className={`bb-focus-ring inline-block rounded-md bg-brand-soft px-1.5 py-0.5 align-baseline font-mono text-[11px] font-medium text-brand-strong transition-colors hover:bg-brand/15 ${className}`}
      title="跳转到视频对应位置"
    >
      {formatTimestampForDuration(seconds, duration)}
    </button>
  );
}

const TIME_TOKEN = String.raw`(?:\d{1,2}:\d{2}(?::\d{2})?|\d+(?:\.\d+)?\s*(?:s|秒))`;
const BRACKETED_TIMESTAMP_RE = new RegExp(String.raw`(\[${TIME_TOKEN}\]|【${TIME_TOKEN}】)`, 'g');
// Chat answers may cite `[03:21]`, `【03:21】`, a bare `03:21`, or the raw
// seconds form `[17.6s]` copied from the transcript. Accept all of them.
const CHAT_TIMESTAMP_RE = new RegExp(
  String.raw`(\[${TIME_TOKEN}\]|【${TIME_TOKEN}】|(?<![\d:.])\d{1,2}:\d{2}(?::\d{2})?(?![\d:])|(?<![\d:.])\d+(?:\.\d+)?\s*(?:s|秒)(?![\d:]))`,
  'g',
);
const BOLD_RE = /(\*\*[^*]+\*\*)/g;
const CODE_RE = /(`[^`]+`)/g;
const LINK_RE = /(\[[^\]]+\]\([^)]+\))/g;

function excerptAt(lines: SubtitleLine[] | null, seconds: number, windowLines = 1): string | null {
  if (!lines || lines.length === 0) return null;
  let index = lines.findIndex((line) => seconds >= line.from && seconds <= line.to);
  if (index < 0) {
    const next = lines.findIndex((line) => line.from >= seconds);
    index = next < 0 ? lines.length - 1 : next;
  }
  const first = Math.max(0, index - windowLines);
  const last = Math.min(lines.length - 1, index + windowLines);
  const text = lines
    .slice(first, last + 1)
    .map((line) => line.content)
    .join('')
    .trim();
  return text ? text.slice(0, 220) : null;
}

function CitationChip({
  seconds,
  duration,
  excerpt,
  onSeek,
  onLocate,
}: {
  seconds: number;
  duration: number;
  excerpt: string | null;
  onSeek: (seconds: number) => void;
  onLocate?: (seconds: number) => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  // A hover card pinned with viewport coordinates must not survive scrolling,
  // dragging the window, or the pointer moving away.
  useEffect(() => {
    if (!anchor) return;

    const onPointerDown = (event: PointerEvent): void => {
      const path = event.composedPath();
      if (ref.current && path.includes(ref.current)) return;
      if (popoverRef.current && path.includes(popoverRef.current)) return;
      setAnchor(null);
    };
    const onScroll = (): void => setAnchor(null);
    const onBlur = (): void => setAnchor(null);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setAnchor(null);
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [anchor]);

  const open = (): void => {
    if (!excerpt) return;
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const width = 280;
    const panelRect = document
      .querySelector<HTMLElement>('section[data-bb-panel]')
      ?.getBoundingClientRect();
    const minLeft = panelRect ? panelRect.left + 8 : 8;
    const maxLeft = panelRect ? panelRect.right - width - 8 : window.innerWidth - width - 8;
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, minLeft),
      Math.max(minLeft, maxLeft),
    );
    const spaceAbove = rect.top - (panelRect?.top ?? 0);
    const spaceBelow = (panelRect?.bottom ?? window.innerHeight) - rect.bottom;
    const above = spaceBelow < 140 && spaceAbove > spaceBelow;
    setPortalRoot(
      document
        .querySelector<HTMLElement>('#bili-cue-note-host')
        ?.shadowRoot?.querySelector<HTMLElement>('.bb-root') ?? null,
    );
    setAnchor({ left, top: above ? rect.top - 8 : rect.bottom + 8, above });
  };

  const scheduleClose = (): void => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setAnchor(null), 120);
  };

  const label = formatTimestampForDuration(seconds, duration);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onFocus={open}
        onBlur={scheduleClose}
        onClick={() => {
          onSeek(seconds);
          setAnchor(null);
        }}
        className="bb-focus-ring mx-0.5 inline-flex items-center rounded-md bg-brand-soft px-1.5 py-0.5 align-baseline font-mono text-[11px] font-medium text-brand-strong transition-colors hover:bg-brand/15"
      >
        {label}
      </button>

      {anchor &&
        excerpt &&
        portalRoot &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            data-bb-panel=""
            onMouseEnter={open}
            onMouseLeave={scheduleClose}
            style={{
              position: 'fixed',
              left: anchor.left,
              top: anchor.top,
              width: 280,
              transform: anchor.above ? 'translateY(-100%)' : undefined,
            }}
            className="bb-citation-popover pointer-events-auto z-[2147483647] rounded-xl bg-surface-raised p-3 font-sans text-sm"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-medium text-brand-strong">{label}</span>
              <span className="text-[10px] text-fg-subtle">字幕原文</span>
            </div>
            <p className="text-xs leading-5 text-fg-muted">{excerpt}</p>
            <div className="mt-2.5 flex gap-1.5">
              <Button
                size="xs"
                variant="secondary"
                onClick={() => {
                  onSeek(seconds);
                  setAnchor(null);
                }}
              >
                <PlayIcon width={12} height={12} />
                跳转播放
              </Button>
              {onLocate && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    onLocate(seconds);
                    setAnchor(null);
                  }}
                >
                  <LocateIcon width={12} height={12} />
                  在字幕中查看
                </Button>
              )}
            </div>
          </div>,
          portalRoot,
        )}
    </>
  );
}

function renderTimestampParts(
  text: string,
  regex: RegExp,
  onSeek: (seconds: number) => void,
  duration: number,
  keyPrefix: string,
  lines: SubtitleLine[] | null,
  onLocate?: (seconds: number) => void,
): ReactNode[] {
  return text.split(regex).map((part, index) => {
    const seconds = parseTimestampToken(part);
    if (seconds !== null) {
      return (
        <CitationChip
          key={`ts-${keyPrefix}-${index}`}
          seconds={seconds}
          duration={duration}
          excerpt={excerptAt(lines, seconds)}
          onSeek={onSeek}
          onLocate={onLocate}
        />
      );
    }
    return <span key={`txt-${keyPrefix}-${index}`}>{part}</span>;
  });
}

function renderLinks(
  text: string,
  onSeek: (seconds: number) => void,
  duration: number,
  keyPrefix: string,
  lines: SubtitleLine[] | null,
  onLocate?: (seconds: number) => void,
): ReactNode[] {
  return text.split(LINK_RE).map((part, index) => {
    const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (match) {
      const href = match[2] ?? '';
      const safe = /^https?:\/\//i.test(href);
      const label = match[1] ?? '';
      if (safe) {
        return (
          <a
            key={`link-${keyPrefix}-${index}`}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-brand-strong underline underline-offset-2 hover:text-brand"
          >
            {label}
          </a>
        );
      }
      return <span key={`link-text-${keyPrefix}-${index}`}>{label}</span>;
    }
    return (
      <span key={`link-plain-${keyPrefix}-${index}`}>
        {renderTimestampParts(
          part,
          CHAT_TIMESTAMP_RE,
          onSeek,
          duration,
          `${keyPrefix}-${index}`,
          lines,
          onLocate,
        )}
      </span>
    );
  });
}

function renderInline(
  text: string,
  onSeek: (seconds: number) => void,
  duration: number,
  keyPrefix: string,
  lines: SubtitleLine[] | null,
  onLocate?: (seconds: number) => void,
): ReactNode[] {
  return text.split(BOLD_RE).map((part, index) => {
    const bold = part.startsWith('**') && part.endsWith('**') && part.length > 4;
    const inner = bold ? part.slice(2, -2) : part;
    const content = inner.split(CODE_RE).map((segment, codeIndex) => {
      if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
        return (
          <code
            key={`code-${keyPrefix}-${index}-${codeIndex}`}
            className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.9em] text-fg"
          >
            {segment.slice(1, -1)}
          </code>
        );
      }
      return (
        <span key={`seg-${keyPrefix}-${index}-${codeIndex}`}>
          {renderLinks(
            segment,
            onSeek,
            duration,
            `${keyPrefix}-${index}-${codeIndex}`,
            lines,
            onLocate,
          )}
        </span>
      );
    });

    return bold ? (
      <strong key={`b-${keyPrefix}-${index}`} className="font-semibold text-fg">
        {content}
      </strong>
    ) : (
      <span key={`s-${keyPrefix}-${index}`}>{content}</span>
    );
  });
}

export function InlineTimestampText({
  text,
  duration = 0,
  onSeek,
}: {
  text: string;
  duration?: number;
  onSeek: (seconds: number) => void;
}) {
  return (
    <>
      {text.split(BRACKETED_TIMESTAMP_RE).map((part, index) => {
        const seconds = parseTimestampToken(part);
        return seconds !== null ? (
          <TimestampButton
            key={`ts-${index}`}
            seconds={seconds}
            duration={duration}
            onSeek={onSeek}
            className="mx-0.5 align-baseline"
          />
        ) : (
          <span key={`txt-${index}`}>{part}</span>
        );
      })}
    </>
  );
}

export function ChatMarkdown({
  text,
  lines = null,
  duration = 0,
  onSeek,
  onLocate,
}: {
  text: string;
  lines?: SubtitleLine[] | null;
  duration?: number;
  onSeek: (seconds: number) => void;
  onLocate?: (seconds: number) => void;
}) {
  const rows = text.split(/\r?\n/);
  return (
    <div className="space-y-1.5 break-words text-sm leading-6 text-fg">
      {rows.map((row, rowIndex) => {
        const trimmed = row.trim();
        if (!trimmed) return <div key={`empty-${rowIndex}`} className="h-1.5" />;

        const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
        if (heading) {
          const level = heading[1]?.length ?? 1;
          return (
            <div
              key={`h-${rowIndex}`}
              className={`pt-1.5 font-semibold text-fg ${level === 1 ? 'text-[15px]' : 'text-sm'}`}
            >
              {renderInline(heading[2] ?? '', onSeek, duration, `h-${rowIndex}`, lines, onLocate)}
            </div>
          );
        }

        if (/^---+$/.test(trimmed)) {
          return <hr key={`hr-${rowIndex}`} className="my-2 border-line" />;
        }

        const quote = /^>\s?(.*)$/.exec(trimmed);
        if (quote) {
          return (
            <div key={`q-${rowIndex}`} className="border-l-2 border-brand/50 pl-3 text-fg-muted">
              {renderInline(quote[1] ?? '', onSeek, duration, `q-${rowIndex}`, lines, onLocate)}
            </div>
          );
        }

        const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
        const ordered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
        if (bullet || ordered) {
          return (
            <div key={`li-${rowIndex}`} className="flex gap-2">
              <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
              <span className="min-w-0 flex-1">
                {renderInline(
                  bullet?.[1] ?? ordered?.[2] ?? '',
                  onSeek,
                  duration,
                  `li-${rowIndex}`,
                  lines,
                  onLocate,
                )}
              </span>
            </div>
          );
        }

        return (
          <p key={`p-${rowIndex}`}>
            {renderInline(trimmed, onSeek, duration, `p-${rowIndex}`, lines, onLocate)}
          </p>
        );
      })}
    </div>
  );
}

export function errorKind(code?: AppErrorCode): 'warning' | 'danger' {
  if (
    code === 'LLM_AUTH' ||
    code === 'LLM_QUOTA' ||
    code === 'LLM_RATE_LIMIT' ||
    code === 'LLM_ERROR' ||
    code === 'UNKNOWN'
  ) {
    return 'danger';
  }
  return 'warning';
}

export function ErrorBanner({
  message,
  kind = 'warning',
  onRetry,
  onSettings,
  retryLabel = '重试',
}: {
  message: string;
  kind?: 'warning' | 'danger';
  onRetry?: () => void;
  onSettings?: () => void;
  retryLabel?: string;
}) {
  const palette =
    kind === 'danger'
      ? 'border-danger-line bg-danger-bg text-danger-fg'
      : 'border-warning-line bg-warning-bg text-warning-fg';

  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-5 ${palette}`}>
      <AlertIcon className="mt-0.5 shrink-0" width={15} height={15} />
      <div className="min-w-0 flex-1">
        <p className="break-words">{message}</p>
        {(onRetry || onSettings) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {onSettings && (
              <button
                type="button"
                onClick={onSettings}
                className="bb-focus-ring rounded-md border border-current/30 px-2 py-1 text-[11px] font-medium hover:bg-current/10"
              >
                打开设置
              </button>
            )}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="bb-focus-ring rounded-md border border-current/30 px-2 py-1 text-[11px] font-medium hover:bg-current/10"
              >
                {retryLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CopyButton({
  text,
  label = '复制',
  className = '',
  size = 'sm',
}: {
  text: string;
  label?: string;
  className?: string;
  size?: ButtonSize;
}) {
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
    <Button
      variant="outline"
      size={size}
      onClick={() => void copy()}
      className={className}
      aria-label={copied ? '已复制' : label}
    >
      {copied ? <CheckIcon width={13} height={13} /> : <CopyIcon width={13} height={13} />}
      {copied ? '已复制' : label}
    </Button>
  );
}
