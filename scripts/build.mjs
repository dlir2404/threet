#!/usr/bin/env node
// Builds the extension with esbuild.
//   node scripts/build.mjs            -> dist/      (production: no debug bridge, no debugger permission)
//   node scripts/build.mjs --dev      -> dist-dev/  (debug bridge to the threet-debug MCP server)
//   add --watch to rebuild on change
import { context, build } from 'esbuild';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const watch = process.argv.includes('--watch');
const out = join(root, dev ? 'dist-dev' : 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

export const DEV_PORT = Number(process.env.THREET_DEV_PORT ?? 47321);
const tokenFile = join(root, '.threet-dev-token');
let token = '';
if (dev) {
  if (!existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(18).toString('hex') + '\n', { mode: 0o600 });
  token = readFileSync(tokenFile, 'utf8').trim();
}

// ---- fonts: Google Sans (OFL, via @fontsource) — latin, latin-ext, vietnamese; 400/500/700 ----
function prepareFonts() {
  const fsDir = join(root, 'node_modules/@fontsource/google-sans');
  const subsets = ['latin', 'latin-ext', 'vietnamese'];
  const weights = [400, 500, 700];
  let css = '';
  mkdirSync(join(out, 'fonts'), { recursive: true });
  for (const sub of subsets) {
    for (const w of weights) {
      const file = `google-sans-${sub}-${w}-normal.woff2`;
      copyFileSync(join(fsDir, 'files', file), join(out, 'fonts', file));
      const src = readFileSync(join(fsDir, `${sub}-${w}.css`), 'utf8');
      const range = /unicode-range:\s*([^;]+);/.exec(src)?.[1] ?? '';
      css += `@font-face{font-family:'Google Sans';font-style:normal;font-weight:${w};font-display:swap;src:url(__FONT_BASE__${file}) format('woff2');${range ? `unicode-range:${range};` : ''}}\n`;
    }
  }
  mkdirSync(join(root, 'build'), { recursive: true });
  writeFileSync(join(root, 'build/fonts.css'), css);
}

const ICON_SIZES = [16, 32, 48, 128];
const ICONS = Object.fromEntries(ICON_SIZES.map((s) => [String(s), `icons/icon-${s}.png`]));

function copyIcons() {
  mkdirSync(join(out, 'icons'), { recursive: true });
  for (const s of ICON_SIZES) copyFileSync(join(root, 'assets/icons', `icon-${s}.png`), join(out, 'icons', `icon-${s}.png`));
}

// Supported sites and their domains: shared with the extension code (src/sites/hosts.json).
const SITES = JSON.parse(readFileSync(join(root, 'src/sites/hosts.json'), 'utf8'));

function manifest() {
  const matches = Object.values(SITES).flatMap((s) => s.domains.map((d) => `*://*.${d}/*`));
  const m = {
    manifest_version: 3,
    name: dev ? 'threet (dev)' : 'threet',
    version: pkg.version,
    description: pkg.description,
    permissions: ['storage', 'declarativeNetRequestWithHostAccess', ...(dev ? ['debugger', 'tabs', 'alarms'] : [])],
    // Detail sheets load the page in a hidden same-origin iframe (see src/content/frames.ts).
    // Sites like Threads refuse to be framed (X-Frame-Options: DENY, and Threads answers
    // Sec-Fetch-Dest: iframe with an error page), so for sub-frames a supported site opens on
    // itself we drop the header and present the request as a document. Other sites still can't frame it.
    declarative_net_request: { rule_resources: [{ id: 'self_frame', enabled: true, path: 'rules.json' }] },
    host_permissions: matches,
    background: { service_worker: 'background.js' },
    icons: ICONS,
    action: { default_title: dev ? 'threet (dev) — toggle sheet' : 'threet — toggle sheet', default_icon: ICONS },
    content_scripts: [{ matches, js: ['content.js'], run_at: 'document_start' }],
    web_accessible_resources: [{ resources: ['fonts/*'], matches }],
  };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(m, null, 2));
  // One rule per site that opens its own detail pages in iframes (sites/<id> with selfFrame).
  const rules = Object.values(SITES)
    .filter((s) => s.selfFrame)
    .map((s, i) => ({
      id: i + 1,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [{ header: 'x-frame-options', operation: 'remove' }],
        requestHeaders: [{ header: 'sec-fetch-dest', operation: 'set', value: 'document' }],
      },
      condition: { requestDomains: s.domains, initiatorDomains: s.domains, resourceTypes: ['sub_frame'] },
    }));
  writeFileSync(join(out, 'rules.json'), JSON.stringify(rules, null, 2));
}

const common = {
  bundle: true,
  target: 'chrome120',
  logLevel: 'info',
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
  legalComments: 'none',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.svg': 'text', '.css': 'text' },
  define: {
    __DEV__: String(dev),
    __DEV_TOKEN__: JSON.stringify(token),
    __DEV_PORT__: String(DEV_PORT),
    // Cache entries are tied to the build that parsed them (parser fixes shouldn't be masked by old rows).
    __BUILD_ID__: JSON.stringify(`${pkg.version}-${Date.now().toString(36)}`),
    'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
  },
};

const entries = [
  { entryPoints: [join(root, 'src/content/index.tsx')], outfile: join(out, 'content.js'), format: 'iife' },
  { entryPoints: [join(root, 'src/background/index.ts')], outfile: join(out, 'background.js'), format: 'iife' },
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
prepareFonts();
copyIcons();
manifest();

if (watch) {
  for (const e of entries) {
    const ctx = await context({ ...common, ...e });
    await ctx.watch();
  }
  console.log(`[threet] watching → ${out}`);
} else {
  await Promise.all(entries.map((e) => build({ ...common, ...e })));
  console.log(`[threet] built → ${out}`);
}
