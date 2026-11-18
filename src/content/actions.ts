import type { Media } from '../shared/types';
import * as driver from './driver';
import { buildModel, cellFull, POST_COLUMNS, type SheetModel } from './sheet';
import { DEFAULT_SETTINGS, store, type Sel, type Settings } from './store';

const DEFAULT_SEL: Sel = { r: 1, c: 4 };

export function currentSel(): Sel {
  return store.state.sel[store.state.boss ? '__boss' : store.state.active] ?? DEFAULT_SEL;
}

function selKey() {
  return store.state.boss ? '__boss' : store.state.active;
}

function model(): SheetModel {
  return buildModel(store.state);
}

/** Total columns rendered (A..Z at least). */
export const MIN_COLS = 26;

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
    if (where === 'bottom' && m.pageable) driver.loadMore();
  },

  /** Enter: open the selected row's thread (or the attachment). */
  openCurrent() {
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
    if (tab?.kind === 'thread' && tab.code === row.post.code) {
      // Already viewing this thread; F2-style reader instead.
      actions.toggleReader();
      return;
    }
    driver.openThread(row.post.path, row.post.author);
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
    const col = POST_COLUMNS[i];
    if (!col) return;
    const titles = { ...(store.state.settings.colTitles ?? {}) };
    const v = value.trim();
    if (!v || v === col.header) delete titles[col.key];
    else titles[col.key] = v;
    actions.saveSettings({ colTitles: titles });
  },

  resetHeaders() {
    actions.saveSettings({ colTitles: {} });
  },

  /** Drop what this sheet has loaded and start again from the top of the real page. */
  clearRows() {
    const tab = store.state.tabs.find((t) => t.id === store.state.active);
    if (!tab || store.state.boss) return;
    store.set((s) =>
      tab.kind === 'list'
        ? { lists: { ...s.lists, [tab.id]: { keys: [], groups: {} } }, sel: { ...s.sel, [tab.id]: DEFAULT_SEL } }
        : { threads: { ...s.threads, [tab.code!]: [] }, sel: { ...s.sel, [tab.id]: DEFAULT_SEL } },
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
      .map((m) => ({ src: m.kind === 'video' ? m.full ?? '' : m.full || m.src, alt: m.alt, video: m.kind === 'video', vkey: m.vkey, code }))
      .filter((it) => it.src || (it.vkey && it.code));
    if (items.length) store.set({ lightbox: { items, index: Math.min(index, items.length - 1) } });
  },

  stepMedia(d: number) {
    const lb = store.state.lightbox;
    if (!lb) return;
    const n = lb.items.length;
    store.set({ lightbox: { ...lb, index: (lb.index + d + n) % n } });
  },

  toggleReader() {
    const sel = currentSel();
    if (sel.r === 0) return actions.editHeader(sel.c);
    store.set((s) => ({ reading: s.reading ? undefined : sel }));
  },

  closeOverlays(): boolean {
    const s = store.state;
    if (s.menu) return store.set({ menu: undefined }), true;
    if (s.lightbox) return store.set({ lightbox: undefined }), true;
    if (s.help) return actions.toggleHelp(), true;
    if (s.reading) return store.set({ reading: undefined }), true;
    return false;
  },

  toggleBoss() {
    store.set((s) => ({ boss: !s.boss, reading: undefined, lightbox: undefined, menu: undefined, help: false }));
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
    actions.saveSettings({ colWidths: { ...store.state.settings.colWidths, [key]: Math.max(24, Math.round(w)) } });
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
