// 墨・和紙・落款の色設計。両モードの表示シェーダーと紙の生成シェーダーが共有する。
// 値は fluid モードの display.frag に直書きされていたものをそのまま移した (見た目は変えない)。
const vec3 PAPER_BASE = vec3(0.925, 0.905, 0.855);           // 和紙の基準色 (sRGB)
const vec3 INK_DENSE  = vec3(0.075, 0.070, 0.068);           // 濃墨
const vec3 INK_THIN   = vec3(0.34, 0.37, 0.385);             // 薄墨は青みが出る
const vec3 INK_WET    = vec3(0.035, 0.040, 0.055);           // 生乾きは深く艶がある
const vec3 SEAL_RED   = vec3(0.72, 0.20, 0.16);              // 落款の朱
const vec3 LIGHT_DIR  = normalize(vec3(-0.45, 0.75, 0.55));  // 左上からの光 (艶・立体感の計算用)
