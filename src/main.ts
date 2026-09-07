import '@fontsource/shippori-mincho/400.css';
import '@fontsource/shippori-mincho/600.css';
import './fonts.css';
import './style.css';

import { createApp } from './app/app.ts';
import { isModeName, type ModeName } from './app/mode.ts';
import { isView, PAPER, VIEWS } from './paper/params.ts';
import { createPanel } from './ui/panel.ts';

function main(): void {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const fallbackEl = document.getElementById('fallback') as HTMLElement;
  const fail = (msg?: string) => { fallbackEl.style.display = 'grid'; if (msg) fallbackEl.textContent = msg; };
  window.addEventListener('error', e => fail('エラー: ' + (e.message || e.error)));

  // ---- 1. URL パラメータ: ?mode=paper でモード、?view=height|water|pigment|fixed で paper の各層を見る ----
  const url = new URL(location.href);
  const modeParam = url.searchParams.get('mode');
  const viewParam = url.searchParams.get('view');
  if (isView(viewParam)) PAPER.view = viewParam;

  // ---- 2. App (WebGL2、入力層、モード)。紙の調整パネルは App より先に作り、前回の値を復元してから紙を作る ----
  let appRef: ReturnType<typeof createApp> = null;
  const panel = createPanel({ onRebuild: () => appRef?.mode.rebuild?.(), input: () => appRef?.input.last ?? { pressure: 0, tiltX: 0, tiltY: 0, down: false } });
  const app = createApp(canvas, isModeName(modeParam) ? modeParam : 'fluid');
  if (!app) { fail(); return; }
  appRef = app;

  // ---- 3. UI: モード切替・紙を替える ----
  const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-mode]')];
  const modeTexts = [...document.querySelectorAll<HTMLElement>('p[data-mode]')];
  const tuneButton = document.getElementById('tune') as HTMLButtonElement;
  function syncUi(): void {
    const name = app!.mode.name;
    for (const b of modeButtons) b.setAttribute('aria-pressed', String(b.dataset.mode === name));
    for (const p of modeTexts) p.hidden = p.dataset.mode !== name;
    tuneButton.hidden = name !== 'paper';           // 調整パネルは紙モードだけ
    if (name !== 'paper') panel.setVisible(false);
    // 再読み込みしても同じモードで開くよう URL に残す (fluid は既定なので付けない)
    if (name === 'fluid') url.searchParams.delete('mode'); else url.searchParams.set('mode', name);
    history.replaceState(null, '', url);
  }
  function setMode(name: ModeName): void { app!.setMode(name); syncUi(); }
  for (const b of modeButtons) b.addEventListener('click', () => { if (isModeName(b.dataset.mode)) setMode(b.dataset.mode); });
  document.getElementById('clear')!.addEventListener('click', () => app.clear());
  tuneButton.addEventListener('click', () => panel.toggle());
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.closest?.('.panel')) return;   // パネルの入力中はショートカットを効かせない
    switch (e.key.toLowerCase()) {
      case 'c': app.clear(); break;
      case 'm': setMode(app.mode.name === 'fluid' ? 'paper' : 'fluid'); break;
      case 'p': if (app.mode.name === 'paper') panel.toggle(); break;
      case 'h': PAPER.view = PAPER.view === 'height' ? 'paper' : 'height'; break;
      case 'v': PAPER.view = VIEWS[(VIEWS.indexOf(PAPER.view) + 1) % VIEWS.length]!; break;
    }
  });
  syncUi();
  if (url.searchParams.get('panel') === '1' && app.mode.name === 'paper') panel.setVisible(true);   // ?panel=1 で開いた状態で始める

  // ---- 4. ループ ----
  let last = performance.now(), time = 0;
  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 1 / 30) || 1 / 60;
    last = now; time += dt;
    app!.frame(dt, time);
    if (!panel.root.hidden) panel.tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
