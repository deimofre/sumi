#version 300 es
#include ../../shaders/common/head.glsl
// ---- 流れ用の紙の性質 (粗い格子): RG = 繊維の向き、B = 揃い具合 0..1、A = 高さの平均 ----
// 細かい紙テクスチャの高さから構造テンソルで繊維の向きを推定する (画像の紙でもプロシージャルでも同じ手順)。
// 勾配は ±2 細テクセルの差分で細かい目を飛ばし、9×9 細テクセル (2 刻み) の窓で平均する。
// 向きの正負は区別しない。多孔率は今のところ一様 (1) として扱う
uniform sampler2D uPaper;   // 細かい紙 (A = 高さ)
uniform vec2 uTexel;        // 細かい紙のテクセル寸法 (uv)
float H(vec2 off) { return texture(uPaper, vUv + off * uTexel).a; }
void main() {
  float jxx = 0.0, jxy = 0.0, jyy = 0.0, hsum = 0.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 c = vec2(x, y) * 2.0;
    float gx = H(c + vec2(2.0, 0.0)) - H(c - vec2(2.0, 0.0));
    float gy = H(c + vec2(0.0, 2.0)) - H(c - vec2(0.0, 2.0));
    jxx += gx * gx; jxy += gx * gy; jyy += gy * gy;
    hsum += H(c);
  }
  float theta = 0.5 * atan(2.0 * jxy, jxx - jyy);   // 勾配が最も強い向き。繊維はそれに直交する
  vec2 fiber = vec2(-sin(theta), cos(theta));
  float coherence = sqrt((jxx - jyy) * (jxx - jyy) + 4.0 * jxy * jxy) / (jxx + jyy + 1e-6);
  o = vec4(fiber * 0.5 + 0.5, coherence, hsum / 25.0);
}
