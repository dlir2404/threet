import { store, type ListData, type State } from './store';
import type { ThreadRow } from '../shared/types';

/**
 * Carries what the sheet has read (feed rows, threads, open tabs) across a full page load that
 * *we* caused (opening a post whose link Threads no longer renders). A reload by the user starts
 * fresh, like reopening the sheet: the snapshot is only restored when hardNavigate() left a
 * recent "keep" mark. Lives in this tab's sessionStorage.
 */

const PREFIX = 'threet:cache:';
const KEY = PREFIX + __BUILD_ID__;
const KEEP = 'threet:keep';
const KEEP_MS = 20000;
const MAX_LIST = 600;
const MAX_THREADS = 30;

interface Snapshot {
  lists: Record<string, ListData>;
  threads: Record<string, ThreadRow[]>;
  tabs: State['tabs'];
  sel: State['sel'];
}

export function restoreCache() {
  try {
    // Drop caches written by other builds.
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX) && k !== KEY) sessionStorage.removeItem(k);
    }
    const keep = Number(sessionStorage.getItem(KEEP) ?? 0);
    sessionStorage.removeItem(KEEP);
    const raw = sessionStorage.getItem(KEY);
    if (!raw || Date.now() - keep > KEEP_MS) {
      sessionStorage.removeItem(KEY); // user reload / new visit: start fresh
      return;
    }
    const snap = JSON.parse(raw) as Snapshot;
    store.set({ lists: snap.lists ?? {}, threads: snap.threads ?? {}, tabs: snap.tabs?.length ? snap.tabs : store.state.tabs, sel: snap.sel ?? {} });
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
}

let timer: number | undefined;
let last: Pick<State, 'lists' | 'threads' | 'tabs' | 'sel'> | undefined;

export function startCache() {
  store.subscribe(() => {
    const s = store.state;
    if (last && last.lists === s.lists && last.threads === s.threads && last.tabs === s.tabs && last.sel === s.sel) return;
    last = { lists: s.lists, threads: s.threads, tabs: s.tabs, sel: s.sel };
    window.clearTimeout(timer);
    timer = window.setTimeout(save, 800);
  });
}

/** Full page load that should keep the sheet: save now and mark it for the next boot. */
export function hardNavigate(path: string) {
  window.clearTimeout(timer);
  save();
  try {
    sessionStorage.setItem(KEEP, String(Date.now()));
  } catch {
    /* ignore */
  }
  location.assign(path);
}

function save() {
  const s = store.state;
  const lists: Record<string, ListData> = {};
  for (const [path, l] of Object.entries(s.lists)) {
    const keys = l.keys.slice(0, MAX_LIST);
    lists[path] = { keys, groups: Object.fromEntries(keys.map((k) => [k, l.groups[k]])) };
  }
  // Keep the threads that are open as tabs plus the most recent others.
  const open = new Set(s.tabs.map((t) => t.code).filter(Boolean));
  const codes = Object.keys(s.threads);
  const keep = [...codes.filter((c) => open.has(c)), ...codes.filter((c) => !open.has(c)).slice(-MAX_THREADS)];
  const threads = Object.fromEntries(keep.map((c) => [c, s.threads[c]]));
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ lists, threads, tabs: s.tabs, sel: s.sel } satisfies Snapshot));
  } catch {
    /* quota: skip this save */
  }
}
