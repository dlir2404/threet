import { describe, expect, it } from 'vitest';
import { compareVersions, fromVersion, parseRelease } from '../src/shared/update';

describe('compareVersions', () => {
  it('compares numerically, with or without v', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('v0.2.0', '0.10.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', 'v1.0.0')).toBe(0);
  });
});

describe('parseRelease', () => {
  const api = {
    tag_name: 'v0.2.0',
    html_url: 'https://github.com/dlir2404/threet/releases/tag/v0.2.0',
    published_at: '2026-11-18T00:00:00Z',
    body: "Download the **threet-v*.zip** asset below.\n\n1. Extract…\n\n## What's Changed\n* feat: videos by @dlir2404 in https://github.com/x/pull/1\n\n**Full Changelog**: https://github.com/x/compare/v0.1.0...v0.2.0",
    assets: [{ name: 'threet-v0.2.0.zip', browser_download_url: 'https://github.com/dlir2404/threet/releases/download/v0.2.0/threet-v0.2.0.zip' }],
  };

  it('extracts version, zip link and the changes part of the notes', () => {
    const u = parseRelease(api)!;
    expect(u.version).toBe('0.2.0');
    expect(u.download).toMatch(/threet-v0\.2\.0\.zip$/);
    expect(u.notes.startsWith("## What's Changed")).toBe(true);
    expect(u.notes).not.toContain('Full Changelog');
  });

  it('falls back to the release page without a zip, and rejects odd tags', () => {
    expect(parseRelease({ ...api, assets: [] })!.download).toBe(api.html_url);
    expect(parseRelease({ ...api, tag_name: 'nightly' })).toBeUndefined();
  });
});

describe('fromVersion', () => {
  it('builds release links from a tag version', () => {
    expect(fromVersion('0.2.0')!.download).toBe('https://github.com/dlir2404/threet/releases/download/v0.2.0/threet-v0.2.0.zip');
    expect(fromVersion('latest')).toBeUndefined();
  });
});
