import { describe, expect, it } from 'vitest';
import { resolveDarkTheme } from '../src/shared/theme';

describe('theme preference', () => {
  it('honors explicit light and dark preferences', () => {
    expect(resolveDarkTheme('dark', false)).toBe(true);
    expect(resolveDarkTheme('light', true)).toBe(false);
  });

  it('follows the detected environment on auto', () => {
    expect(resolveDarkTheme('auto', true)).toBe(true);
    expect(resolveDarkTheme('auto', false)).toBe(false);
  });
});
