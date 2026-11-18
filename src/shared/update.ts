/** Update check against GitHub Releases (unpacked extensions don't auto-update). */

export const RELEASES_API = 'https://api.github.com/repos/dlir2404/threet/releases/latest';
export const RELEASES_PAGE = 'https://github.com/dlir2404/threet/releases/latest';
/**
 * Fallback when api.github.com is unreachable (some networks/DNS redirect it to github.com, which
 * has no CORS): jsDelivr resolves "latest" to the newest semver tag of the repo.
 */
export const FALLBACK_API = 'https://data.jsdelivr.com/v1/packages/gh/dlir2404/threet/resolved?specifier=latest';
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export interface UpdateInfo {
  /** Latest released version, without the leading "v". */
  version: string;
  /** Release page on GitHub. */
  url: string;
  /** Direct link to the installable ZIP asset (falls back to the release page). */
  download: string;
  /** Release notes (markdown as written on GitHub), trimmed. */
  notes: string;
  publishedAt?: string;
}

/** Stored in chrome.storage.local under "update". */
export interface UpdateState {
  checkedAt: number;
  latest?: UpdateInfo;
  error?: string;
}

/** Numeric x.y.z comparison: >0 when a is newer than b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Turn a GitHub "latest release" API response into UpdateInfo. */
export function parseRelease(json: any): UpdateInfo | undefined {
  const tag = typeof json?.tag_name === 'string' ? json.tag_name : '';
  if (!/^v?\d+\.\d+\.\d+$/.test(tag)) return undefined;
  const zip = (json.assets ?? []).find((a: any) => /^threet-v[\d.]+\.zip$/.test(a?.name ?? ''));
  const notes = String(json.body ?? '')
    // Install steps are repeated in our dialog; keep the "What's changed" part.
    .replace(/^[\s\S]*?(?=##\s*What'?s Changed)/i, '')
    .replace(/\*\*Full Changelog\*\*:.*$/im, '')
    .trim()
    .slice(0, 2000);
  return {
    version: tag.replace(/^v/, ''),
    url: json.html_url ?? RELEASES_PAGE,
    download: zip?.browser_download_url ?? json.html_url ?? RELEASES_PAGE,
    notes,
    publishedAt: json.published_at,
  };
}

/** UpdateInfo from just a version (fallback source): links follow the release workflow's naming. */
export function fromVersion(version: string): UpdateInfo | undefined {
  const v = version.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(v)) return undefined;
  const base = 'https://github.com/dlir2404/threet/releases';
  return { version: v, url: `${base}/tag/v${v}`, download: `${base}/download/v${v}/threet-v${v}.zip`, notes: '' };
}
