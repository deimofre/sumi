#version 300 es
#include ../../shaders/common/head.glsl
#include ../../shaders/common/noise.glsl
#include footprint.glsl
// ---- Deposit (粗い格子): 筆の接地面に水と、水に乗る顔料を載せる。加算ブレンドで flow テクスチャに足す ----
// R += 水、G += 顔料、A += 接地 (湿り年齢。update で 1 に丸める)
// 接地は細かい紙の高さを 4 点見て平均する (乾いた筆は水もほとんど置かない → にじまない)
uniform sampler2D uPaper;              // 細かい紙 (A = 高さ)
uniform vec2 uCoarseTexel;             // この格子のテクセル寸法 (uv)
uniform float uWater, uPigment;
uniform float uThreshold, uSoftness;
float contactAt(vec2 uv) { return smoothstep(uThreshold, uThreshold + uSoftness, texture(uPaper, uv).a); }
void main() {
  float s = footprint(vUv);
  vec2 d = uCoarseTexel * 0.25;
  float contact = 0.25 * (contactAt(vUv + d) + contactAt(vUv - d) + contactAt(vUv + vec2(d.x, -d.y)) + contactAt(vUv + vec2(-d.x, d.y)));
  float a = s * contact;
  o = vec4(uWater * a, uPigment * a, 0.0, s);
}
