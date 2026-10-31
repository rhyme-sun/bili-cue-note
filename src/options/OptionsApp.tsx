import { useEffect, useState, type ReactNode } from 'react';
import { BrandMarkIcon } from '../shared/BrandMarkIcon';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { sendBackground } from '../shared/messaging';
import { getSettings, saveSettings } from '../shared/settings';
import { resolveDarkTheme } from '../shared/theme';
import type { OutputLanguage, Settings, SummaryLength, ThemePreference } from '../shared/types';

const PRESETS: Array<{ id: string; label: string; baseUrl: string; model: string }> = [
  {
    id: 'deepseek',
    label: 'DeepSeek（推荐）',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  {
    id: 'qwen',
    label: '通义千问（DashScope 兼容模式）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
  {
    id: 'ollama',
    label: 'Ollama（本地）',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
  },
  { id: 'custom', label: '自定义', baseUrl: '', model: '' },
];

const LENGTH_OPTIONS: Array<{ value: SummaryLength; label: string }> = [
  { value: 'short', label: '简：3–5 个章节，快速扫一眼' },
  { value: 'medium', label: '中：5–8 个章节，默认' },
  { value: 'long', label: '详：8–12 个章节，当笔记看' },
];

const LANGUAGE_OPTIONS: Array<{ value: OutputLanguage; label: string }> = [
  { value: 'auto', label: '跟随视频语言' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英文' },
  { value: 'ja', label: '日文' },
  { value: 'ko', label: '韩文' },
];

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'auto', label: '跟随 B 站页面 / 系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];

function useSystemDark(): boolean {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return systemDark;
}

type Status = { kind: 'ok' | 'error' | 'info'; message: string } | null;

function originPattern(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

async function requestOriginPermission(baseUrl: string): Promise<boolean> {
  const pattern = originPattern(baseUrl);
  if (!pattern) return false;
  try {
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

function detectPreset(settings: Settings): string {
  const found = PRESETS.find(
    (item) =>
      item.id !== 'custom' && item.baseUrl === settings.baseUrl && item.model === settings.model,
  );
  return found?.id ?? 'custom';
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-5 text-fg-muted">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition placeholder:text-fg-subtle focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-50';

const cardClass = 'space-y-5 rounded-2xl border border-line bg-surface-raised p-5 shadow-sm';

export function OptionsApp() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [preset, setPreset] = useState('deepseek');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const systemDark = useSystemDark();

  const dark = resolveDarkTheme(settings.theme, systemDark);

  useEffect(() => {
    const root = document.documentElement;
    root.style.colorScheme = dark ? 'dark' : 'light';
    if (settings.theme === 'auto') {
      // Let the prefers-color-scheme fallback in tokens.css decide.
      root.removeAttribute('data-theme');
    } else {
      root.dataset.theme = dark ? 'dark' : 'light';
    }
  }, [dark, settings.theme]);

  useEffect(() => {
    void getSettings().then((value) => {
      setSettings(value);
      setSaved(value);
      setPreset(detectPreset(value));
      setLoaded(true);
    });
  }, []);

  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    setPreset(detectPreset(next));
    setStatus(null);
  };

  const handlePreset = (id: string): void => {
    setPreset(id);
    const found = PRESETS.find((item) => item.id === id);
    if (!found || id === 'custom') return;
    setSettings((previous) => ({
      ...previous,
      baseUrl: found.baseUrl,
      model: found.model,
    }));
    setStatus(null);
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setStatus(null);
    const normalized: Settings = {
      ...settings,
      baseUrl: settings.baseUrl.trim(),
      apiKey: settings.apiKey.trim(),
      model: settings.model.trim(),
      contextWindow: Math.max(8_000, Math.floor(settings.contextWindow || 128_000)),
    };

    if (!normalized.baseUrl || !normalized.model) {
      setSaving(false);
      setStatus({ kind: 'error', message: 'Base URL 和模型名称不能为空。' });
      return;
    }

    const granted = await requestOriginPermission(normalized.baseUrl);
    await saveSettings(normalized);
    setSettings(normalized);
    setSaved(normalized);
    setSaving(false);
    setStatus(
      granted
        ? { kind: 'ok', message: '已保存。现在打开一个 B 站视频页试试。' }
        : {
            kind: 'info',
            message: '设置已保存，但没有获得该 API 域名的访问权限；请求可能会被浏览器拦截。',
          },
    );
  };

  const handleTest = async (): Promise<void> => {
    setTesting(true);
    setStatus(null);
    const granted = await requestOriginPermission(settings.baseUrl);
    if (!granted) {
      setTesting(false);
      setStatus({
        kind: 'error',
        message: '没有获得该 API 域名的访问权限，无法测试连接。',
      });
      return;
    }
    const response = await sendBackground<string>({
      type: 'test-llm',
      settings: {
        ...settings,
        baseUrl: settings.baseUrl.trim(),
        apiKey: settings.apiKey.trim(),
        model: settings.model.trim(),
        contextWindow: Math.max(8_000, Math.floor(settings.contextWindow || 128_000)),
      },
    });
    setTesting(false);
    if (response.ok) {
      setStatus({
        kind: 'ok',
        message: `连接成功，模型返回：${(response.data ?? '').slice(0, 80) || '（空）'}`,
      });
    } else {
      setStatus({ kind: 'error', message: `连接失败：${response.error}` });
    }
  };

  const handleClearCache = async (): Promise<void> => {
    if (!window.confirm('清除所有缓存的字幕、摘要和对话记录？此操作不可撤销。')) return;
    const response = await sendBackground({ type: 'db-clear' });
    setStatus(
      response.ok
        ? { kind: 'ok', message: '缓存已清除。' }
        : { kind: 'error', message: `清除失败：${response.error}` },
    );
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-fg-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        正在读取设置…
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10 text-fg">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand text-on-brand shadow-sm">
              <BrandMarkIcon width={20} height={20} />
            </span>
            <div>
              <h1 className="text-xl font-semibold leading-6">BiliCueNote 设置</h1>
              <p className="text-xs text-fg-subtle">B 站视频的 AI 学习伴侣</p>
            </div>
          </div>
          <p className="text-sm leading-6 text-fg-muted">
            用你自己的 OpenAI 兼容模型，把 B 站视频变成可追问、可核对的学习材料。Key 只保存在本机。
          </p>
        </header>

        <section className={cardClass}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">模型</h2>
            {dirty && (
              <span className="rounded-full border border-warning-line bg-warning-bg px-2 py-0.5 text-[10px] font-medium text-warning-fg">
                有未保存的修改
              </span>
            )}
          </div>

          <Field label="快速预设" hint="选择后会自动填入 Base URL 和模型名，之后仍可手动修改。">
            <select
              value={preset}
              onChange={(event) => handlePreset(event.target.value)}
              className={inputClass}
            >
              {PRESETS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Base URL"
            hint="OpenAI 兼容地址，通常以 /v1 结尾。例如 https://api.deepseek.com/v1。"
          >
            <input
              value={settings.baseUrl}
              onChange={(event) => update('baseUrl', event.target.value)}
              placeholder="https://api.deepseek.com/v1"
              spellCheck={false}
              className={inputClass}
            />
          </Field>

          <Field
            label="API Key"
            hint="只保存在 chrome.storage.local，不会同步、不会上传到 BiliCueNote。"
          >
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(event) => update('apiKey', event.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="shrink-0 rounded-lg border border-line px-3 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </Field>

          <Field label="模型名称" hint="填你账号可用的模型 ID，例如 deepseek-chat。">
            <input
              value={settings.model}
              onChange={(event) => update('model', event.target.value)}
              placeholder="deepseek-chat"
              spellCheck={false}
              className={inputClass}
            />
          </Field>

          <Field
            label="模型上下文窗口（tokens）"
            hint="用于判断长视频是否需要分段总结。不确定就保持 128000。"
          >
            <input
              type="number"
              min={8000}
              step={1000}
              value={settings.contextWindow}
              onChange={(event) => update('contextWindow', Number(event.target.value))}
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="默认摘要长度">
              <select
                value={settings.summaryLength}
                onChange={(event) => update('summaryLength', event.target.value as SummaryLength)}
                className={inputClass}
              >
                {LENGTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="默认输出语言">
              <select
                value={settings.outputLanguage}
                onChange={(event) => update('outputLanguage', event.target.value as OutputLanguage)}
                className={inputClass}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle pt-4">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存设置'}
            </button>
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing || saving}
              className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
            <button
              type="button"
              onClick={() => void handleClearCache()}
              className="ml-auto rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-sm font-medium text-danger-fg transition-colors hover:bg-danger-bg/70"
            >
              清除缓存
            </button>
          </div>

          {status && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                status.kind === 'ok'
                  ? 'border-success-line bg-success-bg text-success-fg'
                  : status.kind === 'error'
                    ? 'border-danger-line bg-danger-bg text-danger-fg'
                    : 'border-warning-line bg-warning-bg text-warning-fg'
              }`}
            >
              {status.message}
            </div>
          )}
        </section>

        <section className={cardClass}>
          <h2 className="text-sm font-semibold">外观</h2>
          <Field
            label="界面主题"
            hint="「跟随」沿用 B 站页面的明暗；也可以固定为浅色或深色。面板顶栏的月亮/太阳按钮可一键切换。"
          >
            <select
              value={settings.theme}
              onChange={(event) => update('theme', event.target.value as ThemePreference)}
              className={inputClass}
            >
              {THEME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-2 border-t border-line-subtle pt-4">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存设置'}
            </button>
            {dirty && <span className="text-xs text-fg-subtle">修改尚未保存</span>}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface-raised p-5 text-sm leading-6 text-fg-muted shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-fg">怎么用</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>填好上面的 Base URL、API Key 和模型，保存并测试连接。</li>
            <li>打开任意 B 站普通视频页（/video/BV...），并确认已登录 B 站。</li>
            <li>点击页面右侧的圆形 BiliCueNote 按钮，窗口会浮在视频旁边。</li>
            <li>直接在对话里提问；想快速了解全片时，点顶部的「生成摘要」。</li>
            <li>回答和摘要里的时间戳可以点击跳转，悬停可核对字幕原文。</li>
          </ol>
        </section>

        <section className="rounded-2xl border border-line bg-surface-raised p-5 text-sm leading-6 text-fg-muted shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-fg">隐私与限制</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>API Key 只存本地，不读取、不上传 B 站 SESSDATA。</li>
            <li>字幕和摘要缓存在本机 IndexedDB，可在上面一键清除。</li>
            <li>只有字幕文本会发送到你填写的模型端点，没有其它后端或遥测。</li>
            <li>不支持无字幕视频、番剧、直播；无字幕时会明确提示。</li>
            <li>B 站 AI 字幕需要登录才可用；风控时请稍后再试。</li>
          </ul>
        </section>

        <p className="pb-4 text-center text-[11px] text-fg-subtle">
          BiliCueNote 0.1.0 · 明暗可随时切换，不收集任何使用数据
        </p>
      </div>
    </div>
  );
}
