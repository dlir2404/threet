import type { Media } from '../shared/types';
import * as driver from './driver';
import { buildModel, cellFull, prefKey, textColumn, type SheetModel } from './sheet';
import { site } from './site';
import { DEFAULT_SETTINGS, store, type Sel, type Settings } from './store';

/** First post row, main text column. */
const defaultSel = (): Sel => ({ r: 1, c: textColumn() });

export function currentSel(): Sel {
  return store.state.sel[store.state.boss ? '__boss' : store.state.active] ?? defaultSel();
}

function selKey() {
  return store.state.boss ? '__boss' : store.state.active;
}

function model(): SheetModel {
  return buildModel(store.state);
}

/** Total columns rendered (A..Z at least). */
export const MIN_COLS = 26;

/** The find bar remembers its text when closed (e.g. after a search opens its results). */
let lastFind = { query: '', user: '' };

export const actions = {
  focusTitle: () => {},
  focusGrid: () => {},

  select(sel: Sel) {
    store.setSel(selKey(), sel);
    store.set({ reading: undefined });
  },

  move(dr: number, dc: number) {
    const m = model();
    const cur = currentSel();
    const maxR = Math.max(m.rows.length + 40, 60);
    const maxC = Math.max(m.columns.length, MIN_COLS) - 1;
    const r = Math.min(Math.max(cur.r + dr, 0), maxR);
    const c = Math.min(Math.max(cur.c + dc, 0), maxC);
    actions.select({ r, c });
    if (m.pageable && dr > 0 && r >= m.rows.length - 3) driver.loadMore(true);
  },

  jump(where: 'top' | 'bottom') {
    const m = model();
    const cur = currentSel();
    actions.select({ r: where === 'top' ? 1 : Math.max(m.rows.length, 1), c: cur.c });
    if (where === 'bottom' && m.pageable && site().mode !== 'pages') driver.loadMore();
  },

  /** Enter: open the selected row's thread (or the attachment). ⇧Enter: a forum thread at its newest page. */
  openCurrent(opts: { latest?: boolean } = {}) {
    const m = model();
    const sel = currentSel();
    if (sel.r === 0) return actions.editHeader(sel.c);
    const row = m.rows[sel.r - 1];
    const col = m.columns[sel.c];
    if (!row?.post || store.state.boss) return;
    if (col?.key === 'media' && row.post.media.length) {
      actions.openMedia(row.post.media, 0, row.post.code);
      return;
    }
    if (col?.key === 'media' && row.post.link) {
      window.open(row.post.link.url, '_blank', 'noopener');
      return;
    }
    const tab = store.state.tabs.find((t) => t.id === store.state.active);
    // Already on that page (the focal post, or a forum post of the thread being read): read it in place.
    if ((tab?.kind === 'thread' && tab.code === row.post.code) || site().postRoute(row.post.path)?.path === store.state.active) {
      actions.toggleReader();
      return;
    }
    driver.openThread(row.post.path, row.post, opts);
  },

  /** Forum quote `i` of the selected post: go to the post it quotes (Backspace comes back). */
  jumpQuote(i = 0) {
    const row = model().rows[currentSel().r - 1];
    const q = row?.post?.quotes?.[i];
    if (!q || store.state.boss) return;
    void driver.jumpToPost(q.path, q.code, row.post!.code);
  },

  // ── Find bar (⌘F) ──────────────────────────────────────────────────────────
  focusFind: () => {},

  openFind() {
    if (store.state.boss) return;
    store.set((s) => ({ find: s.find ?? { ...lastFind, filter: false }, menu: undefined, reading: undefined }));
    actions.focusFind();
  },

  closeFind() {
    store.set({ find: undefined });
    actions.focusGrid();
  },

  /** Type into the find bar's keywords (query) or author (user) box. */
  setFind(patch: { query?: string; user?: string }) {
    store.set((s) => {
      const find = { query: '', user: '', filter: false, ...s.find, ...patch, searching: false, error: undefined };
      lastFind = { query: find.query, user: find.user };
      return { find };
    });
  },

  toggleFindFilter() {
    store.set((s) => ({ find: s.find && { ...s.find, filter: !s.find.filter } }));
    // The selected row may have been hidden: land on the first visible one.
    const m = model();
    if (currentSel().r > m.rows.length) actions.select({ r: Math.min(1, m.rows.length), c: currentSel().c });
  },

  /** Hits among the loaded rows, as 1-based row numbers. */
  findHits(): number[] {
    const out: number[] = [];
    model().rows.forEach((r, i) => r.hit && out.push(i + 1));
    return out;
  },

  /** Select the next (d=1) or previous hit after the cursor, wrapping around. */
  findStep(d: 1 | -1) {
    const hits = actions.findHits();
    if (!hits.length) return;
    const r = currentSel().r;
    const next = d > 0 ? hits.find((h) => h > r) ?? hits[0] : [...hits].reverse().find((h) => h < r) ?? hits[hits.length - 1];
    const row = model().rows[next - 1];
    const cols = site().columns;
    const c = row?.hit?.text || !row?.hit?.author ? textColumn() : Math.max(0, cols.findIndex((x) => x.key === 'author'));
    actions.select({ r: next, c });
  },

  /** Search the whole thread / forum with the site's own search. */
  searchAll() {
    const f = store.state.find;
    if (f && (f.query.trim() || f.user.trim())) void driver.searchSite({ keywords: f.query.trim(), user: f.user.trim() || undefined });
  },

  // ── Pages (forums) ─────────────────────────────────────────────────────────
  stepPage(d: 1 | -1) {
    driver.stepPage(d);
  },

  gotoPage(n: number | 'last') {
    store.set({ pagerEdit: false });
    driver.gotoPage(n);
    actions.focusGrid();
  },

  editPager(on = true) {
    if ((store.state.pager[store.state.active]?.total ?? 0) > 1) store.set({ pagerEdit: on });
    if (!on) actions.focusGrid();
  },

  back() {
    if (store.state.boss) return;
    driver.back();
  },

  nextTab(dir: 1 | -1) {
    if (store.state.boss) return;
    const { tabs, active } = store.state;
    const i = tabs.findIndex((t) => t.id === active);
    const t = tabs[(i + dir + tabs.length) % tabs.length];
    if (t && t.id !== active) driver.activateTab(t.id);
  },

  activateTab(id: string) {
    driver.activateTab(id);
  },

  closeTab(id: string) {
    const { tabs, active } = store.state;
    if (tabs.length <= 1 || id === '/') return;
    if (id === active) actions.back();
    else driver.closeSheet(id);
  },

  /** Start renaming a column title (header row, like editing the file name). */
  editHeader(c?: number) {
    if (store.state.boss) return;
    const col = c ?? currentSel().c;
    if (!buildModel(store.state).columns[col]) return; // blank columns past the data
    actions.select({ r: 0, c: col });
    store.set({ editingHeader: col });
  },

  commitHeader(value: string | null) {
    const i = store.state.editingHeader;
    store.set({ editingHeader: undefined });
    actions.focusGrid();
    if (i == null || value == null) return;
    const col = site().columns[i];
    if (!col) return;
    const titles = { ...(store.state.settings.colTitles ?? {}) };
    const v = value.trim();
    if (!v || v === col.header) delete titles[prefKey(col.key)];
    else titles[prefKey(col.key)] = v;
    actions.saveSettings({ colTitles: titles });
  },

  /** Reset this site's column titles (other sites keep theirs). */
  resetHeaders() {
    const mine = `${site().id}.`;
    const titles = Object.fromEntries(Object.entries(store.state.settings.colTitles ?? {}).filter(([k]) => !k.startsWith(mine)));
    actions.saveSettings({ colTitles: titles });
  },

  /** Drop what this sheet has loaded and start again from the top of the real page. */
  clearRows() {
    const tab = store.state.tabs.find((t) => t.id === store.state.active);
    if (!tab || store.state.boss) return;
    store.set((s) =>
      tab.kind === 'list'
        ? { lists: { ...s.lists, [tab.id]: { keys: [], groups: {} } }, sel: { ...s.sel, [tab.id]: defaultSel() } }
        : { threads: { ...s.threads, [tab.code!]: [] }, sel: { ...s.sel, [tab.id]: defaultSel() } },
    );
    driver.refresh();
  },

  moveTab(id: string, dir: 1 | -1) {
    const tabs = [...store.state.tabs];
    const i = tabs.findIndex((t) => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= tabs.length) return;
    [tabs[i], tabs[j]] = [tabs[j], tabs[i]];
    store.set({ tabs });
  },

  /** Open the media viewer on a post's attachments (all of them, not just the first). */
  openMedia(media: Media[], index = 0, code?: string) {
    // Videos are mirrored from the page's live <video> (ui/Video.tsx); src is their poster.
    const items = media
      .map((m) => ({ src: m.kind === 'video' ? m.full ?? '' : m.full || m.src, alt: m.alt, video: m.kind === 'video', play: m.play, vkey: m.vkey, code }))
      .filter((it) => it.src || it.play || (it.vkey && it.code));
    if (items.length) store.set({ lightbox: { items, index: Math.min(index, items.length - 1) } });
  },

  stepMedia(d: number) {
    const lb = store.state.lightbox;
    if (!lb) return;
    const n = lb.items.length;
    store.set({ lightbox: { ...lb, index: (lb.index + d + n) % n } });
  },

  openUpdate() {
    if (store.state.update) store.set({ updateOpen: true, menu: undefined, help: false });
  },

  /** later = ask again in a day; skip = never for this version. */
  closeUpdate(how: 'later' | 'skip') {
    const v = store.state.update?.version ?? '';
    store.set({ updateOpen: false });
    if (how === 'skip') actions.saveSettings({ skipVersion: v });
    else actions.saveSettings({ updateSnoozeUntil: Date.now() + 24 * 60 * 60 * 1000 });
    actions.focusGrid();
  },

  toggleUpdateChecks() {
    const on = !store.state.settings.checkUpdates;
    actions.saveSettings({ checkUpdates: on });
    if (on) chrome.runtime.sendMessage({ type: 'threet:checkUpdate', force: true }).catch(() => {});
  },

  toggleReader() {
    const sel = currentSel();
    if (sel.r === 0) return actions.editHeader(sel.c);
    store.set((s) => ({ reading: s.reading ? undefined : sel }));
  },

  closeOverlays(): boolean {
    const s = store.state;
    if (s.updateOpen) return actions.closeUpdate('later'), true;
    if (s.menu) return store.set({ menu: undefined }), true;
    if (s.lightbox) return store.set({ lightbox: undefined }), true;
    if (s.help) return actions.toggleHelp(), true;
    if (s.reading) return store.set({ reading: undefined }), true;
    return false;
  },

  toggleBoss() {
    store.set((s) => ({ boss: !s.boss, reading: undefined, lightbox: undefined, menu: undefined, help: false, updateOpen: false }));
  },

  toggleVisible() {
    store.set((s) => ({ visible: !s.visible, menu: undefined }));
  },

  toggleHelp() {
    store.set((s) => ({ help: !s.help, menu: undefined }));
    if (!store.state.help && !store.state.settings.seenGuide) actions.saveSettings({ seenGuide: true });
  },

  guideStep(d: number) {
    store.set((s) => ({ guideTab: Math.max(0, Math.min(4, (s.guideTab ?? 0) + d)) }));
  },

  toggleFormula() {
    actions.saveSettings({ formulaExpanded: !store.state.settings.formulaExpanded });
  },

  togglePreviews() {
    actions.saveSettings({ showPreviews: !store.state.settings.showPreviews });
  },

  zoomBy(d: number) {
    const z = Math.round(Math.min(2, Math.max(0.5, (store.state.settings.zoom ?? 1) + d)) * 100) / 100;
    actions.saveSettings({ zoom: z });
  },

  setZoom(z: number) {
    actions.saveSettings({ zoom: z });
  },

  setColWidth(key: string, w: number) {
    actions.saveSettings({ colWidths: { ...store.state.settings.colWidths, [prefKey(key)]: Math.max(24, Math.round(w)) } });
  },

  userActivity() {
    driver.userActivity();
  },

  loadMore(auto = false) {
    driver.loadMore(auto);
  },

  refresh() {
    driver.refresh();
  },

  copyCell() {
    const m = model();
    const sel = currentSel();
    const row = m.rows[sel.r - 1];
    const col = m.columns[sel.c];
    const text = sel.r === 0 ? col?.header ?? '' : row && col ? cellFull(row, col) : '';
    navigator.clipboard?.writeText(text).catch(() => {});
  },

  saveSettings(patch: Partial<Settings>) {
    const settings = { ...DEFAULT_SETTINGS, ...store.state.settings, ...patch };
    store.set({ settings });
    try {
      chrome.storage.local.set({ settings });
    } catch {
      /* extension context gone */
    }
  },
};
