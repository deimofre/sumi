#version 300 es
#include ../../shaders/common/head.glsl
#include ../../shaders/common/noise.glsl
#include ../../shaders/common/inkColor.glsl
// ---- paper モードの表示 (Phase 2: 紙 + 墨の濃度。艶・文字・落款は Phase 4) ----
uniform sampler2D uPaper;     // 細かい格子: RGB = 和紙の色、A = 高さ
uniform sampler2D uFixed;     // 細かい格子: R = 固定顔料 F
uniform sampler2D uFlow;      // 粗い格子: R = 水 W、G = 移動顔料 P、A = 湿り年齢
uniform vec2 uPaperPx;        // CSS ピクセル寸法 (ディザ用)
uniform float uAspect, uInkOpacity, uCapacity, uSettle, uViewScale;
uniform int uView;            // 0 通常 / 1 高さ / 2 水 / 3 移動顔料 / 4 固定顔料

void main() {
  vec2 px = vUv * uPaperPx;
  vec4 paper = texture(uPaper, vUv);
  float h = paper.a;
  float F = texture(uFixed, vUv).r;
  vec4 flow = texture(uFlow, vUv);
  float W = flow.r, P = flow.g;
  if (uView == 1) { o = vec4(vec3(h), 1.0); return; }
  // 状態の層は平方根で符号化して出す (8bit でも薄い値の分解能を保つ。読み戻し側で二乗して戻す)
  if (uView == 2) { o = vec4(vec3(sqrt(clamp(W * uViewScale, 0.0, 1.0))), 1.0); return; }
  if (uView == 3) { o = vec4(vec3(sqrt(clamp(P * uViewScale, 0.0, 1.0))), 1.0); return; }
  if (uView == 4) { o = vec4(vec3(sqrt(clamp(F * uViewScale, 0.0, 1.0))), 1.0); return; }

  float Pd = P * (1.0 + uSettle * (h - 0.5) * 2.0);                // 水に乗った顔料も紙の目で見える
  float a = 1.0 - exp(-(F + Pd) * uInkOpacity);                     // 濃度 → 不透明度 (重ねるほど飽和)
  vec3 inkCol = mix(INK_THIN, INK_DENSE, smoothstep(0.0, 0.9, a));  // 薄い所は青みが出る
  vec3 col = paper.rgb * (1.0 - 0.07 * clamp(W / uCapacity, 0.0, 1.0));   // 濡れた紙は少し暗い
  col = mix(col, inkCol, a);
  float vig = smoothstep(1.35, 0.3, length((vUv - 0.5) * vec2(uAspect, 1.0)));   // display.frag と同じ周辺減光
  col *= 0.94 + 0.06 * vig;
  col += (hash(px) - 0.5) / 255.0;   // ディザ
  o = vec4(col, 1.0);
}
