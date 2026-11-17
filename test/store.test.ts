import { describe, expect, it } from 'vitest';
import { routeOf, store } from '../src/content/store';
import { buildModel } from '../src/content/sheet';
import type { Post, PostGroup } from '../src/shared/types';

const post = (code: string, extra: Partial<Post> = {}): Post => ({
  code, path: `/@u/post/${code}`, author: 'u', text: code, media: [], badges: [],
  counts: { like: '', reply: '', repost: '', share: '' }, ...extra,
});
const g = (...codes: string[]): PostGroup => ({ posts: codes.map((c) => post(c)) });
const keys = (path: string) => store.state.lists[path].keys;

describe('routeOf', () => {
  it('classifies paths', () => {
    expect(routeOf('/')).toEqual({ kind: 'feed', path: '/' });
    expect(routeOf('/@a.b/post/XYZ/')).toEqual({ kind: 'thread', path: '/@a.b/post/XYZ', code: 'XYZ' });
    expect(routeOf('/@a.b').kind).toBe('profile');
    expect(routeOf('/search').kind).toBe('other');
  });
});

describe('mergeList', () => {
  it('appends new posts after the last known one and keeps order', () => {
    store.mergeList('/t1', [g('a'), g('b'), g('c')]);
    store.mergeList('/t1', [g('c'), g('d'), g('e')]); // scrolled: a,b virtualised away
    expect(keys('/t1')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('puts posts that appear above the known ones at the top (refresh)', () => {
    store.mergeList('/t2', [g('c'), g('d')]);
    store.mergeList('/t2', [g('x'), g('y'), g('c')]);
    expect(keys('/t2')).toEqual(['x', 'y', 'c', 'd']);
  });

  it('updates a group when a surfaced reply shows up later', () => {
    store.mergeList('/t3', [g('a')]);
    store.mergeList('/t3', [g('a', 'a1')]);
    expect(store.state.lists['/t3'].groups.a.posts.map((p) => p.code)).toEqual(['a', 'a1']);
  });
});

describe('setThread', () => {
  it('keeps replies that scrolled out of the real DOM', () => {
    const row = (code: string, depth = 1) => ({ post: post(code), depth });
    store.setThread('T', [{ post: post('T'), depth: 0, focal: true }, row('r1'), row('r2')]);
    store.setThread('T', [{ post: post('T'), depth: 0, focal: true }, row('r2'), row('r3')]);
    expect(store.state.threads.T.map((r) => r.post.code)).toEqual(['T', 'r1', 'r2', 'r3']);
  });
});

describe('buildModel', () => {
  it('numbers feed rows and surfaced replies', () => {
    store.set({ tabs: [{ id: '/t3', kind: 'list', title: 'Overview' }], active: '/t3', boss: false });
    const m = buildModel(store.state);
    expect(m.rows.map((r) => r.no)).toEqual(['1', '1.1']);
  });

  it('puts a quoted post on its own row under the quoting post', () => {
    store.mergeList('/t4', [{ posts: [post('A', { quoted: post('Q', { author: 'qq' }) })] }, g('B')]);
    store.set({ tabs: [{ id: '/t4', kind: 'list', title: 'Overview' }], active: '/t4' });
    const m = buildModel(store.state);
    expect(m.rows.map((r) => [r.no, r.post?.code, !!r.quote])).toEqual([['1', 'A', false], ['1.q', 'Q', true], ['2', 'B', false]]);
    expect(new Set(m.rows.map((r) => r.key)).size).toBe(3);
  });

  it('numbers thread rows by depth', () => {
    store.set({ tabs: [{ id: '/@u/post/N', kind: 'thread', title: '@u', code: 'N' }], active: '/@u/post/N' });
    store.state.threads.N = [
      { post: post('P'), depth: 0, ancestor: true },
      { post: post('N'), depth: 0, focal: true },
      { post: post('a'), depth: 1 },
      { post: post('a1'), depth: 2 },
      { post: post('b'), depth: 1 },
    ];
    expect(buildModel(store.state).rows.map((r) => r.no)).toEqual(['1', '2', '2.1', '2.1.1', '2.2']);
  });
});
