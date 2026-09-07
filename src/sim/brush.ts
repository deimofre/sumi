// ============================================================
// fluid モードの筆: ストロークサンプルを水面への注入 (スプラット) に変換する
// 数値は分割前 (legacy/) のものをそのまま。入力の解釈 (入り・抜き・とどまり) は src/input/stroke.ts
// ============================================================
import type { StrokeSample } from '../input/stroke.ts';
import { smooth } from '../util/math.ts';
import type { SimState } from './state.ts';

function splatVelocity(s: SimState, x: number, y: number, fx: number, fy: number, radius: number): void {
  const { gl, velocity, aspect } = s;
  const p = s.P.splatVel.bind();
  gl.uniform2f(p.u.texelSize, velocity.texelX, velocity.texelY);
  gl.uniform1i(p.u.uTarget, velocity.read.attach(0));
  gl.uniform1f(p.u.aspectRatio, aspect);
  gl.uniform2f(p.u.point, x, y);
  gl.uniform2f(p.u.force, fx, fy);
  gl.uniform1f(p.u.radius, aspect > 1 ? radius * aspect : radius);
  s.blit(velocity.write); velocity.swap();
}
function splatDye(s: SimState, x: number, y: number, amount: number, radius: number, kasure: number, wet: number,
                  dirX: number, dirY: number, seed: number): void {
  const { gl, dye, aspect } = s;
  const p = s.P.splatDye.bind();
  gl.uniform2f(p.u.texelSize, dye.texelX, dye.texelY);
  gl.uniform1i(p.u.uTarget, dye.read.attach(0));
  gl.uniform1f(p.u.aspectRatio, aspect);
  gl.uniform2f(p.u.point, x, y);
  gl.uniform2f(p.u.dir, dirX, dirY);
  gl.uniform1f(p.u.radius, aspect > 1 ? radius * aspect : radius);
  gl.uniform1f(p.u.amount, amount);
  gl.uniform1f(p.u.wet, wet);
  gl.uniform1f(p.u.kasure, kasure);
  gl.uniform1f(p.u.seed, seed);
  s.blit(dye.write); dye.swap();
}

/** 速いほどかすれる (速さ → かすれ係数 0..1) */
const kasureOf = (speed: number) => smooth(0.55, 2.4, speed);

export function applyInputs(s: SimState, samples: readonly StrokeSample[]): void {
  const { velocity } = s;
  for (const sp of samples) {
    switch (sp.kind) {
      case 'drop':
        // 穂先が触れた点。まだ小さい
        splatDye(s, sp.x, sp.y, 0.28, 0.00009, 0.0, 1.0, sp.dirX, sp.dirY, sp.seed);
        splatVelocity(s, sp.x, sp.y, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 0.0006);
        break;
      case 'move': {
        const kasure = kasureOf(sp.speed);
        const widthMul = (0.32 + 0.68 * sp.entry) * (1.0 - 0.5 * kasure) * (0.7 + 0.6 * sp.pressure);
        // 速度は sim テクセル/秒。ガウシアンの重なりを打ち消して指の速さに合わせる
        const velRadius = 0.0007;
        const overlap = Math.min(1, sp.spacing / (Math.sqrt(velRadius) * 1.77));
        const gain = (sp.ink ? 1.7 : 0.9) * overlap;
        const fx = sp.vx * velocity.width * gain;
        const fy = sp.vy * velocity.height * gain;
        const amount = sp.ink ? (0.17 - 0.11 * kasure) * (0.55 + 0.45 * sp.entry) : 0.0;
        const radius = 0.00028 * widthMul * widthMul;           // radius は幅の二乗で効く
        splatVelocity(s, sp.x, sp.y, fx, fy, velRadius);
        if (amount > 0) splatDye(s, sp.x, sp.y, amount, radius * (0.8 + 0.4 * Math.random()), kasure, 1.0, sp.dirX, sp.dirY, sp.seed);
        break;
      }
      case 'tail': {
        // 抜き: 尾の先ほど細く薄く、かすれる
        const f = 1 - sp.t;
        const w = (0.85 * f + 0.06) * (0.7 + 0.6 * sp.pressure);
        splatDye(s, sp.x, sp.y, 0.13 * f * f, 0.00028 * w * w, Math.min(1, kasureOf(sp.speed) + 0.75 * sp.t), 1.0, sp.dirX, sp.dirY, sp.seed);
        splatVelocity(s, sp.x, sp.y, sp.dirX * 30 * f, sp.dirY * 30 * f, 0.0005);
        break;
      }
      case 'hold': {
        // とどまると溜まる: 押したまま止まっている間、ゆっくり広がる
        const r = 0.00022 + Math.min(sp.hold, 3.5) * 0.00011;
        splatDye(s, sp.x, sp.y, 0.9 * sp.dt, r, 0.0, 1.0, sp.dirX, sp.dirY, sp.seed);
        if (sp.hold > 0.15) splatVelocity(s, sp.x, sp.y, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 0.0012);
        break;
      }
    }
  }
}
