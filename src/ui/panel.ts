// ============================================================
// デバッグパネル (紙モード): PAPER_SCHEMA から自動生成するスライダー、プリセットの書き出し / 読み込み、fps。
// 外部ライブラリは使わない。値は localStorage に自動保存し、次回の読み込み時に復元する
// ============================================================
import { exportParams, importParams, PAPER, PAPER_DEFS, resetParams, type PaperKey } from '../paper/params.ts';

const STORAGE_KEY = 'sumi.paper.params';

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
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const fmt = (v: number, step: number) => v.toFixed(Math.max(0, Math.ceil(-Math.log10(step))));

/** 前回の値を復元する。無ければ何もしない */
function restore(): PaperKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? importParams(JSON.parse(raw)) : [];
  } catch { return []; }
}
function persist(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(exportParams())); } catch { /* 保存できない環境では諦める */ }
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
  btn('既定に戻す', () => { apply(resetParams()); });
  btn('書き出し', () => {
    const blob = new Blob([JSON.stringify(exportParams(), null, 2)], { type: 'application/json' });
    const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'sumi-paper-preset.json';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const file = el('input'); file.type = 'file'; file.accept = 'application/json,.json'; file.hidden = true;
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f) return;
    try { apply(importParams(JSON.parse(await f.text()))); } catch { /* 壊れたファイルは無視 */ }
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
      persist();
      if (d.rebuild) opts.onRebuild();
    });
    row.append(name, out, range);
    if (d.hint) row.append(el('small', 'panel-hint', d.hint));
    groupEl!.append(row);
    inputs.set(key, { range, out });
  }

  /** PAPER の値を UI に反映し、必要なら作り直す */
  function apply(changed: PaperKey[]): void {
    for (const d of PAPER_DEFS) {
      const i = inputs.get(d.key as PaperKey); if (!i) continue;
      const v = PAPER[d.key as PaperKey]; i.range.value = String(v); i.out.textContent = fmt(v, d.step);
    }
    persist();
    if (changed.some(k => PAPER_DEFS.find(d => d.key === k)?.rebuild)) opts.onRebuild();
  }
  function setVisible(v: boolean): void { root.hidden = !v; }

  // ---- fps: 0.5 秒ごとに平均を出す ----
  let acc = 0, n = 0;
  function tick(dt: number): void {
    acc += dt; n++;
    if (acc >= 0.5) { fps.textContent = `${(n / acc).toFixed(0)} fps · ${(acc / n * 1000).toFixed(1)} ms`; acc = 0; n = 0; }
  }

  // 起動時に前回の値を復元 (作り直しは呼び出し側が初期化後に行う)
  restore();
  apply([]);
  document.body.append(root);
  return { root, setVisible, toggle: () => setVisible(root.hidden), tick };
}
