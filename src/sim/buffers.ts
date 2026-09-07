// ============================================================
// 解像度・バッファ
// ============================================================
import { CFG } from '../config.ts';
import type { Formats } from '../gl/context.ts';
import { createDoubleFBO, createFBO, type DoubleFBO, type FBO } from '../gl/fbo.ts';

export interface Buffers {
  velocity: DoubleFBO; dye: DoubleFBO; pressure: DoubleFBO;
  divergence: FBO; curlBuf: FBO;
}

function res(gl: WebGL2RenderingContext, base: number): { w: number; h: number } {
  let a = gl.drawingBufferWidth / gl.drawingBufferHeight; if (a < 1) a = 1 / a;
  const min = Math.round(base), max = Math.round(base * a);
  return gl.drawingBufferWidth > gl.drawingBufferHeight ? { w: max, h: min } : { w: min, h: max };
}

/** 現在の描画バッファサイズに合わせてシミュレーション用バッファを作り直す */
export function createBuffers(gl: WebGL2RenderingContext, formats: Formats): Buffers {
  const s = res(gl, CFG.simRes), d = res(gl, CFG.dyeRes);
  return {
    velocity: createDoubleFBO(gl, s.w, s.h, formats.rg),
    dye: createDoubleFBO(gl, d.w, d.h, formats.rg),
    pressure: createDoubleFBO(gl, s.w, s.h, formats.r),
    divergence: createFBO(gl, s.w, s.h, formats.r),
    curlBuf: createFBO(gl, s.w, s.h, formats.r),
  };
}
