// ============================================================
// App: GL 環境・入力層・現在のモードをまとめ、1 フレームの流れ (リサイズ → 入力 → モード) を持つ。
// DOM の UI やループは main.ts。ここは回帰確認ハーネスからも DOM 無しで使う
// ============================================================
import { getContext } from '../gl/context.ts';
import { createQuad } from '../gl/fbo.ts';
import { createStrokeInput, type StrokeInput } from '../input/stroke.ts';
import { createPaperMode } from '../paper/index.ts';
import { createFluidMode } from '../sim/index.ts';
import type { AppContext, Mode, ModeName } from './mode.ts';

export interface App {
  readonly ctx: AppContext;
  readonly input: StrokeInput;
  readonly mode: Mode;
  /** モードを切り替える。前のモードの状態は捨て、バッファは解放する */
  setMode(name: ModeName): void;
  /** 描画バッファの寸法を canvas の表示サイズに合わせる。変わったら true */
  resize(): boolean;
  /** 1 フレーム: リサイズ確認 → 入力の取り出し → モードの更新と描画 */
  frame(dt: number, time: number): void;
  /** 「紙を替える」 */
  clear(): void;
}

const factories: Record<ModeName, (ctx: AppContext) => Mode> = { fluid: createFluidMode, paper: createPaperMode };

/** WebGL2 の float テクスチャが使えない端末では null */
export function createApp(canvas: HTMLCanvasElement, initial: ModeName): App | null {
  const gc = getContext(canvas);
  if (!gc) return null;
  const { gl, formats } = gc;
  const blit = createQuad(gl);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const measure = () => ({ w: Math.floor(canvas.clientWidth * dpr), h: Math.floor(canvas.clientHeight * dpr) });
  const first = measure();
  canvas.width = first.w; canvas.height = first.h;
  const ctx: AppContext = { gl, canvas, formats, blit, dpr, W: first.w, H: first.h, aspect: first.w / first.h };
  const input = createStrokeInput(canvas);

  let mode = factories[initial](ctx);
  input.setTouchInks(mode.touchInks);

  function resize(): boolean {
    const { w, h } = measure();
    if (w === ctx.W && h === ctx.H) return false;
    ctx.W = canvas.width = w; ctx.H = canvas.height = h; ctx.aspect = w / h;
    mode.resize();
    return true;
  }
  return {
    ctx, input,
    get mode() { return mode; },
    setMode(name) {
      if (mode.name === name) return;
      mode.dispose(); input.reset();
      mode = factories[name](ctx);
      input.setTouchInks(mode.touchInks);
    },
    resize,
    frame(dt, time) { resize(); mode.frame(input.collect(dt, ctx.aspect), dt, time); },
    clear() { mode.clear(); },
  };
}
