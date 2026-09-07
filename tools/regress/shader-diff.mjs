#!/usr/bin/env node
// fluid モードのシェーダーが基準コミットから変わっていないか、#include を展開した全文で比べる。
//   node tools/regress/shader-diff.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_COMMIT = '790b12e';
const root = fileURLToPath(new URL('../..', import.meta.url));
const dir = 'src/shaders';

const readAt = (rev, p) => rev ? execFileSync('git', ['show', `${rev}:${p}`], { cwd: root, encoding: 'utf8' }) : readFileSync(join(root, p), 'utf8');
const expand = (rev, p) => readAt(rev, p).replace(/^[ \t]*#include[ \t]+(\S+)[ \t]*$/gm, (_, inc) => expand(rev, posix.join(posix.dirname(p), inc)));

let same = 0, diff = [];
for (const f of readdirSync(join(root, dir)).filter(f => /\.(frag|vert)$/.test(f)).sort()) {
  const p = posix.join(dir, f);
  if (expand(BASE_COMMIT, p) === expand(null, p)) same++; else diff.push(p);
}
console.log(`${same} shaders identical after include expansion`);
for (const p of diff) {
  console.log(`\nDIFFERS: ${p}`);
  const tmp = mkdtempSync(join(tmpdir(), 'sumi-shader-'));
  writeFileSync(join(tmp, 'base'), expand(BASE_COMMIT, p)); writeFileSync(join(tmp, 'head'), expand(null, p));
  const r = execFileSync('sh', ['-c', `diff -u ${join(tmp, 'base')} ${join(tmp, 'head')} || true`], { encoding: 'utf8' });
  console.log(r.split('\n').slice(2).join('\n'));
}
