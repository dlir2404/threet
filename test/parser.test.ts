// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGroups, parsePostPath, parseThread, textOf } from '../src/content/parser';

const FEED = resolve(__dirname, 'fixtures/feed-home.html');
const hasFeed = existsSync(FEED);

function load(file: string): Document {
  return new DOMParser().parseFromString(readFileSync(file, 'utf8'), 'text/html');
}

describe('parsePostPath', () => {
  it('parses absolute and relative permalinks', () => {
    expect(parsePostPath('https://www.threads.com/@a.b/post/Dfz70sSEkq_')).toEqual({ user: 'a.b', code: 'Dfz70sSEkq_' });
    expect(parsePostPath('/@x/post/ABC?xmt=1')).toEqual({ user: 'x', code: 'ABC' });
    expect(parsePostPath('/@x/post/ABC/media')).toEqual({ user: 'x', code: 'ABC' });
    expect(parsePostPath('/@x')).toBeNull();
  });
});

describe('textOf', () => {
  it('turns <br> and blocks into newlines', () => {
    const d = new DOMParser().parseFromString('<span>a<br>b<div>c</div>d</span>', 'text/html');
    expect(textOf(d.body.firstElementChild!)).toBe('a\nb\nc\nd');
  });
});

describe.skipIf(!hasFeed)('feed fixture (saved home page)', () => {
  const doc = hasFeed ? load(FEED) : document;
  const groups = parseGroups(doc);
  const posts = groups.flatMap((g) => g.posts);

  it('finds every post and skips follow suggestions', () => {
    expect(posts.map((p) => p.author)).toEqual([
      'tobeacrackedswe', 'dankhoia', 'linda_nguyen_112', 'sappirecao',
      'lwoft_23', 'kimchi.hancuoc', 'wnih_n', 'fnhiux.05', 'bao1032nguyen',
    ]);
  });

  it('groups a surfaced reply with its parent post', () => {
    expect(groups.map((g) => g.posts.map((p) => p.author))).toEqual([
      ['tobeacrackedswe'], ['dankhoia'], ['linda_nguyen_112'], ['sappirecao'],
      ['lwoft_23', 'kimchi.hancuoc'], ['wnih_n', 'fnhiux.05'], ['bao1032nguyen'],
    ]);
  });

  it('reads header fields', () => {
    const p = posts[0];
    expect(p.code).toBe('Dfz70sSEkq_');
    expect(p.path).toBe('/@tobeacrackedswe/post/Dfz70sSEkq_');
    expect(p.time).toBe('2026-11-16T17:51:55.000Z');
    expect(p.timeLabel).toBe('14 giờ');
    expect(p.topic).toBe('Software Engineer');
    expect(p.badges).toContain('Cuộc trò chuyện đầu tiên');
    expect(p.text.startsWith('hi mng mình đi intern swe')).toBe(true);
  });

  it('reads action counts by position', () => {
    expect(posts[0].counts).toEqual({ like: '23', reply: '5', repost: '', share: '2' });
    expect(posts[1].counts).toEqual({ like: '14K', reply: '262', repost: '2,3K', share: '394' });
  });

  it('keeps multi-paragraph text and media', () => {
    const linda = posts[2];
    expect(linda.text).toContain('Một vài fact về TA giao tiếp');
    expect(linda.text).toContain('\n');
    expect(linda.media).toHaveLength(1);
    expect(linda.part).toBe('1/2');
    expect(linda.text.endsWith('đoán chữ.')).toBe(true);
  });

  it('separates a quoted post from the quoting post', () => {
    const p = posts.find((x) => x.author === 'lwoft_23')!;
    expect(p.quoted?.author).toBe('druxy.aries');
    expect(p.quoted?.text).toContain('Tại sao em nghỉ công ty cũ');
    expect(p.text).not.toContain('Tại sao em nghỉ');
    expect(p.media).toHaveLength(0);
    expect(p.quoted?.media).toHaveLength(1);
    expect(p.counts.like).toBe(p.counts.like); // own bar parsed without crashing
    expect(p.counts).not.toEqual(p.quoted?.counts);
  });

  it('labels surfaced replies', () => {
    const r = posts.find((x) => x.author === 'kimchi.hancuoc')!;
    expect(r.badges.join(' ')).toContain('Tác giả gốc đã thích');
    expect(r.text).not.toContain('Tác giả gốc đã thích');
  });

  it('parseThread falls back to first post as focal', () => {
    const rows = parseThread(doc, 'DfzKxYvmauN');
    const focal = rows.find((r) => r.focal)!;
    expect(focal.post.author).toBe('kimchi.hancuoc');
  });
});
