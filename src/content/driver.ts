import type { Post } from '../shared/types';
import { videoFor } from './media';
import { site } from './site';
import { routeOf, store, tabTitle, type Route } from './store';
import { log } from './log';
import type { FindQuery } from './find';
import { buildModel } from './sheet';
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
  // The pager is only in the DOM once the page has been parsed (scan also runs at document_start).
  if (site().mode === 'pages' && document.readyState !== 'loading' && !pageNext.has(route.path)) {
    pageNext.set(route.path, site().nextPage?.(document) ?? null);
    notePage(route.path, document);
  }
  const list = site().findList(document);
  if (list) {
    const m = itemIndex.get(route.path) ?? new Map<string, number>();
    for (const [code, idx] of site().indexItems(list)) m.set(code, idx);
    itemIndex.set(route.path, m);
  }
  if (route.kind === 'feed' || route.kind === 'profile') {
    const groups = site().parseGroups(document, list);
    store.mergeList(route.path, groups);
  } else if (route.kind === 'thread' && route.code) {
    const rows = site().parseThread(document, route.code);
    store.applyThread(route, rows);
  }
  if (!store.state.ready && document.querySelector(site().postSelector)) store.set({ ready: true });
}

/** Nearest scrollable ancestor of the post list, or the document scroller (of `doc`). */
export function findScroller(doc: Document = document): HTMLElement {
  const view = doc.defaultView ?? window;
  const list = site().findList(doc);
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

/**
 * Automatic loads (scrolled near the end) in a row since the user last scrolled or pressed a key.
 * Capped so a sheet that stays "near the end" (fast sites, tall screens) can't load forever.
 */
let autoStreak = 0;
const MAX_AUTO_STREAK = 3;

/** The user moved (scroll, keys): allow another short run of automatic loads. */
export function userActivity() {
  autoStreak = 0;
}

export function autoLoadAllowed() {
  return Date.now() >= nextAutoAt && autoStreak < MAX_AUTO_STREAK;
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
  if (auto) autoStreak++;
  else autoStreak = 0;
  if (site().mode === 'pages') {
    // One page at a time, like the site: nothing loads by itself; "load more" = next page.
    if (!auto) stepPage(1);
    return;
  }
  const src = activeSource();
  if (!src) return;
  // A thread whose post has no replies has nothing more to load.
  const route = routeOf(store.state.active);
  if (route.kind === 'thread' && route.code) {
    const focal = store.state.threads[route.code]?.find((r) => r.focal)?.post;
    const replies = site().replyMetric;
    if (focal && replies && !focal.counts[replies] && store.state.threads[route.code].length <= 2) return;
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
    site().findList(document)?.children[idx]?.scrollIntoView({ block: 'center' });
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
  const visible = () => Array.from(document.querySelectorAll(site().postSelector)).filter((c) => c.getBoundingClientRect().width > 0);
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

/**
 * Open a thread / sub-thread as a sheet backed by its own iframe; the page underneath stays put.
 * Forums (pages mode): a post permalink opens the thread at that post's page; `latest` at its newest page.
 */
export function openThread(postPath: string, post?: Post, opts: { latest?: boolean } = {}) {
  const route = site().postRoute(postPath);
  if (!route) return;
  store.openTab(route, tabTitle(route, post));
  if (site().mode === 'pages' && route.kind === 'thread') {
    const path = postPath.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '');
    if (opts.latest && site().latestUrl) return openThreadAt(route.path, site().latestUrl!(route.path), { selectLast: true });
    if (path !== route.path && post?.code) return openThreadAt(route.path, path, { focus: post.code });
  }
  showSheet(route.path);
}

/** Make sure whatever backs sheet `id` is live: the page itself, an iframe, or (fallback) navigation. */
function showSheet(id: string) {
  if (site().mode === 'pages') {
    if (!hasData(id)) void loadPage(id);
    return;
  }
  if (routeOf(location.pathname).path === id) return;
  if (routeOf(id).kind === 'thread') openFrame(id, () => navigate(id));
  else navigate(id);
}

/**
 * pages mode: positions to come back to after jumping to a quoted post, per sheet
 * (the page and the post the jump started from).
 */
const jumps = new Map<string, { page: number; code: string }[]>();

/** pages mode: go to the post a quote points at (same page: select it; else load its page). */
export async function jumpToPost(path: string, code: string, fromCode?: string) {
  if (site().mode !== 'pages' || !path || store.state.loading) return;
  const id = store.state.active;
  const remember = () => {
    const p = store.state.pager[id];
    if (p && fromCode) jumps.set(id, [...(jumps.get(id) ?? []).slice(-49), { page: p.page, code: fromCode }]);
  };
  const at = rowOf(id, code);
  if (at >= 0) {
    remember();
    store.setSel(id, { r: at + 1, c: textCol() });
    flash('Bài gốc · Backspace để quay lại', 3000);
    return;
  }
  // The permalink redirects to the right thread and page; the quote may come from another thread.
  flash('Working…', 15000);
  let r: Response;
  try {
    r = await fetch(path, { credentials: 'include' });
  } catch (e) {
    flash(`Không mở được bài gốc (${String((e as Error)?.message ?? e)})`);
    return;
  }
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  if (!r.ok) {
    // The forum's own reason ("post not found": deleted, or not visible to you) is the last message box.
    const why = Array.from(doc.querySelectorAll('.blockMessage')).pop()?.textContent?.trim();
    flash(`Không mở được bài gốc: ${why || `HTTP ${r.status}`}`, 5000);
    return;
  }
  const route = site().postRoute(r.url);
  if (!route || route.kind !== 'thread') {
    flash('Không mở được bài gốc');
    return;
  }
  if (route.path === id) {
    remember();
    await loadPage(id, r.url, { mode: 'reset', focus: code, doc });
    flash('Bài gốc · Backspace để quay lại', 3000);
    return;
  }
  // Quoted from another thread: open that thread in its own tab, at the post.
  store.openTab(route, tabTitle(route));
  await loadPage(route.path, r.url, { mode: 'reset', focus: code, doc });
  flash('Bài gốc ở thớt khác · Backspace để quay lại', 3000);
}

/** Close the current sheet and show the previous one (pages mode: first undo quote jumps). */
export function back() {
  const stack = jumps.get(store.state.active);
  const last = stack?.pop();
  if (last) {
    const id = store.state.active;
    const at = rowOf(id, last.code);
    const url = store.state.pager[id]?.page === last.page ? null : pageUrl(id, last.page);
    if (at >= 0 && !url) store.setSel(id, { r: at + 1, c: textCol() });
    else if (url) void loadPage(id, url, { mode: 'reset', focus: last.code });
    return;
  }
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

/** Ask the page for fresh posts: go to the top and let the site re-trigger its feed. */
export function refresh() {
  if (site().mode === 'pages') {
    // Re-read the page the sheet shows: new replies land at the end.
    const id = store.state.active;
    const p = store.state.pager[id];
    void loadPage(id, (p && pageUrl(id, p.page)) || id);
    return;
  }
  const frame = frameFor(store.state.active);
  if (frame) {
    frame.el.contentWindow?.location.reload();
    return;
  }
  const sc = findScroller();
  sc.scrollTop = 0;
  const route = routeOf(location.pathname);
  if (route.kind === 'feed') site().refresh?.(document);
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
  const list = site().findList(document);
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
    const fresh = site().indexItems(list);
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
  const list = site().findList(doc);
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

/*
 * ---- pages mode (classic paginated sites, e.g. forums) ---------------------------------------
 * Every sheet is a URL that is fetched and parsed; "load more" fetches the next page. The page
 * the user has open is never navigated, so nothing here needs iframes or history tricks.
 */

/** Next page URL per sheet (tab id); null when the last page has been loaded. */
const pageNext = new Map<string, string | null>();

function hasData(id: string): boolean {
  return rowCount(id) > 0;
}

/** Rows a sheet holds (thread rows or list items). */
function rowCount(id: string): number {
  const route = routeOf(id);
  if (route.kind === 'thread' && route.code) return store.state.threads[route.code]?.length ?? 0;
  return store.state.lists[id]?.keys.length ?? 0;
}

/** Rows of sheet `id` as displayed (quote rows included, find filter ignored). */
function sheetRows(id: string) {
  return buildModel({ ...store.state, active: id, find: undefined }).rows;
}

/** 0-based display row of a post in a sheet, or -1. */
function rowOf(id: string, code: string): number {
  return sheetRows(id).findIndex((r) => !r.quote && r.post?.code === code);
}

const textCol = () => Math.max(0, site().columns.findIndex((c) => c.key === 'text'));

async function fetchDoc(url: string): Promise<Document> {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return new DOMParser().parseFromString(await r.text(), 'text/html');
}

/** Short message in the status toast. */
export function flash(msg: string, ms = 2500) {
  window.clearTimeout(toastTimer);
  store.set({ toast: msg });
  toastTimer = window.setTimeout(() => store.state.toast === msg && store.set({ toast: undefined }), ms);
}

interface PageLoad {
  /** merge: update the page the sheet shows (default) · reset: show this page instead. */
  mode?: 'merge' | 'reset';
  /** Select this post once loaded. */
  focus?: string;
  /** Already fetched document for `url` (skip the fetch). */
  doc?: Document;
  /** Select the last row (opening a thread at its newest post). */
  selectLast?: boolean;
}

/** Record which page a sheet shows. */
function notePage(id: string, doc: Document) {
  const info = site().pageInfo?.(doc);
  if (!info) return;
  const cur = store.state.pager[id];
  store.set((s) => ({ pager: { ...s.pager, [id]: { page: info.page, total: info.total, template: info.template || cur?.template || '' } } }));
}

/** Fetch `url` (default: the sheet's own first page) and merge it into sheet `id`. */
async function loadPage(id: string, url = id, opts: PageLoad = {}) {
  if (store.state.loading) return;
  const mode = opts.mode ?? 'merge';
  const route = routeOf(id);
  store.set({ loading: true });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => store.state.loading && store.set({ toast: 'Working…' }), 900);
  let grew = false;
  try {
    const doc = opts.doc ?? (await fetchDoc(url));
    if (mode === 'reset') store.clearSheet(id);
    const before = rowCount(id);
    if (route.kind === 'thread' && route.code) {
      store.applyThread(route, site().parseThread(doc, route.code));
    } else {
      store.mergeList(route.path, site().parseGroups(doc), 'end');
    }
    const after = rowCount(id);
    grew = after > before;
    notePage(id, doc);
    pageNext.set(id, site().nextPage?.(doc) ?? null);
    // Where the cursor goes.
    const at = opts.focus ? rowOf(id, opts.focus) : -1;
    if (at >= 0) store.setSel(id, { r: at + 1, c: textCol() });
    else if (opts.selectLast && after) store.setSel(id, { r: sheetRows(id).length, c: textCol() });
    else if (mode === 'reset') store.setSel(id, { r: 1, c: textCol() });
  } catch (e) {
    log('page load failed', url, String(e));
    flash(`Không tải được trang (${String((e as Error)?.message ?? e)})`);
  } finally {
    finishLoading(grew);
  }
}

/** Page URL from a sheet's pager template. */
function pageUrl(id: string, n: number): string | null {
  const p = store.state.pager[id];
  if (!p) return null;
  if (n === 1 && !p.template) return id;
  return p.template ? p.template.replace('{n}', String(n)) : null;
}

/** ‹ / ›: show the page before or after the current one. */
export function stepPage(d: 1 | -1) {
  if (site().mode !== 'pages') return;
  const id = store.state.active;
  const p = store.state.pager[id];
  if (d > 0) {
    const next = pageNext.get(id) ?? (p && p.page < p.total ? pageUrl(id, p.page + 1) : null);
    if (next) void loadPage(id, next, { mode: 'reset' });
    else flash(p ? `Đã là trang cuối (${p.total})` : 'Không còn trang sau');
    return;
  }
  const url = p && p.page > 1 ? pageUrl(id, p.page - 1) : null;
  if (url) void loadPage(id, url, { mode: 'reset' });
  else flash('Đã là trang đầu');
}

/** Jump to page n (or the last page): the sheet then holds just that page. */
export function gotoPage(n: number | 'last') {
  if (site().mode !== 'pages') return;
  const id = store.state.active;
  const p = store.state.pager[id];
  const route = routeOf(id);
  if (n === 'last' && route.kind === 'thread' && site().latestUrl) {
    void loadPage(id, site().latestUrl!(id), { mode: 'reset', selectLast: true });
    return;
  }
  if (!p) return;
  const page = Math.min(Math.max(1, n === 'last' ? p.total : Math.round(n)), p.total);
  if (page === p.page) return;
  const url = pageUrl(id, page);
  if (url) void loadPage(id, url, { mode: 'reset' });
}

/** pages mode: open a thread at a given post (search hit, quote) or at its newest page. */
function openThreadAt(id: string, url: string, opts: PageLoad) {
  if (opts.focus && rowOf(id, opts.focus) >= 0) {
    store.setSel(id, { r: rowOf(id, opts.focus) + 1, c: textCol() });
    return;
  }
  void loadPage(id, url, { mode: 'reset', ...opts });
}

/** Sheet a results tab was searched from, so searching again from it keeps the scope. */
const searchScope = new Map<string, Route>();

/** Scope the site's search covers from sheet `id` (a results tab keeps the scope it came from). */
export function searchScopeOf(id: string): Route {
  return searchScope.get(id) ?? routeOf(id);
}

/** Run the site's own search for the find-bar text; results open as a new sheet. */
export async function searchSite(q: FindQuery) {
  const s = site();
  if (!s.search || store.state.find?.searching) return;
  if (!q.keywords && !q.user) return;
  const scope = searchScopeOf(store.state.active);
  store.set((st) => ({ find: st.find && { ...st.find, searching: true, error: undefined } }));
  try {
    const { path, doc } = await s.search(q, scope);
    searchScope.set(path, scope);
    const words = [q.keywords, q.user && `👤 ${q.user}`].filter(Boolean).join(' ');
    store.openTab({ kind: 'feed', path }, `🔍 ${words.length > 24 ? `${words.slice(0, 23)}…` : words}`);
    store.mergeList(path, s.parseGroups(doc), 'end');
    notePage(path, doc);
    pageNext.set(path, s.nextPage?.(doc) ?? null);
    store.setSel(path, { r: 1, c: textCol() });
    // The results are the answer: close the find bar so Enter opens a hit.
    store.set({ find: undefined });
    const n = rowCount(path);
    const more = (store.state.pager[path]?.total ?? 1) > 1 ? '+' : '';
    flash(`${n}${more} kết quả · Enter mở bài ngay chỗ đó trong thớt`, 5000);
  } catch (e) {
    const error = String((e as Error)?.message ?? e);
    if (store.state.find) store.set((st) => ({ find: st.find && { ...st.find, searching: false, error } }));
    else flash(error, 4000);
  }
}
