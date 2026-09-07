// ============================================================
// 紙テクスチャ (共通層): 画像があれば読み込み、無ければプロシージャル生成。
//   paper (細かい格子): RGB = 和紙の色 (sRGB)、A = 高さ (linear)
//   props (粗い格子):   RG = 繊維の向き、B = 揃い具合、A = 高さの平均 (高さから構造テンソルで推定。shaders/props.frag)
// どちらも RGBA8
// ============================================================
import { must } from '../gl/context.ts';
import { createFBO, type FBO } from '../gl/fbo.ts';
import { PAPER } from './params.ts';
import type { PaperPrograms } from './shaders/index.ts';

export interface PaperTexture {
  /** 細かい格子の寸法 */
  readonly width: number; readonly height: number;
  /** 紙 (色 + 高さ) をユニットにバインドしてその番号を返す */
  attach(unit: number): number;
  /** 流れ用の性質 (繊維の向き + 揃い具合 + 高さの平均) をユニットにバインドしてその番号を返す */
  attachProps(unit: number): number;
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
export interface Size { w: number; h: number }

export function createPaperTexture(gl: WebGL2RenderingContext, blit: (t: FBO | null) => void, P: PaperPrograms,
                                   fine: Size, coarse: Size, gen: PaperGenParams, image: ImageBitmap | null): PaperTexture {
  const fmt = { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  const paper = createFBO(gl, fine.w, fine.h, fmt), props = createFBO(gl, coarse.w, coarse.h, fmt);

  function fillFromImage(img: ImageBitmap): void {
    const tex = must(gl.createTexture(), 'createTexture');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);   // 画像は上が先頭、テクスチャは下が先頭
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // 画面比に合わせて中央を切り出す (cover)
    const ap = fine.w / fine.h, ai = img.width / img.height;
    const sx = ai > ap ? ap / ai : 1, sy = ai > ap ? 1 : ai / ap;
    const p = P.paperImage.bind();
    gl.uniform1i(p.u.uImage, 0);
    gl.uniform2f(p.u.uScale, sx, sy);
    gl.uniform2f(p.u.uOffset, (1 - sx) / 2, (1 - sy) / 2);
    blit(paper);
    gl.deleteTexture(tex);
  }
  function fillProcedural(seed: number): void {
    const p = P.paperGen.bind();
    gl.uniform2f(p.u.uPaperPx, gen.cssW, gen.cssH);
    gl.uniform1f(p.u.uSeed, seed);
    gl.uniform1f(p.u.uGrainScale, PAPER.grainScale);
    gl.uniform1f(p.u.uFiberStrength, PAPER.fiberStrength);
    gl.uniform1f(p.u.uLaidStrength, PAPER.laidStrength);
    gl.uniform1f(p.u.uHeightContrast, PAPER.heightContrast);
    blit(paper);
  }
  function fillProps(): void {
    const p = P.props.bind();
    gl.uniform1i(p.u.uPaper, paper.attach(0));
    gl.uniform2f(p.u.uTexel, paper.texelX, paper.texelY);
    blit(props);
  }

  if (image) fillFromImage(image); else fillProcedural(gen.seed);
  fillProps();

  return {
    width: fine.w, height: fine.h,
    attach: unit => paper.attach(unit),
    attachProps: unit => props.attach(unit),
    regenerate(seed) { if (image) return; fillProcedural(seed); fillProps(); },
    dispose() { paper.destroy(); props.destroy(); },
  };
}
