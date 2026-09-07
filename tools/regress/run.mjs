#!/usr/bin/env node
// ============================================================
// fluid モードの回帰確認。
// 基準コミット (モード分割前) を worktree に出し、今の作業ツリーと同じポインタ列・同じ乱数で動かして、
// 25 か所の表示スナップショットのハッシュを比べる。全部一致すれば fluid の見た目は変わっていない。
// あわせてモード切替 (fluid → paper → fluid) で状態が消え、GL エラーが出ないことも見る。
//   node tools/regress/run.mjs [--out DIR] [--self-check]
//   --out DIR      最終フレームの PNG を old.png / new.png として書き出す
//   --self-check   基準を 2 回走らせ、ハーネス自体が決定的か確かめる
// 前提: macOS の Google Chrome (headless)。両方のツリーを vite の CLI で配信する
// ============================================================
import { cpSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argValue, capture, git, root, savePng, serve } from './lib.mjs';

const BASE_COMMIT = '790b12e';   // fluid の見た目の基準: モード分割前の初回コミット
const here = join(root, 'tools/regress');
const work = join(tmpdir(), 'sumi-regress-base');
const args = process.argv.slice(2);
const outDir = argValue(args, '--out');
const selfCheck = args.includes('--self-check');

function prepareBase() {
  if (existsSync(work)) git('worktree', 'remove', '--force', work);
  git('worktree', 'prune');
  git('worktree', 'add', '--detach', work, BASE_COMMIT);
  symlinkSync(join(root, 'node_modules'), join(work, 'node_modules'));   // vite と plugin を使い回す
  mkdirSync(join(work, 'tools/regress'), { recursive: true });
  for (const f of ['shared.ts', 'harness-old.ts', 'harness-old.html']) cpSync(join(here, f), join(work, 'tools/regress', f));
}
function compare(label, a, b) {
  const keys = Object.keys(a.hashes);
  const bad = keys.filter(k => a.hashes[k] !== b.hashes[k]);
  console.log(`${label}: size ${a.size} vs ${b.size}, glError ${a.glError} / ${b.glError}, ${keys.length - bad.length}/${keys.length} snapshots identical`);
  for (const k of bad) console.log(`  MISMATCH ${k}: ${a.hashes[k]} vs ${b.hashes[k]}`);
  return bad.length === 0 && a.size.join() === b.size.join() && a.glError === 0 && b.glError === 0;
}

prepareBase();
const servers = [];
let ok = false;
try {
  const base = await serve(work, 5190), head = await serve(root, 5191);
  servers.push(base.child, head.child);
  const baseUrl = base.url + 'tools/regress/harness-old.html', headUrl = head.url + 'tools/regress/harness-new.html';
  const baseRes = capture(baseUrl);
  ok = true;
  if (selfCheck) ok = compare('base vs base (self-check)', baseRes, capture(baseUrl)) && ok;
  const headRes = capture(headUrl);
  ok = compare('base vs head', baseRes, headRes) && ok;
  savePng(baseRes.png, outDir, 'old.png'); savePng(headRes.png, outDir, 'new.png');

  // モード切替: fluid → paper → fluid で墨が消え、基準の初期表示 (f0) に戻ること。切替で GL エラーが出ないこと
  const sw = capture(head.url + 'tools/regress/harness-switch.html').steps;
  const errs = ['err0', 'err1', 'err2', 'err3', 'err4'].map(k => sw[k]);
  const swOk = sw.fresh === baseRes.hashes.f0 && sw.back === sw.fresh && sw.inked !== sw.fresh
            && sw.paper !== sw.fresh && sw.paper2 !== sw.paper && errs.every(e => e === 0);
  console.log(`mode switch: fresh=${sw.fresh} inked=${sw.inked} paper=${sw.paper} back=${sw.back} paper2=${sw.paper2} glErrors=[${errs}] → ${swOk ? 'ok' : 'NG'}`);
  ok = swOk && ok;
} finally {
  for (const c of servers) c.kill();
  git('worktree', 'remove', '--force', work);
}
console.log(ok ? 'PASS: fluid mode is unchanged' : 'FAIL: fluid mode differs from base');
process.exit(ok ? 0 : 1);
