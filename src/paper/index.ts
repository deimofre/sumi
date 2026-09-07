// ============================================================
// paper モード: 紙に筆で書く (毛細管にじみモデル)。
// 二つの格子を使う:
//   flow  (粗い格子、短辺 flowRes、RGBA16F): R = 水 W、G = 移動顔料 P、B = このフレームに定着した顔料 Fx、A = 湿り年齢
//   fixed (細かい格子、短辺 1024/2048、R16F):  R = 固定顔料 F (掠れの筋と乾いた墨。以後動かない)
// 水の広がりを端末の解像度から切り離すため、流れは粗い格子で計算し、紙の目に沿った細部は細かい格子に置く。
// 毎フレーム: Deposit (筆) → [Diffuse → Transport → Evaporate & Fix] × flowSteps → Settle (Fx を F へ) → Display
// ============================================================
import type { AppContext, Mode } from '../app/mode.ts';
import { createDoubleFBO, fitResolution, type DoubleFBO } from '../gl/fbo.ts';
import { applyInputs } from './brush.ts';
import { PAPER } from './params.ts';
import { createPaperTexture, loadPaperImage, type PaperTexture, type Size } from './paperTexture.ts';
import { createPaperPrograms, type PaperPrograms } from './shaders/index.ts';

// プログラムはコンテキストごとに 1 度だけコンパイルし、モードを行き来しても使い回す
const programs = new WeakMap<WebGL2RenderingContext, PaperPrograms>();

const VIEW_INDEX = { paper: 0, height: 1, water: 2, pigment: 3, fixed: 4, invalid: 5 } as const;

/** 細かい格子の解像度。短辺を params の値 (0 なら端末に応じて 1024 / 2048) に合わせる */
function fineResolution(ctx: AppContext): Size {
  const short = PAPER.resShort || (Math.min(ctx.W, ctx.H) >= 1536 ? 2048 : 1024);
  return fitResolution(ctx.gl, short);
}

export function createPaperMode(ctx: AppContext): Mode {
  const { gl, blit, formats } = ctx;
  let P = programs.get(gl);
  if (!P) { P = createPaperPrograms(gl); programs.set(gl, P); }
  const { update, settle, display, depositFlow, depositFixed } = P;

  let seed = 0;                             // 0 は fluid モードと同じ目の紙。「紙を替える」で変わる
  let image: ImageBitmap | null = null;     // 紙画像が読めたらプロシージャルの代わりに使う
  let disposed = false;

  function clearState(...targets: DoubleFBO[]): void {
    gl.clearColor(0, 0, 0, 0);
    for (const t of targets) for (const f of [t.read, t.write]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo); gl.clear(gl.COLOR_BUFFER_BIT); }
  }
  function build(): { paper: PaperTexture; flow: DoubleFBO; fixed: DoubleFBO } {
    const fine = fineResolution(ctx), coarse = fitResolution(gl, PAPER.flowRes);
    const paper = createPaperTexture(gl, blit, P!, fine, coarse, { cssW: ctx.W / ctx.dpr, cssH: ctx.H / ctx.dpr, seed }, image);
    const flow = createDoubleFBO(gl, coarse.w, coarse.h, formats.rgba);
    const fixed = createDoubleFBO(gl, fine.w, fine.h, formats.r);
    clearState(flow, fixed);
    return { paper, flow, fixed };
  }
  let { paper, flow, fixed } = build();
  const disposeAll = () => { paper.dispose(); flow.destroy(); fixed.destroy(); };
  if (PAPER.paperImage) {
    loadPaperImage(PAPER.paperImage).then(img => {
      if (!img || disposed) return;
      image = img; disposeAll(); ({ paper, flow, fixed } = build());
    });
  }

  /** 粗い格子の 1 ステップ (秒数 sdt)。first はフレーム最初のステップ (前フレームの Fx を捨てる) */
  function step(sdt: number, first: boolean): void {
    const p = update.bind();
    gl.uniform1i(p.u.uFlow, flow.read.attach(0));
    gl.uniform1i(p.u.uProps, paper.attachProps(1));
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
    gl.uniform1f(p.u.uAgeDecay, Math.pow(0.5, sdt / PAPER.wetAgeHalfLife));
    gl.uniform1f(p.u.uDt, sdt);
    gl.uniform1f(p.u.uResetFix, first ? 1 : 0);
    blit(flow.write); flow.swap();
  }
  /** このフレームに定着した顔料 (Fx) を紙の目に沿って細かい格子の F に写す */
  function settleFixed(): void {
    const p = settle.bind();
    gl.uniform1i(p.u.uFixed, fixed.read.attach(0));
    gl.uniform1i(p.u.uFlow, flow.read.attach(1));
    gl.uniform1i(p.u.uPaper, paper.attach(2));
    gl.uniform1i(p.u.uProps, paper.attachProps(3));
    gl.uniform1f(p.u.uSettle, PAPER.settleStrength);
    blit(fixed.write); fixed.swap();
  }
  function render(): void {
    const p = display.bind();
    gl.uniform1i(p.u.uPaper, paper.attach(0));
    gl.uniform1i(p.u.uFixed, fixed.read.attach(1));
    gl.uniform1i(p.u.uFlow, flow.read.attach(2));
    gl.uniform1i(p.u.uProps, paper.attachProps(3));
    gl.uniform2f(p.u.uPaperPx, ctx.W / ctx.dpr, ctx.H / ctx.dpr);
    gl.uniform1f(p.u.uAspect, ctx.aspect);
    gl.uniform1f(p.u.uInkOpacity, PAPER.inkOpacity);
    gl.uniform1f(p.u.uCapacity, PAPER.capacity);
    gl.uniform1f(p.u.uSettle, PAPER.settleStrength);
    gl.uniform1f(p.u.uViewScale, PAPER.viewScale);
    gl.uniform1i(p.u.uView, VIEW_INDEX[PAPER.view]);
    blit(null);
  }

  return {
    name: 'paper',
    touchInks: true,   // 紙では指でも書ける (iPhone には Pencil が無い)
    frame(samples, dt, _time) {
      applyInputs({ gl, blit, depositFlow, depositFixed, flow, fixed, paper, aspect: ctx.aspect }, samples);
      if (dt > 0) {
        const steps = Math.max(1, Math.round(PAPER.flowSteps));
        for (let i = 0; i < steps; i++) step(dt / steps, i === 0);
        settleFixed();
      }
      render();
    },
    resize() { disposeAll(); ({ paper, flow, fixed } = build()); },
    clear() {
      // 新しい紙にする: 墨を消し、目の違う紙を生成し直す (画像の紙ではそのまま)
      seed = Math.floor(Math.random() * 1000);
      paper.regenerate(seed);
      clearState(flow, fixed);
    },
    dispose() { disposed = true; disposeAll(); },
  };
}
