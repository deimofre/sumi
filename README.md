# 墨 — WebGL2 流体サンプル

```sh
npm install
npm run dev       # 開発サーバー。iPad などから見るときは表示される LAN の URL を開く
npm run build     # 型チェック + dist/ にビルド
npm run preview   # dist/ を配信して確認
```

- `src/shaders/*.frag` が各パスのシェーダー。`common/` の共通チャンクは `#include` で読み込む。
- `src/config.ts` に解像度や半減期などの数値がまとまっている。
- `legacy/sumi-fluid-v3-brush.html` は分割前の単一ファイル版。挙動の比較用に残してある。
- 見出しの毛筆フォント「Sumi」は商用フォント (昭和書体 KSW清龍N) のためリポジトリに含めていない。無ければ `@fontsource/shippori-mincho` にフォールバックする。
