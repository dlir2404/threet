import { actions, currentSel } from './actions';
import * as driver from './driver';
import { CONTAINER_SEL, findList, parseGroups, parseThread } from './parser';
import { buildModel, cellDisplay } from './sheet';
import { routeOf, store } from './store';
import { framePaths, frameFor } from './frames';

/**
 * Dev-only: answers debug commands relayed by the background service worker from the
 * threet-debug MCP server. Stripped from production builds (__DEV__ is false there).
 */

type Handler = (args: any) => unknown;

function summary() {
  const s = store.state;
  return {
    href: location.href,
    route: s.route,
    visible: s.visible,
    boss: s.boss,
    ready: s.ready,
    loading: s.loading,
    active: s.active,
    tabs: s.tabs,
    sel: currentSel(),
    reading: s.reading,
    lists: Object.fromEntries(Object.entries(s.lists).map(([k, v]) => [k, v.keys.length])),
    threads: Object.fromEntries(Object.entries(s.threads).map(([k, v]) => [k, v.length])),
    settings: s.settings,
    realContainers: document.querySelectorAll(CONTAINER_SEL).length,
    frames: framePaths().map((p) => ({ path: p, ok: frameFor(p)?.ok, inFrame: frameFor(p)?.el.contentDocument?.querySelectorAll(CONTAINER_SEL).length ?? null })),
  };
}

/** Real Threads DOM, minus generated class names, to inspect what the parser sees. */
function cleanHtml(el: Element, max = 20000): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('*').forEach((n) => {
    n.removeAttribute('class');
    n.removeAttribute('style');
    if (n.tagName === 'path') n.removeAttribute('d');
    if (n.tagName === 'IMG') {
      n.removeAttribute('srcset');
      const src = n.getAttribute('src');
      if (src) n.setAttribute('src', src.slice(0, 60) + '…');
    }
  });
  clone.removeAttribute('class');
  const html = clone.outerHTML;
  return html.length > max ? html.slice(0, max) + `… [${html.length - max} more chars]` : html;
}

const handlers: Record<string, Handler> = {
  state: () => summary(),

  rows: ({ limit = 30, offset = 0 } = {}) => {
    const m = buildModel(store.state);
    return {
      columns: m.columns.map((c) => c.header),
      total: m.rows.length,
      rows: m.rows.slice(offset, offset + limit).map((r) => m.columns.map((c) => cellDisplay(r, c))),
    };
  },

  posts: ({ path, code, limit = 20 } = {}) => {
    const s = store.state;
    if (code) return s.threads[code] ?? null;
    const list = s.lists[path ?? s.active];
    if (!list) return null;
    return list.keys.slice(0, limit).map((k) => list.groups[k]);
  },

  /** Parse the live page right now without touching the store. */
  parse: () => {
    const route = routeOf(location.pathname);
    if (route.kind === 'thread' && route.code) return { route, rows: parseThread(document, route.code) };
    return { route, groups: parseGroups(document) };
  },

  dom: ({ index, limit = 3, max = 12000, list = false } = {}) => {
    if (list) {
      const l = findList(document);
      if (!l) return null;
      return {
        listTag: l.tagName,
        children: l.children.length,
        childSummary: Array.from(l.children).slice(0, 40).map((c, i) => ({
          i,
          tag: c.tagName,
          containers: c.querySelectorAll(CONTAINER_SEL).length,
          text: (c.textContent ?? '').slice(0, 80),
        })),
      };
    }
    const all = Array.from(document.querySelectorAll(CONTAINER_SEL));
    const pick = index != null ? [all[index]].filter(Boolean) : all.slice(0, limit);
    return pick.map((el) => cleanHtml(el, max));
  },

  coverage: () => driver.coverage(),

  /** chrome.storage.local, or one key of it. */
  storage: ({ key }: { key?: string } = {}) => chrome.storage.local.get(key ?? null),

  scroller: () => {
    const sc = driver.findScroller();
    return { tag: sc.tagName, scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight, isDocument: sc === document.scrollingElement };
  },

  scan: () => {
    driver.scan();
    return summary();
  },

  action: ({ name, args = [] }: { name: string; args?: unknown[] }) => {
    const fn = (actions as any)[name] ?? (driver as any)[name];
    if (typeof fn !== 'function') throw new Error(`unknown action ${name}. actions: ${Object.keys(actions).join(', ')}; driver: ${Object.keys(driver).join(', ')}`);
    const out = fn(...args);
    return { ok: true, result: out ?? null, state: summary() };
  },

  set: (patch: Record<string, unknown>) => {
    store.set(patch as any);
    return summary();
  },
};

export function installDevBridge() {
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== 'threet:debug') return;
    try {
      const h = handlers[msg.cmd];
      if (!h) {
        reply({ error: `unknown cmd ${msg.cmd}; known: ${Object.keys(handlers).join(', ')}` });
        return;
      }
      Promise.resolve(h(msg.args ?? {})).then(
        (result) => reply({ result }),
        (e) => reply({ error: String(e?.stack ?? e) }),
      );
    } catch (e: any) {
      reply({ error: String(e?.stack ?? e) });
    }
    return true;
  });
  // Wake the service worker so it (re)connects to the debug server.
  chrome.runtime.sendMessage({ type: 'threet:hello', href: location.href }).catch(() => {});
}
