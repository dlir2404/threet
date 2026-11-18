import type { PageKind, Post, PostGroup, ThreadRow } from '../shared/types';

/**
 * One supported website. Everything site-specific lives behind this interface (src/sites/<id>/);
 * the sheet UI, store, driver (loading, navigation, iframes) and debug tooling are shared.
 *
 * Build-time facts (domains for the manifest, the self-framing rule) live in ./hosts.json so the
 * build script can read them without bundling TypeScript.
 */


/** Where the real page is. "feed"/"profile" render as list sheets, "thread" as a detail sheet. */
export interface Route {
  kind: PageKind;
  /** Normalised path; also the id of the sheet tab that mirrors it. */
  path: string;
  /** Detail pages: id of the focal post. */
  code?: string;
}

/** A sheet column. Post columns read a field (key) or a site metric (metric). */
export interface Column {
  key: string;
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  kind?: 'text' | 'num' | 'chip' | 'media' | 'link' | 'header';
  /** Wrap and clamp long text instead of clipping to one line. */
  wrap?: boolean;
  /** Read post.counts[metric] (likes, replies, upvotes, views…). */
  metric?: string;
}

export interface Site {
  id: string;
  /** Display name ("Threads"). */
  name: string;
  /** Hostnames this adapter handles (suffix match), from hosts.json. */
  domains: string[];
  /**
   * How sheets get their content:
   *  - "live": read the page the user has open; load more by scrolling it; detail pages in a
   *    same-origin iframe when `frames` (Threads, Reddit).
   *  - "pages": classic paginated HTML (forums): every sheet is fetched with fetch() and parsed,
   *    "load more" fetches nextPage(); the real page never navigates (voz).
   */
  mode: 'live' | 'pages';
  /** live mode: detail pages can be opened in a same-origin iframe. */
  frames: boolean;
  /** pages mode: URL of the next page of a fetched document, or null. */
  nextPage?(doc: Document): string | null;

  routeOf(pathname: string): Route;
  /** Sheet-tab title for a route ("Overview", "@author"); `post` is the focal post once known. */
  tabTitle(route: Route, post?: Post): string;
  /** Route of a post permalink (href or path), or null if it isn't one. */
  postRoute(href: string | null | undefined): Route | null;

  /** Columns of post sheets, in order. Must include keys "no" and "text". */
  columns: Column[];
  /** Metric that counts replies: a detail page whose focal post has none loads nothing more. */
  replyMetric?: string;

  /** Selector matching one rendered post (used to detect content and new pages). */
  postSelector: string;
  /** Element whose children are the list items (virtualised lists keep one child per item). */
  findList(scope: ParentNode): Element | null;
  parseGroups(scope: ParentNode, list?: Element | null): PostGroup[];
  parseThread(scope: ParentNode, focalCode: string): ThreadRow[];
  /** Post id → index of its item in `list`, to scroll unmounted items back into view. */
  indexItems(list: Element): Map<string, number>;

  /** Ask the page for newer posts (e.g. click its home link). Optional. */
  refresh?(doc: Document): void;
}

export type { PageKind, Post, PostGroup, ThreadRow };
