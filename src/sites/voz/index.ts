import hosts from '../hosts.json';
import type { Route, Site } from '../types';
import { nextPage, parseGroups, parseNodePath, parseThread } from './parser';

/** voz.vn — XenForo forum, read page by page (pages mode). */

function routeOf(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  const t = parseNodePath(path, 't');
  if (t) return { kind: 'thread', path: t.path, code: t.id };
  const f = parseNodePath(path, 'f');
  if (f) return { kind: 'feed', path: f.path };
  if (path === '/') return { kind: 'feed', path };
  const wn = /^\/whats-new(\/(posts|latest-activity|profile-posts))?/.exec(path);
  if (wn) return { kind: 'feed', path: wn[0] };
  return { kind: 'other', path };
}

const short = (s: string) => (s.length > 30 ? `${s.slice(0, 29)}…` : s);

export const voz: Site = {
  id: 'voz',
  name: hosts.voz.name,
  domains: hosts.voz.domains,
  mode: 'pages',
  frames: false,
  nextPage,

  routeOf,
  tabTitle(route, post) {
    if (post?.title) return short(post.title);
    if (route.kind === 'thread') return `#${route.code}`;
    if (route.path.startsWith('/whats-new')) return "What's new";
    if (route.path.startsWith('/f/')) return short(route.path.slice(3).replace(/\.\d+$/, '').replace(/-/g, ' ') || 'Forum');
    return 'Overview';
  },
  postRoute(href) {
    const t = parseNodePath(href, 't');
    if (t) return { kind: 'thread', path: t.path, code: t.id };
    const f = parseNodePath(href, 'f');
    return f ? { kind: 'feed', path: f.path } : null;
  },

  columns: [
    { key: 'no', header: 'No', width: 52, align: 'right', kind: 'num' },
    { key: 'author', header: 'Reporter', width: 140 },
    { key: 'time', header: 'Updated', width: 118 },
    { key: 'topic', header: 'Function', width: 130, kind: 'chip' },
    { key: 'text', header: 'Description', width: 580, wrap: true },
    { key: 'reply', header: 'Replies', width: 76, align: 'right', kind: 'num', metric: 'reply' },
    { key: 'view', header: 'Views', width: 76, align: 'right', kind: 'num', metric: 'view' },
    { key: 'like', header: 'Votes', width: 64, align: 'right', kind: 'num', metric: 'like' },
    { key: 'media', header: 'Attachment', width: 140, kind: 'media' },
    { key: 'ref', header: 'Ticket ID', width: 100, kind: 'link' },
  ],

  postSelector: 'article.message--post, .structItem--thread, .node--forum',
  findList: (scope) => scope.querySelector('.structItemContainer, .block-body'),
  parseGroups,
  parseThread,
  indexItems: () => new Map(),
};
