import hosts from '../hosts.json';
import type { Route, Site } from '../types';
import { CONTAINER_SEL, findList, indexItems, parseGroups, parsePostPath, parseThread } from './parser';

/** Threads (threads.com). */

function routeOf(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  const m = /^\/@([^/]+)\/post\/([^/?#]+)/.exec(path);
  if (m) return { kind: 'thread', path: `/@${m[1]}/post/${m[2]}`, code: m[2] };
  if (path === '/' || path === '/for_you' || path === '/following' || path === '/liked' || path === '/saved') {
    return { kind: 'feed', path };
  }
  if (/^\/@[^/]+(\/(replies|reposts|media))?$/.test(path)) return { kind: 'profile', path };
  return { kind: 'other', path };
}

export const threads: Site = {
  id: 'threads',
  name: hosts.threads.name,
  domains: hosts.threads.domains,
  mode: 'live',
  frames: hosts.threads.selfFrame,

  routeOf,
  tabTitle(route, post) {
    if (route.kind === 'thread') return post ? `@${post.author}` : `#${route.code?.slice(0, 6)}`;
    if (route.kind === 'profile') return route.path.slice(1);
    if (route.path === '/following') return 'Following';
    return 'Overview';
  },
  postRoute(href) {
    const ref = parsePostPath(href);
    return ref ? { kind: 'thread', path: `/@${ref.user}/post/${ref.code}`, code: ref.code } : null;
  },

  columns: [
    { key: 'no', header: 'No', width: 52, align: 'right', kind: 'num' },
    { key: 'author', header: 'Reporter', width: 140 },
    { key: 'time', header: 'Updated', width: 118 },
    { key: 'topic', header: 'Function', width: 128, kind: 'chip' },
    { key: 'text', header: 'Description', width: 540, wrap: true },
    { key: 'like', header: 'Votes', width: 68, align: 'right', kind: 'num', metric: 'like' },
    { key: 'reply', header: 'Comments', width: 86, align: 'right', kind: 'num', metric: 'reply' },
    { key: 'repost', header: 'Reposts', width: 74, align: 'right', kind: 'num', metric: 'repost' },
    { key: 'share', header: 'Shares', width: 68, align: 'right', kind: 'num', metric: 'share' },
    { key: 'media', header: 'Attachment', width: 150, kind: 'media' },
    { key: 'ref', header: 'Ticket ID', width: 128, kind: 'link' },
  ],
  replyMetric: 'reply',

  postSelector: CONTAINER_SEL,
  findList,
  parseGroups,
  parseThread,
  indexItems,

  refresh(doc) {
    doc.querySelector<HTMLAnchorElement>('a[href="/"]')?.click();
  },
};
