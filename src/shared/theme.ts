import type { ThemePreference } from './types';

/**
 * Resolve the effective dark state. `auto` keeps whatever the environment
 * detects (the Bilibili page inside the panel, the OS in the options page);
 * explicit preferences always win.
 */
export function resolveDarkTheme(preference: ThemePreference, autoDark: boolean): boolean {
  if (preference === 'dark') return true;
  if (preference === 'light') return false;
  return autoDark;
}
