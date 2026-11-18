import type { Counts, Media, Post, PostGroup, ThreadRow } from '../shared/types';

/**
 * Reads posts out of the live Threads DOM.
 *
 * Threads uses generated atomic class names that change between deploys, so nothing here
 * relies on classes. Anchors used instead:
 *   - [data-pressable-container="true"]   one post (quoted posts are nested containers)
 *   - a[href*="/post/"] containing <time> permalink + timestamp
 *   - a[href="/@user"]                      author
 *   - span[dir="auto"]                      text runs (body, username, counters)
 *   - [role="button"] containing <svg>      action buttons; the last four are like/reply/repost/share
 */

export const CONTAINER_SEL = '[data-pressable-container="true"]';

const POST_HREF_RE = /\/@([^/?#]+)\/post\/([^/?#]+)/;
const PROFILE_HREF_RE = /^(?:https?:\/\/(?:www\.)?threads\.(?:com|net))?\/@([^/?#]+)\/?(?:[?#].*)?$/;
const TOPIC_HREF_RE = /\/search\?[^#]*serp_type=tags/;
const PART_RE = /^\s*(\d+)\s*\/\s*(\d+)\s*$/;

export function parsePostPath(href: string | null | undefined): { user: string; code: string } | null {
  if (!href) return null;
  const m = POST_HREF_RE.exec(href);
  if (!m || m[2] === 'media') return null;
  return { user: decodeURIComponent(m[1]), code: m[2] };
}

/** Is `el` inside a container nested under `root` (i.e. belongs to a quoted post)? */
function inNested(el: Element, root: Element): boolean {
  let p = el.parentElement;
  while (p && p !== root) {
    if (p.matches(CONTAINER_SEL)) return true;
    p = p.parentElement;
  }
  return false;
}

function own<T extends Element>(root: Element, sel: string): T[] {
  return Array.from(root.querySelectorAll<T>(sel)).filter((el) => !inNested(el, root));
}

const BLOCK = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE']);

/**
 * Copy "this block-level tag is actually displayed inline" from the live element onto its clone
 * (clones are detached, so getComputedStyle can't be used on them).
 */
function markInline(orig: Element, clone: Element) {
  if (!orig.isConnected) return;
  const a = orig.querySelectorAll('*');
  const b = clone.querySelectorAll('*');
  // A block inside an inline-block box doesn't break the surrounding line either, so once an
  // element is inline-level everything below it counts as inline.
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (b[i].hasAttribute('data-threet-inline')) continue;
    // Use the element's own window: thread sheets parse a same-origin iframe.
    const view = a[i].ownerDocument.defaultView ?? window;
    if (view.getComputedStyle(a[i]).display.startsWith('inline') && a[i].tagName !== 'SPAN' && a[i].tagName !== 'A') {
      b[i].setAttribute('data-threet-inline', '');
      b[i].querySelectorAll('*').forEach((x) => x.setAttribute('data-threet-inline', ''));
    }
  }
}

/** innerText-like extraction that also works in jsdom (no layout). */
export function textOf(el: Element): string {
  let out = '';
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      out += n.nodeValue ?? '';
      return;
    }
    if (n.nodeType !== 1) return;
    const e = n as Element;
    const tag = e.tagName;
    if (tag === 'BR') {
      out += '\n';
      return;
    }
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'svg' || tag === 'SVG') return;
    if (tag === 'IMG') {
      // Threads renders some emoji as <img alt="😀">.
      const alt = e.getAttribute('alt') ?? '';
      if ([...alt].length <= 2) out += alt;
      return;
    }
    // Threads renders inline chips (links, mentions) as <div style=display:inline-*>.
    const block = BLOCK.has(tag) && !e.hasAttribute('data-threet-inline');
    if (block && out && !out.endsWith('\n')) out += '\n';
    e.childNodes.forEach(walk);
    if (block && out && !out.endsWith('\n')) out += '\n';
  };
  walk(el);
  return out
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function precedes(a: Node, b: Node): boolean {
  return !!(a.compareDocumentPosition(b) & 4 /* DOCUMENT_POSITION_FOLLOWING */);
}

function largestFromSrcset(srcset: string | null): string | undefined {
  if (!srcset) return undefined;
  let best: { url: string; w: number } | undefined;
  for (const part of srcset.split(',')) {
    const [url, size] = part.trim().split(/\s+/);
    const w = parseInt(size ?? '', 10) || 0;
    if (url && (!best || w > best.w)) best = { url, w };
  }
  return best?.url;
}

/** Video thumbnails are <img width="100%" height="100%"> stacked under the <video>. */
function isVideoPoster(img: HTMLImageElement): boolean {
  return (img.getAttribute('width') ?? '').endsWith('%') || (img.getAttribute('height') ?? '').endsWith('%');
}

/**
 * Live <video> elements by media key. Threads streams video through MediaSource (blob: URLs),
 * which can't be reused, but a live element can be mirrored with captureStream().
 */
const videoEls = new Map<string, WeakRef<HTMLVideoElement>>();

export function videoFor(vkey: string): HTMLVideoElement | null {
  const el = videoEls.get(vkey)?.deref();
  return el?.isConnected ? el : null;
}

/** Frames grabbed from playing videos, used as their poster once Threads drops the poster image. */
const frames = new WeakMap<HTMLVideoElement, string>();

function frameOf(v: HTMLVideoElement): string | undefined {
  const done = frames.get(v);
  if (done) return done;
  if (v.readyState < 2 || !v.videoWidth) return undefined;
  try {
    const scale = Math.min(1, 480 / v.videoWidth);
    const c = v.ownerDocument.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.7);
    frames.set(v, url);
    return url;
  } catch {
    return undefined; // tainted canvas: no poster
  }
}

function posterFor(video: Element): string | undefined {
  let box: Element | null = video.parentElement;
  for (let i = 0; box && i < 4; i++, box = box.parentElement) {
    const img = Array.from(box.querySelectorAll<HTMLImageElement>('img')).find(isVideoPoster);
    if (img?.getAttribute('src')) return img.getAttribute('src')!;
  }
  return undefined;
}

function isMediaImg(img: HTMLImageElement): boolean {
  if (isVideoPoster(img)) return true;
  const w = parseInt(img.getAttribute('width') ?? '', 10);
  const h = parseInt(img.getAttribute('height') ?? '', 10);
  if (img.getAttribute('draggable') === 'false' && (w > 60 || h > 60 || Number.isNaN(w))) return true;
  if (w >= 100 || h >= 100) return true;
  // Live page fallback when attributes are missing: rely on rendered size.
  if (Number.isNaN(w) && Number.isNaN(h) && img.naturalWidth >= 100 && img.clientWidth >= 80) return true;
  return false;
}

/** Parse one [data-pressable-container] into a Post. Returns null for non-post containers (follow suggestions…). */
export function parsePost(root: Element): Post | null {
  const times = own<HTMLTimeElement>(root, 'time');
  let permalink: HTMLAnchorElement | null = null;
  let timeEl: HTMLTimeElement | null = null;
  for (const t of times) {
    const a = t.closest('a');
    if (a && root.contains(a) && parsePostPath(a.getAttribute('href'))) {
      permalink = a as HTMLAnchorElement;
      timeEl = t;
      break;
    }
  }
  if (!permalink) {
    // Some layouts put the permalink elsewhere; take the first own post link.
    permalink = own<HTMLAnchorElement>(root, 'a[href*="/post/"]').find((a) => parsePostPath(a.getAttribute('href'))) ?? null;
    if (!permalink) return null;
    timeEl = times[0] ?? null;
  }
  const ref = parsePostPath(permalink.getAttribute('href'))!;

  // Author: first own profile link with visible text, falling back to the permalink user.
  let author = ref.user;
  let authorLink: Element | null = null;
  for (const a of own<HTMLAnchorElement>(root, 'a[href]')) {
    const m = PROFILE_HREF_RE.exec(a.getAttribute('href') ?? '');
    if (m && textOf(a)) {
      author = decodeURIComponent(m[1]);
      authorLink = a;
      break;
    }
  }

  const avatarImg = own<HTMLImageElement>(root, 'img').find((img) => !isMediaImg(img));
  const topicLink = own<HTMLAnchorElement>(root, 'a[href]').find((a) => TOPIC_HREF_RE.test(a.getAttribute('href') ?? ''));

  const quotedRoot = Array.from(root.querySelectorAll(CONTAINER_SEL)).find((c) => c !== root && !inNested(c, root));

  // Link preview card: an outbound link (l.threads.com redirect) outside the text, holding an
  // image and/or title spans. Inline links inside the text stay part of the text.
  const card = own<HTMLAnchorElement>(root, 'a[href]').find((a) => {
    const href = a.getAttribute('href') ?? '';
    let host = '';
    try {
      host = new URL(href).hostname;
    } catch {
      return false; // relative = a Threads page
    }
    // Outbound only: Threads' own pages (profiles, tags, search) are not link previews,
    // except its l.threads.com redirector, which wraps every external link.
    const internal = /(^|\.)threads\.(com|net)$/.test(host) && host !== 'l.threads.com';
    return !internal && !a.closest('span[dir="auto"]')
      && (a.querySelector('img') || a.querySelectorAll('span[dir="auto"]').length >= 1);
  });
  let link: Post['link'];
  if (card) {
    const href = card.getAttribute('href')!;
    let url = href;
    try {
      const u = new URL(href);
      url = u.searchParams.get('u') ?? href;
    } catch {
      /* keep raw */
    }
    const texts = Array.from(card.querySelectorAll('span[dir="auto"]')).map((s) => textOf(s)).filter(Boolean);
    let domain = '';
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      /* ignore */
    }
    const title = texts.find((t) => t !== domain) ?? texts[0] ?? domain;
    link = { url, title, domain };
  }
  const quoted = quotedRoot ? parsePost(quotedRoot) ?? undefined : undefined;

  // Action bar: like / reply / repost / share buttons (own [role=button] with an icon).
  const buttons = own<HTMLElement>(root, '[role="button"]').filter(
    (b) => b.querySelector('svg') && !b.parentElement?.closest('[role="button"]'),
  );
  // The bar is the smallest block holding exactly four of them; the detail page adds
  // follow/more/sort/activity buttons around it, so "last four" is not enough.
  let actions: HTMLElement[] | undefined;
  for (const b of buttons) {
    for (let a = b.parentElement; a && a !== root; a = a.parentElement) {
      const inside = buttons.filter((x) => a!.contains(x));
      if (inside.length >= 4) {
        if (inside.length === 4) actions = inside;
        break;
      }
    }
    if (actions) break;
  }
  actions ??= buttons.slice(-4);
  const countOf = (b?: Element) => {
    if (!b) return '';
    const s = b.querySelector('span[dir="auto"]');
    return s ? textOf(s) : '';
  };
  const counts: Counts = {
    like: countOf(actions[0]),
    reply: countOf(actions[1]),
    repost: countOf(actions[2]),
    share: countOf(actions[3]),
  };
  const actionBar = actions[0] ?? null;

  // Text runs: outermost own span[dir=auto] that are not header bits / counters.
  const header = new Set<Element>([permalink]);
  if (authorLink) header.add(authorLink);
  if (topicLink) header.add(topicLink);
  const runs = own<HTMLSpanElement>(root, 'span[dir="auto"]').filter((s) => {
    if (s.closest('[role="button"]')) return false;
    for (const h of header) if (h.contains(s) || s.contains(h)) return false;
    if (s.querySelector('time')) return false;
    if (quotedRoot && (quotedRoot.contains(s) || s.contains(quotedRoot))) return false;
    if (card?.contains(s)) return false;
    if (actionBar && !precedes(s, actionBar) && s !== actionBar) return false;
    return true;
  });
  const outer = runs.filter((s) => !runs.some((o) => o !== s && o.contains(s)));

  const anchor = timeEl ?? permalink;
  const badges: string[] = [];
  const body: string[] = [];
  let part: string | undefined;
  for (const s of outer) {
    // Multi-part posts end with an inline "1 / 2" indicator; lift it out of the text.
    const clone = s.cloneNode(true) as Element;
    markInline(s, clone);
    // Threads' own buttons inside the text ("Dịch" / Translate) are not content.
    clone.querySelectorAll('[role="button"]').forEach((b) => b.remove());
    for (const d of Array.from(clone.querySelectorAll('div'))) {
      const m = PART_RE.exec(d.textContent ?? '');
      if (m && d.querySelectorAll('span').length >= 2) {
        part = `${m[1]}/${m[2]}`;
        d.remove();
        break;
      }
    }
    const t = textOf(clone);
    if (!t) continue;
    if (precedes(s, anchor)) badges.push(t);
    else body.push(t);
  }

  // Non-dir badges such as "Tác giả gốc đã thích" sit next to a tiny avatar; pick them up for context.
  // Its text lives in the <svg title> of the icon next to it.
  for (const img of own<HTMLImageElement>(root, 'img')) {
    const w = parseInt(img.getAttribute('width') ?? '', 10);
    if (w > 0 && w <= 20 && img !== avatarImg) {
      const box = img.parentElement?.parentElement;
      const svg = box?.querySelector('svg');
      if (card?.contains(img)) continue;
      // Only the "liked by author" kind: a tiny avatar next to an icon with a title.
      const label = (svg?.getAttribute('title') || svg?.querySelector('title')?.textContent || '').trim();
      if (label && label.length < 60 && !badges.includes(label)) badges.push(label);
    }
  }

  const media: Media[] = [];
  for (const img of own<HTMLImageElement>(root, 'img')) {
    if (!isMediaImg(img) || isVideoPoster(img)) continue;
    if (card?.contains(img)) continue;
    if (quotedRoot?.contains(img)) continue;
    const src = img.getAttribute('src') ?? '';
    if (!src) continue;
    media.push({
      kind: 'image',
      src,
      full: largestFromSrcset(img.getAttribute('srcset')),
      alt: img.getAttribute('alt') ?? undefined,
      width: parseInt(img.getAttribute('width') ?? '', 10) || undefined,
      height: parseInt(img.getAttribute('height') ?? '', 10) || undefined,
    });
  }
  let vn = 0;
  for (const v of own<HTMLVideoElement>(root, 'video')) {
    if (quotedRoot?.contains(v)) continue;
    const src = v.getAttribute('src') || v.querySelector('source')?.getAttribute('src') || '';
    const vkey = `${ref.code}:v${vn++}`;
    videoEls.set(vkey, new WeakRef(v));
    // src is a page-local blob: URL; previews use the poster image, or a frame once it plays.
    media.push({ kind: 'video', src, full: v.getAttribute('poster') || posterFor(v) || frameOf(v), vkey });
  }


  return {
    code: ref.code,
    path: `/@${ref.user}/post/${ref.code}`,
    author,
    avatar: avatarImg?.getAttribute('src') ?? undefined,
    topic: topicLink ? textOf(topicLink) : undefined,
    time: timeEl?.getAttribute('datetime') ?? undefined,
    timeLabel: timeEl ? textOf(timeEl) : undefined,
    text: body.join('\n'),
    link,
    part,
    media,
    counts,
    quoted,
    badges,
  };
}

/** Top-level containers (not nested inside another container), in document order. */
export function topContainers(scope: ParentNode): Element[] {
  return Array.from(scope.querySelectorAll(CONTAINER_SEL)).filter(
    (c) => !c.parentElement?.closest(CONTAINER_SEL),
  );
}

function isPostContainer(c: Element): boolean {
  return own<HTMLAnchorElement>(c, 'a[href*="/post/"]').some((a) => parsePostPath(a.getAttribute('href')));
}

/**
 * The element whose children are the feed items. Chosen as the ancestor with the most
 * children that hold a post, so a multi-column layout picks one column, not the column row.
 * Ties go to the deepest candidate.
 */
/**
 * Post containers that are actually on screen. Threads keeps previous pages mounted but
 * hidden (zero size); without layout (jsdom) every container counts.
 */
function liveContainers(scope: ParentNode): Element[] {
  const all = topContainers(scope).filter(isPostContainer);
  const sized = all.filter((c) => {
    const r = c.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return sized.length ? sized : all;
}

export function findList(scope: ParentNode): Element | null {
  const containers = liveContainers(scope);
  if (!containers.length) return null;
  if (containers.length === 1) return containers[0].parentElement;
  const score = new Map<Element, Set<Element>>();
  for (const c of containers) {
    let child: Element = c;
    for (let p = c.parentElement; p; child = p, p = p.parentElement) {
      let set = score.get(p);
      if (!set) score.set(p, (set = new Set()));
      set.add(child);
    }
  }
  let best: Element | null = null;
  let bestN = 0;
  for (const c of containers) {
    // Walk from deep to shallow so ties keep the deeper element.
    for (let p = c.parentElement; p; p = p.parentElement) {
      const n = score.get(p)!.size;
      if (n > bestN) {
        best = p;
        bestN = n;
      }
    }
  }
  return best;
}

/**
 * Groups posts the way Threads lays them out: each child of the list element is one "item",
 * containing a post and possibly a reply Threads chose to surface below it.
 */
export function parseGroups(scope: ParentNode, list: Element | null = findList(scope)): PostGroup[] {
  if (!list) return [];
  const live = new Set(liveContainers(scope));
  const containers = topContainers(list).filter((c) => live.has(c));
  const itemOf = (c: Element): Element => {
    let p: Element = c;
    while (p.parentElement && p.parentElement !== list) p = p.parentElement;
    return p;
  };
  const groups: PostGroup[] = [];
  let lastItem: Element | null = null;
  for (const c of containers) {
    const post = parsePost(c);
    if (!post) continue;
    const item = itemOf(c);
    if (item === lastItem && groups.length) groups[groups.length - 1].posts.push(post);
    else groups.push({ posts: [post] });
    lastItem = item;
  }
  return groups;
}

/** Indentation Threads uses for each nested reply level (measured on threads.com, Nov 2026). */
const INDENT_PX = 41;

export function permalinkCode(c: Element): string | undefined {
  const a = own<HTMLAnchorElement>(c, 'a[href*="/post/"]').find((x) => x.querySelector('time') && parsePostPath(x.getAttribute('href')));
  return parsePostPath(a?.getAttribute('href'))?.code;
}

/**
 * Thread (post detail) page: ancestors, the focal post, then replies.
 *
 * On the live page Threads keeps the previous feed mounted (hidden, zero size) and shows other
 * posts in a right-hand panel, so with layout available we keep only visible containers in the
 * focal post's column and read the reply depth from their indentation. Without layout (tests,
 * jsdom) we fall back to DOM grouping.
 */
export function parseThread(scope: ParentNode, focalCode: string): ThreadRow[] {
  let tops = topContainers(scope).filter(isPostContainer);
  const rects = new Map(tops.map((c) => [c, c.getBoundingClientRect()] as const));
  const hasLayout = tops.some((c) => rects.get(c)!.width > 0);
  if (hasLayout) {
    tops = tops.filter((c) => rects.get(c)!.width > 0 && rects.get(c)!.height > 0);
    const focalEl = tops.find((c) => permalinkCode(c) === focalCode);
    if (focalEl) {
      const col = rects.get(focalEl)!;
      tops = tops.filter((c) => {
        const r = rects.get(c)!;
        return r.left >= col.left - 4 && r.right <= col.right + 4;
      });
      const rows: ThreadRow[] = [];
      let seen = false;
      for (const c of tops) {
        const post = parsePost(c);
        if (!post) continue;
        if (post.code === focalCode && !seen) {
          seen = true;
          rows.push({ post, depth: 0, focal: true });
        } else if (!seen) {
          rows.push({ post, depth: 0, ancestor: true });
        } else {
          const indent = Math.max(0, Math.round((rects.get(c)!.left - col.left) / INDENT_PX));
          rows.push({ post, depth: Math.min(1 + indent, 8) });
        }
      }
      return rows;
    }
    // Live page but the focal post isn't on screen yet (still loading, or the URL changed
    // before the page did): report nothing rather than mislabel whatever is showing.
    return [];
  }
  return parseThreadByGroups(scope, focalCode);
}

function parseThreadByGroups(scope: ParentNode, focalCode: string): ThreadRow[] {
  const groups = parseGroups(scope);
  const rows: ThreadRow[] = [];
  let seenFocal = false;
  for (const g of groups) {
    if (!seenFocal) {
      const idx = g.posts.findIndex((p) => p.code === focalCode);
      if (idx === -1) {
        for (const p of g.posts) rows.push({ post: p, depth: 0, ancestor: true });
        continue;
      }
      g.posts.forEach((p, i) => {
        if (i < idx) rows.push({ post: p, depth: 0, ancestor: true });
        else if (i === idx) rows.push({ post: p, depth: 0, focal: true });
        else rows.push({ post: p, depth: 1 });
      });
      seenFocal = true;
      continue;
    }
    g.posts.forEach((p, i) => rows.push({ post: p, depth: Math.min(1 + i, 6) }));
  }
  if (!seenFocal) {
    // Focal post not identifiable — treat the first post as focal and the rest as replies.
    return rows.map((r, i) => ({ post: r.post, depth: i === 0 ? 0 : 1, focal: i === 0 }));
  }
  return rows;
}

/**
 * Index of each rendered post's item within the list element. Threads keeps one (empty)
 * placeholder child per item even when the item is virtualised away, so this index lets us
 * scroll an item back into view later.
 */
export function indexItems(list: Element): Map<string, number> {
  const out = new Map<string, number>();
  const live = new Set(liveContainers(list));
  for (const c of topContainers(list)) {
    if (!live.has(c)) continue;
    const code = permalinkCode(c);
    if (!code) continue;
    let item: Element = c;
    while (item.parentElement && item.parentElement !== list) item = item.parentElement;
    out.set(code, Array.prototype.indexOf.call(list.children, item));
  }
  return out;
}
