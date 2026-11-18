import { useEffect, useRef } from 'preact/hooks';
import { actions, currentSel } from '../actions';
import { searchScopeOf } from '../driver';
import { site } from '../site';
import type { State } from '../store';
import { I } from './common';

/**
 * ⌘F find box, placed like Google Sheets' (top right of the grid).
 *  - Sites with their own search (voz): one job, "search this whole thread". Keywords + author
 *    boxes, Enter runs the site's search and opens the results as a sheet. Matches among the
 *    pages already loaded are highlighted on the side (↑ ↓ to step through them).
 *  - Other sites: classic find among the loaded rows (Enter / ⇧Enter, filter).
 */
export function FindBar({ s }: { s: State }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    actions.focusFind = () => {
      input.current?.focus();
      input.current?.select();
    };
    actions.focusFind();
    return () => {
      actions.focusFind = () => {};
    };
  }, []);
  return site().search ? <SiteSearch s={s} input={input} /> : <LocalFind s={s} input={input} />;
}

type Props = { s: State; input: { current: HTMLInputElement | null } };

const value = (e: Event) => (e.currentTarget as HTMLInputElement).value;

/** Shared keys: Esc closes, ⌘F reselects the text. True when handled. */
function commonKey(e: KeyboardEvent, input: Props['input']): boolean {
  if (e.key === 'Escape') {
    e.preventDefault();
    actions.closeFind();
    return true;
  }
  if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault();
    input.current?.select();
    return true;
  }
  return false;
}

function useHits(s: State) {
  const f = s.find!;
  const hits = f.query.trim() || f.user.trim() ? actions.findHits() : [];
  return { hits, at: hits.indexOf(currentSel().r) + 1 };
}

const Steps = ({ n, title }: { n: number; title: [string, string] }) => (
  <>
    <button class="round-btn" title={title[0]} disabled={!n} onClick={() => actions.findStep(-1)}><I n="chevronUp" /></button>
    <button class="round-btn" title={title[1]} disabled={!n} onClick={() => actions.findStep(1)}><I n="chevronDown" /></button>
  </>
);

function SiteSearch({ s, input }: Props) {
  const f = s.find!;
  const { hits, at } = useHits(s);
  const label = site().searchLabel?.(searchScopeOf(s.active)) ?? `Tìm trên ${site().name}`;
  const total = s.pager[s.active]?.total ?? 0;
  const empty = !f.query.trim() && !f.user.trim();

  const onKey = (e: KeyboardEvent) => {
    if (commonKey(e, input)) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      actions.searchAll();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      actions.findStep(e.key === 'ArrowUp' ? -1 : 1);
    }
  };

  return (
    <div class="findbar site" onMouseDown={(e) => e.stopPropagation()}>
      <div class="fb-head">
        <span>
          {label}
          {total > 1 && <span class="fb-pages"> · {total.toLocaleString('vi-VN')} trang</span>}
        </span>
        <button class="round-btn" title="Đóng (Esc)" onClick={() => actions.closeFind()}><I n="close" /></button>
      </div>
      <div class="fb-row">
        <label class="fb-field">
          <input ref={input} value={f.query} placeholder="Từ khoá" spellcheck={false} onInput={(e) => actions.setFind({ query: value(e) })} onKeyDown={onKey} />
        </label>
        <label class="fb-field fb-user">
          <span class="fb-at">👤</span>
          <input value={f.user} placeholder="Người đăng" spellcheck={false} onInput={(e) => actions.setFind({ user: value(e) })} onKeyDown={onKey} />
        </label>
        <button class="fb-search" disabled={empty || f.searching} onClick={() => actions.searchAll()}>
          {f.searching ? 'Đang tìm…' : 'Tìm'}
        </button>
      </div>
      <div class={`fb-hint ${f.error ? 'err' : ''}`}>
        {f.searching ? (
          <>Đang hỏi {site().name}… lần đầu có thể mất vài giây.</>
        ) : f.error ? (
          f.error
        ) : empty ? (
          <>Nhập từ khoá, tên người đăng, hoặc cả hai, rồi bấm <b>Enter</b>. Kết quả mở ở tab mới, <b>Enter</b> ở một kết quả để nhảy tới bài đó.</>
        ) : hits.length ? (
          <span class="fb-local">
            <span>
              Đã tô xanh <b>{hits.length}</b> bài khớp trong trang này{at ? ` (bài ${at})` : ''} · <b>Enter</b> để tìm cả thớt
            </span>
            <Steps n={hits.length} title={['Bài khớp trước (↑)', 'Bài khớp sau (↓)']} />
          </span>
        ) : (
          <>Bấm <b>Enter</b> để tìm.</>
        )}
      </div>
    </div>
  );
}

function LocalFind({ s, input }: Props) {
  const f = s.find!;
  const { hits, at } = useHits(s);

  const onKey = (e: KeyboardEvent) => {
    if (commonKey(e, input)) return;
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      actions.findStep(e.shiftKey || e.key === 'ArrowUp' ? -1 : 1);
    }
  };

  return (
    <div class="findbar" onMouseDown={(e) => e.stopPropagation()}>
      <div class="fb-row">
        <label class="fb-field">
          <input ref={input} value={f.query} placeholder="Tìm trong sheet" spellcheck={false} onInput={(e) => actions.setFind({ query: value(e) })} onKeyDown={onKey} />
          {f.query.trim() && <span class="fb-count">{hits.length ? `${at || '–'} / ${hits.length}` : '0 kết quả'}</span>}
        </label>
        <Steps n={hits.length} title={['Kết quả trước (⇧Enter)', 'Kết quả sau (Enter)']} />
        <button class={`round-btn ${f.filter ? 'on' : ''}`} title={f.filter ? 'Hiện lại mọi dòng' : 'Chỉ hiện dòng khớp'} disabled={!f.query.trim()} onClick={() => actions.toggleFindFilter()}>
          <I n="filter" />
        </button>
        <button class="round-btn" title="Đóng (Esc)" onClick={() => actions.closeFind()}><I n="close" /></button>
      </div>
      {!f.query.trim() && <div class="fb-hint">Tìm trong các dòng đã tải, cả chữ lẫn tên người đăng. Gõ không dấu cũng được.</div>}
    </div>
  );
}
