// ============================================================
// paper モードの筆 (Phase 2 の仮): サンプルごとに接地面 (円) へ水と顔料を載せる。
//   細かい格子 (F):    顔料の一部 (brushFixFraction) が接地した繊維にその場で定着する → 掠れの筋
//   粗い格子 (W, P):   水と残りの顔料。ここから毛細管でにじむ
// 接地面の楕円化・毛の割れ・墨残量・高さによる掠れの本調整は Phase 3
// ============================================================
import type { DoubleFBO, FBO } from '../gl/fbo.ts';
import type { Program } from '../gl/program.ts';
import { MOVE_SPACING, type StrokeSample } from '../input/stroke.ts';
import { PAPER } from './params.ts';
import type { PaperTexture } from './paperTexture.ts';

export interface DepositTarget {
  gl: WebGL2RenderingContext;
  blit: (t: FBO | null) => void;
  depositFlow: Program; depositFixed: Program;
  flow: DoubleFBO; fixed: DoubleFBO;
  paper: PaperTexture;
  aspect: number;
}

interface Dab { x: number; y: number; radius: number; water: number; pigment: number }

/** サンプル → 接地面の大きさと供給量 (筆モデル)。Phase 3 でここが本実装になる */
function dabOf(sp: StrokeSample): Dab | null {
  if (!sp.ink) return null;
  const size = 0.35 + 0.65 * sp.pressure;   // 筆圧で半径
  const R = PAPER.brushRadius;
  switch (sp.kind) {
    case 'drop':   // 穂先が触れた点。まだ小さい
      return { x: sp.x, y: sp.y, radius: R * size * 0.5, water: PAPER.brushWater * 0.5, pigment: PAPER.brushPigment * 0.5 };
    case 'move': { // 入りで太くなる。補間点の間隔が広いときは供給量で補う
      const len = sp.spacing / MOVE_SPACING;
      return { x: sp.x, y: sp.y, radius: R * size * (0.45 + 0.55 * sp.entry), water: PAPER.brushWater * len, pigment: PAPER.brushPigment * len };
    }
    case 'tail': { // 抜き: 尾の先ほど細く薄い
      const f = 1 - sp.t;
      return { x: sp.x, y: sp.y, radius: R * size * (0.15 + 0.85 * f), water: PAPER.brushWater * 0.8 * f * f, pigment: PAPER.brushPigment * 0.8 * f * f };
    }
    case 'hold':   // とどまり: 供給が続く。広がりは拡散から自然に出る
      return { x: sp.x, y: sp.y, radius: R * size, water: PAPER.holdWater * sp.dt, pigment: PAPER.holdPigment * sp.dt };
  }
}

/** このフレームのサンプルを flow / fixed テクスチャに加算する (read 側に直接、ピンポンしない) */
export function applyInputs(t: DepositTarget, samples: readonly StrokeSample[]): void {
  const dabs: Dab[] = [];
  for (const sp of samples) { const d = dabOf(sp); if (d) dabs.push(d); }
  if (dabs.length === 0) return;
  const { gl } = t;
  // 画面比を揃えた座標系 (短辺 = 1)
  const ax = t.aspect >= 1 ? t.aspect : 1, ay = t.aspect >= 1 ? 1 : 1 / t.aspect;
  const fixFrac = PAPER.brushFixFraction;
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);

  // 細かい格子: その場で定着する顔料
  let p = t.depositFixed.bind();
  gl.uniform1i(p.u.uPaper, t.paper.attach(0));
  gl.uniform2f(p.u.uAspect, ax, ay);
  gl.uniform1f(p.u.uThreshold, PAPER.contactThreshold);
  gl.uniform1f(p.u.uSoftness, PAPER.contactSoftness);
  for (const d of dabs) {
    gl.uniform2f(p.u.uCenter, d.x, d.y);
    gl.uniform2f(p.u.uHalf, d.radius / ax, d.radius / ay);
    gl.uniform1f(p.u.uRadius, d.radius);
    gl.uniform1f(p.u.uPigment, d.pigment * fixFrac);
    t.blit(t.fixed.read);
  }
  // 粗い格子: 水と、水に乗る顔料
  p = t.depositFlow.bind();
  gl.uniform1i(p.u.uProps, t.paper.attachProps(0));
  gl.uniform2f(p.u.uAspect, ax, ay);
  gl.uniform1f(p.u.uThreshold, PAPER.contactThreshold);
  gl.uniform1f(p.u.uSoftness, PAPER.contactSoftness);
  for (const d of dabs) {
    gl.uniform2f(p.u.uCenter, d.x, d.y);
    gl.uniform2f(p.u.uHalf, d.radius / ax, d.radius / ay);
    gl.uniform1f(p.u.uRadius, d.radius);
    gl.uniform1f(p.u.uWater, d.water);
    gl.uniform1f(p.u.uPigment, d.pigment * (1 - fixFrac));
    t.blit(t.flow.read);
  }
  gl.disable(gl.BLEND);
}
