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
  Phase 5 (調整パネル・プリセット) まで済み。以後はパラメータの調整と、実機での見た目・性能の詰め。

切替は画面右下の「水面 / 紙」、キーボードの `m`、または URL の `?mode=paper`。切替時にシミュレーションの状態は捨て、バッファは解放する。

| キー / URL | 働き |
|---|---|
| `c` / 「紙を替える」 | 水面: 墨を薄める。紙: 目の違う紙を生成し直す |
| `m` | モード切替 |
| `h` / `?view=height` | 紙モードで、紙の高さ (掠れ判定に使う凹凸) を白黒で見る |
| `v` / `?view=water` など | 紙モードで表示を切り替える: paper → height → water → pigment → fixed |
| `?mode=paper` | 紙モードで開く |
| `p` / 「調整」 / `?panel=1` | 紙モードの調整パネルを開閉。値は自動で保存され、次回も復元される。JSON の書き出し / 読み込みと既定値への復帰もここ |

## 構成

```
src/
  main.ts            DOM の UI・URL パラメータ・描画ループ
  app/               App (GL 環境 + 入力層 + 現在のモード) と Mode インターフェース
  input/stroke.ts    入力層 (両モード共通): ポインタ → ストロークサンプル列。入り・抜き・とどまりの判定
  sim/               fluid モード。brush.ts がサンプルを水面への注入に変換し、fluid.ts が 1 ステップ進める
  paper/             paper モード。params.ts にパラメータの定義 (既定値・範囲・説明)、paperTexture.ts が紙 (画像 or プロシージャル)、
                     brush.ts が筆、index.ts が毎フレームのパス
  ui/panel.ts        調整パネル (params.ts の定義から自動生成。プリセットの書き出し / 読み込み、fps)
  text/textLayer.ts  文字と落款 (両モード共通、2D canvas → テクスチャ)。縦組みの文はモードごと
  shaders/           fluid のシェーダー。common/ は両モード共有 (#include で読む)
  paper/shaders/     paper のシェーダー
  config.ts          fluid の数値 (解像度、半減期など)
legacy/              分割前の単一ファイル版。挙動の比較用
tools/regress/       fluid の回帰確認ハーネス
```

- パラメータは `src/paper/params.ts` の `PAPER_SCHEMA` に集約している。既定値を変えるならここ。調整パネルの値は `localStorage` に
  保存されるので、既定値を変えた後は「既定に戻す」を押すか保存を消す。
- 紙画像を使うときは `src/paper/params.ts` の `paperImage` に URL を入れる。RGB が和紙の色、A が高さ (0..1)。
  無ければプロシージャル生成に落ちる。
- 文言を変えたら `npm run fonts` でサブセットフォントを作り直す (無い字はしっぽり明朝で出る)。
- 見出しの毛筆フォント「Sumi」は商用フォント (昭和書体 KSW清龍N) のためリポジトリに含めていない。
  無ければ `@fontsource/shippori-mincho` にフォールバックする。

## paper モードの仕組み (Phase 2〜4)

三つの層を二つの格子に置く。

- **表面の膜 (細かい、短辺 1024 / 2048)**: 筆が置いた墨そのもの (水と顔料)。濃く艶のある液体として描き、
  時間をかけて紙に染み込む (`soak.frag`)。紙が飽和している所では待つので、厚い墨ほど長く液だまりが残る。
  乾いた筆や速い払いでは筆の毛が割れ、墨を運ぶ毛が減って進行方向の筋になる (掠れ・飛白)。
- **流れの格子 (粗い、短辺 `flowRes` = 384)**: 染み込んだ水 W と移動顔料 P。毛細管拡散・顔料の移流・蒸発・定着を
  1 パスで計算する (`update.frag`)。端末の解像度によらず同じ格子なので、にじみの広がりが揃う。
- **定着の格子 (細かい)**: 固定顔料 F。染み込むとき顔料の一部はその場で繊維に定着し (筆の形そのまま)、
  流れの格子で定着した分は紙の目に沿って写される (`settle.frag`)。

縁が濃くなる (コーヒーリング) のはノイズではなく物理から出る: 縁の薄い水が先に乾いてピン止めされ、内側から水が
流れ込んで顔料を運び、そこで定着する。流れる途中で顔料の一部は繊維に濾し取られ (`filterRate`)、暈は外へ向かって薄れる。
筆が置いた余分な水は表面の溜まりとして残り、放した後も数秒かけて暈に供給される。
`node tools/regress/paper.mjs --raw` で半径方向のプロファイルを見られる。

表示 (`paper/shaders/display-paper.frag`): 色の定数 (濃墨・薄墨・湿り墨・和紙・落款・光の向き) は `shaders/common/inkColor.glsl` を
fluid と共有する。下から、和紙 → 染み込んだ墨 (F + P、マット。P は紙の局所的な凹凸で沈殿ムラ) → 文字と落款 → 表面の膜。
膜は厚みから法線を作って fluid と同じ光を当てるので、液だまりの縁の丸みと光沢が水面モードと同じ解像度で出る。

筆 (`paper/brush.ts`): 筆圧で半径 (`pressureMin` → 1 倍、指数 `pressureCurve`)。動いていれば進行方向に伸びて後ろへずれ
(穂の引きずり)、止まっていれば傾きで楕円。墨残量はストローク開始時 1 で、筆圧で重み付けした累積長ととどまった時間で減り
(`inkCapacity`)、供給量は残量の `inkFalloff` 乗なので、一筆の中で濃く滲む書き出しから薄く乾いた終わりへ変わる。
膜に置く量 (`brushWater` / `brushPigment`) は「筆が通った所の膜の厚さ」で、太さによらず同じ厚さになる。
掠れは筆の毛の割れで決まる: 墨残量が減る (`splitStart`)・筆圧が低い (`splitPressure`)・速く払う (`splitSpeed`) ほど
墨を運ぶ毛が減り、進行方向に筋が走る (シードはストロークごとに固定)。紙の目は `paperGrip` の分だけ膜をむらにするだけで、
0 にすれば掠れに関わらない。

```sh
npm run regress:paper                          # 一点に 1.5 秒とどまる → にじみの広がりと縁の濃さの表
npm run regress:stroke                         # 墨容量を超える長さの線 → 区間ごとの被覆率と、F と紙の高さの相関
node tools/regress/stroke.mjs --frames 35 --pressure 0.7 --out shots   # 速い払い (飛白)
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
