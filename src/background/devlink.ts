/**
 * Dev-only link between the extension and the threet-debug MCP server (mcp/server.mjs).
 *
 *   Claude ──stdio──▶ MCP server ──ws://127.0.0.1:PORT──▶ this service worker ──▶ content script / CDP
 *
 * The service worker is the WebSocket *client*; the server only accepts connections whose
 * Origin is a chrome-extension:// URL and that present the build-time dev token.
 */

const THREADS_URLS = ['*://*.threads.com/*', '*://*.threads.net/*'];
const URL_WS = `ws://127.0.0.1:${__DEV_PORT__}/?token=${__DEV_TOKEN__}`;

let ws: WebSocket | null = null;
let backoff = 500;
const logs: { at: number; level: string; source: string; args: unknown[] }[] = [];
const attached = new Set<number>();

function pushLog(level: string, source: string, args: unknown[]) {
  logs.push({ at: Date.now(), level, source, args });
  if (logs.length > 500) logs.splice(0, logs.length - 500);
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(URL_WS);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    backoff = 500;
    send({ type: 'hello', version: chrome.runtime.getManifest().version, id: chrome.runtime.id });
  };
  ws.onmessage = (ev) => {
    let msg: { id: number; method: string; params?: any };
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    handle(msg.method, msg.params ?? {}).then(
      (result) => send({ id: msg.id, result }),
      (e) => send({ id: msg.id, error: String(e?.message ?? e) }),
    );
  };
  ws.onclose = () => {
    ws = null;
    scheduleReconnect();
  };
  ws.onerror = () => {
    /* onclose follows */
  };
}

function scheduleReconnect() {
  setTimeout(connect, backoff);
  backoff = Math.min(backoff * 2, 10000);
}

function send(obj: unknown) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

async function pickTab(tabId?: number): Promise<chrome.tabs.Tab> {
  if (tabId != null) return chrome.tabs.get(tabId);
  const tabs = await chrome.tabs.query({ url: THREADS_URLS });
  if (!tabs.length) throw new Error('No Threads tab open. Open https://www.threads.com in Chrome.');
  return tabs.find((t) => t.active && t.highlighted) ?? tabs.find((t) => t.active) ?? tabs[0];
}

async function cdp(tabId: number, method: string, params: object = {}): Promise<any> {
  if (!attached.has(tabId)) {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached.add(tabId);
    await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
  }
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

function watchDebugger() {
  chrome.debugger.onDetach.addListener((src) => {
    if (src.tabId != null) attached.delete(src.tabId);
  });

  chrome.debugger.onEvent.addListener((src, method, params: any) => {
    if (method === 'Runtime.consoleAPICalled' && (params.type === 'error' || params.type === 'warning')) {
      pushLog(params.type, `page:${src.tabId}`, (params.args ?? []).map((a: any) => a.value ?? a.description ?? a.type));
    } else if (method === 'Runtime.exceptionThrown') {
      const d = params.exceptionDetails;
      pushLog('exception', `page:${src.tabId}`, [d?.exception?.description ?? d?.text]);
    }
  });
}

async function handle(method: string, p: any): Promise<unknown> {
  switch (method) {
    case 'ping':
      return { pong: Date.now() };

    case 'tabs':
      return (await chrome.tabs.query({ url: THREADS_URLS })).map((t) => ({ id: t.id, url: t.url, title: t.title, active: t.active, windowId: t.windowId }));

    case 'content': {
      const tab = await pickTab(p.tabId);
      const res = await chrome.tabs.sendMessage(tab.id!, { type: 'threet:debug', cmd: p.cmd, args: p.args });
      if (res?.error) throw new Error(res.error);
      return res?.result;
    }

    case 'eval': {
      const tab = await pickTab(p.tabId);
      const r = await cdp(tab.id!, 'Runtime.evaluate', {
        expression: p.expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
        timeout: p.timeout ?? 10000,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result?.value ?? r.result?.description ?? null;
    }

    case 'screenshot': {
      const tab = await pickTab(p.tabId);
      const params: any = { format: p.format ?? 'png' };
      if (p.format === 'jpeg') params.quality = p.quality ?? 80;
      if (p.clip) params.clip = { ...p.clip, scale: 1 };
      const r = await cdp(tab.id!, 'Page.captureScreenshot', params);
      return { data: r.data, mimeType: `image/${params.format}` };
    }

    case 'input': {
      // Synthesize real (trusted) input through CDP: p.events = [{type:'key', key:'ArrowDown'} | {type:'click', x, y}]
      const tab = await pickTab(p.tabId);
      for (const e of p.events ?? []) {
        if (e.type === 'key') {
          const base = { key: e.key, code: e.code ?? codeFor(e.key), modifiers: e.modifiers ?? 0, windowsVirtualKeyCode: e.keyCode ?? vkFor(e.key) };
          await cdp(tab.id!, 'Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: e.key.length === 1 ? e.key : undefined });
          await cdp(tab.id!, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
        } else if (e.type === 'click' || e.type === 'dblclick') {
          const clicks = e.type === 'dblclick' ? 2 : 1;
          for (let i = 1; i <= clicks; i++) {
            await cdp(tab.id!, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: e.x, y: e.y, button: 'left', clickCount: i });
            await cdp(tab.id!, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: e.x, y: e.y, button: 'left', clickCount: i });
          }
        } else if (e.type === 'move') {
          await cdp(tab.id!, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: e.x, y: e.y });
        } else if (e.type === 'wheel') {
          await cdp(tab.id!, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: e.x, y: e.y, deltaX: e.dx ?? 0, deltaY: e.dy ?? 0 });
        } else if (e.type === 'wait') {
          await new Promise((r) => setTimeout(r, e.ms ?? 300));
        }
      }
      return { ok: true };
    }

    case 'navigate': {
      const tab = await pickTab(p.tabId);
      await chrome.tabs.update(tab.id!, { url: p.url });
      return { ok: true };
    }

    case 'reloadTab': {
      const tab = await pickTab(p.tabId);
      await chrome.tabs.reload(tab.id!);
      return { ok: true };
    }

    case 'reloadExtension': {
      // Reply first; the reload kills this worker. Threads tabs are reloaded on next start (see below).
      await chrome.storage.local.set({ reloadTabsAfterRestart: !!p.reloadTabs });
      setTimeout(() => chrome.runtime.reload(), 100);
      return { ok: true, note: 'extension reloading; it reconnects in ~1s' };
    }

    case 'detach': {
      for (const id of attached) await chrome.debugger.detach({ tabId: id }).catch(() => {});
      attached.clear();
      return { ok: true };
    }

    case 'logs': {
      const out = logs.slice(-(p.limit ?? 100));
      if (p.clear) logs.length = 0;
      return out;
    }

    default:
      throw new Error(`unknown method ${method}`);
  }
}

function codeFor(key: string): string {
  if (key.length === 1) return /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : /\d/.test(key) ? `Digit${key}` : key === ' ' ? 'Space' : '';
  return key;
}

function vkFor(key: string): number {
  const map: Record<string, number> = {
    Enter: 13, Escape: 27, Backspace: 8, Tab: 9, ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
    PageUp: 33, PageDown: 34, End: 35, Home: 36, F2: 113,
  };
  if (map[key]) return map[key];
  if (key.length === 1) return key.toUpperCase().charCodeAt(0);
  return 0;
}

export function startDevLink() {
  watchDebugger();
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type === 'threet:log') pushLog(msg.level, `content:${sender.tab?.id}`, msg.args);
    if (msg?.type === 'threet:hello') connect();
  });
  // Keep the worker alive while the socket is open (Chrome 116+ counts WebSocket traffic).
  setInterval(() => send({ type: 'keepalive', at: Date.now() }), 20000);
  chrome.alarms.create('threet-dev-reconnect', { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((a) => a.name === 'threet-dev-reconnect' && connect());
  chrome.storage.local.get('reloadTabsAfterRestart').then(async ({ reloadTabsAfterRestart }) => {
    if (!reloadTabsAfterRestart) return;
    await chrome.storage.local.remove('reloadTabsAfterRestart');
    for (const t of await chrome.tabs.query({ url: THREADS_URLS })) if (t.id != null) chrome.tabs.reload(t.id);
  });
  connect();
}
