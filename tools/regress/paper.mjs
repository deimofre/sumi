#!/usr/bin/env node
// ============================================================
// paper モードの検証: 一点に 1.5 秒とどまって放したときの、にじみの広がりと縁の濃さを時系列で表にする。
//   node tools/regress/paper.mjs [--out DIR] [--set key=value ...]
//   --out DIR   最終フレームの PNG (paper-normal.png / paper-fixed.png) を書き出す
//   --set k=v   PAPER の数値パラメータを上書き (例: --set diffusion=0.7 --set evapRate=0.3)
// 見るもの: wetR (W > 0.05 の半径) が伸びて止まること、乾いた後の F が中心より縁で濃いこと
// ============================================================
import { argValue, capture, root, savePng, serve } from './lib.mjs';

const args = process.argv.slice(2);
const outDir = argValue(args, '--out');
const sets = args.flatMap((a, i) => a === '--set' ? [args[i + 1].replace('=', ':')] : []);

const head = await serve(root, 5193);
let ok = false;
try {
  const res = capture(head.url + 'tools/regress/harness-paper.html?set=' + encodeURIComponent(sets.join(',')));
  const { bin } = res;
  console.log(`size ${res.size}, glError ${res.glError}, overrides ${JSON.stringify(res.overrides)}`);
  console.log('  t(s)  wetR  inkR  Fc     Fpeak  @r    ring  pigment(F+P)');
  const radiusWhere = (arr, th) => { let r = 0; arr.forEach((v, i) => { if (v > th) r = (i + 0.5) * bin; }); return r; };
  for (const c of res.checkpoints) {
    const wetR = radiusWhere(c.water, 0.05);
    const inkR = radiusWhere(c.fixed.map((v, i) => v + c.pigment[i]), 0.02);
    const Fc = (c.fixed[0] + c.fixed[1] + c.fixed[2]) / 3;
    let Fpeak = 0, rPeak = 0;
    c.fixed.forEach((v, i) => { if ((i + 0.5) * bin > 4 && v > Fpeak) { Fpeak = v; rPeak = (i + 0.5) * bin; } });
    // 顔料の総量 (F + P を面積で重み付け)。定着しても増減しないはず
    const total = c.fixed.reduce((s, v, i) => s + (v + c.pigment[i]) * 2 * Math.PI * (i + 0.5) * bin * bin, 0);
    console.log(`${c.t.toFixed(2).padStart(6)} ${String(wetR).padStart(5)} ${String(inkR).padStart(5)}  ${Fc.toFixed(3)}  ${Fpeak.toFixed(3)}  ${String(rPeak).padStart(4)}  ${(Fc > 0 ? Fpeak / Fc : 0).toFixed(2)}  ${total.toFixed(0)}`);
  }
  if (args.includes('--raw')) for (const c of res.checkpoints) {
    if (![1.5, 2.5, 6.5, 20].includes(Number(c.t.toFixed(1)))) continue;
    const fmt = a => a.slice(0, 20).map(v => v.toFixed(3)).join(' ');
    console.log(`raw t=${c.t.toFixed(1)} (r = 1,3,5,...39px)\n  W: ${fmt(c.water)}\n  P: ${fmt(c.pigment)}\n  F: ${fmt(c.fixed)}`);
  }
  const last = res.checkpoints[res.checkpoints.length - 1];
  console.log('final F profile (r → F):', last.fixed.slice(0, 30).map((v, i) => `${(i + 0.5) * bin}:${v.toFixed(2)}`).join(' '));
  savePng(res.pngNormal, outDir, 'paper-normal.png'); savePng(res.pngFixed, outDir, 'paper-fixed.png'); savePng(res.pngWet, outDir, 'paper-wet.png');
  ok = res.glError === 0;
} finally {
  head.child.kill();   // process.exit は finally の後で (try の中で exit すると vite が残る)
}
process.exit(ok ? 0 : 1);
