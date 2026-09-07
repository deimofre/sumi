// fonts-src/*.{otf,ttf,woff,woff2} を「使う文字 + かな + 英数」だけに絞り、
// public/fonts/*.woff2 と src/fonts.css を生成する。
//   npm run fonts
// 文言を変えて新しい漢字が増えたら再実行する (index.html と文字レイヤー・各モードの文から自動で拾う)。
// 自動で拾えない文字は tools/extra-glyphs.txt に書いておくと追加される。
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

// パスに日本語が含まれても壊れないよう fileURLToPath を使う (URL.pathname はエンコードされる)
const root = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(root, 'fonts-src');
const OUT = join(root, 'public/fonts');
const CSS = join(root, 'src/fonts.css');
const FAMILY = 'Sumi';   // style.css / textLayer.ts が参照する font-family 名

// ---- 1. 残す文字を集める ----
const range = (a, b) => { let s = ''; for (let c = a; c <= b; c++) s += String.fromCodePoint(c); return s; };
let chars = range(0x20, 0x7e)      // ASCII
  + range(0x3000, 0x303f)          // 句読点・記号
  + range(0x3041, 0x309f)          // ひらがな
  + range(0x30a0, 0x30ff)          // カタカナ・ー
  + range(0xff01, 0xff5e)          // 全角英数
  + '—…〜・';
for (const f of ['index.html', 'src/text/textLayer.ts', 'src/sim/index.ts', 'src/paper/index.ts', 'tools/extra-glyphs.txt']) {
  const p = join(root, f);
  if (existsSync(p)) chars += readFileSync(p, 'utf8');
}
const keep = [...new Set(chars)].filter((ch) => {
  const c = ch.codePointAt(0);
  return c >= 0x20 && c !== 0x7f && !(c >= 0x80 && c < 0xa0);
}).join('');

// ---- 2. サブセット化 ----
const files = existsSync(SRC) ? readdirSync(SRC).filter((f) => /\.(ttf|otf|woff2?)$/i.test(f)) : [];
if (!files.length) { console.error('fonts-src/ に otf / ttf がありません'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const faces = [];
for (const f of files) {
  const input = readFileSync(join(SRC, f));
  const out = await subsetFont(input, keep, { targetFormat: 'woff2' });
  const name = basename(f, extname(f)).replace(/[^\w-]+/g, '-') + '.woff2';
  writeFileSync(join(OUT, name), out);
  // 1ファイルだけなら全ウェイトをこれで賄う (合成ボールドを避ける)。複数ならファイル名で判定
  const weight = files.length === 1 ? '100 900' : /bold|heavy|black|semibold|medium/i.test(f) ? '700' : '400';
  faces.push({ file: f, name, weight, from: input.length, to: out.length });
}

// ---- 3. CSS ----
const css = faces.map((x) =>
  `@font-face {\n  font-family: "${FAMILY}";\n  font-style: normal;\n  font-weight: ${x.weight};\n  font-display: swap;\n  src: url(/fonts/${x.name}) format("woff2");\n}`,
).join('\n');
writeFileSync(CSS, `/* tools/subset-font.mjs が生成する。手で編集しない */\n${css}\n`);

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`残した文字: ${[...keep].length} 字`);
for (const x of faces) console.log(`${x.file} → public/fonts/${x.name}  ${kb(x.from)} → ${kb(x.to)}  (weight ${x.weight})`);
console.log(`src/fonts.css を更新`);
