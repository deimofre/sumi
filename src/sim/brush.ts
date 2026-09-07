// ============================================================
// 入力 (なぞる・押す・とどまる) とスプラット (注入)
// ============================================================
import { CFG } from '../config.ts';
import type { SimState } from './state.ts';

interface Move { x0: number; y0: number; x1: number; y1: number; dt: number; ink: boolean; pressure: number }
interface Drop { x: number; y: number }
interface Tail { x: number; y: number; dirX: number; dirY: number; speed: number; k: number; seed: number; pressure: number; p: number }

// down: ポインターが触れている。inking: その接触で墨が乗る (マウス/Pencil は押している間。指は CFG.touchInks 次第)
const ptr = { x: 0, y: 0, down: false, inking: false, inside: false, hold: 0, seed: 0, lastT: 0, dirX: 1, dirY: 0,
              strokeLen: 0, speed: 0, kasure: 0, pressure: 0.5 };
const moves: Move[] = [], drops: Drop[] = [], tails: Tail[] = [];

export function installPointerEvents(s: SimState): void {
  const { canvas } = s;
  const toUv = (e: PointerEvent) => ({ x: e.clientX / canvas.clientWidth, y: 1 - e.clientY / canvas.clientHeight });

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const p = toUv(e);
    ptr.down = true; ptr.inside = true; ptr.x = p.x; ptr.y = p.y; ptr.hold = 0;
    ptr.seed = Math.random() * 100; ptr.lastT = e.timeStamp;
    ptr.strokeLen = 0; ptr.speed = 0; ptr.kasure = 0;
    ptr.pressure = e.pressure > 0 ? e.pressure : 0.5;
    // 指は既定では墨を乗せず、水面を揺らすだけ (iPad では Pencil が筆、指が手)
    ptr.inking = e.pointerType !== 'touch' || CFG.touchInks;
    if (!ptr.inking) return;
    canvas.classList.add('is-down');   // カーソルを「墨を含んだ筆」に
    drops.push(p);   // 穂先が触れた点。まだ小さい
  });
  canvas.addEventListener('pointermove', e => {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const p = toUv(ev);
      if (!ptr.inside) { ptr.inside = true; ptr.x = p.x; ptr.y = p.y; ptr.lastT = ev.timeStamp; continue; }
      const dt = Math.max(2, ev.timeStamp - ptr.lastT) / 1000;
      ptr.lastT = ev.timeStamp;
      if (p.x !== ptr.x || p.y !== ptr.y) {
        // Pencil のホバー (触れていない) や指のなぞりは ink=false で速度だけを与える
        moves.push({ x0: ptr.x, y0: ptr.y, x1: p.x, y1: p.y, dt, ink: ptr.inking,
                     pressure: ev.pressure > 0 ? ev.pressure : 0.5 });
        ptr.hold = 0;
      }
      ptr.x = p.x; ptr.y = p.y;
    }
  });
  // 抜き: 筆が離れる瞬間の速さで、穂先が細く掠れて消える尾を引く
  function release() {
    if (ptr.inking && ptr.speed > 0.12) {
      tails.push({ x: ptr.x, y: ptr.y, dirX: ptr.dirX, dirY: ptr.dirY, speed: ptr.speed,
                   k: ptr.kasure, seed: ptr.seed, pressure: ptr.pressure, p: 0 });
    }
    ptr.down = false; ptr.inking = false;
    canvas.classList.remove('is-down');
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { release(); ptr.inside = false; });
}

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
function splatDye(s: SimState, x: number, y: number, amount: number, radius: number, kasure: number, wet: number): void {
  const { gl, dye, aspect } = s;
  const p = s.P.splatDye.bind();
  gl.uniform2f(p.u.texelSize, dye.texelX, dye.texelY);
  gl.uniform1i(p.u.uTarget, dye.read.attach(0));
  gl.uniform1f(p.u.aspectRatio, aspect);
  gl.uniform2f(p.u.point, x, y);
  gl.uniform2f(p.u.dir, ptr.dirX, ptr.dirY);
  gl.uniform1f(p.u.radius, aspect > 1 ? radius * aspect : radius);
  gl.uniform1f(p.u.amount, amount);
  gl.uniform1f(p.u.wet, wet);
  gl.uniform1f(p.u.kasure, kasure);
  gl.uniform1f(p.u.seed, ptr.seed);
  s.blit(dye.write); dye.swap();
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function applyInputs(s: SimState, dt: number): void {
  const { aspect, velocity } = s;
  // 画面比を揃えた座標系 (短辺 = 1)
  const ax = aspect >= 1 ? aspect : 1, ay = aspect >= 1 ? 1 : 1 / aspect;

  for (const d of drops) {
    splatDye(s, d.x, d.y, 0.28, 0.00009, 0.0, 1.0);
    splatVelocity(s, d.x, d.y, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 0.0006);
  }
  drops.length = 0;

  for (const m of moves) {
    const dxs = (m.x1 - m.x0) * ax, dys = (m.y1 - m.y0) * ay;
    const dist = Math.hypot(dxs, dys);
    if (dist < 1e-6) continue;
    const speed = Math.min(dist / m.dt, 3.0);                // 短辺/秒
    ptr.dirX = dxs / dist; ptr.dirY = dys / dist;
    const kasure = smooth(0.55, 2.4, speed);                 // 速いほどかすれる
    const n = Math.min(40, Math.max(1, Math.ceil(dist / 0.005)));
    // 入り: 穂先が触れてから筆の腹が乗るまで、短い距離で太くなる
    let entry = 1.0;
    if (m.ink) {
      entry = smooth(0.0, 0.04, ptr.strokeLen + dist * 0.5);
      ptr.strokeLen += dist;
      ptr.speed = ptr.speed * 0.5 + speed * 0.5;
      ptr.kasure = kasure;
      ptr.pressure = ptr.pressure * 0.6 + m.pressure * 0.4;
    }
    const widthMul = (0.32 + 0.68 * entry) * (1.0 - 0.5 * kasure) * (0.7 + 0.6 * m.pressure);
    // 速度は sim テクセル/秒。ガウシアンの重なりを打ち消して指の速さに合わせる
    const velRadius = 0.0007;
    const overlap = Math.min(1, (dist / n) / (Math.sqrt(velRadius) * 1.77));
    const gain = (m.ink ? 1.7 : 0.9) * overlap;
    const fx = (m.x1 - m.x0) / m.dt * velocity.width * gain;
    const fy = (m.y1 - m.y0) / m.dt * velocity.height * gain;
    const amount = m.ink ? (0.17 - 0.11 * kasure) * (0.55 + 0.45 * entry) : 0.0;
    const radius = 0.00028 * widthMul * widthMul;           // radius は幅の二乗で効く
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = m.x0 + (m.x1 - m.x0) * t, y = m.y0 + (m.y1 - m.y0) * t;
      splatVelocity(s, x, y, fx, fy, velRadius);
      if (amount > 0) splatDye(s, x, y, amount, radius * (0.8 + 0.4 * Math.random()), kasure, 1.0);
    }
  }
  moves.length = 0;

  for (const t of tails) {
    const p0 = t.p; t.p = Math.min(1, t.p + dt / 0.11);      // 抜きは一瞬 (約0.1秒)
    const len = Math.min(0.13, t.speed * 0.055);              // 速く離すほど長く細い尾
    const n = Math.max(1, Math.ceil((t.p - p0) * len / 0.004));
    ptr.dirX = t.dirX; ptr.dirY = t.dirY; ptr.seed = t.seed;
    for (let k = 0; k < n; k++) {
      const pr = p0 + (t.p - p0) * (k + 0.5) / n;
      const f = 1 - pr;
      const x = t.x + t.dirX * len * pr / ax, y = t.y + t.dirY * len * pr / ay;
      const w = (0.85 * f + 0.06) * (0.7 + 0.6 * t.pressure);
      splatDye(s, x, y, 0.13 * f * f, 0.00028 * w * w, Math.min(1, t.k + 0.75 * pr), 1.0);
      splatVelocity(s, x, y, t.dirX * 30 * f, t.dirY * 30 * f, 0.0005);
    }
  }
  for (let i = tails.length - 1; i >= 0; i--) if (tails[i]!.p >= 1) tails.splice(i, 1);

  // とどまると溜まる: 押したまま止まっている間、ゆっくり広がる (墨が乗る接触のときだけ)
  if (ptr.inking && ptr.inside) {
    ptr.hold += dt;
    const r = 0.00022 + Math.min(ptr.hold, 3.5) * 0.00011;
    splatDye(s, ptr.x, ptr.y, 0.9 * dt, r, 0.0, 1.0);
    if (ptr.hold > 0.15) splatVelocity(s, ptr.x, ptr.y, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 0.0012);
  }
}
