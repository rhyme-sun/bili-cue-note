import { PANEL_WIDTH } from '../../shared/constants';

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STORAGE_KEY = 'bb-panel-window';
const MARGIN = 12;

export const MIN_PANEL_WIDTH = 360;
export const MIN_PANEL_HEIGHT = 480;
export const MAX_PANEL_WIDTH = 760;

export function clampRect(rect: PanelRect): PanelRect {
  const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth);
  const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
  const maxWidth = Math.min(MAX_PANEL_WIDTH, viewportWidth - MARGIN * 2);
  const maxHeight = viewportHeight - MARGIN * 2;

  const width = Math.min(Math.max(rect.width, MIN_PANEL_WIDTH), Math.max(minWidth(), maxWidth));
  const height = Math.min(
    Math.max(rect.height, MIN_PANEL_HEIGHT),
    Math.max(minHeight(), maxHeight),
  );

  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, MARGIN), Math.max(MARGIN, viewportWidth - width - MARGIN)),
    y: Math.min(Math.max(rect.y, MARGIN), Math.max(MARGIN, viewportHeight - height - MARGIN)),
  };
}

function minWidth(): number {
  return Math.min(MIN_PANEL_WIDTH, Math.max(280, window.innerWidth - MARGIN * 2));
}

function minHeight(): number {
  return Math.min(MIN_PANEL_HEIGHT, Math.max(320, window.innerHeight - MARGIN * 2));
}

export function defaultRect(): PanelRect {
  const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth);
  const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
  const width = Math.min(PANEL_WIDTH, Math.max(280, viewportWidth - MARGIN * 2));
  const height = Math.min(640, Math.max(320, viewportHeight - 120));
  return clampRect({
    width,
    height,
    x: viewportWidth - width - 24,
    y: 72,
  });
}

function isRect(value: unknown): value is PanelRect {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PanelRect>;
  return (
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y) &&
    typeof candidate.width === 'number' &&
    Number.isFinite(candidate.width) &&
    typeof candidate.height === 'number' &&
    Number.isFinite(candidate.height)
  );
}

export async function loadPanelRect(): Promise<PanelRect | null> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const value = stored[STORAGE_KEY];
    return isRect(value) ? clampRect(value) : null;
  } catch {
    return null;
  }
}

export function savePanelRect(rect: PanelRect): void {
  void chrome.storage.local.set({ [STORAGE_KEY]: clampRect(rect) }).catch(() => undefined);
}
