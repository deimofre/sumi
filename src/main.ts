import '@fontsource/shippori-mincho/400.css';
import '@fontsource/shippori-mincho/600.css';
import './fonts.css';
import './style.css';

import { getContext } from './gl/context.ts';
import { createQuad } from './gl/fbo.ts';
import { createPrograms } from './shaders/index.ts';
import { createBuffers } from './sim/buffers.ts';
import { applyInputs, installPointerEvents } from './sim/brush.ts';
import { render } from './sim/display.ts';
import { step } from './sim/fluid.ts';
import type { SimState } from './sim/state.ts';
import { createTextTexture, drawText, watchFonts } from './sim/textLayer.ts';

function main(): void {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const fallbackEl = document.getElementById('fallback') as HTMLElement;
  const fail = (msg?: string) => { fallbackEl.style.display = 'grid'; if (msg) fallbackEl.textContent = msg; };
  window.addEventListener('error', e => fail('エラー: ' + (e.message || e.error)));

  // ---- 1. WebGL2 セットアップ ----
  const ctx = getContext(canvas);
  if (!ctx) { fail(); return; }
  const { gl, formats } = ctx;
  const P = createPrograms(gl);
  const blit = createQuad(gl);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // ---- 2. 解像度・バッファ・文字レイヤー ----
  const measure = () => ({ w: Math.floor(canvas.clientWidth * dpr), h: Math.floor(canvas.clientHeight * dpr) });
  const first = measure();
  canvas.width = first.w; canvas.height = first.h;
  const s: SimState = {
    gl, canvas, formats, P, blit, dpr,
    W: first.w, H: first.h, aspect: first.w / first.h,
    ...createBuffers(gl, formats),
    textTex: createTextTexture(gl),
    fade: 0,
  };
  drawText(s);
  watchFonts(s);

  function resize(): boolean {
    const { w, h } = measure();
    if (w === s.W && h === s.H) return false;
    s.W = canvas.width = w; s.H = canvas.height = h; s.aspect = s.W / s.H;
    Object.assign(s, createBuffers(gl, formats)); drawText(s);
    return true;
  }

  // ---- 3. 入力 ----
  installPointerEvents(s);
  document.getElementById('clear')!.addEventListener('click', () => { s.fade = 0.9; });
  window.addEventListener('keydown', e => { if (e.key === 'c' || e.key === 'C') s.fade = 0.9; });

  // ---- 4. ループ ----
  let last = performance.now(), time = 0;
  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 1 / 30) || 1 / 60;
    last = now; time += dt;
    resize();
    applyInputs(s, dt);
    step(s, dt);
    render(s, time);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
