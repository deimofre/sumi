import type { Formats } from '../gl/context.ts';
import type { FBO } from '../gl/fbo.ts';
import type { Programs } from '../shaders/index.ts';
import type { Buffers } from './buffers.ts';

/** 各モジュールが共有する状態。元の単一ファイルでモジュールスコープに置かれていたもの */
export interface SimState extends Buffers {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  formats: Formats;
  P: Programs;
  blit: (target: FBO | null) => void;
  dpr: number;
  /** 描画バッファのピクセルサイズと縦横比 */
  W: number; H: number; aspect: number;
  /** 文字レイヤーのテクスチャ (r=文字 g=落款) */
  textTex: WebGLTexture;
  /** 「紙を替える」の残り秒数。正の間だけ墨が速く薄れる */
  fade: number;
}
