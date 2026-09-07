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
  Phase 4 (表示の統合: 共通の色ルール、湿り艶、文字と落款) まで済み。残りはデバッグパネルとプリセット (Phase 5)。

切替は画面右下の「水面 / 紙」、キーボードの `m`、または URL の `?mode=paper`。切替時にシミュレーションの状態は捨て、バッファは解放する。

| キー / URL | 働き |
|---|---|
| `c` / 「紙を替える」 | 水面: 墨を薄める。紙: 目の違う紙を生成し直す |
| `m` | モード切替 |
| `h` / `?view=height` | 紙モードで、紙の高さ (掠れ判定に使う凹凸) を白黒で見る |
| `v` / `?view=water` など | 紙モードで表示を切り替える: paper → height → water → pigment → fixed |
| `?mode=paper` | 紙モードで開く |

## 構成

```
src/
  main.ts            DOM の UI・URL パラメータ・描画ループ
  app/               App (GL 環境 + 入力層 + 現在のモード) と Mode インターフェース
  input/stroke.ts    入力層 (両モード共通): ポインタ → ストロークサンプル列。入り・抜き・とどまりの判定
  sim/               fluid モード。brush.ts がサンプルを水面への注入に変換し、fluid.ts が 1 ステップ進める
  paper/             paper モード。params.ts にパラメータ、paperTexture.ts が紙 (画像 or プロシージャル)、
                     brush.ts が筆、index.ts が毎フレームのパス
  text/textLayer.ts  文字と落款 (両モード共通、2D canvas → テクスチャ)。縦組みの文はモードごと
  shaders/           fluid のシェーダー。common/ は両モード共有 (#include で読む)
  paper/shaders/     paper のシェーダー
  config.ts          fluid の数値 (解像度、半減期など)
legacy/              分割前の単一ファイル版。挙動の比較用
tools/regress/       fluid の回帰確認ハーネス
```

- 紙画像を使うときは `src/paper/params.ts` の `paperImage` に URL を入れる。RGB が和紙の色、A が高さ (0..1)。
  無ければプロシージャル生成に落ちる。
- 文言を変えたら `npm run fonts` でサブセットフォントを作り直す (無い字はしっぽり明朝で出る)。
- 見出しの毛筆フォント「Sumi」は商用フォント (昭和書体 KSW清龍N) のためリポジトリに含めていない。
  無ければ `@fontsource/shippori-mincho` にフォールバックする。

## paper モードの仕組み (Phase 2〜4)

二つの格子を使う。

- **流れの格子 (粗い、短辺 `flowRes` = 384)**: 水 W、移動顔料 P、湿り年齢。毛細管拡散・顔料の移流・蒸発・定着を
  1 パスで計算する (`paper/shaders/update.frag`)。端末の解像度によらず同じ格子なので、にじみの広がりが揃う。
- **定着の格子 (細かい、短辺 1024 / 2048)**: 固定顔料 F。筆が置いた顔料の一部はその場で繊維に定着し (掠れの筋)、
  流れの格子で定着した分は紙の目に沿って写される (`settle.frag`)。

縁が濃くなる (コーヒーリング) のはノイズではなく物理から出る: 縁の薄い水が先に乾いてピン止めされ、内側から水が
流れ込んで顔料を運び、そこで定着する。流れる途中で顔料の一部は繊維に濾し取られ (`filterRate`)、暈は外へ向かって薄れる。
筆が置いた余分な水は表面の溜まりとして残り、放した後も数秒かけて暈に供給される。
`node tools/regress/paper.mjs --raw` で半径方向のプロファイルを見られる。

表示 (`paper/shaders/display-paper.frag`): 色の定数 (濃墨・薄墨・湿り墨・和紙・落款・光の向き) は `shaders/common/inkColor.glsl` を
fluid と共有する。濃度は F + P (P は紙の局所的な凹凸で沈殿ムラ)、湿り艶は水の膜の厚みから法線を作って fluid と同じ光を当てる。
文字と落款は共通の文字レイヤーで、湿った墨が乗ると縁がにじむ。

筆 (`paper/brush.ts`): 筆圧で半径、傾きで楕円。墨残量はストローク開始時 1 で、筆圧で重み付けした累積長ととどまった時間で減る。
接地判定は紙の高さで、しきい値は墨残量が減るほど・筆圧が低いほど上がる (`kasureMin` → `kasureMax`) ので、
掠れの筋は紙の凹凸と一致する。墨残量が `splitStart` を下回ると接地面が進行方向の細い筋に分かれる (毛の割れ)。

```sh
npm run regress:paper                          # 一点に 1.5 秒とどまる → にじみの広がりと縁の濃さの表
npm run regress:stroke                         # 墨容量を超える長さの線 → 区間ごとの被覆率と、F と紙の高さの相関
node tools/regress/paper.mjs --set diffusion=0.9 --set evapRate=0.1 --out shots   # パラメータを変えて試す
```

## fluid モードの回帰確認

モード分割前のコミット (`790b12e`) を基準に、同じポインタ列・同じ乱数で 240 フレーム動かし、25 か所の表示を比べる。

```sh
npm run regress                       # PASS / FAIL
node tools/regress/run.mjs --out shots --self-check   # 最終フレームの PNG も書き出す
node tools/regress/shader-diff.mjs    # #include 展開後のシェーダー全文を基準と比べる
```

macOS の Google Chrome を headless で使う。基準側は一時的な git worktree に出し、終わったら消す。
