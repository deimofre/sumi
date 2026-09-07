// 回帰・検証ランナーの共通部: vite CLI での配信と headless Chrome での取得
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const root = fileURLToPath(new URL('../..', import.meta.url));
export const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** dir を vite の開発サーバーで配信する。プログラム API (createServer) だと固まったので CLI を spawn する */
export async function serve(dir, port) {
  // stderr は inherit ではなく pipe で受ける。inherit だと、万一 kill し損ねたときに親のパイプが閉じず呼び出し元が固まる
  const child = spawn(join(root, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1', '--logLevel', 'error'],
                      { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', d => process.stderr.write(`[vite ${port}] ${d}`));
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return { url, child }; } catch { /* まだ起動中 */ }
    await sleep(100);
  }
  child.kill();
  throw new Error(`vite did not start in ${dir}`);
}
/** ページを headless Chrome で開き、ハーネスが埋め込んだ結果 (base64 JSON) を取り出す */
export function capture(url, windowSize = '900,600') {
  const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu-sandbox', '--no-first-run', '--hide-scrollbars',
    `--window-size=${windowSize}`, '--timeout=90000', '--dump-dom', url], { encoding: 'utf8', maxBuffer: 256 << 20 });
  const m = r.stdout.match(/@@RESULT@@([A-Za-z0-9+/=]+)@@END@@/);
  if (!m) throw new Error(`harness produced no result for ${url}\n${r.stderr.slice(-3000)}`);
  return JSON.parse(decodeURIComponent(escape(Buffer.from(m[1], 'base64').toString('latin1'))));
}
export function savePng(dataUrl, dir, name) {
  if (!dir || !dataUrl) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
}
export function argValue(args, flag) { return args.includes(flag) ? args[args.indexOf(flag) + 1] : null; }
