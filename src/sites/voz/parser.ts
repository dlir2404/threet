import type { Media, Post, PostGroup, ThreadRow } from '../../shared/types';
import type { PageInfo } from '../types';
import { textOf } from '../../content/dom';

/**
 * voz.vn (XenForo 2). Server-rendered, paginated pages, read from fetched HTML (pages mode):
 *   forum index   .node--forum           (box name, threads/posts counts, latest thread)
 *   thread list   .structItem--thread    (title, prefix label, author, replies/views)
 *   thread page   article.message--post  (author, time, #n, body with quotes, images, reactions)
 *   search        li.block-row           (post hits: thread title, snippet, author, #n)
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

/** Images and attachment links inside a quote → "[ảnh]"; drop the "click to expand" link. */
function quoteText(q: Element): string {
  const c = (q.querySelector('.bbCodeBlock-content') ?? q).cloneNode(true) as Element;
  c.querySelectorAll('.bbCodeBlock-expandLink, script, noscript, blockquote').forEach((x) => x.remove());
  const doc = c.ownerDocument;
  c.querySelectorAll('.bbImageWrapper, img.bbImage, a[href*="/attachments/"], .bbMediaWrapper, .bbMediaJustifier').forEach((x) => {
    const isMedia = x.matches('.bbMediaWrapper, .bbMediaJustifier');
    x.replaceWith(doc.createTextNode(isMedia ? ' [video] ' : ' [ảnh] '));
  });
  return text(c).replace(/(\[ảnh\]\s*)+/g, '[ảnh] ').replace(/\s+/g, ' ').trim();
}

function postRow(article: Element, threadPath: string): Post | null {
  const id = (article.getAttribute('data-content') ?? '').replace(/^post-/, '');
  if (!id) return null;
  const wrapper = article.querySelector('.message-body .bbWrapper');
  let body = '';
  const quotes: Post[] = [];
  const media: Media[] = [];
  if (wrapper) {
    const clone = wrapper.cloneNode(true) as Element;
    for (const q of Array.from(clone.querySelectorAll('blockquote.bbCodeBlock--quote'))) {
      // Nested quotes belong to the outer one.
      if (q.parentElement?.closest('blockquote.bbCodeBlock--quote')) continue;
      const qid = /post:\s*(\d+)/.exec(q.getAttribute('data-source') ?? '')?.[1];
      quotes.push({
        code: qid ?? `${id}q${quotes.length}`,
        // Quotes can come from another thread: /posts/ID/ redirects to wherever the post is.
        path: qid ? `/posts/${qid}/` : '',
        author: q.getAttribute('data-quote') ?? '',
        text: quoteText(q),
        media: [],
        counts: {},
        badges: [],
      });
    }
    clone.querySelectorAll('blockquote.bbCodeBlock--quote, .bbCodeBlock-expandLink, script, noscript').forEach((x) => x.remove());
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
    text: body,
    quotes: quotes.length ? quotes : undefined,
    media,
    counts: { like: reactionCount(article.querySelector('.reactionsBar')) },
    badges: [],
  };
}

/** A search hit ("li.block-row"): links to the post, shows a snippet. */
function searchRow(li: Element): Post | null {
  const a = li.querySelector<HTMLAnchorElement>('.contentRow-title a');
  const href = a?.getAttribute('href') ?? '';
  const t = parseNodePath(href, 't');
  if (!a || !t) return null;
  const pid = /\/post-(\d+)/.exec(href)?.[1];
  const minor = text(li.querySelector('.contentRow-minor'));
  return {
    code: pid ?? `t${t.id}`,
    path: pid ? `${t.path}/post-${pid}` : t.path,
    title: text(a),
    author: li.getAttribute('data-author') || text(li.querySelector('.contentRow-minor .username')),
    time: li.querySelector('.contentRow-minor time')?.getAttribute('datetime') ?? undefined,
    ordinal: /#[\d.,]+/.exec(minor)?.[0],
    topic: text(a),
    text: text(li.querySelector('.contentRow-snippet')),
    media: [],
    counts: {},
    badges: [],
  };
}

export function parseGroups(scope: ParentNode): PostGroup[] {
  const threads = Array.from(scope.querySelectorAll('.structItem--thread'));
  const hits = threads.length ? [] : Array.from(scope.querySelectorAll('li.block-row')).filter((li) => li.querySelector('.contentRow-snippet'));
  let rows = threads.length
    ? threads.map(threadRow)
    : hits.length
      ? hits.map(searchRow)
      : Array.from(scope.querySelectorAll('.node--forum')).map(forumRow);
  // Hits from a single thread: its title on every row says nothing.
  if (hits.length && new Set(rows.map((p) => p?.title)).size === 1) rows = rows.map((p) => p && { ...p, topic: undefined });
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
  // A later page has no #1: its first post still carries the thread title (for the tab).
  if (rows[0] && !rows[0].focal && title) rows[0] = { ...rows[0], post: { ...rows[0].post, title } };
  return rows;
}

export function nextPage(doc: Document): string | null {
  const href = doc.querySelector('.pageNav-jump--next')?.getAttribute('href');
  if (!href) return null;
  const u = new URL(href, ORIGIN);
  return u.pathname + u.search; // search results page with ?page=N
}

const pageNum = (el: Element | null | undefined) => parseInt(text(el).replace(/\D/g, ''), 10) || 0;

/** "Trang 3 / 150" from the pager; template from its last-page link ("…/page-150" → "…/page-{n}"). */
export function pageInfo(doc: Document): PageInfo | null {
  const pages = Array.from(doc.querySelectorAll('.pageNav-page'));
  if (!pages.length) return doc.querySelector('article.message--post, .structItem--thread, li.block-row') ? { page: 1, total: 1, template: '' } : null;
  const page = pageNum(doc.querySelector('.pageNav-page--current')) || 1;
  const total = Math.max(page, ...pages.map(pageNum));
  const last = pages.map((p) => p.querySelector('a')).filter((a) => a && pageNum(a) === total).pop();
  let template = '';
  const href = last?.getAttribute('href');
  if (href) {
    const u = new URL(href, ORIGIN);
    const rel = u.pathname + u.search;
    template = rel.replace(new RegExp(`(page-|page=)${total}(?!\\d)`), '$1{n}');
    if (!template.includes('{n}')) template = '';
  }
  return { page, total, template };
}
