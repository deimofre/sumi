// ============================================================
// シミュレーション 1 ステップ
// ============================================================
import { CFG } from '../config.ts';
import type { SimState } from './state.ts';

// 墨の減衰を「まとめて掛ける」ための蓄積時間。
// ダイは半精度 (fp16、有効 11bit) なので、1フレームぶんの減衰率 0.9997 を掛けても
// 元の値に丸め戻されて濃い墨が永遠に減らない。動かさずに置いておく iPad で顕著になる
// (デスクトップはマウスの微動で流れが起き、再サンプリングのぶれで偶然減っていた)。
// 0.25 秒ぶんをまとめて掛けると減衰率が 0.9957 になり、丸め幅を十分に超える。
let inkAcc = 0;

export function step(s: SimState, dt: number): void {
  const { gl, P, blit, velocity, dye, pressure, divergence, curlBuf } = s;

  let p = P.curl.bind();
  gl.uniform2f(p.u.texelSize, velocity.texelX, velocity.texelY);
  gl.uniform1i(p.u.uVelocity, velocity.read.attach(0));
  blit(curlBuf);

  p = P.vorticity.bind();
  gl.uniform2f(p.u.texelSize, velocity.texelX, velocity.texelY);
  gl.uniform1i(p.u.uVelocity, velocity.read.attach(0));
  gl.uniform1i(p.u.uCurl, curlBuf.attach(1));
  gl.uniform1f(p.u.curl, CFG.curl);
  gl.uniform1f(p.u.dt, dt);
  blit(velocity.write); velocity.swap();

  p = P.divergence.bind();
  gl.uniform2f(p.u.texelSize, velocity.texelX, velocity.texelY);
  gl.uniform1i(p.u.uVelocity, velocity.read.attach(0));
  blit(divergence);

  p = P.clear.bind();
  gl.uniform2f(p.u.texelSize, pressure.texelX, pressure.texelY);
  gl.uniform1i(p.u.uTexture, pressure.read.attach(0));
  gl.uniform1f(p.u.value, 0.8);
  blit(pressure.write); pressure.swap();

  p = P.pressure.bind();
  gl.uniform2f(p.u.texelSize, velocity.texelX, velocity.texelY);
  gl.uniform1i(p.u.uDivergence, divergence.attach(0));
  for (let i = 0; i < CFG.pressureIters; i++) {
    gl.uniform1i(p.u.uPressure, pressure.read.attach(1));
    blit(pressure.write); pressure.swap();
  }

  p = P.gradient.bind();
  gl.uniform2f(p.u.texelSize, velocity.texelX, velocity.texelY);
  gl.uniform1i(p.u.uPressure, pressure.read.attach(0));
  gl.uniform1i(p.u.uVelocity, velocity.read.attach(1));
  blit(velocity.write); velocity.swap();

  const half = (hl: number) => Math.pow(0.5, dt / hl);
  p = P.advect.bind();
  gl.uniform2f(p.u.texelSize, velocity.texelX, velocity.texelY);
  gl.uniform1f(p.u.dt, dt);
  gl.uniform1i(p.u.uVelocity, velocity.read.attach(0));
  gl.uniform1i(p.u.uSource, velocity.read.attach(0));
  const vd = half(CFG.velHalfLife);
  gl.uniform4f(p.u.dissipation, vd, vd, 1, 1);
  blit(velocity.write); velocity.swap();

  inkAcc += dt;
  let inkD = 1;
  if (inkAcc >= CFG.inkDecayInterval) { inkD = Math.pow(0.5, inkAcc / CFG.inkHalfLife); inkAcc = 0; }
  if (s.fade > 0) { inkD *= 0.9; s.fade -= dt; }
  gl.uniform1i(p.u.uVelocity, velocity.read.attach(0));
  gl.uniform1i(p.u.uSource, dye.read.attach(1));
  gl.uniform4f(p.u.dissipation, inkD, half(CFG.wetHalfLife), 1, 1);
  blit(dye.write); dye.swap();
}
