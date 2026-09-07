// paper モードの検証: 画面中央に 1.5 秒とどまって放し、水 (W)・移動顔料 (P)・固定顔料 (F) の
// 半径方向プロファイルを時系列で読み取る。にじみが広がって止まり、縁が濃く定着することを数値で確かめる。
// URL の ?set=key:value,key:value で PAPER の数値パラメータを上書きできる (調整用)
import { createApp } from '../../src/app/app.ts';
import { PAPER, type View } from '../../src/paper/params.ts';
import { dispatch, DT } from './shared.ts';

const url = new URL(location.href);
const overrides: Record<string, number> = {};
for (const kv of (url.searchParams.get('set') ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  if (k && v !== undefined && k in PAPER && typeof PAPER[k as keyof typeof PAPER] === 'number') {
    (PAPER as unknown as Record<string, number>)[k] = Number(v); overrides[k] = Number(v);
  }
}

const canvas = document.getElementById('gl') as HTMLCanvasElement;
canvas.setPointerCapture = () => {};
const created = createApp(canvas, 'paper');
if (!created) throw new Error('WebGL2 float unavailable');
const app = created;
const { gl } = app.ctx;
const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
const cx = Math.round(W / 2), cy = Math.round(H / 2);
const MAXR = 160, BIN = 2;
const buf = new Uint8Array(W * H * 4);
PAPER.viewScale = 0.25;   // 1 を超える値も 8bit で読めるよう縮めて描き、読み戻しで戻す

/** 指定の層を表示して読み戻し、中心からの距離 (BIN px 刻み) ごとの平均値を返す */
function profile(view: View): number[] {
  PAPER.view = view; app.mode.frame([], 0, 0);   // dt = 0: 状態を進めずに描き直す
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const n = MAXR / BIN, sum = new Float64Array(n), cnt = new Float64Array(n);
  for (let y = Math.max(0, cy - MAXR); y < Math.min(H, cy + MAXR); y++) {
    for (let x = Math.max(0, cx - MAXR); x < Math.min(W, cx + MAXR); x++) {
      const r = Math.hypot(x - cx, y - cy);
      if (r >= MAXR) continue;
      const b = Math.floor(r / BIN);
      const v = buf[(y * W + x) * 4]! / 255; sum[b] += v * v; cnt[b]++;   // 平方根符号化を戻す
    }
  }
  PAPER.view = 'paper';
  return Array.from(sum, (s, i) => cnt[i] ? s / cnt[i] / PAPER.viewScale : 0);
}

const HOLD_START = 10, HOLD_END = 100, LAST = 460;
const CHECKS = [20, 40, 70, 100, 130, 160, 220, 300, 400, 460];
const checkpoints: { f: number; t: number; water: number[]; pigment: number[]; fixed: number[] }[] = [];
const px = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
let time = 0, pngWet = '';
// 見た目の確認用に、計測点から離れた下の方に 1 本ストロークも引く (200〜260 フレーム、筆圧を変えながら)
const STROKE = { start: 200, end: 260, x0: canvas.clientWidth * 0.15, x1: canvas.clientWidth * 0.85, y0: canvas.clientHeight * 0.88, y1: canvas.clientHeight * 0.84 };
for (let f = 0; f <= LAST; f++) {
  const ms = f * 1000 / 60;
  if (f === HOLD_START) dispatch(canvas, { type: 'down', x: px.x, y: px.y, pressure: 0.5, t: ms });
  if (f === HOLD_END) dispatch(canvas, { type: 'up', x: px.x, y: px.y, pressure: 0, t: ms });
  if (f >= STROKE.start && f <= STROKE.end) {
    const u = (f - STROKE.start) / (STROKE.end - STROKE.start);
    const x = STROKE.x0 + (STROKE.x1 - STROKE.x0) * u, y = STROKE.y0 + (STROKE.y1 - STROKE.y0) * u + Math.sin(u * 9) * 6;
    const pressure = 0.3 + 0.6 * Math.sin(u * Math.PI);
    if (f === STROKE.start) dispatch(canvas, { type: 'down', x, y, pressure, t: ms });
    else if (f === STROKE.end) dispatch(canvas, { type: 'up', x, y, pressure: 0, t: ms });
    else dispatch(canvas, { type: 'move', x, y, pressure, t: ms });
  }
  time += DT; app.frame(DT, time);
  if (f === 70) { app.mode.frame([], 0, time); pngWet = canvas.toDataURL('image/png'); }   // とどまっている最中 (濡れて艶がある)
  if (CHECKS.includes(f)) checkpoints.push({ f, t: (f - HOLD_START) / 60, water: profile('water'), pigment: profile('pigment'), fixed: profile('fixed') });
}
app.mode.frame([], 0, time);
const pngNormal = canvas.toDataURL('image/png');
PAPER.view = 'fixed'; app.mode.frame([], 0, time);
const pngFixed = canvas.toDataURL('image/png');
const result = { size: [W, H], bin: BIN, glError: gl.getError(), overrides, checkpoints, pngNormal, pngFixed, pngWet };
document.getElementById('out')!.textContent = '@@RESULT@@' + btoa(unescape(encodeURIComponent(JSON.stringify(result)))) + '@@END@@';
