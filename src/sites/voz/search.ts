import type { Route, SearchQuery } from '../types';
import { log } from '../../content/log';
import { parseNodePath } from './parser';

/**
 * voz search. Cloudflare challenges script requests (fetch) to /search/search, but lets a real
 * navigation through, so the search form is submitted into a hidden same-origin iframe, exactly
 * like the site's own search box. Result pages after the first (/search/<id>/?page=N) can be fetched.
 *
 * Cloudflare sometimes shows its "Just a moment…" check first; it solves itself, but only in a
 * frame of real size, so the frame is full-size, off-screen and transparent rather than 1px.
 */

const TIMEOUT_MS = 30000;

function csrfToken(): string {
  const m = /(?:^|;\s*)xf_csrf=([^;]+)/.exec(document.cookie);
  return m ? decodeURIComponent(m[1]) : '';
}

/** Search constraints for the sheet being searched: a thread, a forum (with sub-forums), or all. */
function scopeFields(scope: Route): Record<string, string> {
  const t = parseNodePath(scope.path, 't');
  if (t) return { 'c[thread]': t.id };
  const f = parseNodePath(scope.path, 'f');
  if (f) return { 'c[nodes][]': f.id, 'c[child_nodes]': '1' };
  return {};
}

export function searchLabel(scope: Route): string {
  if (parseNodePath(scope.path, 't')) return 'Tìm trong cả thớt này';
  if (parseNodePath(scope.path, 'f')) return 'Tìm trong cả box này';
  return 'Tìm trên toàn voz';
}

export function search(q: SearchQuery, scope: Route): Promise<{ path: string; doc: Document }> {
  const fields: Record<string, string> = {
    _xfToken: csrfToken(),
    keywords: q.keywords,
    'c[users]': q.user ?? '',
    order: 'date',
    search_type: 'post',
    ...scopeFields(scope),
  };
  const name = `threet-search-${Date.now()}`;
  const frame = document.createElement('iframe');
  frame.name = name;
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('inert', '');
  frame.style.cssText = 'position:fixed;left:-3000px;top:0;width:800px;height:600px;border:0;opacity:0;pointer-events:none;';
  const form = document.createElement('form');
  form.method = 'post';
  form.action = '/search/search';
  form.target = name;
  for (const [k, v] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = k;
    input.value = v;
    form.appendChild(input);
  }
  document.documentElement.append(frame, form);

  return new Promise((resolve, reject) => {
    const done = () => {
      window.clearTimeout(timer);
      frame.remove();
    };
    const timer = window.setTimeout(() => {
      done();
      reject(new Error('voz không phản hồi'));
    }, TIMEOUT_MS);
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      const loc = frame.contentWindow?.location;
      if (!doc || !loc || loc.href === 'about:blank') return;
      // Cloudflare's "Just a moment…" check runs in the frame, then reloads it: wait for that.
      if (doc.documentElement.innerHTML.includes('_cf_chl_opt') || doc.querySelector('#challenge-form')) {
        log('voz search: waiting for the Cloudflare check');
        return;
      }
      // Snapshot the page before the frame goes away.
      const copy = new DOMParser().parseFromString(doc.documentElement.outerHTML, 'text/html');
      const path = loc.pathname.replace(/\/+$/, '');
      done();
      if (!/^\/search\/\d+/.test(loc.pathname)) {
        // Still on the form: "no results", flood control, or another error.
        const msg = copy.querySelector('.blockMessage--error, .blockMessage')?.textContent?.trim().replace(/\s+/g, ' ');
        log('voz search ended on', loc.href, copy.title);
        reject(new Error(msg || 'Không tìm thấy kết quả nào'));
        return;
      }
      resolve({ path, doc: copy });
    });
    form.submit();
    form.remove();
  });
}
