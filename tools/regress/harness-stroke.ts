// 掠れの検証: 筆圧一定で墨容量を超える長さのストロークを引き、区間ごとに
//   coverage = 筆の帯の中で墨が付いた画素の割合 (後半ほど下がるはず)
//   corr     = F と紙の高さの相関 (筋が高い所と一致するなら正で、後半ほど大きくなるはず)
// を測る。URL の ?set=key:value で PAPER の数値パラメータを上書きできる
import { createApp } from '../../src/app/app.ts';
import { PAPER, type View } from '../../src/paper/params.ts';
import { dispatch, DT } from './shared.ts';

const url = new URL(location.href);
for (const kv of (url.searchParams.get('set') ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  if (k && v !== undefined && k in PAPER && typeof PAPER[k as keyof typeof PAPER] === 'number') (PAPER as unknown as Record<string, number>)[k] = Number(v);
}
const canvas = document.getElementById('gl') as HTMLCanvasElement;
canvas.setPointerCapture = () => {};
const created = createApp(canvas, 'paper');
if (!created) throw new Error('WebGL2 float unavailable');
const app = created;
const { gl } = app.ctx;
const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
PAPER.viewScale = 0.25;

const pressure = Number(url.searchParams.get('pressure') ?? 0.9);
const x0 = canvas.clientWidth * 0.08, x1 = canvas.clientWidth * 0.92, y = canvas.clientHeight * 0.5;
const N = Number(url.searchParams.get('frames') ?? 120);   // ストロークのフレーム数 (少ないほど速い払い)
let time = 0;
for (let f = 0; f <= 250; f++) {
  const ms = f * 1000 / 60;
  if (f === 5) dispatch(canvas, { type: 'down', x: x0, y, pressure, t: ms });
  else if (f > 5 && f <= 5 + N) dispatch(canvas, { type: 'move', x: x0 + (x1 - x0) * (f - 5) / N, y, pressure, t: ms });
  else if (f === 6 + N) dispatch(canvas, { type: 'up', x: x1, y, pressure: 0, t: ms });
  time += DT; app.frame(DT, time);
}

const buf = new Uint8Array(W * H * 4);
function readView(view: View, decodeSqrt: boolean): Float32Array {
  PAPER.view = view; app.mode.frame([], 0, time);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const out = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const v = buf[i * 4]! / 255; out[i] = decodeSqrt ? v * v / PAPER.viewScale : v; }
  return out;
}
const F = readView('fixed', true), Hh = readView('height', false);
// 診断: 負・NaN の画素数と、通常表示で紙より明るい画素数 (どちらも 0 のはず)
const bad = readView('invalid', false);
let invalid = 0; for (let i = 0; i < W * H; i++) if (bad[i]! > 0.5) invalid++;
let invalidP = 0, invalidW = 0; for (let i = 0; i < W * H; i++) { if (buf[i * 4 + 1]! > 127) invalidP++; if (buf[i * 4 + 2]! > 127) invalidW++; }
PAPER.view = 'paper'; app.mode.frame([], 0, time);
gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
let bright = 0, maxR = 0; for (let i = 0; i < W * H; i++) { const r = buf[i * 4]!; if (r > maxR) maxR = r; if (r > 245) bright++; }
const png = canvas.toDataURL('image/png');

// 帯: 筆の半径ぶん上下 (readPixels は下が先頭なので y を反転)
const band = Math.round(PAPER.brushRadius * Math.min(W, H));
const cy = H - Math.round(y * (H / canvas.clientHeight));
const SEG = 8;
const segments: { x: number; coverage: number; meanF: number; corr: number }[] = [];
for (let sIdx = 0; sIdx < SEG; sIdx++) {
  const xa = Math.round((x0 + (x1 - x0) * sIdx / SEG) * (W / canvas.clientWidth)), xb = Math.round((x0 + (x1 - x0) * (sIdx + 1) / SEG) * (W / canvas.clientWidth));
  let n = 0, covered = 0, sf = 0, sh = 0, sff = 0, shh = 0, sfh = 0;
  for (let yy = cy - band; yy <= cy + band; yy++) for (let xx = xa; xx < xb; xx++) {
    const i = yy * W + xx, f = F[i]!, h = Hh[i]!;
    n++; if (f > 0.03) covered++;
    sf += f; sh += h; sff += f * f; shh += h * h; sfh += f * h;
  }
  const mf = sf / n, mh = sh / n;
  const cov = sfh / n - mf * mh, vf = sff / n - mf * mf, vh = shh / n - mh * mh;
  segments.push({ x: (sIdx + 0.5) / SEG, coverage: covered / n, meanF: mf, corr: vf > 0 && vh > 0 ? cov / Math.sqrt(vf * vh) : 0 });
}
const result = { size: [W, H], glError: gl.getError(), pressure, frames: N, segments, invalid: { F: invalid, P: invalidP, W: invalidW }, bright, maxR, png };
document.getElementById('out')!.textContent = '@@RESULT@@' + btoa(unescape(encodeURIComponent(JSON.stringify(result)))) + '@@END@@';
