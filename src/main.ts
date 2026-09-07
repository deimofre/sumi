import '@fontsource/shippori-mincho/400.css';
import '@fontsource/shippori-mincho/600.css';
import './fonts.css';
import './style.css';

import { createApp } from './app/app.ts';
import { isModeName, type ModeName } from './app/mode.ts';
import { PAPER } from './paper/params.ts';

function main(): void {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const fallbackEl = document.getElementById('fallback') as HTMLElement;
  const fail = (msg?: string) => { fallbackEl.style.display = 'grid'; if (msg) fallbackEl.textContent = msg; };
  window.addEventListener('error', e => fail('エラー: ' + (e.message || e.error)));

  // ---- 1. URL パラメータ: ?mode=paper でモード、?view=height で紙の高さ表示 (paper モードの確認用) ----
  const url = new URL(location.href);
  const modeParam = url.searchParams.get('mode');
  if (url.searchParams.get('view') === 'height') PAPER.view = 'height';

  // ---- 2. App (WebGL2、入力層、モード) ----
  const app = createApp(canvas, isModeName(modeParam) ? modeParam : 'fluid');
  if (!app) { fail(); return; }

  // ---- 3. UI: モード切替・紙を替える ----
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-mode]')];
  const modeTexts = [...document.querySelectorAll<HTMLElement>('p[data-mode]')];
  function syncUi(): void {
    const name = app!.mode.name;
    for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === name));
    for (const p of modeTexts) p.hidden = p.dataset.mode !== name;
    // 再読み込みしても同じモードで開くよう URL に残す (fluid は既定なので付けない)
    if (name === 'fluid') url.searchParams.delete('mode'); else url.searchParams.set('mode', name);
    history.replaceState(null, '', url);
  }
  function setMode(name: ModeName): void { app!.setMode(name); syncUi(); }
  for (const b of modeButtons) b.addEventListener('click', () => { if (isModeName(b.dataset.mode)) setMode(b.dataset.mode); });
  document.getElementById('clear')!.addEventListener('click', () => app.clear());
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key.toLowerCase()) {
      case 'c': app.clear(); break;
      case 'm': setMode(app.mode.name === 'fluid' ? 'paper' : 'fluid'); break;
      case 'h': PAPER.view = PAPER.view === 'height' ? 'paper' : 'height'; break;
    }
  });
  syncUi();

  // ---- 4. ループ ----
  let last = performance.now(), time = 0;
  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 1 / 30) || 1 / 60;
    last = now; time += dt;
    app!.frame(dt, time);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
