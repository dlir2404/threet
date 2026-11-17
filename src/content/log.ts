/** Tiny logger. In dev builds logs are forwarded to the background (and on to the debug MCP server). */
export function log(...args: unknown[]) {
  if (!__DEV__) return;
  console.debug('[threet]', ...args);
  try {
    chrome.runtime.sendMessage({ type: 'threet:log', level: 'debug', args: args.map(safe), at: Date.now() }).catch(() => {});
  } catch {
    /* extension reloaded; ignore */
  }
}

export function logError(...args: unknown[]) {
  console.error('[threet]', ...args);
  if (!__DEV__) return;
  try {
    chrome.runtime.sendMessage({ type: 'threet:log', level: 'error', args: args.map(safe), at: Date.now() }).catch(() => {});
  } catch {
    /* ignore */
  }
}

function safe(v: unknown): unknown {
  if (v instanceof Error) return { error: v.message, stack: v.stack };
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return String(v);
  }
}
