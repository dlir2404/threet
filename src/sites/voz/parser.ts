import type { Media, Post, PostGroup, ThreadRow } from '../../shared/types';
import { textOf } from '../../content/dom';

/**
 * voz.vn (XenForo 2). Server-rendered, paginated pages, read from fetched HTML (pages mode):
 *   forum index   .node--forum           (box name, threads/posts counts, latest thread)
 *   thread list   .structItem--thread    (title, prefix label, author, replies/views)
 *   thread page   article.message--post  (author, time, #n, body with quotes, images, reactions)
 */

const ORIGIN = 'https://voz.vn';
const abs = (u: string) => {
  try {
    return new URL(u, ORIGIN).href;
  } catch {
    return u;
  }
};
const text = (el: Element | null | undefined) => (el ? textOf(el) : '');

/** "/t/slug.123/page-2" → { slug, id } (also /f/ for forums). */
export function parseNodePath(href: string | null | undefined, kind: 't' | 'f'): { path: string; id: string } | null {
  if (!href) return null;
  let path = href;
  try {
    path = new URL(href, ORIGIN).pathname;
  } catch {
    return null;
  }
  const m = new RegExp(`^/${kind}/([^/]*?)\\.?(\\d+)(?:/|$)`).exec(path);
  if (!m) return null;
  return { path: `/${kind}/${m[1] ? `${m[1]}.` : ''}${m[2]}`, id: m[2] };
}

function forumRow(node: Element): Post | null {
  const a = node.querySelector<HTMLAnchorElement>('.node-title a');
  const ref = parseNodePath(a?.getAttribute('href'), 'f');
  if (!a || !ref) return null;
  const stats = Array.from(node.querySelectorAll('.node-stats dd')).map((d) => text(d));
  const latest = node.querySelector('.node-extra-title');
  const category = node.closest('.block--category')?.querySelector('.block-header a, .block-header');
  return {
    code: `f${ref.id}`,
    path: ref.path,
    title: text(a),
    author: text(node.querySelector('.node-extra-user')),
    time: node.querySelector('.node-extra-date')?.getAttribute('datetime') ?? undefined,
    topic: text(category) || undefined,
    text: `📁 ${text(a)}${latest ? `\n↳ ${text(latest)}` : ''}`,
    media: [],
    // Forum rows: Replies = posts in the box, Views = threads in the box.
    counts: { reply: stats[1] ?? '', view: stats[0] ?? '' },
    badges: [],
  };
}

function threadRow(item: Element): Post | null {
  const a = Array.from(item.querySelectorAll<HTMLAnchorElement>('.structItem-title a')).find((x) => parseNodePath(x.getAttribute('href'), 't'));
  const ref = parseNodePath(a?.getAttribute('href'), 't');
  if (!a || !ref) return null;
  const prefix = item.querySelector('.structItem-title .label');
  const meta = Array.from(item.querySelectorAll('.structItem-cell--meta dd')).map((d) => text(d));
  const sticky = item.classList.contains('structItem--sticky') || !!item.closest('.structItemContainer-group--sticky');
  const latestUser = text(item.querySelector('.structItem-cell--latest .username'));
  const latestTime = text(item.querySelector('.structItem-cell--latest time'));
  return {
    code: ref.id,
    path: ref.path,
    title: text(a),
    author: item.getAttribute('data-author') || text(item.querySelector('.structItem-minor .username')),
    time: item.querySelector('.structItem-startDate time')?.getAttribute('datetime') ?? undefined,
    topic: text(prefix) || undefined,
    text: text(a),
    media: [],
    counts: { reply: meta[0] ?? '', view: meta[1] ?? '' },
    badges: [sticky ? 'Ghim (sticky)' : '', latestUser ? `Mới nhất: ${latestUser}${latestTime ? ` · ${latestTime}` : ''}` : ''].filter(Boolean),
  };
}

/** "A, B và 3 người khác" → 5 */
function reactionCount(bar: Element | null): string {
  const t = text(bar);
  if (!t) return '';
  const more = /(\d[\d.,]*)\s*(người khác|others?)/i.exec(t);
  const head = more ? t.slice(0, more.index) : t;
  const names = head.split(/,|\svà\s|\sand\s/).map((s) => s.trim()).filter(Boolean).length;
  return String(names + (more ? parseInt(more[1].replace(/[.,]/g, ''), 10) : 0));
}

function postRow(article: Element, threadPath: string): Post | null {
  const id = (article.getAttribute('data-content') ?? '').replace(/^post-/, '');
  if (!id) return null;
  const wrapper = article.querySelector('.message-body .bbWrapper');
  let body = '';
  const quotes: string[] = [];
  const media: Media[] = [];
  if (wrapper) {
    const clone = wrapper.cloneNode(true) as Element;
    for (const q of Array.from(clone.querySelectorAll('blockquote.bbCodeBlock--quote'))) {
      const who = q.getAttribute('data-quote') ?? '';
      const what = text(q.querySelector('.bbCodeBlock-content') ?? q).replace(/\s+/g, ' ');
      quotes.push(`❝ ${who}: ${what.length > 120 ? `${what.slice(0, 119)}…` : what}`);
      q.remove();
    }
    clone.querySelectorAll('.bbCodeBlock-expandLink, script, noscript').forEach((x) => x.remove());
    body = text(clone);
    for (const img of Array.from(wrapper.querySelectorAll<HTMLImageElement>('img.bbImage, img[data-zoom-target]'))) {
      const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
      if (src && !img.closest('blockquote')) media.push({ kind: 'image', src: abs(src), alt: img.getAttribute('alt') || undefined });
    }
  }
  const ordinal = text(article.querySelector('.message-attribution-opposite li:last-child a')) || undefined;
  return {
    code: id,
    path: `${threadPath}/post-${id}`,
    author: article.getAttribute('data-author') ?? text(article.querySelector('.message-name .username')),
    avatar: article.querySelector('.message-avatar img')?.getAttribute('src') ?? undefined,
    time: article.querySelector('.message-attribution-main time')?.getAttribute('datetime') ?? undefined,
    ordinal,
    text: [...quotes, body].filter(Boolean).join('\n'),
    media,
    counts: { like: reactionCount(article.querySelector('.reactionsBar')) },
    badges: [],
  };
}

export function parseGroups(scope: ParentNode): PostGroup[] {
  const threads = Array.from(scope.querySelectorAll('.structItem--thread'));
  const rows = threads.length
    ? threads.map(threadRow)
    : Array.from(scope.querySelectorAll('.node--forum')).map(forumRow);
  return rows.filter((p): p is Post => !!p).map((p) => ({ posts: [p] }));
}

export function parseThread(scope: ParentNode, threadId: string): ThreadRow[] {
  const doc = (scope as Document).querySelector ? (scope as Document) : null;
  const canonical = doc?.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const threadPath = parseNodePath(canonical, 't')?.path ?? `/t/${threadId}`;
  const title = text(doc?.querySelector('.p-title-value'));
  const rows: ThreadRow[] = [];
  for (const a of Array.from(scope.querySelectorAll('article.message--post'))) {
    const post = postRow(a, threadPath);
    if (!post) continue;
    if (post.ordinal === '#1') rows.push({ post: { ...post, title }, depth: 0, focal: true });
    else rows.push({ post, depth: 1 });
  }
  return rows;
}

export function nextPage(doc: Document): string | null {
  const href = doc.querySelector('.pageNav-jump--next')?.getAttribute('href');
  return href ? new URL(href, ORIGIN).pathname : null;
}
