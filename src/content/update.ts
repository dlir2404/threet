import { compareVersions, type UpdateState } from '../shared/update';
import { store } from './store';

/**
 * Sheet side of the update check: asks the background to check (it does so at most once a day),
 * keeps store.update set when GitHub has a newer version, and pops the dialog once per page load
 * unless snoozed ("Để sau", 24 h), skipped, in boss mode, or while the guide is open.
 */
let autoShown = false;

function apply(state?: UpdateState) {
  const current = chrome.runtime.getManifest().version;
  const latest = state?.latest;
  store.set({ update: latest && compareVersions(latest.version, current) > 0 ? latest : undefined });
  maybeOpen();
}

function maybeOpen() {
  const s = store.state;
  const u = s.update;
  if (autoShown || !u || s.updateOpen) return;
  if (!s.settings.checkUpdates || s.settings.skipVersion === u.version || Date.now() < s.settings.updateSnoozeUntil) return;
  if (!s.visible || !s.settings.enabled || s.boss || s.help || s.lightbox) return;
  autoShown = true;
  store.set({ updateOpen: true });
}

export function startUpdates() {
  chrome.storage.local.get('update').then(({ update }) => apply(update as UpdateState | undefined)).catch(() => {});
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.update) apply(changes.update.newValue as UpdateState | undefined);
  });
  // The guide may be open on first run: show the update right after it closes.
  store.subscribe(maybeOpen);
  if (store.state.settings.checkUpdates) chrome.runtime.sendMessage({ type: 'threet:checkUpdate' }).catch(() => {});
}
