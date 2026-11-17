import { render } from 'preact';
import css from './ui/styles.css';
import fontsCss from '../../build/fonts.css';
import { App } from './ui/App';
import { SHEETS_FAVICON } from './ui/common';
import { DEFAULT_SETTINGS, store } from './store';
import { startDriver } from './driver';
import { installKeys } from './keys';
import { installDevBridge } from './devbridge';
import { log, logError } from './log';
import { restoreCache, startCache } from './cache';
import { syncFrames } from './frames';
import { actions } from './actions';

/**
 * Runs at document_start on threads.com. Covers the page immediately (no flash of Threads),
 * then mounts the Sheets UI in a shadow root once settings are loaded.
 */

const HOST_TAG = 'threet-root';

function mountHost(): HTMLElement {
  document.querySelector(HOST_TAG)?.remove(); // extension reload in dev
  const host = document.createElement(HOST_TAG);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);
  const cover = document.createElement('div');
  cover.className = 'cover';
  shadow.appendChild(cover);
  document.documentElement.appendChild(host);
  // React/Threads may re-render <body>; keep the host attached and last.
  new MutationObserver(() => {
    if (!host.isConnected || host.nextSibling) document.documentElement.appendChild(host);
  }).observe(document.documentElement, { childList: true });
  return host;
}

function injectFonts() {
  const base = chrome.runtime.getURL('fonts/');
  const style = document.createElement('style');
  style.textContent = fontsCss.replaceAll('__FONT_BASE__', base);
  (document.head ?? document.documentElement).appendChild(style);
}

let originalTitle = '';
let originalIcons: HTMLLinkElement[] = [];

function disguiseTab() {
  const s = store.state;
  const on = s.settings.enabled && s.visible;
  const want = `${s.settings.title} - Google Sheets`;
  if (on) {
    if (document.title !== want) {
      if (!document.title.endsWith(' - Google Sheets')) originalTitle = document.title;
      document.title = want;
    }
    const head = document.head;
    if (!head) return;
    for (const l of Array.from(head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]'))) {
      if (l.dataset.threet) continue;
      originalIcons.push(l);
      l.remove();
    }
    if (!head.querySelector('link[data-threet]')) {
      const l = document.createElement('link');
      l.rel = 'icon';
      l.type = 'image/svg+xml';
      l.href = SHEETS_FAVICON;
      l.dataset.threet = '1';
      head.appendChild(l);
    }
  } else {
    if (document.title.endsWith(' - Google Sheets') && originalTitle) document.title = originalTitle;
    const head = document.head;
    head?.querySelector('link[data-threet]')?.remove();
    if (head && originalIcons.length) {
      originalIcons.forEach((l) => head.appendChild(l));
      originalIcons = [];
    }
  }
}

async function main() {
  const host = mountHost();
  const shadow = host.shadowRoot!;

  try {
    const { settings } = await chrome.storage.local.get('settings');
    store.set({ settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) } });
  } catch (e) {
    logError('settings load failed', e);
  }

  if (!store.state.settings.seenGuide) store.set({ help: true });
  injectFonts();
  installKeys(host);
  restoreCache();
  startCache();
  startDriver();
  if (__DEV__) installDevBridge();

  const root = document.createElement('div');
  shadow.appendChild(root);
  render(<App />, root);
  shadow.querySelector('.cover')?.remove();

  const pageStyle = document.createElement('style');
  pageStyle.textContent = 'html,body{scrollbar-width:none!important}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important}';
  let wasOn = true;
  const sync = () => {
    const s = store.state;
    const on = s.settings.enabled && s.visible;
    host.hidden = !on;
    syncFrames();
    // Coming back from the real page (maybe focused inside a thread frame): take focus back.
    if (on && !wasOn) window.setTimeout(() => actions.focusGrid(), 0);
    wasOn = on;
    // The page scrollbar would show at the right edge, next to the sheet's own.
    if (on && !pageStyle.isConnected) (document.head ?? document.documentElement).appendChild(pageStyle);
    if (!on && pageStyle.isConnected) pageStyle.remove();
    // Threads keeps scrolling/focus state; hand focus back to it when we hide.
    disguiseTab();
  };
  store.subscribe(sync);
  sync();
  // Threads rewrites <title> on navigation; re-apply.
  const titleObs = new MutationObserver(() => disguiseTab());
  const watchHead = () => document.head && titleObs.observe(document.head, { childList: true, subtree: true, characterData: true });
  if (document.head) watchHead();
  else document.addEventListener('DOMContentLoaded', watchHead, { once: true });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings?.newValue) store.set({ settings: { ...DEFAULT_SETTINGS, ...changes.settings.newValue } });
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'threet:toggle') store.set((s) => ({ visible: !s.visible }));
  });
  log('mounted', location.href);
}

main().catch((e) => logError('boot failed', e));
