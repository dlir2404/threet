// Launch headless Chrome on a URL, wait, evaluate expressions (argv after --), print JSON. Dev helper for the preview page.
//   node scripts/cdp-eval.mjs http://127.0.0.1:5177/ --wait 2500 -- 'expr1' 'expr2'
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const args = process.argv.slice(2);
const url = args[0];
const wi = args.indexOf('--wait');
const wait = wi > 0 ? Number(args[wi + 1]) : 2500;
const exprs = args.includes('--') ? args.slice(args.indexOf('--') + 1) : [];
const si = args.indexOf('--shot');
const shot = si > 0 ? args[si + 1] : null;
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, '--window-size=1518,860', '--force-device-scale-factor=1',
  `--user-data-dir=/tmp/threet-cdp-${port}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); }
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.on('open', r));
let id = 0; const waiters = new Map();
ws.on('message', (b) => { const m = JSON.parse(String(b)); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', m.params.exceptionDetails.exception?.description); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('console.error', m.params.args.map((a) => a.value ?? a.description).join(' ')); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiters.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(wait);
for (const e of exprs) {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  console.log('>', e.slice(0, 80));
  console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r.result, null, 1));
}
if (shot) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  (await import('node:fs')).writeFileSync(shot, Buffer.from(r.result.data, 'base64'));
  console.log('shot:', shot);
}
ws.close(); chrome.kill();
process.exit(0);
