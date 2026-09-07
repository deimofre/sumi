// ============================================================
// 入力層 (両モード共通): ポインタイベント → ストロークサンプル列
//
// 入り (穂先が触れてから筆の腹が乗るまで)・抜き (離した勢いで引く尾)・とどまり (押したまま止まる) の
// 判定はここで行う。各モードは受け取ったサンプルを「水面に流す」か「紙に載せる」かだけを決める。
// 数値と計算順は分割前の fluid 実装のまま (fluid モードの見た目を変えないため)。
// ============================================================
import { smooth } from '../util/math.ts';

/** 全サンプルに共通する情報。座標は uv (左下原点、0..1)、長さと速さは短辺 = 1 の等方座標系 */
interface SampleBase {
  x: number; y: number;
  /** 進行方向の単位ベクトル */
  dirX: number; dirY: number;
  /** 速さ (短辺/秒、上限 MAX_SPEED)。move は区間の速さ、tail は離す直前の区間の速さ */
  speed: number;
  /** 筆圧 0..1。筆圧の無い端末は 0.5。move は生の値、tail/hold はストローク内で平滑化した値 */
  pressure: number;
  /** 傾き (度)。傾きの無い端末は 0 */
  tiltX: number; tiltY: number;
  /** ストローク開始からの累積長と、筆圧で重み付けした累積長 (∫ pressure d len。墨残量の計算用) */
  strokeLen: number; loadLen: number;
  /** 入り係数 0..1。累積長が ENTRY_LEN に達するまでに 1 になる */
  entry: number;
  /** ストロークごとに固定の乱数シード (掠れの筋などに使う) */
  seed: number;
  /** 墨が乗る接触か。指のなぞりや Pencil のホバーは false (fluid では水面を揺らすだけ) */
  ink: boolean;
}
export type StrokeSample =
  /** 穂先が触れた点 (pointerdown) */
  | (SampleBase & { kind: 'drop' })
  /** なぞりの補間点。vx/vy はポインタの速度 (uv/秒)、spacing は補間点の間隔 */
  | (SampleBase & { kind: 'move'; vx: number; vy: number; spacing: number })
  /** 抜きの外挿点。t は 0→1 の進み (1 で消える)。pressure は離した時点の値で、減衰は各モードが t から掛ける */
  | (SampleBase & { kind: 'tail'; t: number })
  /** 押したまま止まっている間、毎フレーム 1 つ。hold はとどまっている秒数、dt はこのフレームの秒数 */
  | (SampleBase & { kind: 'hold'; hold: number; dt: number });

export interface StrokeInput {
  /** このフレームのサンプルを取り出す (drop → move → tail → hold の順)。aspect は描画バッファの縦横比 W/H */
  collect(dt: number, aspect: number): StrokeSample[];
  /** 指でも墨を乗せるか (false なら指は ink=false のサンプルになる)。モードごとに切り替える */
  setTouchInks(v: boolean): void;
  /** 溜まっている入力と抜きの尾を捨てる (モード切替時) */
  reset(): void;
}

// サンプリング密度: なぞりは短辺の 0.5% 間隔 (1 イベントあたり最大 40 点)、抜きの尾は 0.4% 間隔
const MOVE_SPACING = 0.005, MOVE_MAX_SAMPLES = 40, TAIL_SPACING = 0.004;
// 入り: 累積長がこの距離 (短辺の 4%) に達するまでに筆の腹が乗る
const ENTRY_LEN = 0.04;
// 抜き: 離す瞬間の速さがこれを超えると尾を引く。尾の長さは速さに比例し (上限あり)、約 0.1 秒で消える
const TAIL_MIN_SPEED = 0.12, TAIL_LEN_PER_SPEED = 0.055, TAIL_MAX_LEN = 0.13, TAIL_DURATION = 0.11;
// 速さの上限 (短辺/秒)。これより速くても同じ扱い
const MAX_SPEED = 3.0;

interface Move { x0: number; y0: number; x1: number; y1: number; dt: number; ink: boolean; pressure: number; tiltX: number; tiltY: number }
interface Drop { x: number; y: number; seed: number; pressure: number; tiltX: number; tiltY: number }
interface Tail {
  x: number; y: number; dirX: number; dirY: number;
  speed: number; segSpeed: number; seed: number; pressure: number;
  strokeLen: number; loadLen: number; tiltX: number; tiltY: number;
  /** 0→1 の進み */
  p: number;
}

export function createStrokeInput(canvas: HTMLCanvasElement): StrokeInput {
  // inking: 今の接触で墨が乗る (マウス/Pencil は押している間。指は touchInks 次第)
  // speed は平滑化した速さ (尾の長さ用)、segSpeed は最後の区間の生の速さ (尾のかすれ用)
  const ptr = { x: 0, y: 0, inking: false, inside: false, hold: 0, seed: 0, lastT: 0, dirX: 1, dirY: 0,
                strokeLen: 0, loadLen: 0, speed: 0, segSpeed: 0, pressure: 0.5, tiltX: 0, tiltY: 0 };
  let touchInks = false;
  const moves: Move[] = [], drops: Drop[] = [], tails: Tail[] = [];
  const toUv = (e: PointerEvent) => ({ x: e.clientX / canvas.clientWidth, y: 1 - e.clientY / canvas.clientHeight });
  const pressureOf = (e: PointerEvent) => e.pressure > 0 ? e.pressure : 0.5;

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const p = toUv(e);
    ptr.inside = true; ptr.x = p.x; ptr.y = p.y; ptr.hold = 0;
    ptr.seed = Math.random() * 100; ptr.lastT = e.timeStamp;
    ptr.strokeLen = 0; ptr.loadLen = 0; ptr.speed = 0; ptr.segSpeed = 0;
    ptr.pressure = pressureOf(e); ptr.tiltX = e.tiltX; ptr.tiltY = e.tiltY;
    // 指は既定では墨を乗せない (iPad では Pencil が筆、指が手)
    ptr.inking = e.pointerType !== 'touch' || touchInks;
    if (!ptr.inking) return;
    canvas.classList.add('is-down');   // カーソルを「墨を含んだ筆」に
    drops.push({ x: p.x, y: p.y, seed: ptr.seed, pressure: ptr.pressure, tiltX: ptr.tiltX, tiltY: ptr.tiltY });
  });
  canvas.addEventListener('pointermove', e => {
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const p = toUv(ev);
      if (!ptr.inside) { ptr.inside = true; ptr.x = p.x; ptr.y = p.y; ptr.lastT = ev.timeStamp; continue; }
      const dt = Math.max(2, ev.timeStamp - ptr.lastT) / 1000;
      ptr.lastT = ev.timeStamp;
      if (p.x !== ptr.x || p.y !== ptr.y) {
        // Pencil のホバー (触れていない) や指のなぞりは ink=false のサンプルになる
        moves.push({ x0: ptr.x, y0: ptr.y, x1: p.x, y1: p.y, dt, ink: ptr.inking,
                     pressure: pressureOf(ev), tiltX: ev.tiltX, tiltY: ev.tiltY });
        ptr.hold = 0;
      }
      ptr.x = p.x; ptr.y = p.y;
    }
  });
  // 抜き: 筆が離れる瞬間の速さで、穂先が細く掠れて消える尾を引く
  function release(): void {
    if (ptr.inking && ptr.speed > TAIL_MIN_SPEED) {
      tails.push({ x: ptr.x, y: ptr.y, dirX: ptr.dirX, dirY: ptr.dirY, speed: ptr.speed, segSpeed: ptr.segSpeed,
                   seed: ptr.seed, pressure: ptr.pressure, strokeLen: ptr.strokeLen, loadLen: ptr.loadLen,
                   tiltX: ptr.tiltX, tiltY: ptr.tiltY, p: 0 });
    }
    ptr.inking = false;
    canvas.classList.remove('is-down');
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { release(); ptr.inside = false; });

  function collect(dt: number, aspect: number): StrokeSample[] {
    const out: StrokeSample[] = [];
    // 画面比を揃えた座標系 (短辺 = 1)
    const ax = aspect >= 1 ? aspect : 1, ay = aspect >= 1 ? 1 : 1 / aspect;

    for (const d of drops) {
      out.push({ kind: 'drop', x: d.x, y: d.y, dirX: ptr.dirX, dirY: ptr.dirY, speed: 0, pressure: d.pressure,
                 tiltX: d.tiltX, tiltY: d.tiltY, strokeLen: 0, loadLen: 0, entry: 0, seed: d.seed, ink: true });
    }
    drops.length = 0;

    for (const m of moves) {
      const dxs = (m.x1 - m.x0) * ax, dys = (m.y1 - m.y0) * ay;
      const dist = Math.hypot(dxs, dys);
      if (dist < 1e-6) continue;
      const speed = Math.min(dist / m.dt, MAX_SPEED);
      ptr.dirX = dxs / dist; ptr.dirY = dys / dist;
      const n = Math.min(MOVE_MAX_SAMPLES, Math.max(1, Math.ceil(dist / MOVE_SPACING)));
      // 入り: 穂先が触れてから筆の腹が乗るまで、短い距離で太くなる
      let entry = 1.0;
      const len0 = ptr.strokeLen, load0 = ptr.loadLen;
      if (m.ink) {
        entry = smooth(0.0, ENTRY_LEN, ptr.strokeLen + dist * 0.5);
        ptr.strokeLen += dist; ptr.loadLen += dist * m.pressure;
        ptr.speed = ptr.speed * 0.5 + speed * 0.5;
        ptr.segSpeed = speed;
        ptr.pressure = ptr.pressure * 0.6 + m.pressure * 0.4;
        ptr.tiltX = m.tiltX; ptr.tiltY = m.tiltY;
      }
      const vx = (m.x1 - m.x0) / m.dt, vy = (m.y1 - m.y0) / m.dt, spacing = dist / n;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        out.push({ kind: 'move', x: m.x0 + (m.x1 - m.x0) * t, y: m.y0 + (m.y1 - m.y0) * t,
                   dirX: ptr.dirX, dirY: ptr.dirY, speed, pressure: m.pressure, tiltX: m.tiltX, tiltY: m.tiltY,
                   strokeLen: len0 + dist * t, loadLen: load0 + dist * t * m.pressure, entry, seed: ptr.seed, ink: m.ink,
                   vx, vy, spacing });
      }
    }
    moves.length = 0;

    for (const t of tails) {
      const p0 = t.p; t.p = Math.min(1, t.p + dt / TAIL_DURATION);
      const len = Math.min(TAIL_MAX_LEN, t.speed * TAIL_LEN_PER_SPEED);   // 速く離すほど長く細い尾
      const n = Math.max(1, Math.ceil((t.p - p0) * len / TAIL_SPACING));
      for (let k = 0; k < n; k++) {
        const pr = p0 + (t.p - p0) * (k + 0.5) / n;
        out.push({ kind: 'tail', x: t.x + t.dirX * len * pr / ax, y: t.y + t.dirY * len * pr / ay,
                   dirX: t.dirX, dirY: t.dirY, speed: t.segSpeed, pressure: t.pressure, tiltX: t.tiltX, tiltY: t.tiltY,
                   strokeLen: t.strokeLen + len * pr, loadLen: t.loadLen + len * pr * t.pressure, entry: 1, seed: t.seed, ink: true,
                   t: pr });
      }
    }
    for (let i = tails.length - 1; i >= 0; i--) if (tails[i]!.p >= 1) tails.splice(i, 1);

    // とどまり: 押したまま止まっている間 (墨が乗る接触のときだけ)
    if (ptr.inking && ptr.inside) {
      ptr.hold += dt;
      out.push({ kind: 'hold', x: ptr.x, y: ptr.y, dirX: ptr.dirX, dirY: ptr.dirY, speed: 0, pressure: ptr.pressure,
                 tiltX: ptr.tiltX, tiltY: ptr.tiltY, strokeLen: ptr.strokeLen, loadLen: ptr.loadLen, entry: 1, seed: ptr.seed, ink: true,
                 hold: ptr.hold, dt });
    }
    return out;
  }

  return {
    collect,
    setTouchInks(v) { touchInks = v; },
    reset() { moves.length = 0; drops.length = 0; tails.length = 0; ptr.hold = 0; },
  };
}
