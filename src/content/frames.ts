import { site } from './site';
import { routeOf, store } from './store';
import { log } from './log';

/**
 * Thread sheets are backed by a same-origin <iframe> of the thread page, so opening a thread or
 * sub-thread never navigates the main page (the feed underneath keeps its place, nothing reloads).
 *
 * Threads normally refuses to be framed; the extension's declarativeNetRequest rule
 * (scripts/build.mjs → rules.json) lifts that for frames threads.com opens itself.
 *
 * The iframes sit in a full-viewport layer right under the sheet, so they are laid out and
 * rendered (Threads only loads replies for items that intersect the viewport) but never seen,
 * and they are `inert` so they can't take focus or clicks. With the sheet switched off (⌥T),
 * the active thread's iframe is shown instead, so "show the original" shows that thread.
 */

interface Frame {
  path: string;
  code: string;
  el: HTMLIFrameElement;
  usedAt: number;
  ok: boolean;
  mo?: MutationObserver;
  poll?: number;
  debounce?: number;
}

const frames = new Map<string, Frame>();
/** Each frame is a whole Threads app (~100–200 MB); older ones are dropped, their rows stay. */
const MAX_FRAMES = 3;
const FAIL_MS = 8000;
let layer: HTMLDivElement | null = null;

function ensureLayer(): HTMLDivElement {
  if (layer?.isConnected) return layer;
  layer = document.createElement('div');
  layer.dataset.threetFrames = '';
  layer.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
  document.documentElement.appendChild(layer);
  syncFrames();
  return layer;
}

export function frameFor(path: string): Frame | undefined {
  return frames.get(path);
}

export function frameDoc(path: string): Document | null {
  return frames.get(path)?.el.contentDocument ?? null;
}

export function framePaths(): string[] {
  return [...frames.keys()];
}

/** Open (or reuse) the iframe for a thread page. `onFail` runs if it never renders the thread. */
export function openFrame(path: string, onFail: () => void) {
  const existing = frames.get(path);
  if (existing) {
    existing.usedAt = Date.now();
    syncFrames();
    return;
  }
  const code = routeOf(path).code;
  if (!code) return onFail();
  const el = document.createElement('iframe');
  el.src = path;
  el.tabIndex = -1;
  el.setAttribute('inert', '');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;';
  const f: Frame = { path, code, el, usedAt: Date.now(), ok: false };
  frames.set(path, f);
  el.addEventListener('load', () => attach(f));
  ensureLayer().appendChild(el);
  // Safety net while the app boots (the observer is re-attached on each load).
  f.poll = window.setInterval(() => scanFrame(f), 1000);
  window.setTimeout(() => {
    if (frames.get(path) === f && !f.ok) {
      log('frame did not render; falling back to page navigation', path);
      closeFrame(path);
      onFail();
    }
  }, FAIL_MS);
  log('frame open', path);
  evict();
  syncFrames();
}

export function closeFrame(path: string) {
  const f = frames.get(path);
  if (!f) return;
  window.clearInterval(f.poll);
  window.clearTimeout(f.debounce);
  f.mo?.disconnect();
  f.el.remove();
  frames.delete(path);
  log('frame closed', path);
}

function evict() {
  if (frames.size <= MAX_FRAMES) return;
  const active = store.state.active;
  const victims = [...frames.values()].filter((f) => f.path !== active).sort((a, b) => a.usedAt - b.usedAt);
  while (frames.size > MAX_FRAMES && victims.length) closeFrame(victims.shift()!.path);
}

function attach(f: Frame) {
  const doc = f.el.contentDocument;
  if (!doc?.documentElement) return;
  // When the frame is shown (sheet off) it has focus, so ⌥T must work from inside it too.
  doc.addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyT') {
        e.preventDefault();
        e.stopImmediatePropagation();
        store.set((s) => ({ visible: !s.visible, menu: undefined }));
      }
    },
    true,
  );
  f.mo?.disconnect();
  f.mo = new MutationObserver(() => {
    window.clearTimeout(f.debounce);
    f.debounce = window.setTimeout(() => scanFrame(f), 150);
  });
  f.mo.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
  scanFrame(f);
}

export function scanFrame(f: Frame | string) {
  const fr = typeof f === 'string' ? frames.get(f) : f;
  if (!fr) return;
  const doc = fr.el.contentDocument;
  if (!doc?.body) return;
  const rows = site().parseThread(doc, fr.code);
  if (!rows.length) return;
  if (!fr.ok) {
    fr.ok = true;
    window.clearInterval(fr.poll);
    fr.poll = window.setInterval(() => scanFrame(fr), 3000);
  }
  store.applyThread(routeOf(fr.path), rows);
}

/**
 * Show/hide frames for the current state: under the sheet they are all laid out (and covered);
 * with the sheet off, only the active thread's frame shows (and becomes interactive).
 */
export function syncFrames() {
  if (!layer) return;
  const s = store.state;
  const sheetOn = s.visible && s.settings.enabled;
  const shown = !sheetOn ? frames.get(s.active) : undefined;
  if (sheetOn) {
    layer.style.visibility = 'visible';
    layer.style.pointerEvents = 'none';
    for (const f of frames.values()) {
      f.el.style.visibility = 'visible';
      f.el.setAttribute('inert', '');
    }
  } else if (shown) {
    layer.style.visibility = 'visible';
    layer.style.pointerEvents = 'auto';
    for (const f of frames.values()) {
      f.el.style.visibility = f === shown ? 'visible' : 'hidden';
      if (f === shown) f.el.removeAttribute('inert');
      else f.el.setAttribute('inert', '');
    }
  } else {
    layer.style.visibility = 'hidden';
    layer.style.pointerEvents = 'none';
  }
}
