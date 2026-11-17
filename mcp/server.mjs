#!/usr/bin/env node
/**
 * threet-debug — MCP server for developing the threet extension. NOT shipped with the extension.
 *
 *   Claude Code ──stdio(MCP)──▶ this process ──WebSocket 127.0.0.1:47321──▶ threet (dev) service worker
 *                                                                            ├─▶ content script (state, actions, DOM)
 *                                                                            └─▶ chrome.debugger (eval, screenshot, input)
 *
 * Only the dev build (dist-dev/) connects here. Connections must come from a chrome-extension://
 * origin and carry the token from .threet-dev-token (written by `npm run dev`).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { z } from 'zod';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.THREET_DEV_PORT ?? 47321);
const tokenFile = join(root, '.threet-dev-token');
const readToken = () => (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');

const log = (...a) => process.stderr.write(`[threet-debug] ${a.join(' ')}\n`);

// ---------------------------------------------------------------- WebSocket side
let ext = null; // { ws, hello }
let listenError = null;
let nextId = 1;
const pending = new Map();

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT, maxPayload: 64 * 1024 * 1024 });
wss.on('listening', () => log(`listening on ws://127.0.0.1:${PORT}`));
wss.on('error', (e) => {
  listenError = e.code === 'EADDRINUSE' ? `port ${PORT} is already in use (another threet-debug server running?)` : String(e);
  log('ws error:', listenError);
});
wss.on('connection', (ws, req) => {
  const origin = req.headers.origin ?? '';
  const token = new URL(req.url ?? '/', 'http://x').searchParams.get('token');
  if (!origin.startsWith('chrome-extension://') || !token || token !== readToken()) {
    log(`rejected connection from origin=${origin || '(none)'}`);
    ws.close(4001, 'unauthorized');
    return;
  }
  if (ext?.ws && ext.ws !== ws) ext.ws.close(4000, 'replaced');
  ext = { ws, hello: null, origin };
  log(`extension connected (${origin})`);
  ws.on('message', (buf) => {
    let msg;
    try {
      msg = JSON.parse(String(buf));
    } catch {
      return;
    }
    if (msg.type === 'hello') ext.hello = msg;
    if (msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(p.timer);
      msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
    }
  });
  ws.on('close', () => {
    if (ext?.ws === ws) ext = null;
    log('extension disconnected');
  });
});

function call(method, params = {}, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (!ext?.ws || ext.ws.readyState !== 1) {
      reject(new Error(
        listenError ??
          'threet (dev) extension is not connected. Load dist-dev/ as an unpacked extension in chrome://extensions, run `npm run dev`, and open a threads.com tab.',
      ));
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout after ${timeoutMs}ms waiting for ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    ext.ws.send(JSON.stringify({ id, method, params }));
  });
}

async function waitConnected(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (ext?.ws?.readyState === 1) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

// ---------------------------------------------------------------- MCP side
const server = new McpServer({ name: 'threet-debug', version: '0.1.0' });

const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: String(e?.message ?? e) }] });
const wrap = (fn) => async (args) => {
  try {
    return await fn(args ?? {});
  } catch (e) {
    return fail(e);
  }
};
const tabId = z.number().int().optional().describe('Chrome tab id; defaults to the active Threads tab');

server.registerTool(
  'threet_status',
  { description: 'Connection status of the threet (dev) extension and the open Threads tabs.' },
  wrap(async () => {
    if (!ext) return text({ connected: false, port: PORT, listenError, hint: 'Load dist-dev/ unpacked, open threads.com' });
    const tabs = await call('tabs');
    return text({ connected: true, port: PORT, extension: ext.hello, tabs });
  }),
);

server.registerTool(
  'threet_state',
  { description: 'Overlay state summary from the content script: route, sheet tabs, selection, list/thread sizes, settings.', inputSchema: { tabId } },
  wrap(async ({ tabId }) => text(await call('content', { tabId, cmd: 'state' }))),
);

server.registerTool(
  'threet_rows',
  {
    description: 'The rows the active sheet is rendering, as cell text (what the user sees).',
    inputSchema: { tabId, offset: z.number().int().optional(), limit: z.number().int().optional() },
  },
  wrap(async ({ tabId, offset, limit }) => text(await call('content', { tabId, cmd: 'rows', args: { offset, limit } }))),
);

server.registerTool(
  'threet_content',
  {
    description:
      'Run a content-script debug command. cmd: state | rows {offset,limit} | posts {path?,code?,limit} | parse (parse live DOM now) | ' +
      'dom {index?,limit?,max?,list?} (real Threads DOM without class names) | scroller | scan | ' +
      'action {name, args[]} (e.g. move [1,0], openCurrent, back, loadMore, refresh, toggleBoss, toggleVisible, activateTab ["/"]) | set {patch}',
    inputSchema: { tabId, cmd: z.string(), args: z.any().optional() },
  },
  wrap(async ({ tabId, cmd, args }) => text(await call('content', { tabId, cmd, args }, 30000))),
);

server.registerTool(
  'threet_eval',
  {
    description:
      'Evaluate JavaScript in the page main world via the Chrome debugger (bypasses page CSP). Returns JSON-serialisable value. ' +
      'The overlay lives at document.querySelector("threet-root").shadowRoot. Promises are awaited.',
    inputSchema: { tabId, expression: z.string(), timeout: z.number().int().optional() },
  },
  wrap(async ({ tabId, expression, timeout }) => text(await call('eval', { tabId, expression, timeout }, (timeout ?? 10000) + 5000))),
);

server.registerTool(
  'threet_screenshot',
  {
    description: 'Screenshot of the Threads tab (what the user sees, overlay included).',
    inputSchema: {
      tabId,
      format: z.enum(['png', 'jpeg']).optional(),
      clip: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
    },
  },
  wrap(async ({ tabId, format, clip }) => {
    const r = await call('screenshot', { tabId, format: format ?? 'jpeg', quality: 80, clip }, 30000);
    return { content: [{ type: 'image', data: r.data, mimeType: r.mimeType }] };
  }),
);

server.registerTool(
  'threet_input',
  {
    description:
      'Send trusted input to the tab via CDP. events: [{type:"key", key:"ArrowDown", modifiers?: 1=Alt 2=Ctrl 4=Meta 8=Shift} | ' +
      '{type:"click"|"dblclick"|"move", x, y} | {type:"wheel", x, y, dy} | {type:"wait", ms}]',
    inputSchema: { tabId, events: z.array(z.record(z.string(), z.any())) },
  },
  wrap(async ({ tabId, events }) => text(await call('input', { tabId, events }, 60000))),
);

server.registerTool(
  'threet_navigate',
  { description: 'Navigate the Threads tab to a URL (full page load).', inputSchema: { tabId, url: z.string() } },
  wrap(async ({ tabId, url }) => text(await call('navigate', { tabId, url }))),
);

server.registerTool(
  'threet_reload',
  {
    description: 'Reload after a rebuild. target "extension" reloads the unpacked extension (and, by default, the Threads tabs); "tab" reloads just the tab.',
    inputSchema: { target: z.enum(['extension', 'tab']), tabId, reloadTabs: z.boolean().optional() },
  },
  wrap(async ({ target, tabId, reloadTabs }) => {
    if (target === 'tab') return text(await call('reloadTab', { tabId }));
    await call('reloadExtension', { reloadTabs: reloadTabs ?? true });
    await new Promise((r) => setTimeout(r, 800));
    const ok = await waitConnected(15000);
    return text({ reloaded: true, reconnected: ok });
  }),
);

server.registerTool(
  'threet_logs',
  {
    description: 'Recent logs: content-script log()/logError() output plus page console errors/exceptions seen while the debugger is attached.',
    inputSchema: { limit: z.number().int().optional(), clear: z.boolean().optional() },
  },
  wrap(async ({ limit, clear }) => text(await call('logs', { limit, clear }))),
);

server.registerTool(
  'threet_detach',
  { description: 'Detach the Chrome debugger (removes the "started debugging this browser" bar).' },
  wrap(async () => text(await call('detach'))),
);

await server.connect(new StdioServerTransport());
log('MCP ready');
