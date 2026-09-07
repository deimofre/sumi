// ============================================================
// paper モードの筆: ストロークサンプル → 接地面と、表面の膜に置く水と顔料
//   接地面: 筆圧で半径。動いているときは進行方向に伸びて後ろへずれる (穂の引きずり)、止まっているときは傾きで楕円
//   墨残量: ストローク開始時 1。筆圧で重み付けした累積長ととどまった時間で減る。供給量に比例し、掠れのしきい値を上げる
//   掠れ: 接地判定は紙の高さ (deposit-film.frag)。しきい値は墨残量が少ないほど・筆圧が低いほど・速いほど上がる
//   毛の割れ: 墨残量が少ない・筆圧が低い・速いとき、接地面が進行方向の細い筋に分かれる (シードはストロークごとに固定)
// ============================================================
import type { DoubleFBO, FBO } from '../gl/fbo.ts';
import type { Program } from '../gl/program.ts';
import { MOVE_SPACING, type StrokeSample } from '../input/stroke.ts';
import { clamp, smooth } from '../util/math.ts';
import { PAPER } from './params.ts';
import type { PaperTexture } from './paperTexture.ts';

export interface DepositTarget {
  gl: WebGL2RenderingContext;
  blit: (t: FBO | null) => void;
  depositFilm: Program;
  film: DoubleFBO;
  paper: PaperTexture;
  aspect: number;
}

interface Dab {
  /** 中心 (uv) と、中心をずらす量 (短辺 = 1) */
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

/** 速さ → 乾き (水面モードの「速いほどかすれる」と同じ曲線) */
const dryness = (speed: number) => smooth(0.55, 2.4, speed);

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
    case 'hold':   // とどまり: 供給が続く。染み込みきらない分が液だまりになる
      water = PAPER.holdWater * sp.dt; pigment = PAPER.holdPigment * sp.dt;
      break;
  }
  water *= ink; pigment *= ink;   // 供給量は墨残量に比例

  // 接地面の形。動いていれば進行方向に伸びて後ろへずれる (穂の引きずり)。止まっていれば傾きで楕円 (穂先が端)
  const dry = dryness(sp.speed);
  let a = radius, b = radius, ang = 0, shift = 0;
  if (sp.kind === 'move' || sp.kind === 'tail') {
    a = radius * (1 + PAPER.dragElongation * Math.min(sp.speed / 1.5, 1));
    ang = Math.atan2(sp.dirY, sp.dirX);
    shift = -(a - b) * 0.5;
  } else {
    const tilt = Math.hypot(sp.tiltX, sp.tiltY);
    if (tilt > 0.5) {
      a = radius * (1 + PAPER.tiltElongation * Math.min(tilt / 60, 1));
      ang = Math.atan2(-sp.tiltY, sp.tiltX);   // tiltY は画面の下向きが正、uv は上向きが正
      shift = (a - b) * 0.5;
    }
  }
  const cos = Math.cos(ang), sin = Math.sin(ang);

  // 掠れのしきい値と毛の割れ
  const threshold = PAPER.kasureMin + (PAPER.kasureMax - PAPER.kasureMin) * (1 - ink)
                  + PAPER.kasurePressure * (1 - pressure) + PAPER.kasureSpeed * dry;
  const splitInk = clamp(1 - ink / PAPER.splitStart, 0, 1);
  const splitPressure = clamp((0.5 - pressure) / 0.5, 0, 1) * 0.7;
  const split = Math.min(1, Math.max(splitInk, splitPressure, dry * 0.85));
  return { x: sp.x, y: sp.y, shiftX: cos * shift, shiftY: sin * shift, a, b, cos, sin, dirX: sp.dirX, dirY: sp.dirY,
           water, pigment, threshold, split, seed: sp.seed };
}

/** このフレームのサンプルを表面の膜に加算する (film.read に直接、ピンポンしない) */
export function applyInputs(t: DepositTarget, samples: readonly StrokeSample[]): void {
  const dabs: Dab[] = [];
  for (const sp of samples) { const d = dabOf(sp); if (d) dabs.push(d); }
  if (dabs.length === 0) return;
  const { gl } = t;
  // 画面比を揃えた座標系 (短辺 = 1)
  const ax = t.aspect >= 1 ? t.aspect : 1, ay = t.aspect >= 1 ? 1 : 1 / t.aspect;
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  const p = t.depositFilm.bind();
  gl.uniform1i(p.u.uPaper, t.paper.attach(0));
  gl.uniform2f(p.u.uAspect, ax, ay);
  gl.uniform1f(p.u.uSoftness, PAPER.contactSoftness);
  gl.uniform1f(p.u.uHairFreq, PAPER.hairFreq);
  for (const d of dabs) {
    const r = Math.max(d.a, d.b);
    gl.uniform2f(p.u.uCenter, d.x + d.shiftX / ax, d.y + d.shiftY / ay);
    gl.uniform2f(p.u.uHalf, r / ax, r / ay);
    gl.uniform2f(p.u.uAxes, d.a, d.b);
    gl.uniform2f(p.u.uRot, d.cos, d.sin);
    gl.uniform2f(p.u.uDir, d.dirX, d.dirY);
    gl.uniform1f(p.u.uSplit, d.split);
    gl.uniform1f(p.u.uSeed, d.seed);
    gl.uniform1f(p.u.uThreshold, d.threshold);
    gl.uniform1f(p.u.uWater, d.water);
    gl.uniform1f(p.u.uPigment, d.pigment);
    t.blit(t.film.read);
  }
  gl.disable(gl.BLEND);
}
