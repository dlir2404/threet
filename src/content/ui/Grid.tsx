import type { Media } from '../../shared/types';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { actions, currentSel, MIN_COLS } from '../actions';
import { cellDisplay, cellFull, cellNote, chipColor, colLetter, type Column, type SheetModel, type SheetRow } from '../sheet';
import type { State } from '../store';
import { I } from './common';
import { VideoMirror } from './Video';

const ROW_HDR = 46;
const BLANK_W = 100;
const FILLER_ROWS = 40;

/** Attachment preview card under/over a media chip. It is interactive (arrows, thumbnails). */
interface Hover {
  key: string;
  x: number;
  /** Anchored below the chip (top) or above it (bottom), in grid-wrap coordinates. */
  top?: number;
  bottom?: number;
  media: Media[];
  items: { src: string; alt?: string; video: boolean; vkey?: string }[];
  index: number;
  code: string;
}

/** Grace period so the pointer can travel from the chip into the card. */
const HOVER_HIDE_MS = 300;

export function Grid({ s, model }: { s: State; model: SheetModel }) {
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const keepHover = () => window.clearTimeout(hideTimer.current);
  // Boss key / tab switch: drop the preview at once (it may be playing a video).
  useEffect(() => setHover(null), [s.boss, s.active]);
  const hideHoverSoon = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHover(null), HOVER_HIDE_MS);
  };
  const [note, setNote] = useState<{ x: number; y: number; text: string; key: string } | null>(null);
  const [reader, setReader] = useState<{ left: number; top: number; width: number } | null>(null);
  const sel = currentSel();
  const zoom = s.settings.zoom ?? 1;

  const cols: Column[] = [...model.columns];
  for (let i = cols.length; i < MIN_COLS; i++) cols.push({ key: `_${i}`, header: '', width: BLANK_W });
  const totalRows = Math.max(model.rows.length + FILLER_ROWS, 60);
  const width = ROW_HDR + cols.reduce((a, c) => a + c.width, 0);

  useEffect(() => {
    actions.focusGrid = () => scroller.current?.focus({ preventScroll: true });
    scroller.current?.focus({ preventScroll: true });
  }, []);

  // Keep the selected cell in view, accounting for the sticky headers.
  useLayoutEffect(() => {
    const sc = scroller.current;
    const el = sheet.current?.querySelector<HTMLElement>(`[data-r="${sel.r}"][data-c="${sel.c}"]`);
    if (!sc || !el) return;
    // Use rects: they already include CSS zoom.
    const sr = sc.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const hdr = sheet.current!.querySelector('.colhdr')!.getBoundingClientRect().height;
    const frozen = sheet.current!.querySelector('.r.frozen')!.getBoundingClientRect().height;
    const rowHdr = sheet.current!.querySelector('.corner')!.getBoundingClientRect().width;
    const top = er.top - sr.top;
    const left = er.left - sr.left;
    if (sel.r > 0) {
      if (top < hdr + frozen) sc.scrollTop += top - hdr - frozen;
      else if (er.bottom - sr.top > sc.clientHeight - 8) sc.scrollTop += Math.min(er.bottom - sr.top - sc.clientHeight + 8, top - hdr - frozen);
    }
    if (left < rowHdr) sc.scrollLeft += left - rowHdr;
    else if (er.right - sr.left > sc.clientWidth - 8) sc.scrollLeft += Math.min(er.right - sr.left - sc.clientWidth + 8, left - rowHdr);
  }, [sel.r, sel.c, s.active, s.boss, zoom]);

  // Position the in-place reader over the selected cell.
  useLayoutEffect(() => {
    if (!s.reading) return setReader(null);
    const el = sheet.current?.querySelector<HTMLElement>(`[data-r="${s.reading.r}"][data-c="${s.reading.c}"]`);
    if (!el) return setReader(null);
    const rowEl = el.parentElement as HTMLElement;
    setReader({ left: el.offsetLeft, top: rowEl.offsetTop, width: Math.max(el.offsetWidth, 460) });
  }, [s.reading, s.active, model.rows.length]);

  // Load more when the end of the data scrolls into view (or the data doesn't fill the screen).
  const maybeLoad = () => {
    const sc = scroller.current;
    if (!sc || !model.pageable || s.loading || !model.rows.length) return;
    const last = sheet.current?.querySelector<HTMLElement>(`.r[data-row="${model.rows.length}"]`);
    if (!last) return;
    const bottom = last.getBoundingClientRect().bottom - sc.getBoundingClientRect().top;
    if (bottom < sc.clientHeight + 200) actions.loadMore(true);
  };
  useEffect(() => {
    const t = window.setTimeout(maybeLoad, 400);
    return () => window.clearTimeout(t);
  }, [model.rows.length, s.active, s.loading]);

  const cellAt = (e: Event): { r: number; c: number; el: HTMLElement } | null => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
    if (!el) return null;
    return { r: Number(el.dataset.r), c: Number(el.dataset.c), el };
  };

  const onMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.rs, .reader')) return;
    const hit = cellAt(e);
    if (!hit) return;
    e.preventDefault();
    scroller.current?.focus({ preventScroll: true });
    actions.select({ r: hit.r, c: hit.c });
  };
  const onDblClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.reader')) return;
    const hit = cellAt(e);
    if (!hit) return;
    if (hit.r === 0) return actions.editHeader(hit.c);
    const col = cols[hit.c];
    if (col?.key === 'text') actions.toggleReader();
    else actions.openCurrent();
  };
  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.lnk') || t.closest('.schip')) {
      const hit = cellAt(e);
      if (hit) {
        actions.select({ r: hit.r, c: hit.c });
        actions.openCurrent();
      }
    }
  };
  const onMove = (e: MouseEvent) => {
    // Cell notes (black corner triangle): show the note box beside the cell, like Sheets.
    const cellEl = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
    if (cellEl?.querySelector('.note')) {
      const r0 = Number(cellEl.dataset.r);
      const c0 = Number(cellEl.dataset.c);
      const key = `${r0}:${c0}`;
      if (note?.key !== key) {
        const row = model.rows[r0 - 1];
        const text = row ? cellNote(row, cols[c0]) : undefined;
        const wrap = scroller.current!.parentElement!.getBoundingClientRect();
        const r = cellEl.getBoundingClientRect();
        let x = r.right - wrap.left + 2;
        if (x + 230 > wrap.width) x = r.left - wrap.left - 232;
        if (text) setNote({ x, y: r.top - wrap.top, text, key });
      }
    } else if (note) setNote(null);
    if (!s.settings.showPreviews || s.boss) return hover && setHover(null);
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.schip');
    if (!chip) return hover && hideHoverSoon();
    keepHover();
    const hit = cellAt(e);
    const row = hit ? model.rows[hit.r - 1] : undefined;
    const media = row?.post?.media ?? [];
    const items = media
      .map((x) => ({ src: x.kind === 'video' ? x.full || '' : x.src, alt: x.alt, video: x.kind === 'video', vkey: x.vkey }))
      .filter((x) => x.src || x.vkey);
    if (!row?.post || !items.length) return;
    const key = `${s.active}:${row.key}`;
    if (hover?.key === key) return;
    const wrap = scroller.current!.parentElement!.getBoundingClientRect();
    const r = chip.getBoundingClientRect();
    let x = r.left - wrap.left;
    if (x + 344 > wrap.width) x = wrap.width - 348;
    // Flush against the chip (no gap); flip above when there isn't room below.
    const below = wrap.bottom - r.bottom, above = r.top - wrap.top;
    const place = below >= 300 || below >= above ? { top: r.bottom - wrap.top } : { bottom: wrap.bottom - r.top };
    setHover({ key, x, ...place, media, items, index: 0, code: row.post.code });
  };

  const startResize = (e: MouseEvent, col: Column) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = col.width;
    const move = (ev: MouseEvent) => actions.setColWidth(col.key, w0 + (ev.clientX - x0) / zoom);
    const up = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
    };
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
  };

  const readerRow = s.reading ? model.rows[s.reading.r - 1] : undefined;
  const readerCol = s.reading ? cols[s.reading.c] : undefined;
  const readerText = s.reading?.r === 0 ? readerCol?.header ?? '' : readerRow && readerCol ? cellFull(readerRow, readerCol) : '';

  return (
    <div class="grid-wrap">
      <div
        class="grid"
        ref={scroller}
        tabIndex={0}
        onScroll={() => {
          if (hover) setHover(null);
          if (note) setNote(null);
          maybeLoad();
        }}
        onMouseDown={onMouseDown}
        onDblClick={onDblClick}
        onClick={onClick}
        onMouseMove={onMove}
        onMouseLeave={() => {
          if (hover) hideHoverSoon();
          setNote(null);
        }}
      >
        <div class="sheet" ref={sheet} style={{ width: `${width}px`, zoom }}>
          <div class="colhdr" style={{ width: `${width}px` }}>
            <div class="corner" />
            {cols.map((c, i) => (
              <div class={`ch ${sel.c === i ? 'on' : ''}`} style={{ width: `${c.width}px` }}>
                {colLetter(i)}
                <div class="rs" onMouseDown={(e) => startResize(e, c)} />
              </div>
            ))}
          </div>
          <HeaderRow cols={cols} sel={sel} editing={s.editingHeader} />
          {model.rows.map((row, i) => (
            <DataRow key={row.key} row={row} r={i + 1} cols={cols} sel={sel} />
          ))}
          {Array.from({ length: totalRows - model.rows.length }, (_, i) => {
            const r = model.rows.length + 1 + i;
            return <FillerRow key={`f${r}`} r={r} cols={cols} sel={sel} />;
          })}
          <div class="add-rows" style={{ width: `${width}px` }}>
            <button class="btn" onClick={() => actions.loadMore()}>Add</button>
            <div class="cnt">1000</div>
            <span>more rows at bottom</span>
          </div>
          {reader && s.reading && (
            <div
              class="reader"
              style={{ left: `${reader.left}px`, top: `${reader.top}px`, width: `${reader.width}px`, maxHeight: `${Math.round(window.innerHeight * 0.55)}px` }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {readerText}
            </div>
          )}
        </div>
      </div>
      {note && !s.boss && (
        <div class="notecard" style={{ left: `${note.x}px`, top: `${note.y}px` }}>{note.text}</div>
      )}
      {hover && (
        <HoverCard
          h={hover}
          onEnter={keepHover}
          onLeave={hideHoverSoon}
          onIndex={(index) => setHover({ ...hover, index })}
          onOpen={() => {
            setHover(null);
            actions.openMedia(hover.media, hover.index, hover.code);
          }}
        />
      )}
    </div>
  );
}

function HoverCard({ h, onEnter, onLeave, onIndex, onOpen }: {
  h: Hover;
  onEnter: () => void;
  onLeave: () => void;
  onIndex: (i: number) => void;
  onOpen: () => void;
}) {
  const cur = h.items[h.index];
  const n = h.items.length;
  const step = (e: MouseEvent, d: number) => {
    e.stopPropagation();
    onIndex((h.index + d + n) % n);
  };
  const pos: Record<string, string> = { left: `${h.x}px` };
  if (h.top != null) pos.top = `${h.top}px`;
  if (h.bottom != null) pos.bottom = `${h.bottom}px`;
  return (
    <div class="hovercard" style={pos} onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseDown={(e) => e.stopPropagation()}>
      <div class="hc-main" title="Open viewer" onClick={onOpen}>
        {cur.video && cur.vkey ? (
          <VideoMirror key={cur.vkey} vkey={cur.vkey} code={h.code} poster={cur.src || undefined} compact />
        ) : (
          <img src={cur.src} referrerpolicy="origin-when-cross-origin" />
        )}
        {n > 1 && (
          <>
            <button class="hc-nav prev" title="Previous" onClick={(e) => step(e, -1)}><I n="chevronLeft" /></button>
            <button class="hc-nav next" title="Next" onClick={(e) => step(e, 1)}><I n="chevronRight" /></button>
            <span class="hc-count">{h.index + 1} / {n}</span>
          </>
        )}
      </div>
      {n > 1 && (
        <div class="hc-strip">
          {h.items.map((it, i) => (
            <button class={`hc-thumb ${i === h.index ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onIndex(i); }}>
              {it.src ? <img src={it.src} referrerpolicy="origin-when-cross-origin" /> : <span class="lb-noimg" />}
              {it.video && <I n="playCircle" />}
            </button>
          ))}
        </div>
      )}
      {cur.alt && <div class="cap">{cur.alt}</div>}
    </div>
  );
}

function HeaderEditor({ value }: { value: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      class="hdr-edit"
      defaultValue={value}
      spellcheck={false}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          actions.commitHeader((e.target as HTMLInputElement).value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          actions.commitHeader(null);
        }
      }}
      onBlur={(e) => actions.commitHeader((e.target as HTMLInputElement).value)}
    />
  );
}

function HeaderRow({ cols, sel, editing }: { cols: Column[]; sel: { r: number; c: number }; editing?: number }) {
  return (
    <div class="r frozen" data-row={0}>
      <div class={`rh ${sel.r === 0 ? 'on' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 0 }}>1</div>
      {cols.map((c, i) => (
        <div
          class={`c hc ${c.header ? '' : 'blank'} ${sel.r === 0 && sel.c === i ? 'sel' : ''}`}
          style={{ width: `${c.width}px` }}
          data-r={0}
          data-c={i}
          title={c.header && editing !== i ? 'Double-click to rename' : undefined}
        >
          {editing === i ? <HeaderEditor value={c.header} /> : c.header}
        </div>
      ))}
    </div>
  );
}

function DataRow({ row, r, cols, sel }: { row: SheetRow; r: number; cols: Column[]; sel: { r: number; c: number } }) {
  return (
    <div class="r" data-row={r}>
      <div class={`rh ${sel.r === r ? 'on' : ''}`}>{r + 1}</div>
      {cols.map((c, i) => {
        const isSel = sel.r === r && sel.c === i;
        const cls = ['c'];
        if (c.wrap) cls.push('wrap');
        if (c.align === 'right') cls.push('right');
        if (c.align === 'center') cls.push('center');
        if (row.tone === 'muted') cls.push('muted');
        if (row.tone === 'strong' && c.key === 'text') cls.push('strong');
        if (isSel) cls.push('sel');
        return (
          <div class={cls.join(' ')} style={{ width: `${c.width}px` }} data-r={r} data-c={i}>
            <CellBody row={row} col={c} />
          </div>
        );
      })}
    </div>
  );
}

function CellBody({ row, col }: { row: SheetRow; col: Column }) {
  if (col.key.startsWith('_')) return null;
  const text = cellDisplay(row, col);
  const note = cellNote(row, col);
  if (col.kind === 'chip') {
    if (!text) return <span class="ddcell"><I n="dropDown" /></span>;
    const [bg, fg] = chipColor(text);
    return (
      <span class="chip" style={{ background: bg, color: fg }}>
        <span>{text}</span>
        <I n="dropDown" />
      </span>
    );
  }
  if (col.kind === 'media') {
    if (!text) return null;
    const vid = row.post?.media[0]?.kind === 'video';
    const isLink = !row.post?.media.length && !!row.post?.link;
    return (
      <span class={`schip ${isLink ? 'link' : ''}`}>
        <I n={isLink ? 'link' : vid ? 'playCircle' : 'image'} />
        <span>{text}</span>
      </span>
    );
  }
  if (col.kind === 'link' && text) return <span class="lnk">{text}</span>;
  return (
    <>
      {col.wrap ? <div class="clamp">{text}</div> : text}
      {note && <span class="note" />}
    </>
  );
}

function FillerRow({ r, cols, sel }: { r: number; cols: Column[]; sel: { r: number; c: number } }) {
  return (
    <div class="r" data-row={r}>
      <div class={`rh ${sel.r === r ? 'on' : ''}`}>{r + 1}</div>
      {cols.map((c, i) => (
        <div class={`c ${sel.r === r && sel.c === i ? 'sel' : ''}`} style={{ width: `${c.width}px` }} data-r={r} data-c={i}>
          {c.kind === 'chip' && <span class="ddcell"><I n="dropDown" /></span>}
        </div>
      ))}
    </div>
  );
}
