import { useCallback, useEffect, useState } from 'react';
import { BrandMarkIcon } from '../../shared/BrandMarkIcon';
import { saveSettings } from '../../shared/settings';
import { resolveDarkTheme } from '../../shared/theme';
import type { PageBridge } from '../bridge';
import { usePageDark, useSettings, useVideo } from './hooks';
import { Panel } from './Panel';
import { applyPanelDark } from './theme';
import { CloseIcon, IconButton, Spinner, Tooltip } from './ui';

function LoadingPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="bb-window pointer-events-auto fixed z-[2147483647] w-[360px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_64px_-12px_rgba(0,0,0,0.35)]"
      style={{ right: 24, top: 72 }}
    >
      <header className="flex h-11 items-center gap-2 border-b border-line px-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-on-brand">
          <BrandMarkIcon width={13} height={13} />
        </div>
        <span className="text-xs font-semibold text-fg">BiliCueNote</span>
        <IconButton label="关闭" onClick={onClose} className="ml-auto">
          <CloseIcon width={15} height={15} />
        </IconButton>
      </header>
      <div className="flex h-24 items-center justify-center gap-2 text-sm text-fg-muted">
        <Spinner className="text-brand" />
        正在读取设置…
      </div>
    </div>
  );
}

export function App({ bridge }: { bridge: PageBridge }) {
  const { settings, loaded } = useSettings();
  const video = useVideo(bridge);
  const pageDark = usePageDark();
  const [open, setOpen] = useState(false);

  const dark = resolveDarkTheme(settings.theme, pageDark);

  useEffect(() => {
    applyPanelDark(dark);
  }, [dark]);

  const toggleTheme = useCallback(() => {
    void saveSettings({ ...settings, theme: dark ? 'light' : 'dark' });
  }, [dark, settings]);

  useEffect(() => {
    const listener = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: unknown) => void,
    ): void => {
      if ((message as { type?: string } | null)?.type === 'toggle-panel') {
        setOpen((value) => !value);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };

    const onPointerDown = (event: PointerEvent): void => {
      const path = event.composedPath();
      if (path.some((node) => node instanceof HTMLElement && node.hasAttribute('data-bb-panel'))) {
        return;
      }
      const deepTarget = path.find((node): node is Element => node instanceof Element);
      if (deepTarget?.closest('.bpx-player-container, #bilibili-player, .bilibili-player, video')) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  if (!video) return null;

  return (
    <>
      {!open && (
        <div
          className="bb-entry pointer-events-auto fixed z-[2147483647]"
          style={{ right: 16, top: '32vh' }}
        >
          <Tooltip label="AI 摘要 · BiliCueNote" side="left">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="打开 BiliCueNote AI 摘要"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-on-brand shadow-[0_10px_28px_-6px_rgba(251,114,153,0.55)] ring-1 ring-black/5 transition-transform duration-150 hover:scale-105 active:scale-95"
            >
              <BrandMarkIcon width={20} height={20} />
            </button>
          </Tooltip>
        </div>
      )}

      {open &&
        (loaded ? (
          <Panel
            key={video.cid}
            bridge={bridge}
            video={video}
            settings={settings}
            dark={dark}
            onToggleTheme={toggleTheme}
            onClose={() => setOpen(false)}
          />
        ) : (
          <LoadingPanel onClose={() => setOpen(false)} />
        ))}
    </>
  );
}
