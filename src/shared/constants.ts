import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  contextWindow: 128_000,
  outputLanguage: 'auto',
  summaryLength: 'medium',
  theme: 'auto',
};

export const PROMPT_VERSION = '1';
export const DB_NAME = 'bili-cue-note';
export const DB_VERSION = 1;

export const SUBTITLE_PRIORITY = ['ai-zh', 'zh-CN', 'zh-Hans', 'zh', 'zh-TW'];

export const MAX_RETRIES = 2;
export const SUMMARY_CONTEXT_RATIO = 0.6;
export const OUTPUT_RESERVE_TOKENS = 4_000;

export const PANEL_WIDTH = 420;
export const EXTENSION_NAME = 'BiliCueNote';
