// ============================================================
// paper モード: 紙に筆で書く (毛細管にじみモデル)。
// 三つの層:
//   film  (細かい格子、RGBA16F): 筆が置いた墨の膜。R = 水、G = 顔料、B/A = このフレームに染み込んだ顔料 / 水。濃く艶がある
//   flow  (粗い格子、短辺 flowRes、RGBA16F): 染み込んだ水 W と移動顔料 P、B = このフレームに定着した顔料 Fx、A = 湿り年齢
//   fixed (細かい格子、R16F): 固定顔料 F (以後動かない)
// 毎フレーム: Deposit (筆 → 膜) → Soak (膜 → 紙) → [Absorb → Diffuse → Transport → Evaporate & Fix] × flowSteps
//             → Settle (染み込んだ顔料と Fx を F へ) → Display
// 水の広がりを端末の解像度から切り離すため、流れは粗い格子で計算し、紙の目に沿った細部と膜は細かい格子に置く
// ============================================================
import type { AppContext, Mode } from '../app/mode.ts';
import { createDoubleFBO, fitResolution, type DoubleFBO } from '../gl/fbo.ts';
import { createTextTexture, drawText, watchFonts } from '../text/textLayer.ts';
import { applyInputs } from './brush.ts';
import { PAPER } from './params.ts';
import { createPaperTexture, loadPaperImage, type PaperTexture, type Size } from './paperTexture.ts';
import { createPaperPrograms, type PaperPrograms } from './shaders/index.ts';

// 縦組みの短い文 (紙モードの説明)
const LINES = ['とどまれば、にじむ。', '走らせれば、掠れる。', '乾けば、縁が残る。'];
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// プログラムはコンテキストごとに 1 度だけコンパイルし、モードを行き来しても使い回す
const programs = new WeakMap<WebGL2RenderingContext, PaperPrograms>();

const VIEW_INDEX = { paper: 0, height: 1, film: 2, water: 3, pigment: 4, fixed: 5, invalid: 6 } as const;
const AGE_HALF_LIFE = 1.5;   // 湿り年齢の半減期 (秒)。今は表示に使っていない

/** 細かい格子の解像度。短辺を params の値 (0 なら端末に応じて 1024 / 2048) に合わせる */
function fineResolution(ctx: AppContext): Size {
  const short = PAPER.resShort || (Math.min(ctx.W, ctx.H) >= 1536 ? 2048 : 1024);
  return fitResolution(ctx.gl, short);
}

export function createPaperMode(ctx: AppContext): Mode {
  const { gl, blit, formats } = ctx;
  let P = programs.get(gl);
  if (!P) { P = createPaperPrograms(gl); programs.set(gl, P); }
  const { soak, update, settle, display, depositFilm } = P;

  let seed = 0;                             // 0 は fluid モードと同じ目の紙。「紙を替える」で変わる
  let image: ImageBitmap | null = null;     // 紙画像が読めたらプロシージャルの代わりに使う
  let disposed = false;

  // 文字と落款 (共通層)。Web フォントが後から届いたら描き直す
  const textTex = createTextTexture(gl);
  const redrawText = () => { if (!disposed) drawText({ gl, W: ctx.W, H: ctx.H, dpr: ctx.dpr, textTex }, LINES); };
  redrawText(); watchFonts(redrawText);

  function clearState(...targets: DoubleFBO[]): void {
    gl.clearColor(0, 0, 0, 0);
    for (const t of targets) for (const f of [t.read, t.write]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo); gl.clear(gl.COLOR_BUFFER_BIT); }
  }
  function build(): { paper: PaperTexture; film: DoubleFBO; flow: DoubleFBO; fixed: DoubleFBO } {
    const fine = fineResolution(ctx), coarse = fitResolution(gl, PAPER.flowRes);
    const paper = createPaperTexture(gl, blit, P!, fine, coarse, { cssW: ctx.W / ctx.dpr, cssH: ctx.H / ctx.dpr, seed }, image);
    const film = createDoubleFBO(gl, fine.w, fine.h, formats.rgba);
    const flow = createDoubleFBO(gl, coarse.w, coarse.h, formats.rgba);
    const fixed = createDoubleFBO(gl, fine.w, fine.h, formats.r);
    clearState(film, flow, fixed);
    return { paper, film, flow, fixed };
  }
  let { paper, film, flow, fixed } = build();
  const disposeAll = () => { paper.dispose(); film.destroy(); flow.destroy(); fixed.destroy(); };
  if (PAPER.paperImage) {
    loadPaperImage(PAPER.paperImage).then(img => {
      if (!img || disposed) return;
      image = img; disposeAll(); ({ paper, film, flow, fixed } = build());
    });
  }

  /** 膜が紙に染み込む (細かい格子) */
  function soakFilm(dt: number): void {
    const p = soak.bind();
    gl.uniform1i(p.u.uFilm, film.read.attach(0));
    gl.uniform1i(p.u.uFlow, flow.read.attach(1));
    gl.uniform1i(p.u.uProps, paper.attachProps(2));
    gl.uniform1f(p.u.uSoak, PAPER.soakRate);
    gl.uniform1f(p.u.uEvap, PAPER.filmEvap);
    gl.uniform1f(p.u.uCapacity, PAPER.capacity);
    gl.uniform1f(p.u.uDt, dt);
    blit(film.write); film.swap();
  }
  /** 粗い格子の 1 ステップ (秒数 sdt)。first はフレーム最初のステップ (膜から受け取り、前フレームの Fx を捨てる) */
  function step(sdt: number, first: boolean): void {
    const p = update.bind();
    gl.uniform1i(p.u.uFlow, flow.read.attach(0));
    gl.uniform1i(p.u.uProps, paper.attachProps(1));
    gl.uniform1i(p.u.uFilm, film.read.attach(2));
    gl.uniform2f(p.u.uTexel, flow.texelX, flow.texelY);
    gl.uniform1f(p.u.uFixFrac, PAPER.brushFixFraction);
    gl.uniform1f(p.u.uK, PAPER.diffusion);
    gl.uniform1f(p.u.uAniso, PAPER.anisotropy);
    gl.uniform1f(p.u.uPorosity, PAPER.porosityContrast);
    gl.uniform1f(p.u.uFilter, PAPER.filterRate);
    gl.uniform1f(p.u.uPin, PAPER.pinThreshold);
    gl.uniform1f(p.u.uCapacity, PAPER.capacity);
    gl.uniform1f(p.u.uPigDiff, PAPER.pigmentDiffusion);
    gl.uniform1f(p.u.uEvap, PAPER.evapRate);
    gl.uniform1f(p.u.uEvapThin, PAPER.evapThinBoost);
    gl.uniform1f(p.u.uFix, PAPER.fixRate);
    gl.uniform1f(p.u.uAgeDecay, Math.pow(0.5, sdt / AGE_HALF_LIFE));
    gl.uniform1f(p.u.uDt, sdt);
    gl.uniform1f(p.u.uResetFix, first ? 1 : 0);
    blit(flow.write); flow.swap();
  }
  /** 染み込んだ顔料 (その場で定着する分) と Fx を細かい格子の F に写す */
  function settleFixed(): void {
    const p = settle.bind();
    gl.uniform1i(p.u.uFixed, fixed.read.attach(0));
    gl.uniform1i(p.u.uFilm, film.read.attach(1));
    gl.uniform1i(p.u.uFlow, flow.read.attach(2));
    gl.uniform1i(p.u.uPaper, paper.attach(3));
    gl.uniform1i(p.u.uProps, paper.attachProps(4));
    gl.uniform1f(p.u.uSettle, PAPER.settleStrength);
    gl.uniform1f(p.u.uFixFrac, PAPER.brushFixFraction);
    blit(fixed.write); fixed.swap();
  }
  function render(time: number): void {
    const p = display.bind();
    gl.uniform1i(p.u.uPaper, paper.attach(0));
    gl.uniform1i(p.u.uFixed, fixed.read.attach(1));
    gl.uniform1i(p.u.uFilm, film.read.attach(2));
    gl.uniform1i(p.u.uFlow, flow.read.attach(3));
    gl.uniform1i(p.u.uProps, paper.attachProps(4));
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.uniform1i(p.u.uText, 5);
    gl.uniform2f(p.u.uPaperPx, ctx.W / ctx.dpr, ctx.H / ctx.dpr);
    gl.uniform2f(p.u.uFineTexel, 1 / paper.width, 1 / paper.height);
    gl.uniform2f(p.u.uCoarseTexel, flow.texelX, flow.texelY);
    gl.uniform1f(p.u.uAspect, ctx.aspect);
    gl.uniform1f(p.u.uInkOpacity, PAPER.inkOpacity);
    gl.uniform1f(p.u.uFilmOpacity, PAPER.filmOpacity);
    gl.uniform1f(p.u.uCapacity, PAPER.capacity);
    gl.uniform1f(p.u.uSettle, PAPER.settleStrength);
    gl.uniform1f(p.u.uViewScale, PAPER.viewScale);
    gl.uniform1f(p.u.uTime, reduceMotion ? 0 : time);
    gl.uniform1f(p.u.uGloss, PAPER.gloss);
    gl.uniform1f(p.u.uBump, PAPER.bump);
    gl.uniform1f(p.u.uWetDarken, PAPER.wetDarken);
    gl.uniform1i(p.u.uView, VIEW_INDEX[PAPER.view]);
    blit(null);
  }

  return {
    name: 'paper',
    touchInks: true,   // 紙では指でも書ける (iPhone には Pencil が無い)
    frame(samples, dt, time) {
      applyInputs({ gl, blit, depositFilm, film, paper, aspect: ctx.aspect }, samples);
      if (dt > 0) {
        soakFilm(dt);
        const steps = Math.max(1, Math.round(PAPER.flowSteps));
        for (let i = 0; i < steps; i++) step(dt / steps, i === 0);
        settleFixed();
      }
      render(time);
    },
    resize() { disposeAll(); ({ paper, film, flow, fixed } = build()); redrawText(); },
    rebuild() { disposeAll(); ({ paper, film, flow, fixed } = build()); },
    clear() {
      // 新しい紙にする: 墨を消し、目の違う紙を生成し直す (画像の紙ではそのまま)
      seed = Math.floor(Math.random() * 1000);
      paper.regenerate(seed);
      clearState(film, flow, fixed);
    },
    dispose() { disposed = true; disposeAll(); gl.deleteTexture(textTex); },
  };
}
