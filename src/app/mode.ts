// ============================================================
// モードの共通インターフェース。fluid (水面に流す) と paper (紙に書く) が実装する
// ============================================================
import type { Formats } from '../gl/context.ts';
import type { FBO } from '../gl/fbo.ts';
import type { StrokeSample } from '../input/stroke.ts';

export type ModeName = 'fluid' | 'paper';
export const isModeName = (v: unknown): v is ModeName => v === 'fluid' || v === 'paper';

/** 両モードが共有する GL 環境と描画バッファの寸法。寸法は App がリサイズ時に書き換えてから Mode.resize を呼ぶ */
export interface AppContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  formats: Formats;
  blit: (target: FBO | null) => void;
  dpr: number;
  W: number; H: number; aspect: number;
}

export interface Mode {
  readonly name: ModeName;
  /** このモードで指でも墨を乗せるか (fluid は指で水面を揺らすだけ、paper は指でも書ける) */
  readonly touchInks: boolean;
  /** 1 フレーム進めて画面に描く。samples はこのフレームの入力 */
  frame(samples: readonly StrokeSample[], dt: number, time: number): void;
  /** 描画バッファの寸法が変わった (ctx の W/H/aspect は更新済み)。バッファを作り直す */
  resize(): void;
  /** 「紙を替える」 */
  clear(): void;
  /** GPU リソースを解放する。以後このモードは使われない */
  dispose(): void;
}
