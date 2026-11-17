#!/usr/bin/env node
/**
 * Offline preview: serves a saved Threads page (scripts stripped) with the built content script and
 * a stub `chrome` API, so the overlay can be checked in a normal browser or a headless screenshot.
 *
 *   node scripts/preview.mjs [fixture.html] [--port 5177] [--shot out.png] [--size 1518x860] [--dist dist]
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const fixture = resolve(argv.find((a) => a.endsWith('.html')) ?? join(root, 'test/fixtures/feed-home.html'));
const port = Number(opt('port', 5177));
const shot = opt('shot');
const size = opt('size', '1518x860');
const dist = join(root, opt('dist', 'dist'));
const pathname = opt('path', '/');
const settings = opt('settings', '{}');

const STUB = `
window.chrome = window.chrome || {};
(function () {
  const store = { settings: Object.assign({}, ${settings}) };
  const listeners = [];
  chrome.runtime = {
    id: 'preview',
    getURL: (p) => '/__dist/' + p,
    sendMessage: () => Promise.resolve(),
    onMessage: { addListener: () => {} },
    getManifest: () => ({ version: 'preview' }),
  };
  chrome.storage = {
    local: {
      get: async (k) => ({ [k]: store[k] }),
      set: async (o) => { Object.assign(store, o); listeners.forEach((l) => l(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { newValue: v }])))); },
    },
    onChanged: { addListener: (l) => listeners.push(l) },
  };
})();
`;

function page() {
  let html = readFileSync(fixture, 'utf8');
  html = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<link\b[^>]*rel="?(?:preload|modulepreload)"?[^>]*>/gi, '');
  const inject = `<script>${STUB}</script><script src="/__dist/content.js"></script>`;
  return html.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/__dist/')) {
    const f = join(dist, decodeURIComponent(url.pathname.slice('/__dist/'.length)));
    if (!f.startsWith(dist) || !existsSync(f)) return res.writeHead(404).end();
    const type = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
    return res.writeHead(200, { 'content-type': type }).end(readFileSync(f));
  }
  if (url.pathname === pathname || url.pathname === '/') {
    return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page());
  }
  res.writeHead(404).end();
});

server.listen(port, '127.0.0.1', () => {
  const target = `http://127.0.0.1:${port}${pathname}`;
  console.log(`preview: ${target}`);
  if (!shot) return;
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const [w, h] = size.split('x');
  // Async: the server must keep answering while Chrome loads the page.
  promisify(execFile)(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${w},${h}`, '--virtual-time-budget=4000', `--screenshot=${resolve(shot)}`,
      '--enable-logging=stderr', '--v=0', target,
    ], { timeout: 60000 })
    .then(({ stderr }) => {
      const lines = String(stderr).split('\n').filter((l) => /CONSOLE|Uncaught|Error/i.test(l) && !/DevTools|dbus|GPU|gcm|Fontconfig/i.test(l));
      if (lines.length) console.log('page console:\n' + lines.slice(0, 30).join('\n'));
      console.log(`screenshot: ${resolve(shot)}`);
    })
    .catch((e) => console.error('chrome failed:', e.message))
    .finally(() => server.close());
});
