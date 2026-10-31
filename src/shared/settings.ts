import { DEFAULT_SETTINGS } from './constants';
import type { Settings } from './types';

export async function getSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get('settings')) as { settings?: Partial<Settings> };
  return { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') return;
    const change = changes.settings;
    if (!change) return;
    callback({ ...DEFAULT_SETTINGS, ...((change.newValue as Partial<Settings>) ?? {}) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function hasLlmConfig(settings: Settings): boolean {
  return Boolean(settings.baseUrl.trim() && settings.apiKey.trim() && settings.model.trim());
}
