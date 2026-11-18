import { CONTAINER_SEL, findList, indexItems, parseGroups, parsePostPath, parseThread, videoFor } from './parser';
import { routeOf, store, tabTitle, type Route } from './store';
import { log } from './log';
import { hardNavigate } from './cache';
import { closeFrame, frameFor, openFrame, scanFrame } from './frames';

/**
 * Drives the real Threads page underneath the overlay: watches the DOM for posts,
 * follows client-side navigation, scrolls to load more, and navigates to threads.
 */

let scanTimer: number | undefined;
let lastPath = '';
let toastTimer: number | undefined;
/** Auto-load backs off when scrolling the real page produced nothing (end of feed, logged out…). */
let misses = 0;
let nextAutoAt = 0;

export function startDriver() {
  const mo = new MutationObserver(() => scheduleScan());
  const attach = () => {
    if (!document.body) return false;
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return true;
  };
  if (!attach()) document.addEventListener('DOMContentLoaded', attach, { once: true });
  document.addEventListener('DOMContentLoaded', () => scheduleScan(0), { once: true });
  window.addEventListener('load', () => scheduleScan(0), { once: true });
  window.addEventListener('popstate', () => (popped = true));
  window.setInterval(checkRoute, 250);
  checkRoute();
}

/**
 * Mirror of the history entries this tab has gone through (as route paths), so switching to a
 * sheet whose page sits right behind/ahead in history can use back()/forward() — Threads keeps
 * those pages alive, while navigating "fresh" to a thread without a link means a full reload.
 */
const hist: { entries: string[]; pos: number } = { entries: [], pos: -1 };
let popped = false;

function recordRoute(path: string) {
  if (popped) {
    popped = false;
    if (hist.entries[hist.pos - 1] === path) return void hist.pos--;
    if (hist.entries[hist.pos + 1] === path) return void hist.pos++;
  }
  if (hist.entries[hist.pos] === path) return;
  hist.entries = hist.entries.slice(0, hist.pos + 1);
  hist.entries.push(path);
  hist.pos++;
}

function checkRoute() {
  if (location.pathname === lastPath) return;
  lastPath = location.pathname;
  const route = routeOf(location.pathname);
  recordRoute(route.path);
  log('route', route);
  store.set({ route });
  if (route.kind !== 'other') store.openTab(route, store.state.tabs.find((t) => t.id === route.path)?.title);
  scheduleScan(0);
}

export function scheduleScan(delay = 150) {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(scan, delay);
}

/** Per page: post code -> index of its item in the (virtualised) list, to scroll it back into view. */
const itemIndex = new Map<string, Map<string, number>>();

export function scan() {
  const route = routeOf(location.pathname);
  const list = findList(document);
  if (list) {
    const m = itemIndex.get(route.path) ?? new Map<string, number>();
    for (const [code, idx] of indexItems(list)) m.set(code, idx);
    itemIndex.set(route.path, m);
  }
  if (route.kind === 'feed' || route.kind === 'profile') {
    const groups = parseGroups(document, list);
    store.mergeList(route.path, groups);
  } else if (route.kind === 'thread' && route.code) {
    const rows = parseThread(document, route.code);
    store.applyThread(route, rows);
  }
  if (!store.state.ready && document.querySelector(CONTAINER_SEL)) store.set({ ready: true });
}

/** Nearest scrollable ancestor of the post list, or the document scroller (of `doc`). */
export function findScroller(doc: Document = document): HTMLElement {
  const view = doc.defaultView ?? window;
  const list = findList(doc);
  for (let el = list?.parentElement ?? null; el && el !== doc.body; el = el.parentElement) {
    const oy = view.getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 4) return el;
  }
  return (doc.scrollingElement as HTMLElement) ?? doc.documentElement;
}

/** Where the active sheet's posts come from: a thread iframe, or the page itself. */
interface Source {
  doc: Document;
  scan: () => void;
  stale: () => boolean;
  count: () => number;
}

function activeSource(): Source | null {
  const active = store.state.active;
  const route = routeOf(active);
  const frame = frameFor(active);
  const doc = frame?.el.contentDocument;
  if (frame && doc) {
    return {
      doc,
      scan: () => scanFrame(active),
      stale: () => store.state.active !== active || frameFor(active) !== frame,
      count: () => (route.code ? store.state.threads[route.code]?.length ?? 0 : 0),
    };
  }
  if (routeOf(location.pathname).path !== active) return null; // nothing live behind this sheet
  return { doc: document, scan, stale: () => routeOf(location.pathname).path !== active, count: storedCount };
}

export function autoLoadAllowed() {
  return Date.now() >= nextAutoAt;
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** How many posts the store holds for the current page (feed keys or thread rows). */
function storedCount(): number {
  const route = routeOf(location.pathname);
  if (route.kind === 'thread' && route.code) return store.state.threads[route.code]?.length ?? 0;
  return store.state.lists[route.path]?.keys.length ?? 0;
}

/**
 * Threads virtualises its lists: only items near the viewport are rendered, the rest are empty
 * placeholders. Jumping straight to the bottom would skip everything in between, so walk down
 * the page a screen at a time, scanning as we go, then wait at the bottom for the next page.
 */
export async function loadMore(auto = false) {
  if (store.state.loading) return;
  if (auto && !autoLoadAllowed()) return;
  const src = activeSource();
  if (!src) return;
  // A thread whose post has no replies has nothing more to load.
  const route = routeOf(store.state.active);
  if (route.kind === 'thread' && route.code) {
    const focal = store.state.threads[route.code]?.find((r) => r.focal)?.post;
    if (focal && !focal.counts.reply && store.state.threads[route.code].length <= 2) return;
  }
  const { scan, stale } = src;
  const sc = findScroller(src.doc);
  const before = src.count();
  store.set({ loading: true });
  window.clearTimeout(toastTimer);
  // Only show "Working…" when it actually takes a while, like Sheets does.
  toastTimer = window.setTimeout(() => store.state.loading && store.set({ toast: 'Working…' }), 900);
  const walkDown = async () => {
    const step = Math.max(200, sc.clientHeight * 0.8);
    while (!stale() && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 4) {
      sc.scrollTop = Math.min(sc.scrollTop + step, sc.scrollHeight - sc.clientHeight);
      await sleep(160);
      scan();
    }
  };
  try {
    await walkDown();
    // At the bottom: wait for Threads to append the next page (or give up)…
    const h0 = sc.scrollHeight;
    for (let t = 0; t < 30 && !stale() && sc.scrollHeight <= h0; t++) await sleep(200);
    await sleep(250);
    // …then walk through it too, so the page that just arrived lands in the sheet now,
    // not on the next load.
    if (sc.scrollHeight > h0) await walkDown();
    scan();
  } finally {
    finishLoading(src.count() > before);
  }
}

function finishLoading(grew: boolean) {
  window.clearTimeout(toastTimer);
  misses = grew ? 0 : misses + 1;
  nextAutoAt = grew ? 0 : Date.now() + Math.min(60000, 3000 * 2 ** (misses - 1));
  store.set({ loading: false, toast: store.state.toast === 'Working…' ? undefined : store.state.toast });
}

function findAnchor(path: string): HTMLAnchorElement | undefined {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).find((a) => {
    const href = a.getAttribute('href') ?? '';
    if (href.includes('/media')) return false;
    try {
      const u = new URL(href, location.origin);
      return u.origin === location.origin && routeOf(u.pathname).path === path;
    } catch {
      return false;
    }
  });
}

/**
 * Navigate the real page while keeping Threads' client-side routing (no reload):
 *  1. click a Threads link to the target if one is rendered;
 *  2. else, if we know where the post sits in the virtualised list, scroll it back into
 *     view so Threads renders it, then click its link;
 *  3. else pushState + popstate (works for pages Threads already has, e.g. the home feed);
 *  4. else a full load (the sheet survives it via the session cache).
 * Links we create ourselves are not handled by Threads' router, so they always reload.
 */
async function navigate(path: string) {
  if (routeOf(location.pathname).path === path) return;
  const step = hist.entries[hist.pos - 1] === path ? -1 : hist.entries[hist.pos + 1] === path ? 1 : 0;
  if (step) {
    log('navigate', path, step < 0 ? 'history.back' : 'history.forward');
    history.go(step);
    window.setTimeout(() => {
      if (routeOf(location.pathname).path !== path) navigateFresh(path);
    }, 1200);
    return;
  }
  return navigateFresh(path);
}

async function navigateFresh(path: string) {
  if (routeOf(location.pathname).path === path) return;
  let a = findAnchor(path);
  let how = 'click';
  const code = routeOf(path).code;
  const idx = code ? itemIndex.get(routeOf(location.pathname).path)?.get(code) : undefined;
  if (!a && idx != null) {
    how = 'reveal';
    findList(document)?.children[idx]?.scrollIntoView({ block: 'center' });
    for (let t = 0; t < 20 && !a; t++) {
      await sleep(100);
      a = findAnchor(path);
    }
  }
  log('navigate', path, a ? how : routeOf(path).kind === 'thread' ? 'reload' : 'spa');
  if (a) {
    a.click();
    window.setTimeout(() => {
      if (routeOf(location.pathname).path !== path) {
        log('click did not navigate; reloading', path);
        hardNavigate(path);
      }
    }, 1500);
  } else if (routeOf(path).kind === 'thread') {
    hardNavigate(path);
  } else {
    spaNavigate(path);
  }
}

/** pushState + popstate: Threads' router follows it for pages it already has (verified for the home feed). */
function spaNavigate(path: string) {
  const visible = () => Array.from(document.querySelectorAll(CONTAINER_SEL)).filter((c) => c.getBoundingClientRect().width > 0);
  const before = new Set(visible());
  history.pushState(history.state, '', path);
  window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  popped = false; // our own push, not a back/forward
  window.setTimeout(() => {
    if (routeOf(location.pathname).path !== path) return; // user moved on
    // Something new must be on screen; the old page's posts don't count.
    const rendered = visible().some((c) => !before.has(c));
    log('spaNavigate check', path, { rendered });
    if (!rendered && document.visibilityState === 'visible') hardNavigate(path);
  }, 3000);
}

export function openPath(path: string, title?: string) {
  const route = routeOf(path);
  store.openTab(route, title);
  navigate(route.path);
}

/** Open a thread / sub-thread as a sheet backed by its own iframe; the page underneath stays put. */
export function openThread(postPath: string, author?: string) {
  const ref = parsePostPath(postPath);
  if (!ref) return;
  const route: Route = { kind: 'thread', path: `/@${ref.user}/post/${ref.code}`, code: ref.code };
  store.openTab(route, tabTitle(route, author));
  showSheet(route.path);
}

/** Make sure whatever backs sheet `id` is live: the page itself, an iframe, or (fallback) navigation. */
function showSheet(id: string) {
  if (routeOf(location.pathname).path === id) return;
  if (routeOf(id).kind === 'thread') openFrame(id, () => navigate(id));
  else navigate(id);
}

/** Close the current sheet and show the previous one. */
export function back() {
  const tabs = store.state.tabs;
  const i = tabs.findIndex((t) => t.id === store.state.active);
  if (i <= 0) return;
  const cur = tabs[i].id;
  closeFrame(cur);
  store.closeTab(cur);
  activateTab(tabs[i - 1].id);
}

export function closeSheet(id: string) {
  closeFrame(id);
  store.closeTab(id);
}

export function activateTab(id: string) {
  store.set({ active: id });
  showSheet(id);
}

/** Ask Threads for fresh posts: go to the top and re-trigger the home link. */
export function refresh() {
  const frame = frameFor(store.state.active);
  if (frame) {
    frame.el.contentWindow?.location.reload();
    return;
  }
  const sc = findScroller();
  sc.scrollTop = 0;
  const route = routeOf(location.pathname);
  if (route.kind === 'feed') {
    const home = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="/"]'))[0];
    home?.click();
  }
  store.set({ toast: 'Working…' });
  window.setTimeout(() => {
    scan();
    store.set({ toast: undefined });
  }, 1200);
}

/**
 * Dev check for the infinite-scroll crawl: visit every item of the real (virtualised) list that
 * we never indexed, let Threads render it, and report posts that are on the page but not in the sheet.
 */
export async function coverage() {
  const route = routeOf(location.pathname);
  const list = findList(document);
  if (!list) return { error: 'no list' };
  const sc = findScroller();
  const keep = sc.scrollTop;
  const known = new Map(itemIndex.get(route.path) ?? []); // snapshot: scans keep adding while we look
  const indexed = new Set(known.values());
  const stored = new Set(
    route.kind === 'thread' && route.code
      ? (store.state.threads[route.code] ?? []).map((r) => r.post.code)
      : (store.state.lists[route.path]?.keys ?? []).flatMap((k) => store.state.lists[route.path].groups[k].posts.map((p) => p.code)),
  );
  const n = list.children.length;
  const unseen: number[] = [];
  for (let i = 0; i < n; i++) if (!indexed.has(i)) unseen.push(i);
  const missing: { index: number; code: string }[] = [];
  const nonPost: number[] = [];
  for (const i of unseen) {
    list.children[i]?.scrollIntoView({ block: 'center' });
    await sleep(250);
    const fresh = indexItems(list);
    const codes = [...fresh].filter(([, idx]) => idx === i).map(([c]) => c);
    if (!codes.length) nonPost.push(i);
    for (const c of codes) if (!stored.has(c)) missing.push({ index: i, code: c });
  }
  for (const [c, idx] of known) if (!stored.has(c) && !missing.some((m) => m.code === c)) missing.push({ index: idx, code: c });
  sc.scrollTop = keep;
  return { listChildren: n, indexedItems: indexed.size, storedPosts: stored.size, unseenChecked: unseen.length, nonPostItems: nonPost, missingFromSheet: missing };
}

/**
 * The live <video> for a media key, so the sheet can mirror it. If Threads has unmounted it
 * (virtualised list), scroll the real page (hidden under the sheet) to the post so Threads
 * mounts and loads it again.
 */
export async function liveVideo(vkey: string, code: string): Promise<HTMLVideoElement | null> {
  let el = videoFor(vkey);
  if (el) return el;
  const active = store.state.active;
  const frame = frameFor(active);
  const doc = frame?.el.contentDocument ?? document;
  const pagePath = frame ? active : routeOf(location.pathname).path;
  const idx = itemIndex.get(pagePath)?.get(code);
  const list = findList(doc);
  const target = idx != null ? list?.children[idx] : doc.querySelector(`a[href*="/post/${code}"] time`);
  if (!target) return null;
  target.scrollIntoView({ block: 'center' });
  for (let t = 0; t < 30 && !el; t++) {
    await sleep(100);
    if (frame) scanFrame(active);
    else scan();
    el = videoFor(vkey);
  }
  return el;
}
