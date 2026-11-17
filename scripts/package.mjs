// Package a freshly built production extension. Requires the `zip` command.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert.match(version, /^\d+\.\d+\.\d+$/, 'Use a numeric x.y.z extension version');
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
assert.equal(manifest.version, version);
assert.equal(manifest.name, 'threet');
assert.deepEqual(manifest.permissions, ['storage', 'declarativeNetRequestWithHostAccess']);
for (const file of ['content.js', 'background.js', 'rules.json', ...[16, 32, 48, 128].map((n) => `icons/icon-${n}.png`)]) {
  assert.ok(readFileSync(join(dist, file)).length, `${file} must not be empty`);
}

copyFileSync(join(root, 'LICENSE'), join(dist, 'LICENSE'));
copyFileSync(join(root, 'README.md'), join(dist, 'README.md'));
mkdirSync(join(dist, 'licenses'), { recursive: true });
for (const [pkg, name] of [
  ['preact', 'preact'],
  ['@fontsource/google-sans', 'google-sans'],
  ['@material-symbols/svg-400', 'material-symbols'],
]) {
  copyFileSync(join(root, 'node_modules', pkg, 'LICENSE'), join(dist, 'licenses', `${name}.txt`));
}

const output = join(root, 'build', 'release');
mkdirSync(output, { recursive: true });
const archive = join(output, `threet-v${version}.zip`);
// zip updates existing archives; remove the old one so stale entries cannot survive.
rmSync(archive, { force: true });
const result = spawnSync('zip', ['-q', '-r', archive, '.'], { cwd: dist, stdio: 'inherit' });
if (result.error) throw result.error;
assert.equal(result.status, 0, 'ZIP packaging failed');
console.log(`[threet] packaged → ${archive}`);
