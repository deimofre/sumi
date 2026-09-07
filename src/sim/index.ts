// ============================================================
// fluid モード: 水面に墨を流す (分割前からの実装)。既存の applyInputs / step / render を Mode に包むだけ
// ============================================================
import type { AppContext, Mode } from '../app/mode.ts';
import { CFG } from '../config.ts';
import { createPrograms } from '../shaders/index.ts';
import { applyInputs } from './brush.ts';
import { createBuffers, type Buffers } from './buffers.ts';
import { render } from './display.ts';
import { step } from './fluid.ts';
import type { SimState } from './state.ts';
import { createTextTexture, drawText, watchFonts } from '../text/textLayer.ts';

// 縦組みの短い文 (水面モードの説明)
const LINES = ['触れれば揺れる。', '押せば墨が乗り、とどまれば溜まる。', '乾けば、青みを帯びる。'];

// プログラム・文字テクスチャ・状態オブジェクトはコンテキストごとに 1 度だけ作り、モードを行き来しても使い回す。
// 状態オブジェクトを残すのは、Web フォント到着時の描き直し (watchFonts) がいつ来ても生きた状態を参照するため。
// 切替時に解放・再生成するのはシミュレーションのバッファだけで、戻ってきたときはまっさらな水面から始まる。
const sessions = new WeakMap<WebGL2RenderingContext, SimState>();

function destroyBuffers(b: Buffers): void {
  b.velocity.destroy(); b.dye.destroy(); b.pressure.destroy(); b.divergence.destroy(); b.curlBuf.destroy();
}

export function createFluidMode(ctx: AppContext): Mode {
  const { gl, formats } = ctx;
  let s = sessions.get(gl);
  if (!s) {
    s = { gl, canvas: ctx.canvas, formats, P: createPrograms(gl), blit: ctx.blit, dpr: ctx.dpr,
          W: ctx.W, H: ctx.H, aspect: ctx.aspect, ...createBuffers(gl, formats), textTex: createTextTexture(gl), fade: 0 };
    sessions.set(gl, s);
    drawText(s, LINES);
    const live = s; watchFonts(() => { if (live.W) drawText(live, LINES); });
  } else {
    s.W = ctx.W; s.H = ctx.H; s.aspect = ctx.aspect; s.fade = 0;
    Object.assign(s, createBuffers(gl, formats));
    drawText(s, LINES);
  }
  const state = s;
  return {
    name: 'fluid',
    touchInks: CFG.touchInks,
    frame(samples, dt, time) { applyInputs(state, samples); step(state, dt); render(state, time); },
    resize() {
      state.W = ctx.W; state.H = ctx.H; state.aspect = ctx.aspect;
      destroyBuffers(state); Object.assign(state, createBuffers(gl, formats)); drawText(state, LINES);
    },
    clear() { state.fade = 0.9; },
    dispose() { destroyBuffers(state); },
  };
}
