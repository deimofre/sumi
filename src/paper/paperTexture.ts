// ============================================================
// 紙テクスチャ (共通層): 画像があれば読み込み、無ければプロシージャル生成
// RGB = 和紙の色 (sRGB)、A = 高さ (linear)。RGBA8 で持つ
// ============================================================
import { must } from '../gl/context.ts';
import { createFBO, type FBO } from '../gl/fbo.ts';
import type { Program } from '../gl/program.ts';
import { PAPER } from './params.ts';

export interface PaperTexture {
  readonly width: number; readonly height: number;
  readonly texelX: number; readonly texelY: number;
  /** テクスチャユニットにバインドしてそのユニット番号を返す */
  attach(unit: number): number;
  /** 別の乱数シードで作り直す (画像から作った紙では何もしない) */
  regenerate(seed: number): void;
  dispose(): void;
}

/** 紙画像 (RGB = 色、A = 高さ) を読む。無い・読めないときは null を返し、呼び出し側はプロシージャルに落とす */
export async function loadPaperImage(url: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    // A は透明度ではなく高さなので、乗算済みアルファにされないよう指定する
    return await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  } catch {
    return null;
  }
}

export interface PaperGenParams {
  /** 紙の CSS ピクセル寸法。目の粗さを解像度や DPR に依存させない */
  cssW: number; cssH: number;
  seed: number;
}

/** 生成シェーダーで w×h の紙を作る。regenerate で同じ FBO に描き直せる */
export function createProceduralPaper(gl: WebGL2RenderingContext, blit: (t: FBO | null) => void, paperGen: Program,
                                      w: number, h: number, params: PaperGenParams): PaperTexture {
  const fbo = createFBO(gl, w, h, { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
  function generate(seed: number): void {
    const p = paperGen.bind();
    gl.uniform2f(p.u.uPaperPx, params.cssW, params.cssH);
    gl.uniform1f(p.u.uSeed, seed);
    gl.uniform1f(p.u.uGrainScale, PAPER.grainScale);
    gl.uniform1f(p.u.uFiberStrength, PAPER.fiberStrength);
    gl.uniform1f(p.u.uLaidStrength, PAPER.laidStrength);
    gl.uniform1f(p.u.uHeightContrast, PAPER.heightContrast);
    blit(fbo);
  }
  generate(params.seed);
  return { width: w, height: h, texelX: fbo.texelX, texelY: fbo.texelY,
    attach: unit => fbo.attach(unit), regenerate: generate, dispose: () => fbo.destroy() };
}

/** 画像をそのままテクスチャにする。解像度は画像のまま */
export function createImagePaper(gl: WebGL2RenderingContext, image: ImageBitmap): PaperTexture {
  const texture = must(gl.createTexture(), 'createTexture');
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);   // 画像は上が先頭、テクスチャは下が先頭
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  const { width, height } = image;
  return { width, height, texelX: 1 / width, texelY: 1 / height,
    attach(unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); return unit; },
    regenerate() {}, dispose: () => gl.deleteTexture(texture) };
}
