#version 300 es
#include ../../shaders/common/head.glsl
#include ../../shaders/common/noise.glsl
#include ../../shaders/common/inkColor.glsl
// ---- 紙の生成 (プロシージャル): RGB = 和紙の色 (sRGB)、A = 高さ (0..1、linear) ----
// 色は fluid モードの display.frag と同じ式で作り、見た目を揃える。
// 高さは掠れの判定・保水容量・沈殿ムラに使う。筆圧が低いほど高い所にしか墨が付かないので、
// 「しきい値 0.3〜0.8 でちょうど筋が出る」よう 0..1 に広く分布させる。
uniform vec2 uPaperPx;      // 紙の CSS ピクセル寸法。目の粗さを解像度や DPR に依存させない
uniform float uSeed;        // 紙ごとの乱数オフセット (紙を替えると変わる)。0 で fluid モードと同じ紙
uniform float uGrainScale, uFiberStrength, uLaidStrength, uHeightContrast;   // params.ts 参照

// 一方向に長く伸びた繊維の筋。angle 方向に沿って伸び、along / across がその方向と直交方向の周波数
float strand(vec2 p, float angle, float along, float across) {
  float c = cos(angle), s = sin(angle);
  vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  return vnoise(vec2(q.x * along, q.y * across));
}

void main() {
  vec2 px = vUv * uPaperPx + uSeed;

  // --- 色 (display.frag と同じ) ---
  float fiber = fbm(px * 0.045);                            // 大きなムラ
  float grain = vnoise(px * 0.6 / uGrainScale);             // 細かい目
  float laid  = vnoise(vec2(px.x * 0.02, px.y * 0.35));     // 簀の目 (横筋)
  vec3 albedo = PAPER_BASE * (0.955 + 0.055 * fiber + 0.025 * grain + 0.02 * laid);

  // --- 高さ ---
  // 細かい目を土台に、向きの違う 4 本立ての繊維の筋 (しきい値でまばらに) と、中くらいのムラを重ねる。
  // 繊維の筋が「高い所」になり、乾いた筆はそこにだけ墨を置く → 掠れの筋が紙の目に沿う
  // 座標を大きなノイズで少し歪ませ、筋がまっすぐな格子に見えないようにする
  vec2 warp = (vec2(fbm(px * 0.02), fbm(px * 0.02 + 31.7)) - 0.5) * 18.0;
  vec2 pw = px + warp;
  float ridges = 0.0;
  for (int i = 0; i < 5; i++) {
    float a = float(i) * 0.6283185 + 0.21 + 0.17 * float(i);   // 36° 刻み + 少しずらす (軸に揃えない)
    float n = strand(pw + float(i) * 37.0, a, 0.035, 0.28);    // 沿う方向に約 28px、直交方向に約 4px の周期
    ridges += smoothstep(0.56, 0.84, n);
  }
  ridges = min(ridges, 1.0);
  float lump = fbm(px * 0.12);                              // 中くらいのムラ (沈殿ムラの元)
  float h = 0.40 * grain + 0.20 * lump + 0.30 * ridges * uFiberStrength + 0.10 * laid * uLaidStrength;
  // 各項の平均を足すとおよそ 0.42。そこを中心に広げる
  h = 0.5 + (h - 0.42) * uHeightContrast;

  o = vec4(albedo, clamp(h, 0.0, 1.0));
}
