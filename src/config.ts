export const CFG = {
  simRes: 192, dyeRes: 1024,
  pressureIters: 22, curl: 9,
  velHalfLife: 0.28,      // 墨は紙に染みてすぐ止まる
  inkHalfLife: 40,        // 秒。長く残るが際限なく黒くならない
  inkDecayInterval: 0.25, // 秒。墨の減衰をこの間隔でまとめて掛ける (fp16 の丸めで減衰が止まるのを防ぐ)
  wetHalfLife: 2.2,       // 乾くまでの目安
  warp: 0.032,
  bump: 6.0,              // 墨の厚みを高さに変換する倍率 (法線の傾き)
  gloss: 1.0,             // 光沢・立体感の強さ。0 で v3 と同じ見た目
  touchInks: false,       // 指でも墨を乗せるなら true (Pencil の無い端末向け)。false なら指は揺らすだけ
};
