// ============================================================
// 表示
// ============================================================
import { CFG } from '../config.ts';
import type { SimState } from './state.ts';

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function render(s: SimState, time: number): void {
  const { gl, dye, velocity, W, H, dpr, aspect } = s;
  const p = s.P.display.bind();
  gl.uniform2f(p.u.texelSize, dye.texelX, dye.texelY);
  gl.uniform1i(p.u.uDye, dye.read.attach(0));
  gl.uniform1i(p.u.uVelocity, velocity.read.attach(1));
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, s.textTex);
  gl.uniform1i(p.u.uText, 2);
  gl.uniform2f(p.u.uPaperPx, W / dpr, H / dpr);
  gl.uniform2f(p.u.uDyeTexel, dye.texelX, dye.texelY);
  gl.uniform2f(p.u.uSimTexel, velocity.texelX, velocity.texelY);
  gl.uniform1f(p.u.uTime, reduceMotion ? 0 : time);
  gl.uniform1f(p.u.uAspect, aspect);
  gl.uniform1f(p.u.uWarp, CFG.warp);
  gl.uniform1f(p.u.uBump, CFG.bump);
  gl.uniform1f(p.u.uGloss, CFG.gloss);
  s.blit(null);
}
