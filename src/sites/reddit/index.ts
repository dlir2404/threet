import hosts from '../hosts.json';
import type { Route, Site } from '../types';
import { findList, indexItems, parseGroups, parsePermalink, parseThread, permalinkPath, POST_SEL } from './parser';

/** Reddit (www.reddit.com, the "shreddit" web app). */

function routeOf(pathname: string): Route {
  let path = pathname.replace(/\/+$/, '') || '/';
  try {
    path = decodeURI(path);
  } catch {
    /* keep */
  }
  const perm = parsePermalink(path);
  if (perm) return { kind: 'thread', path: permalinkPath(perm), code: perm.comment ?? perm.post };
  const sub = /^\/r\/([^/]+)(\/(hot|new|top|rising|controversial|best))?$/i.exec(path);
  if (sub) return { kind: 'feed', path: `/r/${sub[1]}${sub[2] ?? ''}` };
  if (/^\/(best|hot|new|top|rising|popular|all)?$/.test(path) || /^\/r\/(popular|all)$/.test(path)) return { kind: 'feed', path };
  if (/^\/(user|u)\/[^/]+(\/(submitted|comments))?$/.test(path)) return { kind: 'profile', path: path.replace(/^\/u\//, '/user/') };
  return { kind: 'other', path };
}

export const reddit: Site = {
  id: 'reddit',
  name: hosts.reddit.name,
  domains: hosts.reddit.domains,
  mode: 'live',
  // Reddit sends X-Frame-Options: SAMEORIGIN, so comment pages load in same-origin iframes as is.
  frames: true,

  routeOf,
  tabTitle(route, post) {
    if (route.kind === 'thread') {
      const t = post?.title || post?.author;
      return t ? (t.length > 28 ? `${t.slice(0, 27)}…` : t) : `#${route.code}`;
    }
    if (route.kind === 'profile') return route.path.replace('/user/', 'u/');
    if (route.path.startsWith('/r/')) return route.path.slice(1);
    return 'Overview';
  },
  postRoute(href) {
    const perm = parsePermalink(href);
    return perm ? { kind: 'thread', path: permalinkPath(perm), code: perm.comment ?? perm.post } : null;
  },

  columns: [
    { key: 'no', header: 'No', width: 52, align: 'right', kind: 'num' },
    { key: 'author', header: 'Reporter', width: 140 },
    { key: 'time', header: 'Updated', width: 118 },
    { key: 'topic', header: 'Function', width: 140, kind: 'chip' },
    { key: 'text', header: 'Description', width: 560, wrap: true },
    { key: 'score', header: 'Score', width: 70, align: 'right', kind: 'num', metric: 'score' },
    { key: 'comment', header: 'Comments', width: 86, align: 'right', kind: 'num', metric: 'comment' },
    { key: 'media', header: 'Attachment', width: 150, kind: 'media' },
    { key: 'ref', header: 'Ticket ID', width: 110, kind: 'link' },
  ],
  replyMetric: 'comment',

  postSelector: POST_SEL,
  findList,
  parseGroups,
  parseThread,
  indexItems,
};
