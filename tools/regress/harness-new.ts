// 今の API (App + Mode) で fluid を動かす
import { createApp } from '../../src/app/app.ts';
import { run } from './shared.ts';

run(canvas => {
  const app = createApp(canvas, 'fluid');
  if (!app) throw new Error('WebGL2 float unavailable');
  return { gl: app.ctx.gl, frame: (dt, time) => app.frame(dt, time) };
});
