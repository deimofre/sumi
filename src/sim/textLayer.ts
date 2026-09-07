// ============================================================
// 文字レイヤー (2D canvas → テクスチャ)。r=文字 g=落款
// ============================================================
import { must } from '../gl/context.ts';
import type { SimState } from './state.ts';

// "Sumi" は fonts-src/ から生成した自前フォント (src/fonts.css)。無ければしっぽり明朝に落ちる
const FAM = '"Sumi", "Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
const LINES = ['触れれば揺れる。', '押せば墨が乗り、とどまれば溜まる。', '乾けば、青みを帯びる。'];
const tcv = document.createElement('canvas');
const tc = must(tcv.getContext('2d'), 'getContext(2d)');

export function createTextTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const textTex = must(gl.createTexture(), 'createTexture');
  gl.bindTexture(gl.TEXTURE_2D, textTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return textTex;
}

function drawVertical(text: string, x: number, top: number, fs: number, lh: number): void {
  let y = top + fs * 0.5;
  for (const ch of text) {
    if (ch === '、' || ch === '。') tc.fillText(ch, x + fs * 0.55, y - fs * 0.5);   // 縦組みでは右上に寄る
    else if (ch === 'ー') { tc.save(); tc.translate(x, y); tc.rotate(Math.PI / 2); tc.fillText(ch, 0, 0); tc.restore(); }
    else tc.fillText(ch, x, y);
    y += lh;
  }
}
function drawSeal(x: number, y: number, s: number): void {
  tc.save();
  tc.fillStyle = '#0f0';
  tc.beginPath(); tc.roundRect(x - s / 2, y - s / 2, s, s, s * 0.06); tc.fill();
  tc.fillStyle = '#000';
  tc.font = `600 ${s * 0.4}px ${FAM}`;
  tc.textAlign = 'center'; tc.textBaseline = 'middle';
  tc.fillText('游', x, y - s * 0.23);
  tc.fillText('墨', x, y + s * 0.24);
  tc.restore();
}
export function drawText(s: SimState): void {
  const { gl, W, H, dpr } = s;
  tcv.width = W; tcv.height = H;
  tc.fillStyle = '#000'; tc.fillRect(0, 0, W, H);
  const m = Math.min(W, H), portrait = H > W;
  const big = m * (portrait ? 0.52 : 0.46);
  const gx = portrait ? W * 0.5 : W * 0.36;
  const gy = portrait ? H * 0.33 : H * 0.5;
  tc.fillStyle = '#fff'; tc.textAlign = 'center'; tc.textBaseline = 'middle';
  tc.font = `600 ${big}px ${FAM}`;
  tc.fillText('墨', gx, gy);

  const fs = Math.max(13 * dpr, Math.min(22 * dpr, m * 0.032));
  const lh = fs * 1.12;
  const longest = Math.max(...LINES.map(l => [...l].length));
  const colX = portrait ? W * 0.86 : W * 0.80;
  const top = portrait ? gy + big * 0.55 + fs : H * 0.5 - longest * lh * 0.5;
  tc.font = `400 ${fs}px ${FAM}`;
  LINES.forEach((line, i) => drawVertical(line, colX - i * fs * 2.1, top, fs, lh));

  drawSeal(gx + big * 0.46, gy + big * 0.40, fs * 1.75);

  gl.bindTexture(gl.TEXTURE_2D, s.textTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tcv);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
}
/** Webフォントが届いたら描き直す (来なければシステム明朝のまま) */
export function watchFonts(s: SimState): void {
  if (document.fonts && document.fonts.load) {
    Promise.race([
      document.fonts.load('600 100px "Sumi", "Shippori Mincho"').then(() => document.fonts.load('400 20px "Sumi", "Shippori Mincho"')),
      new Promise(r => setTimeout(r, 2500)),
    ]).then(() => { if (s.W) drawText(s); });
  }
}
