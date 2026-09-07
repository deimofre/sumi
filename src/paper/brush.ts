// ============================================================
// paper モードの筆 (Phase 3): ストロークサンプル → 接地面と供給量
//   接地面: 筆圧で半径、傾きで楕円 (長軸は傾いた方向、穂先が中心)。傾きの無い端末では円
//   墨残量: ストローク開始時 1。筆圧で重み付けした累積長と、とどまった時間で減る。供給量に比例し、掠れのしきい値を上げる
//   毛の割れ: 墨残量が少ない・筆圧が低いとき、接地面が進行方向の細い筋に分かれる (シードはストロークごとに固定)
//   掠れ: 接地判定に紙の高さを使う (deposit-fixed.frag)。しきい値は筆圧が低いほど・墨残量が少ないほど上がる
// ============================================================
import type { DoubleFBO, FBO } from '../gl/fbo.ts';
import type { Program } from '../gl/program.ts';
import { MOVE_SPACING, type StrokeSample } from '../input/stroke.ts';
import { clamp } from '../util/math.ts';
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

interface Dab {
  /** 中心 (uv) と、穂先が楕円の端に来るようにずらす量 (短辺 = 1) */
  x: number; y: number; shiftX: number; shiftY: number;
  /** 楕円の長軸・短軸 (短辺 = 1) と回転 */
  a: number; b: number; cos: number; sin: number;
  dirX: number; dirY: number;
  water: number; pigment: number;
  /** 接地しきい値 (紙の高さ) */
  threshold: number;
  /** 毛の割れ 0..1 */
  split: number;
  seed: number;
}

// ストロークごとの状態 (とどまって減った墨)。サンプルの seed が変わったら新しいストローク
const stroke = { seed: NaN, holdDrain: 0 };

/** 墨残量 0..1 */
function inkRemaining(sp: StrokeSample): number {
  if (sp.seed !== stroke.seed) { stroke.seed = sp.seed; stroke.holdDrain = 0; }
  if (sp.kind === 'hold') stroke.holdDrain += sp.dt * PAPER.holdDrain;
  return clamp(1 - sp.loadLen / PAPER.inkCapacity - stroke.holdDrain, 0, 1);
}

function dabOf(sp: StrokeSample): Dab | null {
  if (!sp.ink) return null;
  const ink = inkRemaining(sp);
  const pressure = sp.kind === 'tail' ? sp.pressure * (1 - sp.t) : sp.pressure;   // 抜きでは筆圧が抜けていく
  let radius = PAPER.brushRadius * (PAPER.pressureMin + (1 - PAPER.pressureMin) * pressure);
  let water: number, pigment: number;
  switch (sp.kind) {
    case 'drop':   // 穂先が触れた点。まだ小さい
      radius *= 0.5; water = PAPER.brushWater * 0.5; pigment = PAPER.brushPigment * 0.5;
      break;
    case 'move': { // 入りで太くなる。補間点の間隔が広いときは供給量で補う
      const len = sp.spacing / MOVE_SPACING;
      radius *= 0.45 + 0.55 * sp.entry; water = PAPER.brushWater * len; pigment = PAPER.brushPigment * len;
      break;
    }
    case 'tail': { // 抜き: 尾の先ほど細く薄い
      const f = 1 - sp.t;
      radius *= 0.15 + 0.85 * f; water = PAPER.brushWater * 0.8 * f * f; pigment = PAPER.brushPigment * 0.8 * f * f;
      break;
    }
    case 'hold':   // とどまり: 供給が続く。広がりは拡散から自然に出る
      water = PAPER.holdWater * sp.dt; pigment = PAPER.holdPigment * sp.dt;
      break;
  }
  water *= ink; pigment *= ink;   // 供給量は墨残量に比例

  // 傾き → 楕円。長軸は傾いた方向 (tiltY は画面の下向きが正、uv は上向きが正)。穂先 (ポインタ位置) が楕円の端に来るよう中心をずらす
  const tilt = Math.hypot(sp.tiltX, sp.tiltY);
  const elong = 1 + PAPER.tiltElongation * Math.min(tilt / 60, 1);
  const ang = tilt > 0.5 ? Math.atan2(-sp.tiltY, sp.tiltX) : 0;
  const a = radius * elong, b = radius;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const shift = (a - b) * 0.5;

  // 掠れのしきい値と毛の割れ
  const threshold = PAPER.kasureMin + (PAPER.kasureMax - PAPER.kasureMin) * (1 - ink) + PAPER.kasurePressure * (1 - pressure);
  const splitInk = clamp(1 - ink / PAPER.splitStart, 0, 1);
  const splitPressure = clamp((0.5 - pressure) / 0.5, 0, 1) * 0.7;
  return { x: sp.x, y: sp.y, shiftX: cos * shift, shiftY: sin * shift, a, b, cos, sin, dirX: sp.dirX, dirY: sp.dirY,
           water, pigment, threshold, split: Math.max(splitInk, splitPressure), seed: sp.seed };
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

  const setFootprint = (p: Program, d: Dab) => {
    const cx = d.x + d.shiftX / ax, cy = d.y + d.shiftY / ay;
    const r = Math.max(d.a, d.b);
    gl.uniform2f(p.u.uCenter, cx, cy);
    gl.uniform2f(p.u.uHalf, r / ax, r / ay);
    gl.uniform2f(p.u.uAxes, d.a, d.b);
    gl.uniform2f(p.u.uRot, d.cos, d.sin);
    gl.uniform2f(p.u.uDir, d.dirX, d.dirY);
    gl.uniform1f(p.u.uSplit, d.split);
    gl.uniform1f(p.u.uSeed, d.seed);
    gl.uniform1f(p.u.uThreshold, d.threshold);
  };
  const setCommon = (p: Program) => {
    gl.uniform1i(p.u.uPaper, t.paper.attach(0));
    gl.uniform2f(p.u.uAspect, ax, ay);
    gl.uniform1f(p.u.uSoftness, PAPER.contactSoftness);
    gl.uniform1f(p.u.uHairFreq, PAPER.hairFreq);
  };

  // 細かい格子: その場で定着する顔料 (掠れの筋)
  let p = t.depositFixed.bind();
  setCommon(p);
  for (const d of dabs) {
    setFootprint(p, d);
    gl.uniform1f(p.u.uPigment, d.pigment * fixFrac);
    t.blit(t.fixed.read);
  }
  // 粗い格子: 水と、水に乗る顔料
  p = t.depositFlow.bind();
  setCommon(p);
  gl.uniform2f(p.u.uCoarseTexel, t.flow.texelX, t.flow.texelY);
  for (const d of dabs) {
    setFootprint(p, d);
    gl.uniform1f(p.u.uWater, d.water);
    gl.uniform1f(p.u.uPigment, d.pigment * (1 - fixFrac));
    t.blit(t.flow.read);
  }
  gl.disable(gl.BLEND);
}
