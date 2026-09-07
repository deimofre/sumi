#!/usr/bin/env node
// ============================================================
// 掠れの検証: 墨容量を超える長さのストロークを引き、区間ごとの被覆率と「F と紙の高さの相関」を表にする。
//   node tools/regress/stroke.mjs [--out DIR] [--pressure 0.9] [--frames 120] [--set key=value ...]
// 見るもの: coverage が後半ほど下がる (墨切れ)、corr が正 (筋が紙の高い所と一致) で後半ほど大きい
// ============================================================
import { argValue, capture, root, savePng, serve } from './lib.mjs';

const args = process.argv.slice(2);
const outDir = argValue(args, '--out');
const pressure = argValue(args, '--pressure') ?? '0.9';
const frames = argValue(args, '--frames') ?? '120';   // 少ないほど速い払い (120 で約 0.7 短辺/秒)
const sets = args.flatMap((a, i) => a === '--set' ? [args[i + 1].replace('=', ':')] : []);

const head = await serve(root, 5194);
let ok = false;
try {
  const res = capture(head.url + `tools/regress/harness-stroke.html?pressure=${pressure}&frames=${frames}&set=` + encodeURIComponent(sets.join(',')));
  console.log(`size ${res.size}, glError ${res.glError}, pressure ${res.pressure}, invalid pixels ${JSON.stringify(res.invalid)}, bright(>245) ${res.bright}, maxR ${res.maxR}`);
  console.log('  along  coverage  meanF   corr(F,height)');
  for (const s of res.segments) console.log(`  ${s.x.toFixed(2)}   ${s.coverage.toFixed(2)}      ${s.meanF.toFixed(3)}   ${s.corr.toFixed(2)}`);
  savePng(res.png, outDir, 'stroke.png');
  ok = res.glError === 0;
} finally {
  head.child.kill();
}
process.exit(ok ? 0 : 1);
