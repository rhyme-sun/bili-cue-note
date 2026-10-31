const DARK_CLASSES = ['bili_dark', 'bili-dark', 'dark'];
const LIGHT_CLASSES = ['bili_light', 'bili-light'];

function hasCookieTheme(): 'dark' | 'light' | null {
  const match = /(?:^|;\s*)theme_style=(dark|light)\b/.exec(document.cookie);
  if (!match) return null;
  return match[1] === 'dark' ? 'dark' : 'light';
}

/**
 * Bilibili's own dark mode is driven by `html.bili_dark` and the
 * `theme_style` cookie; when neither signal is present we follow the OS.
 */
export function detectPageDark(): boolean {
  const root = document.documentElement;
  if (DARK_CLASSES.some((name) => root.classList.contains(name))) return true;
  if (root.getAttribute('lab-style') === 'dark') return true;
  if (root.getAttribute('data-theme') === 'dark') return true;
  if (LIGHT_CLASSES.some((name) => root.classList.contains(name))) return false;

  const cookie = hasCookieTheme();
  if (cookie) return cookie === 'dark';

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyPanelDark(dark: boolean): void {
  const host = document.getElementById('bili-cue-note-host');
  const root = host?.shadowRoot?.querySelector<HTMLElement>('.bb-root');
  root?.classList.toggle('dark', dark);
}

export function observePageDark(onChange: (dark: boolean) => void): () => void {
  let active = true;
  const notify = (): void => {
    if (active) onChange(detectPageDark());
  };

  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'lab-style'],
  });

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', notify);

  notify();

  return () => {
    active = false;
    observer.disconnect();
    media.removeEventListener('change', notify);
  };
}
