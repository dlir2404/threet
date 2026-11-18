import type { Media, Post, PostGroup, ThreadRow } from '../../shared/types';
import { textOf } from '../../content/dom';

/**
 * Reads Reddit (new "shreddit" web) out of the live DOM. Reddit renders posts and comments as
 * custom elements whose attributes carry the data, so this is mostly attribute reading:
 *   <shreddit-post id="t3_…" author permalink post-title score comment-count created-timestamp
 *                  post-type content-href subreddit-prefixed-name>
 *   <shreddit-comment thingid="t1_…" author depth score created permalink>
 */

export const POST_SEL = 'shreddit-post';
const COMMENT_SEL = 'shreddit-comment';

const bare = (id: string | null) => (id ?? '').replace(/^t[13]_/, '');

/** "/r/sub/comments/ID/slug/" → { sub, post: ID, comment?: CID } */
export function parsePermalink(href: string | null | undefined): { sub: string; post: string; comment?: string } | null {
  if (!href) return null;
  let path = href;
  try {
    path = new URL(href, 'https://www.reddit.com').pathname;
  } catch {
    return null;
  }
  const m = /^\/r\/([^/]+)\/comments\/([a-z0-9]+)(?:\/[^/]*)?(?:\/comment\/([a-z0-9]+))?/i.exec(decodeURI(path));
  if (!m) return null;
  return { sub: m[1], post: m[2], comment: m[3] };
}

export function permalinkPath(p: { sub: string; post: string; comment?: string }): string {
  return `/r/${p.sub}/comments/${p.post}${p.comment ? `/comment/${p.comment}` : ''}`;
}

function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? '';
}

/** Best mp4 from <shreddit-player packaged-media-json>. */
function playableMp4(player: Element): string | undefined {
  try {
    const json = JSON.parse(attr(player, 'packaged-media-json'));
    const perms: any[] = json?.playbackMp4s?.permutations ?? [];
    const best = perms
      .map((p) => p?.source)
      .filter((s) => s?.url)
      .sort((a, b) => (b.dimensions?.height ?? 0) - (a.dimensions?.height ?? 0))[0];
    return best?.url;
  } catch {
    return undefined;
  }
}

function mediaOf(el: Element): { media: Media[]; link?: Post['link'] } {
  const type = attr(el, 'post-type');
  const href = attr(el, 'content-href');
  const box = el.querySelector('[slot="post-media-container"]');
  const imgs = box ? Array.from(box.querySelectorAll<HTMLImageElement>('img')) : [];
  const srcOf = (i: HTMLImageElement) => i.getAttribute('src') || i.getAttribute('data-lazy-src') || '';
  const media: Media[] = [];
  if (type === 'video') {
    const player = el.querySelector('shreddit-player, shreddit-player-2');
    if (player) media.push({ kind: 'video', src: attr(player, 'src'), full: attr(player, 'poster') || undefined, play: playableMp4(player) });
  } else if (type === 'gallery') {
    const seen = new Set<string>();
    for (const i of el.querySelectorAll<HTMLImageElement>('gallery-carousel li img')) {
      const src = srcOf(i);
      if (!src || seen.has(src)) continue;
      seen.add(src);
      media.push({ kind: 'image', src, alt: i.alt || undefined });
    }
  } else if (type === 'image') {
    const preview = imgs.map(srcOf).find(Boolean);
    if (preview || href) media.push({ kind: 'image', src: preview || href, full: href || undefined, alt: attr(el, 'post-title') });
  }
  let link: Post['link'];
  if (type === 'link' && href) {
    let domain = attr(el, 'domain');
    try {
      domain ||= new URL(href).hostname.replace(/^www\./, '');
    } catch {
      /* keep */
    }
    link = { url: href, title: domain, domain };
  }
  return { media, link };
}

export function parsePost(el: Element): Post | null {
  const code = bare(el.getAttribute('id'));
  const perm = parsePermalink(attr(el, 'permalink'));
  if (!code || !perm) return null;
  const title = attr(el, 'post-title');
  const bodyEl = el.querySelector('[slot="text-body"]');
  const body = bodyEl ? textOf(bodyEl) : '';
  const flair = el.querySelector('shreddit-post-flair');
  const inSubreddit = attr(el, 'view-context') === 'SubredditFeed';
  const { media, link } = mediaOf(el);
  return {
    code,
    path: permalinkPath(perm),
    author: attr(el, 'author'),
    title,
    topic: (inSubreddit && flair ? textOf(flair) : '') || attr(el, 'subreddit-prefixed-name') || undefined,
    time: attr(el, 'created-timestamp') || undefined,
    text: body ? `${title}\n${body}` : title,
    media,
    link,
    counts: { score: attr(el, 'score'), comment: attr(el, 'comment-count') },
    badges: [],
  };
}

function parseComment(el: Element): Post | null {
  const code = bare(el.getAttribute('thingid'));
  const perm = parsePermalink(attr(el, 'permalink'));
  if (!code || !perm) return null;
  // Own body only: nested replies sit inside the same element.
  const body = Array.from(el.querySelectorAll('[slot="comment"]')).find((b) => b.closest(COMMENT_SEL) === el);
  return {
    code,
    path: permalinkPath(perm),
    author: attr(el, 'author'),
    time: attr(el, 'created') || undefined,
    text: body ? textOf(body) : '[deleted]',
    media: [],
    counts: { score: attr(el, 'score') },
    badges: [],
  };
}

export function findList(scope: ParentNode): Element | null {
  const feed = scope.querySelector('shreddit-feed');
  if (feed) return feed;
  // Other listings (profiles, search): the parent of the post items.
  const first = scope.querySelector(POST_SEL);
  return first?.closest('article')?.parentElement ?? first?.parentElement ?? null;
}

function itemOf(el: Element, list: Element): Element {
  let p: Element = el;
  while (p.parentElement && p.parentElement !== list) p = p.parentElement;
  return p;
}

export function parseGroups(scope: ParentNode, list: Element | null = findList(scope)): PostGroup[] {
  if (!list) return [];
  const out: PostGroup[] = [];
  for (const el of list.querySelectorAll(POST_SEL)) {
    const post = parsePost(el);
    if (post) out.push({ posts: [post] });
  }
  return out;
}

export function indexItems(list: Element): Map<string, number> {
  const out = new Map<string, number>();
  for (const el of list.querySelectorAll(POST_SEL)) {
    const code = bare(el.getAttribute('id'));
    if (code) out.set(code, Array.prototype.indexOf.call(list.children, itemOf(el, list)));
  }
  return out;
}

/**
 * Comment page: the post, then comments in page order with their own depth. On a single-comment
 * permalink the focal comment leads and the post above it is shown as context.
 */
export function parseThread(scope: ParentNode, focalCode: string): ThreadRow[] {
  const comments = Array.from(scope.querySelectorAll(COMMENT_SEL));
  const focalComment = comments.find((c) => bare(c.getAttribute('thingid')) === focalCode);
  // Comment pages also render suggested posts; take the one the comments belong to.
  const postId = focalComment ? bare(focalComment.getAttribute('postid')) : focalCode;
  const posts = Array.from(scope.querySelectorAll(POST_SEL));
  const postEl =
    posts.find((p) => bare(p.getAttribute('id')) === postId) ??
    posts.find((p) => p.getAttribute('view-context') === 'CommentsPage') ??
    posts.find((p) => !p.closest('shreddit-feed, aside')) ??
    null;
  const post = postEl ? parsePost(postEl) : null;
  const rows: ThreadRow[] = [];
  const base = focalComment ? Number(focalComment.getAttribute('depth') ?? 0) : -1;
  if (post) rows.push(focalComment ? { post, depth: 0, ancestor: true } : { post, depth: 0, focal: true });
  for (const c of comments) {
    const p = parseComment(c);
    if (!p) continue;
    const d = Number(c.getAttribute('depth') ?? 0);
    if (c === focalComment) rows.push({ post: p, depth: 0, focal: true });
    else rows.push({ post: p, depth: Math.max(1, Math.min(8, d - base)) });
  }
  return rows;
}
