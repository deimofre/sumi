# 墨 — WebGL2 サンプル (水面 / 紙)

```sh
npm install
npm run dev       # 開発サーバー。iPad などから見るときは表示される LAN の URL を開く
npm run build     # 型チェック + dist/ にビルド
npm run preview   # dist/ を配信して確認
npm run regress   # fluid モードの回帰確認 (macOS の Chrome が要る。下記)
```

## モード

- **水面 (fluid)**: 水面に墨を流す。分割前からの実装で、見た目と挙動は変えていない。
- **紙 (paper)**: 紙に筆で書く (毛細管にじみモデル)。`paper-ink-mode-spec.md` の指示書に沿って段階的に作っている。
  いまは Phase 1 (紙の生成と表示だけ)。

切替は画面右下の「水面 / 紙」、キーボードの `m`、または URL の `?mode=paper`。切替時にシミュレーションの状態は捨て、バッファは解放する。

| キー / URL | 働き |
|---|---|
| `c` / 「紙を替える」 | 水面: 墨を薄める。紙: 目の違う紙を生成し直す |
| `m` | モード切替 |
| `h` / `?view=height` | 紙モードで、紙の高さ (掠れ判定に使う凹凸) を白黒で見る |
| `?mode=paper` | 紙モードで開く |

## 構成

```
src/
  main.ts            DOM の UI・URL パラメータ・描画ループ
  app/               App (GL 環境 + 入力層 + 現在のモード) と Mode インターフェース
  input/stroke.ts    入力層 (両モード共通): ポインタ → ストロークサンプル列。入り・抜き・とどまりの判定
  sim/               fluid モード。brush.ts がサンプルを水面への注入に変換し、fluid.ts が 1 ステップ進める
  paper/             paper モード。params.ts にパラメータ、paperTexture.ts が紙 (画像 or プロシージャル)
  shaders/           fluid のシェーダー。common/ は両モード共有 (#include で読む)
  paper/shaders/     paper のシェーダー
  config.ts          fluid の数値 (解像度、半減期など)
legacy/              分割前の単一ファイル版。挙動の比較用
tools/regress/       fluid の回帰確認ハーネス
```

- 紙画像を使うときは `src/paper/params.ts` の `paperImage` に URL を入れる。RGB が和紙の色、A が高さ (0..1)。
  無ければプロシージャル生成に落ちる。
- 見出しの毛筆フォント「Sumi」は商用フォント (昭和書体 KSW清龍N) のためリポジトリに含めていない。
  無ければ `@fontsource/shippori-mincho` にフォールバックする。

## fluid モードの回帰確認

モード分割前のコミット (`790b12e`) を基準に、同じポインタ列・同じ乱数で 240 フレーム動かし、25 か所の表示を比べる。

```sh
npm run regress                       # PASS / FAIL
node tools/regress/run.mjs --out shots --self-check   # 最終フレームの PNG も書き出す
node tools/regress/shader-diff.mjs    # #include 展開後のシェーダー全文を基準と比べる
```

macOS の Google Chrome を headless で使う。基準側は一時的な git worktree に出し、終わったら消す。
