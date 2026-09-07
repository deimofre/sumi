// モード切替の確認: fluid で墨を乗せた後 paper へ行き、fluid に戻ると、まっさらな水面 (基準の f0) と同じ表示になること。
// 切替のたびに glError が出ないことも見る
import { createApp } from '../../src/app/app.ts';
import { buildScript, dispatch, DT, fnv1a } from './shared.ts';

const canvas = document.getElementById('gl') as HTMLCanvasElement;
canvas.setPointerCapture = () => {};
const app = createApp(canvas, 'fluid');
if (!app) throw new Error('WebGL2 float unavailable');
const { gl } = app.ctx;
const script = buildScript(canvas.clientWidth, canvas.clientHeight);
const read = () => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const buf = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return fnv1a(buf);
};
let time = 0, cursor = 0;
const steps: Record<string, string | number> = {};
// 台本を cursor から n フレーム進める (台本を使い切ったらイベント無しで進む)
const advance = (n: number) => { for (let i = 0; i < n; i++, cursor++) { for (const ev of script[cursor] ?? []) dispatch(canvas, ev); time += DT; app.frame(DT, time); } };

advance(1); steps.fresh = read();           // 何も描いていない fluid の 1 フレーム目 (基準の f0 と同じはず)
advance(69);                                // ストローク A と抜き
steps.inked = read();
steps.err0 = gl.getError();
app.setMode('paper'); advance(5);
steps.paper = read(); steps.err1 = gl.getError();
app.setMode('fluid'); advance(3);
steps.back = read(); steps.err2 = gl.getError();   // 墨は消えているので fresh と同じはず
app.setMode('paper'); app.clear(); advance(3);     // 紙を替える (別の目の紙)
steps.paper2 = read(); steps.err3 = gl.getError();
app.setMode('fluid'); steps.err4 = gl.getError();
const result = { size: [gl.drawingBufferWidth, gl.drawingBufferHeight], steps };
document.getElementById('out')!.textContent = '@@RESULT@@' + btoa(unescape(encodeURIComponent(JSON.stringify(result)))) + '@@END@@';
