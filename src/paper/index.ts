// ============================================================
// paper モード: 紙に筆で書く (毛細管にじみモデル)。
// Phase 1 は紙の生成と表示のみ。墨の 3 層 (水・移動顔料・固定顔料) は Phase 2 から
// ============================================================
import type { AppContext, Mode } from '../app/mode.ts';
import { fitResolution } from '../gl/fbo.ts';
import { PAPER } from './params.ts';
import { createImagePaper, createProceduralPaper, loadPaperImage, type PaperTexture } from './paperTexture.ts';
import { createPaperPrograms, type PaperPrograms } from './shaders/index.ts';

// プログラムはコンテキストごとに 1 度だけコンパイルし、モードを行き来しても使い回す
const programs = new WeakMap<WebGL2RenderingContext, PaperPrograms>();

/** 紙とシミュレーションの解像度。短辺を params の値 (0 なら端末に応じて 1024 / 2048) に合わせる */
function paperResolution(ctx: AppContext): { w: number; h: number } {
  const short = PAPER.resShort || (Math.min(ctx.W, ctx.H) >= 1536 ? 2048 : 1024);
  return fitResolution(ctx.gl, short);
}

export function createPaperMode(ctx: AppContext): Mode {
  const { gl, blit } = ctx;
  let P = programs.get(gl);
  if (!P) { P = createPaperPrograms(gl); programs.set(gl, P); }
  const { paperGen, display } = P;

  let seed = 0;                             // 0 は fluid モードと同じ目の紙。「紙を替える」で変わる
  let image: ImageBitmap | null = null;     // 紙画像が読めたらプロシージャルの代わりに使う
  let disposed = false;

  function buildPaper(): PaperTexture {
    if (image) return createImagePaper(gl, image);
    const { w, h } = paperResolution(ctx);
    return createProceduralPaper(gl, blit, paperGen, w, h, { cssW: ctx.W / ctx.dpr, cssH: ctx.H / ctx.dpr, seed });
  }
  let paper = buildPaper();
  if (PAPER.paperImage) {
    loadPaperImage(PAPER.paperImage).then(img => {
      if (!img || disposed) return;
      image = img; paper.dispose(); paper = buildPaper();
    });
  }

  return {
    name: 'paper',
    touchInks: true,   // 紙では指でも書ける (iPhone には Pencil が無い)
    frame(_samples, _dt, _time) {
      const p = display.bind();
      gl.uniform1i(p.u.uPaper, paper.attach(0));
      gl.uniform2f(p.u.uPaperPx, ctx.W / ctx.dpr, ctx.H / ctx.dpr);
      gl.uniform1f(p.u.uAspect, ctx.aspect);
      gl.uniform1i(p.u.uView, PAPER.view === 'height' ? 1 : 0);
      blit(null);
    },
    resize() { paper.dispose(); paper = buildPaper(); },
    clear() {
      // 新しい紙にする: 目の違う紙を生成し直す (画像の紙ではそのまま)
      seed = Math.floor(Math.random() * 1000);
      paper.regenerate(seed);
    },
    dispose() { disposed = true; paper.dispose(); },
  };
}
