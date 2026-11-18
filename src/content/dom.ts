/** DOM helpers shared by every site adapter. */

const BLOCK = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE']);

/**
 * Copy "this block-level tag is actually displayed inline" from the live element onto its clone
 * (clones are detached, so getComputedStyle can't be used on them).
 */
export function markInline(orig: Element, clone: Element) {
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
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}


/** Largest candidate URL in an <img srcset>. */
export function largestFromSrcset(srcset: string | null): string | undefined {
  if (!srcset) return undefined;
  let best: { url: string; w: number } | undefined;
  for (const part of srcset.split(',')) {
    const [url, size] = part.trim().split(/\s+/);
    const w = parseInt(size ?? '', 10) || 0;
    if (url && (!best || w > best.w)) best = { url, w };
  }
  return best?.url;
}
