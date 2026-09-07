// ============================================================
// デバッグパネル (紙モード): PAPER_SCHEMA から自動生成するスライダー、プリセットの書き出し / 読み込み、fps。
// 外部ライブラリは使わない。
// 保存: ユーザーが動かした項目「だけ」を localStorage に持ち、次回はそれをコードの既定値の上に重ねる。
// 触っていない項目はコードの既定値が変わればそれに従う (以前は全項目を保存していて、既定値の更新が効かなかった)
// ============================================================
import { exportParams, importParams, isPaperKey, PAPER, PAPER_DEFS, resetParams, type PaperKey } from '../paper/params.ts';

const STORAGE_KEY = 'sumi.paper.overrides';   // 形式: { v: 1, values: { key: number } }
const STORAGE_VERSION = 1;

export interface Panel {
  readonly root: HTMLElement;
  setVisible(v: boolean): void;
  toggle(): void;
  /** 毎フレーム呼ぶ (fps の計測) */
  tick(dt: number): void;
}
export interface PanelOptions {
  /** 格子や紙を作り直す必要のあるパラメータが変わった */
  onRebuild: () => void;
  /** 入力の様子 (筆圧・傾きが届いているかの確認用)。毎フレーム読む */
  input?: () => { pressure: number; tiltX: number; tiltY: number; down: boolean };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const fmt = (v: number, step: number) => v.toFixed(Math.max(0, Math.ceil(-Math.log10(step))));

/** ユーザーが動かした項目 */
const overrides = new Map<PaperKey, number>();

/** 前回動かした項目を復元する。無ければ (古い形式なら) 何もしない */
function restore(): PaperKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { v?: number; values?: Record<string, unknown> };
    if (data.v !== STORAGE_VERSION || !data.values) return [];
    for (const [k, v] of Object.entries(data.values)) if (isPaperKey(k) && typeof v === 'number' && Number.isFinite(v)) overrides.set(k, v);
    return importParams(Object.fromEntries(overrides));
  } catch { return []; }
}
function persist(): void {
  try {
    if (overrides.size === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, values: Object.fromEntries(overrides) }));
  } catch { /* 保存できない環境では諦める */ }
}

export function createPanel(opts: PanelOptions): Panel {
  const root = el('div', 'panel');
  root.hidden = true;
  const inputs = new Map<PaperKey, { range: HTMLInputElement; out: HTMLOutputElement }>();

  // ---- 見出し: タイトル、fps、操作 ----
  const head = el('div', 'panel-head');
  head.append(el('span', 'panel-title', '紙の調整'));
  const fps = el('span', 'panel-fps', '');
  head.append(fps);
  const actions = el('div', 'panel-actions');
  const btn = (label: string, on: () => void) => { const b = el('button', undefined, label); b.type = 'button'; b.addEventListener('click', on); actions.append(b); return b; };
  btn('既定に戻す', () => { overrides.clear(); apply(resetParams()); });
  btn('書き出し', () => {
    const blob = new Blob([JSON.stringify(exportParams(), null, 2)], { type: 'application/json' });
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'sumi-paper-preset.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const file = el('input'); file.type = 'file'; file.accept = 'application/json,.json'; file.hidden = true;
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f) return;
    try {
      const changed = importParams(JSON.parse(await f.text()));
      for (const k of PAPER_DEFS) if (isPaperKey(k.key)) overrides.set(k.key, PAPER[k.key]);   // 読み込んだプリセットは全項目を保持する
      apply(changed);
    } catch { /* 壊れたファイルは無視 */ }
    file.value = '';
  });
  btn('読み込み', () => file.click());
  btn('閉じる', () => setVisible(false));
  head.append(actions, file);
  root.append(head);

  // ---- グループごとのスライダー ----
  let group = '';
  let groupEl: HTMLElement | null = null;
  for (const d of PAPER_DEFS) {
    if (d.hidden) continue;
    if (d.group !== group) {
      group = d.group;
      groupEl = el('section', 'panel-group');
      groupEl.append(el('h3', undefined, group));
      root.append(groupEl);
    }
    const key = d.key as PaperKey;
    const row = el('label', 'panel-row');
    const name = el('span', 'panel-name', d.label);
    const out = el('output', 'panel-value', fmt(PAPER[key], d.step));
    const range = el('input'); range.type = 'range';
    range.min = String(d.min); range.max = String(d.max); range.step = String(d.step); range.value = String(PAPER[key]);
    range.addEventListener('input', () => {
      PAPER[key] = Number(range.value);
      out.textContent = fmt(PAPER[key], d.step);
      overrides.set(key, PAPER[key]);
      persist();
      if (d.rebuild) opts.onRebuild();
    });
    row.append(name, out, range);
    if (d.hint) row.append(el('small', 'panel-hint', d.hint));
    groupEl!.append(row);
    inputs.set(key, { range, out });
  }

  /** PAPER の値を UI に反映して保存し、必要なら作り直す */
  function apply(changed: PaperKey[]): void {
    for (const d of PAPER_DEFS) {
      const i = inputs.get(d.key as PaperKey); if (!i) continue;
      const v = PAPER[d.key as PaperKey]; i.range.value = String(v); i.out.textContent = fmt(v, d.step);
    }
    persist();
    if (changed.some(k => PAPER_DEFS.find(d => d.key === k)?.rebuild)) opts.onRebuild();
  }
  function setVisible(v: boolean): void { root.hidden = !v; }

  // ---- fps と入力の様子: 0.25 秒ごとに更新 ----
  let acc = 0, n = 0;
  function tick(dt: number): void {
    acc += dt; n++;
    if (acc >= 0.25) {
      const inp = opts.input?.();
      const pen = inp ? ` · 筆圧 ${inp.down ? inp.pressure.toFixed(2) : '–'} · 傾き ${Math.hypot(inp.tiltX, inp.tiltY).toFixed(0)}°` : '';
      fps.textContent = `${(n / acc).toFixed(0)} fps · ${(acc / n * 1000).toFixed(1)} ms${pen}`;
      acc = 0; n = 0;
    }
  }

  // 起動時に、前回動かした項目だけを復元する (保存はユーザーが動かしたときだけ)
  try { localStorage.removeItem('sumi.paper.params'); } catch { /* 以前の形式 (全項目を保存) は捨てる */ }
  restore();
  for (const d of PAPER_DEFS) {
    const i = inputs.get(d.key as PaperKey); if (!i) continue;
    const v = PAPER[d.key as PaperKey]; i.range.value = String(v); i.out.textContent = fmt(v, d.step);
  }
  document.body.append(root);
  return { root, setVisible, toggle: () => setVisible(root.hidden), tick };
}
