// Smoke test for mcp/server.mjs: fake extension over WebSocket + real MCP client over stdio.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

const PORT = 47399;
const token = readFileSync(new URL('../.threet-dev-token', import.meta.url), 'utf8').trim();
const client = new Client({ name: 'smoke', version: '0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp/server.mjs'], env: { ...process.env, THREET_DEV_PORT: String(PORT) }, stderr: 'inherit' }));
const tools = (await client.listTools()).tools.map((t) => t.name);
console.log('tools:', tools.join(', '));
console.log('status (no ext):', (await client.callTool({ name: 'threet_status' })).content[0].text);

// Bad origin must be rejected.
await new Promise((res) => {
  const bad = new WebSocket(`ws://127.0.0.1:${PORT}/?token=${token}`, { origin: 'https://evil.example' });
  bad.on('close', (code) => { console.log('bad origin closed with', code); res(); });
  bad.on('error', () => {});
});

const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?token=${token}`, { origin: 'chrome-extension://abc' });
await new Promise((r) => ws.on('open', r));
ws.send(JSON.stringify({ type: 'hello', version: '0.1.0', id: 'abc' }));
ws.on('message', (b) => {
  const m = JSON.parse(String(b));
  if (m.method === 'tabs') ws.send(JSON.stringify({ id: m.id, result: [{ id: 1, url: 'https://www.threads.com/' }] }));
  else if (m.method === 'content') ws.send(JSON.stringify({ id: m.id, result: { echo: m.params } }));
  else if (m.method === 'screenshot') ws.send(JSON.stringify({ id: m.id, result: { data: 'iVBORw0KGgo=', mimeType: 'image/png' } }));
  else ws.send(JSON.stringify({ id: m.id, error: 'nope ' + m.method }));
});
await new Promise((r) => setTimeout(r, 100));
console.log('status:', (await client.callTool({ name: 'threet_status' })).content[0].text.replace(/\s+/g, ' '));
console.log('content:', (await client.callTool({ name: 'threet_content', arguments: { cmd: 'action', args: { name: 'move', args: [1, 0] } } })).content[0].text.replace(/\s+/g, ' '));
console.log('screenshot type:', (await client.callTool({ name: 'threet_screenshot', arguments: {} })).content[0].type);
const err = await client.callTool({ name: 'threet_logs', arguments: {} });
console.log('error path:', err.isError, err.content[0].text);
ws.close();
await client.close();
process.exit(0);
