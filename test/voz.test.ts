// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { nextPage, pageInfo, parseGroups, parseThread } from '../src/sites/voz/parser';
import { voz } from '../src/sites/voz';

// Synthetic XenForo 2 markup (no real user data).
const FORUM = `
<div class="structItemContainer">
  <div class="structItemContainer-group structItemContainer-group--sticky">
    <div class="structItem structItem--thread js-threadListItem-111" data-author="mod">
      <div class="structItem-title"><a href="/f/demo.17/?prefix_id=1" class="labelLink"><span class="label">Thông báo</span></a><a href="/t/noi-quy.111/">Nội quy</a></div>
      <div class="structItem-minor"><a class="username">mod</a></div>
      <li class="structItem-startDate"><time datetime="2026-01-01T08:00:00+0700"></time></li>
      <div class="structItem-cell--meta"><dl><dt>Trả lời</dt><dd>5</dd></dl><dl><dt>Lượt xem</dt><dd>1,2K</dd></dl></div>
    </div>
  </div>
  <div class="structItemContainer-group js-threadList">
    <div class="structItem structItem--thread js-threadListItem-222" data-author="an">
      <div class="structItem-title"><a href="/t/hoi-dap-cau-hinh.222/">Hỏi đáp cấu hình</a></div>
      <li class="structItem-startDate"><time datetime="2026-11-18T10:28:45+0700"></time></li>
      <div class="structItem-cell--meta"><dl><dd>33</dd></dl><dl><dd>166</dd></dl></div>
      <div class="structItem-cell--latest"><time>3 phút trước</time><a class="username">binh</a></div>
    </div>
  </div>
</div>
<div class="pageNav"><a class="pageNav-jump pageNav-jump--next" href="/f/demo.17/page-2">Next</a></div>`;

const THREAD = `
<html><head><link rel="canonical" href="https://voz.vn/t/hoi-dap-cau-hinh.222/"></head><body>
<h1 class="p-title-value">Hỏi đáp cấu hình</h1>
<article class="message message--post" data-author="an" data-content="post-1001">
  <div class="message-attribution-main"><time datetime="2026-11-18T10:28:45+0700"></time></div>
  <ul class="message-attribution-opposite"><li><a href="#">#1</a></li></ul>
  <div class="message-body"><div class="bbWrapper">Máy em hay treo<br>Giúp với <img class="bbImage" data-src="/attachments/a.jpg" alt="a.jpg"></div></div>
  <div class="reactionsBar"><a>binh, chi và 3 người khác</a></div>
</article>
<article class="message message--post" data-author="binh" data-content="post-1002">
  <ul class="message-attribution-opposite"><li><a href="#">#2</a></li></ul>
  <div class="message-body"><div class="bbWrapper">
    <blockquote class="bbCodeBlock bbCodeBlock--quote" data-quote="an" data-source="post: 1001"><div class="bbCodeBlock-content">Máy em hay treo <a href="/attachments/x-png.373388023/">Xem tệp đính kèm 373388023</a><div class="bbImageWrapper"><img class="bbImage" alt="b.png"></div><div class="bbCodeBlock-expandLink"><a>Nhấp để mở rộng...</a></div></div></blockquote>
    Thay RAM đi
  </div></div>
</article>
<a class="pageNav-jump pageNav-jump--next" href="/t/hoi-dap-cau-hinh.222/page-2">Next</a>
</body></html>`;

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('voz routes', () => {
  it('classifies forum, thread and post links', () => {
    expect(voz.routeOf('/')).toEqual({ kind: 'feed', path: '/' });
    expect(voz.routeOf('/f/chuyen-tro-linh-tinhtm.17/page-3')).toEqual({ kind: 'feed', path: '/f/chuyen-tro-linh-tinhtm.17' });
    expect(voz.routeOf('/t/hoi-dap-cau-hinh.222/page-2')).toEqual({ kind: 'thread', path: '/t/hoi-dap-cau-hinh.222', code: '222' });
    expect(voz.postRoute('/t/hoi-dap-cau-hinh.222/post-1002')?.path).toBe('/t/hoi-dap-cau-hinh.222');
    expect(voz.routeOf('/whats-new/posts/').path).toBe('/whats-new/posts');
  });
});

describe('voz thread list', () => {
  const d = doc(FORUM);
  const posts = parseGroups(d).flatMap((g) => g.posts);
  it('reads threads with prefix, counts and sticky badge', () => {
    expect(posts.map((p) => p.code)).toEqual(['111', '222']);
    expect(posts[0]).toMatchObject({ title: 'Nội quy', topic: 'Thông báo', author: 'mod' });
    expect(posts[0].badges[0]).toContain('sticky');
    expect(posts[1]).toMatchObject({ path: '/t/hoi-dap-cau-hinh.222', counts: { reply: '33', view: '166' } });
    expect(posts[1].badges.join()).toContain('binh');
    expect(nextPage(d)).toBe('/f/demo.17/page-2');
  });
});

describe('voz thread page', () => {
  const rows = parseThread(doc(THREAD), '222');
  it('makes #1 the focal post with the thread title', () => {
    expect(rows[0]).toMatchObject({ focal: true, depth: 0 });
    expect(rows[0].post).toMatchObject({ ordinal: '#1', title: 'Hỏi đáp cấu hình', counts: { like: '5' } });
    expect(rows[0].post.media[0].src).toBe('https://voz.vn/attachments/a.jpg');
  });
  it('turns quotes into posts that point at the original, without attachment noise', () => {
    expect(rows[1].post.text).toBe('Thay RAM đi');
    expect(rows[1].post.quotes).toEqual([
      expect.objectContaining({ code: '1001', author: 'an', path: '/posts/1001/', text: 'Máy em hay treo [ảnh]' }),
    ]);
    expect(rows[1].post.path).toBe('/t/hoi-dap-cau-hinh.222/post-1002');
  });
});

const SEARCH = `
<ol class="block-body">
  <li class="block-row block-row--separated" data-author="BE READY">
    <div class="contentRow"><div class="contentRow-main">
      <h3 class="contentRow-title"><a href="/t/hoi-bo-bim.1089186/post-44382603">Hội bố bỉm <em class="textHighlight">sữa</em></a></h3>
      <div class="contentRow-snippet">Con mình bị dị ứng đạm <em class="textHighlight">sữa</em> bò</div>
      <div class="contentRow-minor"><ul><li><a class="username">BE READY</a></li><li>Bài viết #2.994</li><li><time datetime="2026-11-17T14:52:08+0700"></time></li></ul></div>
    </div></div>
  </li>
  <li class="block-row block-row--separated" data-author="an">
    <div class="contentRow"><div class="contentRow-main">
      <h3 class="contentRow-title"><a href="/t/hoi-bo-bim.1089186/post-44000001">Hội bố bỉm sữa</a></h3>
      <div class="contentRow-snippet">mua sữa ở đâu</div>
      <div class="contentRow-minor"><ul><li>Bài viết #12</li></ul></div>
    </div></div>
  </li>
</ol>
<div class="pageNav">
  <a class="pageNav-jump pageNav-jump--next" href="/search/6569157/?page=2&amp;q=s%E1%BB%AFa&amp;c[thread]=1089186">Next</a>
  <ul><li class="pageNav-page pageNav-page--current"><a href="/search/6569157/?q=x">1</a></li>
  <li class="pageNav-page"><a href="/search/6569157/?page=10&amp;q=s%E1%BB%AFa">10</a></li></ul>
</div>`;

const PAGED = `
<ul class="pageNav-main">
  <li class="pageNav-page"><a href="/t/hoi-bo-bim.1089186/">1</a></li>
  <li class="pageNav-page pageNav-page--current"><a href="/t/hoi-bo-bim.1089186/page-3">3</a></li>
  <li class="pageNav-page"><a href="/t/hoi-bo-bim.1089186/page-150">150</a></li>
</ul>
<article class="message message--post" data-author="x" data-content="post-1"></article>`;

describe('voz search and pages', () => {
  it('reads search hits as posts of the thread, numbered like the thread', () => {
    const posts = parseGroups(doc(SEARCH)).map((g) => g.posts[0]);
    expect(posts.map((p) => [p.code, p.path, p.author, p.ordinal])).toEqual([
      ['44382603', '/t/hoi-bo-bim.1089186/post-44382603', 'BE READY', '#2.994'],
      ['44000001', '/t/hoi-bo-bim.1089186/post-44000001', 'an', '#12'],
    ]);
    expect(posts[0].text).toBe('Con mình bị dị ứng đạm sữa bò');
    expect(posts[0].topic).toBeUndefined(); // one thread: no title chip on every row
    expect(voz.postRoute(posts[0].path)).toEqual({ kind: 'thread', path: '/t/hoi-bo-bim.1089186', code: '1089186' });
  });

  it('keeps the query of the next results page and routes results as a sheet', () => {
    expect(nextPage(doc(SEARCH))).toBe('/search/6569157/?page=2&q=s%E1%BB%AFa&c[thread]=1089186');
    expect(voz.routeOf('/search/6569157/')).toEqual({ kind: 'feed', path: '/search/6569157' });
  });

  it('reads the page number, page count and page URL template', () => {
    expect(pageInfo(doc(PAGED))).toEqual({ page: 3, total: 150, template: '/t/hoi-bo-bim.1089186/page-{n}' });
    expect(pageInfo(doc(SEARCH))).toEqual({ page: 1, total: 10, template: '/search/6569157/?page={n}&q=s%E1%BB%AFa' });
    expect(pageInfo(doc('<article class="message--post"></article>'))).toEqual({ page: 1, total: 1, template: '' });
  });
});
