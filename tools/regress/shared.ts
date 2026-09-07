// ============================================================
// 回帰確認の共通部。乱数を固定した上で同じポインタ列を同じフレーム刻みで流し、表示をハッシュする。
// harness-old.ts (基準コミットの API) と harness-new.ts (今の API) の両方から使う
// ============================================================
export interface Ev {
  type: 'down' | 'move' | 'up' | 'leave';
  /** CSS px、左上原点 */
  x: number; y: number;
  pressure?: number; pointerType?: 'pen' | 'touch' | 'mouse';
  /** イベントの timeStamp (ms) */
  t: number;
}
export const DT = 1 / 60;
export const FRAMES = 241;
export const CHECK_EVERY = 10;

/** フレームごとのイベント列。入り・抜き・とどまり・指・ホバー・速い払いを一通り含む */
export function buildScript(w: number, h: number): Ev[][] {
  const frames: Ev[][] = Array.from({ length: FRAMES }, () => []);
  const ms = (f: number, k: number) => f * 1000 / 60 + k * 4;
  const at = (f: number, ev: Omit<Ev, 't'>, k = 0) => frames[f]!.push({ ...ev, t: ms(f, k) });

  // A (10-60): ゆっくり曲がるペンのストローク。筆圧を揺らし、3 フレームに 1 度は 1 フレームに 2 イベント
  at(10, { type: 'down', x: w * 0.2, y: h * 0.5, pressure: 0.6 });
  for (let f = 11; f <= 60; f++) {
    const steps = f % 3 === 0 ? 2 : 1;
    for (let k = 0; k < steps; k++) {
      const u = (f - 10) / 50 + k * 0.006;
      at(f, { type: 'move', x: w * (0.2 + 0.4 * u), y: h * (0.5 + 0.2 * Math.sin(u * Math.PI * 2)),
              pressure: 0.4 + 0.5 * Math.abs(Math.sin(u * 5)) }, k);
    }
  }
  at(60, { type: 'up', x: w * 0.6, y: h * 0.5, pressure: 0 }, 2);

  // B (90-150): 一点で押し続ける (とどまり)
  at(90, { type: 'down', x: w * 0.7, y: h * 0.3, pressure: 0.5 });
  at(150, { type: 'up', x: w * 0.7, y: h * 0.3, pressure: 0 });

  // C (155-185): 指のなぞり (墨は乗らず水面を揺らすだけ)
  at(155, { type: 'down', x: w * 0.3, y: h * 0.8, pressure: 0, pointerType: 'touch' });
  for (let f = 156; f <= 184; f++) {
    const u = (f - 155) / 29;
    at(f, { type: 'move', x: w * (0.3 + 0.5 * u), y: h * (0.8 - 0.1 * u), pressure: 0, pointerType: 'touch' });
  }
  at(185, { type: 'up', x: w * 0.8, y: h * 0.7, pressure: 0, pointerType: 'touch' });

  // D (186-199): Pencil のホバー (触れていない移動)
  for (let f = 186; f <= 199; f++) {
    const u = (f - 186) / 13;
    at(f, { type: 'move', x: w * (0.8 - 0.3 * u), y: h * (0.7 - 0.4 * u), pressure: 0 });
  }

  // E (200-207): 速い払い。速さは上限に張り付き、離した勢いで長い尾を引く
  at(200, { type: 'down', x: w * 0.15, y: h * 0.2, pressure: 0.8 });
  for (let f = 201; f <= 206; f++) at(f, { type: 'move', x: w * (0.15 + 0.07 * (f - 200)), y: h * (0.2 + 0.03 * (f - 200)), pressure: 0.7 });
  at(207, { type: 'up', x: w * 0.57, y: h * 0.38, pressure: 0 });
  at(213, { type: 'leave', x: 0, y: 0 });
  return frames;
}

const TYPES = { down: 'pointerdown', move: 'pointermove', up: 'pointerup', leave: 'pointerleave' } as const;
export function dispatch(canvas: HTMLCanvasElement, ev: Ev): void {
  const e = new PointerEvent(TYPES[ev.type], { clientX: ev.x, clientY: ev.y, pressure: ev.pressure ?? 0.5,
    pointerType: ev.pointerType ?? 'pen', pointerId: 1, isPrimary: true, bubbles: true, cancelable: true });
  // timeStamp は生成時刻で固定されるので、台本の時刻で上書きする (速さの計算に使われる)
  Object.defineProperty(e, 'timeStamp', { value: ev.t });
  canvas.dispatchEvent(e);
}

/** FNV-1a 32bit */
export function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function readDisplay(gl: WebGL2RenderingContext): Uint8Array {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const buf = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf;
}

export interface Harness { gl: WebGL2RenderingContext; frame(dt: number, time: number): void }
export function run(setup: (canvas: HTMLCanvasElement) => Harness): void {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  // 合成イベントにはアクティブなポインタが無く、本物の setPointerCapture は例外を投げる
  canvas.setPointerCapture = () => {};
  const h = setup(canvas);
  const { gl } = h;
  const script = buildScript(canvas.clientWidth, canvas.clientHeight);
  const hashes: Record<string, string> = {};
  let time = 0;
  for (let f = 0; f < script.length; f++) {
    for (const ev of script[f]!) dispatch(canvas, ev);
    time += DT;
    h.frame(DT, time);
    if (f % CHECK_EVERY === 0) hashes['f' + f] = fnv1a(readDisplay(gl));
  }
  const result = { size: [gl.drawingBufferWidth, gl.drawingBufferHeight], glError: gl.getError(), hashes, png: canvas.toDataURL('image/png') };
  // dump-dom で拾えるよう、記号を含まない base64 で埋め込む
  document.getElementById('out')!.textContent = '@@RESULT@@' + btoa(unescape(encodeURIComponent(JSON.stringify(result)))) + '@@END@@';
}
