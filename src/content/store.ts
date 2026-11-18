import type { UpdateInfo } from '../shared/update';
import type { Post, PostGroup, ThreadRow } from '../shared/types';
import type { Route } from '../sites/types';
import { site } from './site';

export type { Route };

export interface Settings {
  enabled: boolean;
  title: string;
  formulaExpanded: boolean;
  showPreviews: boolean;
  /** Column widths, keyed "<site>.<column>". */
  colWidths: Record<string, number>;
  /** User-renamed column titles, keyed "<site>.<column>" (see prefKey in sheet.ts). */
  colTitles: Record<string, string>;
  zoom: number;
  /** The guide pops up once on first use. */
  seenGuide: boolean;
  /** Daily check of GitHub Releases for a newer version. */
  checkUpdates: boolean;
  /** "Remind me later": don't pop the update dialog again before this time. */
  updateSnoozeUntil: number;
  /** "Skip this version". */
  skipVersion: string;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  title: 'Q4 Planning - Tracker',
  formulaExpanded: false,
  showPreviews: true,
  colWidths: {},
  colTitles: {},
  zoom: 1,
  seenGuide: false,
  checkUpdates: true,
  updateSnoozeUntil: 0,
  skipVersion: '',
};

export interface Tab {
  /** Path of the real page this sheet mirrors. Also the tab id. */
  id: string;
  kind: 'list' | 'thread';
  title: string;
  code?: string;
  /** Renamed by the user: keep the title even when the thread refreshes. */
  renamed?: boolean;
}

export interface ListData {
  keys: string[];
  groups: Record<string, PostGroup>;
}


export interface Sel {
  r: number;
  c: number;
}

export interface State {
  ready: boolean;
  visible: boolean;
  boss: boolean;
  route: Route;
  tabs: Tab[];
  active: string;
  lists: Record<string, ListData>;
  threads: Record<string, ThreadRow[]>;
  loading: boolean;
  /** Selection per tab id. r/c are 0-based over the data grid (r=0 is the header row). */
  sel: Record<string, Sel>;
  settings: Settings;
  toast?: string;
  /** Cell currently opened in the in-place reader (F2 / double-click on text). */
  reading?: Sel;
  help: boolean;
  guideTab?: number;
  /** Newer release found on GitHub (only set when it is newer than this build). */
  update?: UpdateInfo;
  updateOpen?: boolean;
  /** Column index whose title is being edited in place. */
  editingHeader?: number;
  /** Sheet tab being renamed in place. */
  renamingTab?: string;
  lightbox?: { items: LightboxItem[]; index: number };
  menu?: OpenMenu;
}

export interface LightboxItem {
  src: string;
  alt?: string;
  video?: boolean;
  /** Videos: playable URL when the site exposes one. */
  play?: string;
  /** Videos: live element key + post code, to play it (see ui/Video.tsx). */
  vkey?: string;
  code?: string;
}

export interface MenuItemLike {
  label?: string;
  icon?: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  sep?: boolean;
  sub?: boolean;
  checked?: boolean;
}

export interface OpenMenu {
  id?: string;
  items: MenuItemLike[];
  x: number;
  y?: number;
  bottom?: number;
  /** Narrow, icon-less menu (sheet-tab menu). */
  compact?: boolean;
}

type Listener = () => void;

/** Route of a path on the current site. */
export function routeOf(pathname: string): Route {
  return site().routeOf(pathname);
}

export function tabTitle(route: Route, post?: Post): string {
  return site().tabTitle(route, post);
}

class Store {
  state: State = {
    ready: false,
    visible: true,
    boss: false,
    route: { kind: 'other', path: '/' },
    // The home feed is always the first sheet, so there is a way back from any thread.
    tabs: [{ id: '/', kind: 'list', title: 'Overview' }],
    active: '/',
    lists: {},
    threads: {},
    loading: false,
    sel: {},
    settings: { ...DEFAULT_SETTINGS },
    help: false,
  };
  private listeners = new Set<Listener>();
  private queued = false;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(patch: Partial<State> | ((s: State) => Partial<State>)) {
    const p = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    if (!this.queued) {
      this.queued = true;
      queueMicrotask(() => {
        this.queued = false;
        this.listeners.forEach((l) => l());
      });
    }
  }

  /** Ensure a tab exists for the route and make it active. */
  openTab(route: Route, title?: string) {
    if (route.kind === 'other') return;
    const id = route.path;
    this.set((s) => {
      const exists = s.tabs.find((t) => t.id === id);
      let tabs: Tab[];
      if (exists) {
        tabs = s.tabs.map((t) => (t.id === id && title && !t.renamed ? { ...t, title } : t));
      } else {
        // New sheets open right after the one they were opened from (like browser tabs),
        // so Back from a sub-thread lands on its parent.
        const tab = { id, kind: route.kind === 'thread' ? 'thread' : 'list', title: title ?? tabTitle(route), code: route.code } as Tab;
        const at = s.tabs.findIndex((t) => t.id === s.active);
        tabs = [...s.tabs];
        tabs.splice(at < 0 ? tabs.length : at + 1, 0, tab);
      }
      return { tabs, active: id };
    });
  }

  closeTab(id: string) {
    this.set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const sel = { ...s.sel };
      delete sel[id];
      return { tabs, sel, active: s.active === id ? tabs[tabs.length - 1]?.id ?? '/' : s.active };
    });
  }

  /** Merge freshly parsed groups into a list, keeping order and the posts we already saw. */
  mergeList(path: string, fresh: PostGroup[]) {
    if (!fresh.length) return false;
    const cur = this.state.lists[path] ?? { keys: [], groups: {} };
    const keys = [...cur.keys];
    const groups = { ...cur.groups };
    let prevIdx = -1;
    let changed = false;
    for (const g of fresh) {
      const key = g.posts[0].code;
      const at = keys.indexOf(key);
      if (at === -1) {
        keys.splice(prevIdx + 1, 0, key);
        prevIdx += 1;
        groups[key] = g;
        changed = true;
      } else {
        prevIdx = at;
        if (!sameGroup(groups[key], g)) {
          groups[key] = mergeGroup(groups[key], g);
          changed = true;
        }
      }
    }
    if (changed) this.set((s) => ({ lists: { ...s.lists, [path]: { keys, groups } } }));
    return changed;
  }

  setThread(code: string, rows: ThreadRow[]) {
    if (!rows.length) return false;
    const prev = this.state.threads[code];
    if (prev) {
      const old = new Map(prev.map((r) => [r.post.code, r.post] as const));
      rows = rows.map((r) => ({ ...r, post: keepPosters(old.get(r.post.code), r.post) }));
    }
    // Replies virtualise away as the real page scrolls; keep the ones we have seen.
    let merged = rows;
    if (prev) {
      const seen = new Set(rows.map((r) => r.post.code));
      const missing = prev.filter((r) => !seen.has(r.post.code));
      if (missing.length) {
        merged = [...rows];
        for (const r of missing) {
          const i = prev.indexOf(r);
          const before = prev.slice(0, i).reverse().find((p) => seen.has(p.post.code));
          const at = before ? merged.findIndex((m) => m.post.code === before.post.code) + 1 : 0;
          merged.splice(at, 0, r);
          seen.add(r.post.code);
        }
      }
      if (merged.length === prev.length && merged.every((r, i) => r.post.code === prev[i].post.code && samePost(r.post, prev[i].post))) {
        return false;
      }
    }
    this.set((s) => ({ threads: { ...s.threads, [code]: merged } }));
    return true;
  }

  /**
   * Take freshly parsed thread rows (from the page or a thread iframe): store them, give the tab
   * its real title once the focal post is known, and land on the focal post the first time.
   */
  applyThread(route: Route, rows: ThreadRow[]) {
    if (!route.code) return;
    this.setThread(route.code, rows);
    const fi = rows.findIndex((r) => r.focal);
    if (fi < 0) return;
    const want = tabTitle(route, rows[fi].post);
    const tab = this.state.tabs.find((t) => t.id === route.path);
    if (tab && !tab.renamed && tab.title !== want) {
      this.set((s) => ({ tabs: s.tabs.map((t) => (t.id === route.path ? { ...t, title: want } : t)) }));
    }
    if (!this.state.sel[route.path]) this.setSel(route.path, { r: fi + 1, c: Math.max(0, site().columns.findIndex((c) => c.key === 'text')) });
  }

  setSel(tab: string, sel: Sel) {
    this.set((s) => ({ sel: { ...s.sel, [tab]: sel } }));
  }

  emit() {
    this.listeners.forEach((l) => l());
  }
}

function sameCounts(a: Post['counts'], b: Post['counts']): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

function samePost(a: Post, b: Post): boolean {
  return a.text === b.text && sameCounts(a.counts, b.counts) && a.media.length === b.media.length
    && a.media.every((m, i) => !!m.full === !!b.media[i].full);
}

/** A re-parse may miss a video's poster (Threads drops it once the video plays): keep the old one. */
function keepPosters(old: Post | undefined, next: Post): Post {
  if (!old || !next.media.some((m, i) => !m.full && old.media[i]?.full)) return next;
  return { ...next, media: next.media.map((m, i) => (m.full || !old.media[i]?.full ? m : { ...m, full: old.media[i].full })) };
}

function sameGroup(a: PostGroup, b: PostGroup): boolean {
  return a.posts.length === b.posts.length && a.posts.every((p, i) => p.code === b.posts[i].code && samePost(p, b.posts[i]));
}

function mergeGroup(a: PostGroup, b: PostGroup): PostGroup {
  const byCode = new Map(a.posts.map((p) => [p.code, p] as const));
  for (const p of b.posts) byCode.set(p.code, keepPosters(byCode.get(p.code), p));
  const order = [...b.posts.map((p) => p.code), ...a.posts.map((p) => p.code).filter((c) => !b.posts.some((p) => p.code === c))];
  return { posts: order.map((c) => byCode.get(c)!) };
}

export const store = new Store();
