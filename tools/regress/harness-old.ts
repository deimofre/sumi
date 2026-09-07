// 基準コミット (モード分割前) の API で fluid を動かす。run.mjs が基準の worktree にコピーして使う
import { getContext } from '../../src/gl/context.ts';
import { createQuad } from '../../src/gl/fbo.ts';
import { createPrograms } from '../../src/shaders/index.ts';
import { applyInputs, installPointerEvents } from '../../src/sim/brush.ts';
import { createBuffers } from '../../src/sim/buffers.ts';
import { render } from '../../src/sim/display.ts';
import { step } from '../../src/sim/fluid.ts';
import type { SimState } from '../../src/sim/state.ts';
import { createTextTexture, drawText } from '../../src/sim/textLayer.ts';
import { run } from './shared.ts';

run(canvas => {
  const ctx = getContext(canvas);
  if (!ctx) throw new Error('WebGL2 float unavailable');
  const { gl, formats } = ctx;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.floor(canvas.clientWidth * dpr), H = Math.floor(canvas.clientHeight * dpr);
  canvas.width = W; canvas.height = H;
  const s: SimState = { gl, canvas, formats, P: createPrograms(gl), blit: createQuad(gl), dpr, W, H, aspect: W / H,
    ...createBuffers(gl, formats), textTex: createTextTexture(gl), fade: 0 };
  drawText(s);
  installPointerEvents(s);
  return { gl, frame(dt, time) { applyInputs(s, dt); step(s, dt); render(s, time); } };
});
