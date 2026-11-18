import type { Post } from '../shared/types';
import type { State } from './store';
import type { Column } from '../sites/types';
import { site } from './site';
import { bossRows, BOSS_COLUMNS } from './boss';

export type CellKind = NonNullable<Column['kind']>;
export type { Column };

/** Settings key for a per-site column preference (title, width): "threads.text". */
export function prefKey(colKey: string): string {
  return `${site().id}.${colKey}`;
}

/** Index of the main text column: where the selection lands by default. */
export function textColumn(): number {
  return Math.max(0, site().columns.findIndex((c) => c.key === 'text'));
}

export interface SheetRow {
  key: string;
  post?: Post;
  /** Free-form values for rows that are not posts (boss sheet). */
  values?: Record<string, string>;
  no: string;
  depth: number;
  tone?: 'muted' | 'strong';
  /** Row showing the post that the row above quotes. */
  quote?: boolean;
}

/** The post's row, plus a row for the post it quotes (so the quoted post is readable and openable). */
function withQuote(row: SheetRow): SheetRow[] {
  const q = row.post?.quoted;
  if (!q) return [row];
  return [row, { key: `${row.key}>q`, post: q, no: `${row.no}.q`, depth: row.depth + 1, quote: true, tone: row.tone === 'muted' ? 'muted' : undefined }];
}

export interface SheetModel {
  columns: Column[];
  rows: SheetRow[];
  /** Whether "load more" makes sense for this sheet. */
  pageable: boolean;
}

export function colLetter(i: number): string {
  let s = '';
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export function buildModel(s: State): SheetModel {
  if (s.boss) return { columns: BOSS_COLUMNS, rows: bossRows(), pageable: false };
  const tab = s.tabs.find((t) => t.id === s.active);
  const columns = site().columns.map((c) => ({
    ...c,
    width: s.settings.colWidths[prefKey(c.key)] ?? c.width,
    header: s.settings.colTitles?.[prefKey(c.key)] || c.header,
  }));
  if (!tab) return { columns, rows: [], pageable: false };
  if (tab.kind === 'list') {
    const list = s.lists[tab.id];
    const rows: SheetRow[] = [];
    list?.keys.forEach((k, i) => {
      const g = list.groups[k];
      g.posts.forEach((p, j) => {
        rows.push(...withQuote({ key: p.code, post: p, no: j === 0 ? String(i + 1) : `${i + 1}.${j}`, depth: j === 0 ? 0 : 1 }));
      });
    });
    return { columns, rows, pageable: true };
  }
  const trows = (tab.code && s.threads[tab.code]) || [];
  let n = 0;
  const counters: number[] = [];
  const rows = trows.flatMap((r): SheetRow[] => {
    let no: string;
    if (r.ancestor || r.focal) {
      no = String(++n);
      counters.length = 0;
    } else {
      counters.length = r.depth;
      counters[r.depth - 1] = (counters[r.depth - 1] ?? 0) + 1;
      for (let d = 0; d < r.depth - 1; d++) counters[d] ??= 1;
      no = `${n}.${counters.slice(0, r.depth).join('.')}`;
    }
    return withQuote({ key: r.post.code, post: r.post, no: r.post.ordinal ?? no, depth: r.depth, tone: r.ancestor ? 'muted' : r.focal ? 'strong' : undefined });
  });
  return { columns, rows, pageable: true };
}

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mediaLabel(p: Post): string {
  if (!p.media.length) return p.link ? p.link.domain || 'link' : '';
  const imgs = p.media.filter((m) => m.kind === 'image').length;
  const vids = p.media.length - imgs;
  if (p.media.length === 1) return vids ? `VID_${p.code.slice(-4).toUpperCase()}.mp4` : `IMG_${p.code.slice(-4).toUpperCase()}.jpg`;
  const n = (k: number, w: string) => (k ? `${k} ${w}${k > 1 ? 's' : ''}` : '');
  return [n(imgs, 'image'), n(vids, 'video')].filter(Boolean).join(', ');
}

/** Text shown inside the cell. */
export function cellDisplay(row: SheetRow, col: Column): string {
  if (row.values) return row.values[col.key] ?? '';
  const p = row.post;
  if (!p) return '';
  switch (col.key) {
    case 'no': return row.no;
    case 'author': return p.author;
    case 'time': return formatTime(p.time) || p.timeLabel || '';
    case 'topic': return p.topic ?? '';
    case 'text': {
      const indent = row.quote ? '❝ ' : row.depth > 0 ? '↳ ' : '';
      const part = p.part ? `[${p.part}] ` : '';
      // The quoted post has its own row right below, so only point at it here.
      return indent + part + (p.text || (p.media.length ? '(attachment)' : p.quoted ? '' : ''))
        + (p.quoted ? `${p.text ? '\n' : ''}❝ quoting @${p.quoted.author} ↓` : '');
    }
    case 'media': return mediaLabel(p);
    case 'ref': return p.code;
    default: return col.metric ? p.counts[col.metric] ?? '' : '';
  }
}

/** Text shown in the formula bar / reader for the cell (full, untruncated). */
export function cellFull(row: SheetRow, col: Column): string {
  if (row.values) return row.values[col.key] ?? '';
  const p = row.post;
  if (!p) return '';
  switch (col.key) {
    case 'text': {
      let t = p.text;
      if (p.part) t = `[${p.part}] ${t}`;
      if (p.quoted) t += `\n\n❝ @${p.quoted.author} — ${formatTime(p.quoted.time)}\n${p.quoted.text}`;
      if (p.link) t += `\n\n🔗 ${p.link.title} — ${p.link.url}`;
      return t;
    }
    case 'author': return `@${p.author}`;
    case 'media': return p.media.length ? p.media.map((m) => m.alt || m.src).join('\n') : p.link ? `=HYPERLINK("${p.link.url}", "${p.link.title}")` : '';
    case 'ref': return `=HYPERLINK("https://www.threads.com${p.path}")`;
    case 'time': return p.time ? new Date(p.time).toLocaleString() : p.timeLabel ?? '';
    default: return cellDisplay(row, col);
  }
}

/** Badge text rendered as a cell note (the little black triangle). */
export function cellNote(row: SheetRow, col: Column): string | undefined {
  if (col.key !== 'text' || !row.post?.badges.length) return undefined;
  return row.post.badges.join('\n');
}

const CHIP_COLORS = [
  ['#fbcfb4', '#7a3410'], ['#c6e8d2', '#0d5129'], ['#d3e3fd', '#0b3a8c'], ['#fde7a6', '#6b4b00'],
  ['#e8d5f6', '#4f1f7a'], ['#c9ecf2', '#0b4f5c'], ['#f6d0d8', '#7a1630'], ['#e6e6e6', '#3c4043'],
];

export function chipColor(label: string): [string, string] {
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return CHIP_COLORS[h % CHIP_COLORS.length] as [string, string];
}
