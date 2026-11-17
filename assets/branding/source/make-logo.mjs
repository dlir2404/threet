#!/usr/bin/env node
// Builds a "spreadsheet icon drawn with Threads glyphs" (micrography) as SVG.
//   node assets/branding/source/make-logo.mjs assets/branding/source/threads-glyph.svg <out.svg> --across 13 [--aligned] [--tonal] [--clip]
// --aligned: square grid whose lines fall exactly on the table edges (use across = 13 or 26),
//            glyphs clipped at the outline, so curves/diagonals stay crisp and no glyph is cut at the table.
// The threet logo is: --across 13 --aligned --fill 0.88 --weight 60 --bare
// Geometry follows the sheet silhouette used for the extension favicon (viewBox 26x36 page).
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const [glyphFile, out] = args;
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const across = Number(opt('across', 9));
const tonal = args.includes('--tonal');
// --bare: transparent background and a tight square viewBox (for icons and the README).
const bare = args.includes('--bare');
// --inverse: solid Sheets-green shapes with lighter glyphs (reads as the solid icon when small).
const inverse = args.includes('--inverse');
// Default: a glyph is placed only if it fits entirely inside one region (true micrography:
// the outline is drawn by the glyphs). --clip instead keeps partial glyphs, cut at the outline.
const aligned = args.includes('--aligned');
// --fill: glyph width as a fraction of the grid pitch (denser = shape reads more solid).
// --weight: extra stroke (in glyph units) to thicken the glyph lines.
const fillRatio = Number(opt('fill', aligned ? 0.8 : 0.86));
const weight = Number(opt('weight', 0));
const clip = aligned || args.includes('--clip');

const g = readFileSync(glyphFile, 'utf8');
const [, gw, gh] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(g);
const gd = /<path d="([^"]+)"/.exec(g)[1];

const GREEN = inverse ? '#5FCB8F' : '#0F9D58', FOLD = inverse ? '#C9EBD7' : '#6CC197';
const BASE = inverse ? '#0F9D58' : '#CEEAD6', FOLD_BASE = inverse ? '#87CEAC' : '#E3F4EA';
// Regions (page coords): body = page minus fold corner minus table frame (+ the four cells).
const inFold = (x, y) => x >= 17 && y <= 9 && y >= x - 17;
const inPage = (x, y) => x >= 0 && x <= 26 && y >= 0 && y <= 36 && !(x > 17 && y < x - 17);
const inTable = (x, y) => x >= 6 && x <= 20 && y >= 16 && y <= 28;
const cells = [[7.6, 17.6], [13.8, 17.6], [7.6, 21.8], [13.8, 21.8]].map(([x, y]) => [x, y, x + 4.6, y + 2.6]);
const inCell = (x, y) => cells.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);
const regionOf = (x, y) => {
  if (!inPage(x, y)) return null;
  if (inFold(x, y)) return 'fold';
  if (inTable(x, y)) return inCell(x, y) ? 'body' : null;
  return 'body';
};

const pitch = 26 / across;
const gwN = pitch * fillRatio, ghN = gwN * (gh / gw);
const rowPitch = aligned ? pitch : ghN * 1.06;
const uses = { body: [], fold: [] };
// The four cells are small: give them their own finer grid so each holds glyphs.
const place = (x0, y0, x1, y1, pw, ph, w, h, test) => {
  for (let y = y0 + ph / 2; y < y1; y += ph) for (let x = x0 + pw / 2; x < x1; x += pw) {
    const r = test(x, y);
    // Whole glyph must sit in the same region (unless clipping).
    const fits = clip || [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]].every(([dx, dy]) => test(x + dx, y + dy) === r);
    if (r && fits) uses[r].push(`<use href="#g" x="${(x - w / 2).toFixed(3)}" y="${(y - h / 2).toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}"/>`);
  }
};
place(0, 0, 26, 36, pitch, rowPitch, gwN, ghN, (x, y) => (inTable(x, y) ? null : regionOf(x, y)));
for (const [a, b, c, d] of cells) {
  const n = Math.max(1, Math.round((c - a) / pitch));
  const pw = (c - a) / n, w = pw * 0.86, h = w * (gh / gw);
  const m = Math.max(1, Math.round((d - b) / (h * 1.06)));
  place(a, b, c, d, pw, (d - b) / m, w, Math.min(h, ((d - b) / m) * 0.94), () => 'body');
}

const page = 'M2.4 0H17l9 9v24.6A2.4 2.4 0 0 1 23.6 36H2.4A2.4 2.4 0 0 1 0 33.6V2.4A2.4 2.4 0 0 1 2.4 0z';
const fold = 'M17 0l9 9h-6.6A2.4 2.4 0 0 1 17 6.6z';
const body = `${page}M6 16h14v12H6z${cells.map(([a, b, c, d]) => `M${a} ${b}H${c}V${d}H${a}z`).join('')}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bare ? '-5 0 36 36' : '-7 -2 40 40'}" width="1024" height="1024">
<defs>
  <symbol id="g" viewBox="0 0 ${gw} ${gh}" preserveAspectRatio="xMidYMid meet"><path d="${gd}" fill-rule="evenodd"${weight ? ` stroke="currentColor" stroke-width="${weight}" stroke-linejoin="round"` : ''}/></symbol>
  <clipPath id="cb"><path d="${body}" fill-rule="evenodd" clip-rule="evenodd"/></clipPath>
  <clipPath id="cf"><path d="${page}"/></clipPath>
</defs>
${bare ? '' : '<rect x="-7" y="-2" width="40" height="40" fill="#fff"/>'}
${tonal || inverse ? `<path d="${body}" fill="${BASE}" fill-rule="evenodd"/><path d="${fold}" fill="${FOLD_BASE}"/>` : ''}
<g fill="${GREEN}" color="${GREEN}"${clip ? ' clip-path="url(#cb)"' : ''}>${uses.body.join('')}</g>
<g fill="${FOLD}" color="${FOLD}"${clip ? ' clip-path="url(#cf)"' : ''}>${uses.fold.join('')}</g>
</svg>`;
writeFileSync(out, svg);
console.log(out, 'glyphs:', uses.body.length + uses.fold.length);
