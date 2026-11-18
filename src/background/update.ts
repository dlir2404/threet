import { CHECK_EVERY_MS, FALLBACK_API, fromVersion, parseRelease, RELEASES_API, type UpdateInfo, type UpdateState } from '../shared/update';

/**
 * Checks GitHub for a newer release at most once a day. Triggered by the content script when a
 * Threads tab opens; the result lands in chrome.storage.local ("update"), which the sheet reads.
 * One anonymous GET to api.github.com (jsDelivr as fallback), no user data. Off with settings.checkUpdates = false.
 */
let running: Promise<void> | null = null;

async function fromGitHub(): Promise<UpdateInfo | undefined> {
  const r = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseRelease(await r.json());
}

async function fromJsDelivr(): Promise<UpdateInfo | undefined> {
  const r = await fetch(FALLBACK_API, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as { version?: string };
  return j.version ? fromVersion(j.version) : undefined;
}

export function checkForUpdate(force = false): Promise<void> {
  running ??= (async () => {
    try {
      const { update, settings } = (await chrome.storage.local.get(['update', 'settings'])) as { update?: UpdateState; settings?: { checkUpdates?: boolean } };
      if (settings?.checkUpdates === false && !force) return;
      const prev = update;
      // After a failed check, try again in an hour instead of a day.
      const every = prev?.error && !prev.latest ? CHECK_EVERY_MS / 24 : CHECK_EVERY_MS;
      if (!force && prev && Date.now() - prev.checkedAt < every) return;
      const next: UpdateState = { checkedAt: Date.now(), latest: prev?.latest };
      try {
        next.latest = (await fromGitHub()) ?? prev?.latest;
      } catch (e) {
        try {
          next.latest = (await fromJsDelivr()) ?? prev?.latest;
          next.error = `github: ${String((e as Error)?.message ?? e)} (used jsDelivr)`;
        } catch (e2) {
          next.error = `github: ${String((e as Error)?.message ?? e)}; jsdelivr: ${String((e2 as Error)?.message ?? e2)}`;
        }
      }
      await chrome.storage.local.set({ update: next });
    } finally {
      running = null;
    }
  })();
  return running;
}

export function installUpdateCheck() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'threet:checkUpdate') void checkForUpdate(!!msg.force);
  });
  chrome.runtime.onStartup.addListener(() => void checkForUpdate());
}
