import { createRoot } from 'react-dom/client';
import { PageBridge } from './bridge';
import { App } from './panel/App';
import panelCss from './panel/panel.css?inline';
import { detectPageDark } from './panel/theme';

function mount(): void {
  if (window.top !== window.self) return;
  if (document.getElementById('bili-cue-note-host')) return;

  const host = document.createElement('div');
  host.id = 'bili-cue-note-host';
  host.setAttribute('data-bili-cue-note', '');
  host.style.cssText =
    'all: initial; display: block; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;';

  const parent = document.body ?? document.documentElement;
  parent.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = panelCss;
  shadow.appendChild(style);

  const rootElement = document.createElement('div');
  rootElement.className = detectPageDark() ? 'bb-root dark' : 'bb-root';
  shadow.appendChild(rootElement);

  const bridge = new PageBridge();
  createRoot(rootElement).render(<App bridge={bridge} />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
