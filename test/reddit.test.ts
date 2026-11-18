// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseGroups, parsePermalink, parseThread } from '../src/sites/reddit/parser';
import { reddit } from '../src/sites/reddit';

// Synthetic markup mirroring Reddit's shreddit elements (no real user data).
const FEED = `
<shreddit-feed>
  <article><shreddit-post id="t3_aaa111" author="alice" permalink="/r/demo/comments/aaa111/hello_world/" post-title="Hello world"
    score="234" comment-count="12" created-timestamp="2026-11-17T10:43:24.359000+0000" post-type="text"
    subreddit-prefixed-name="r/demo" view-context="SubredditFeed">
    <shreddit-post-flair>Discussion</shreddit-post-flair>
    <a slot="text-body" href="/r/demo/comments/aaa111/hello_world/"><div><p>First line</p><p>Second line</p></div></a>
  </shreddit-post></article>
  <article><shreddit-post id="t3_bbb222" author="bob" permalink="/r/demo/comments/bbb222/clip/" post-title="A clip"
    score="10" comment-count="0" created-timestamp="2026-11-16T00:00:00+0000" post-type="video" subreddit-prefixed-name="r/demo">
    <div slot="post-media-container"><shreddit-player src="https://v.redd.it/x/HLSPlaylist.m3u8" poster="https://example.com/p.jpg"
      packaged-media-json='{"playbackMp4s":{"permutations":[{"source":{"url":"https://v.redd.it/x/lo.mp4","dimensions":{"height":360}}},{"source":{"url":"https://v.redd.it/x/hi.mp4","dimensions":{"height":720}}}]}}'></shreddit-player></div>
  </shreddit-post></article>
  <article><shreddit-post id="t3_ccc333" author="carol" permalink="/r/demo/comments/ccc333/link/" post-title="Read this"
    score="5" comment-count="1" post-type="link" content-href="https://example.org/a" domain="example.org" subreddit-prefixed-name="r/demo"></shreddit-post></article>
</shreddit-feed>`;

const THREAD = `
<aside><shreddit-post id="t3_zzz999" author="ad" permalink="/r/other/comments/zzz999/x/" post-title="Suggested" post-type="text"></shreddit-post></aside>
<shreddit-post id="t3_aaa111" author="alice" permalink="/r/demo/comments/aaa111/hello_world/" post-title="Hello world" score="234" comment-count="3" post-type="text"></shreddit-post>
<shreddit-comment-tree>
  <shreddit-comment thingid="t1_c1" postid="t3_aaa111" author="dan" depth="0" score="16" created="2026-11-17T15:08:46+0000" permalink="/r/demo/comments/aaa111/comment/c1/">
    <details><div slot="comment">
        <p>Top level</p>
        <p>  indented line</p></div>
      <shreddit-comment thingid="t1_c2" author="erin" depth="1" score="4" permalink="/r/demo/comments/aaa111/comment/c2/">
        <details><div slot="comment"><p>Nested reply</p></div></details>
      </shreddit-comment>
    </details>
  </shreddit-comment>
  <shreddit-comment thingid="t1_c3" author="finn" depth="0" score="1" permalink="/r/demo/comments/aaa111/comment/c3/">
    <details><div slot="comment"><p>Another</p></div></details>
  </shreddit-comment>
</shreddit-comment-tree>`;

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('reddit routes', () => {
  it('classifies paths', () => {
    expect(reddit.routeOf('/')).toEqual({ kind: 'feed', path: '/' });
    expect(reddit.routeOf('/r/demo/')).toEqual({ kind: 'feed', path: '/r/demo' });
    expect(reddit.routeOf('/r/demo/comments/aaa111/hello_world/')).toEqual({ kind: 'thread', path: '/r/demo/comments/aaa111', code: 'aaa111' });
    expect(reddit.routeOf('/r/demo/comments/aaa111/x/comment/c2/').code).toBe('c2');
    expect(reddit.routeOf('/user/bob').kind).toBe('profile');
    expect(parsePermalink('https://www.reddit.com/r/demo/comments/aaa111/')).toEqual({ sub: 'demo', post: 'aaa111', comment: undefined });
  });
});

describe('reddit feed', () => {
  const posts = parseGroups(doc(FEED)).flatMap((g) => g.posts);

  it('reads attributes into posts', () => {
    expect(posts.map((p) => p.code)).toEqual(['aaa111', 'bbb222', 'ccc333']);
    const p = posts[0];
    expect(p).toMatchObject({ author: 'alice', title: 'Hello world', topic: 'Discussion', path: '/r/demo/comments/aaa111' });
    expect(p.text).toBe('Hello world\nFirst line\nSecond line');
    expect(p.counts).toEqual({ score: '234', comment: '12' });
  });

  it('picks the best mp4 for videos and keeps link posts as links', () => {
    expect(posts[1].media[0]).toMatchObject({ kind: 'video', play: 'https://v.redd.it/x/hi.mp4', full: 'https://example.com/p.jpg' });
    expect(posts[1].topic).toBe('r/demo');
    expect(posts[2].link).toEqual({ url: 'https://example.org/a', title: 'example.org', domain: 'example.org' });
  });
});

describe('reddit comments', () => {
  it('lists the post then comments with their depth', () => {
    const rows = parseThread(doc(THREAD), 'aaa111');
    expect(rows.map((r) => [r.post.author, r.depth, !!r.focal])).toEqual([['alice', 0, true], ['dan', 1, false], ['erin', 2, false], ['finn', 1, false]]);
    expect(rows[1].post.text).toBe('Top level\n\nindented line');
  });

  it('a comment permalink makes that comment the focal row', () => {
    const rows = parseThread(doc(THREAD), 'c1');
    expect(rows[0]).toMatchObject({ ancestor: true });
    expect(rows.find((r) => r.focal)?.post.author).toBe('dan');
    expect(rows.find((r) => r.post.author === 'erin')?.depth).toBe(1);
  });
});
