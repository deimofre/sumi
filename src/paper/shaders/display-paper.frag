#version 300 es
#include ../../shaders/common/head.glsl
#include ../../shaders/common/noise.glsl
#include ../../shaders/common/inkColor.glsl
// ---- paper モードの表示 (Phase 1: 紙だけ。墨・文字・落款は後のフェーズで足す) ----
uniform sampler2D uPaper;     // RGB = 和紙の色、A = 高さ
uniform vec2 uPaperPx;        // CSS ピクセル寸法 (ディザ用)
uniform float uAspect;
uniform int uView;            // 0 = 通常、1 = 高さを白黒で見る

void main() {
  vec2 px = vUv * uPaperPx;
  vec4 paper = texture(uPaper, vUv);
  if (uView == 1) { o = vec4(vec3(paper.a), 1.0); return; }

  vec3 col = paper.rgb;
  float vig = smoothstep(1.35, 0.3, length((vUv - 0.5) * vec2(uAspect, 1.0)));   // display.frag と同じ周辺減光
  col *= 0.94 + 0.06 * vig;
  col += (hash(px) - 0.5) / 255.0;   // ディザ
  o = vec4(col, 1.0);
}
