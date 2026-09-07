#version 300 es
#include ../../shaders/common/head.glsl
// ---- Deposit (粗い格子): 筆の接地面に水と、水に乗る顔料を載せる。加算ブレンドで flow テクスチャに足す ----
// R += 水、G += 顔料、A += 接地 (湿り年齢。update で 1 に丸める)
uniform sampler2D uProps;              // A = 高さの平均
uniform vec2 uCenter, uAspect;         // 中心 (uv)、短辺 = 1 に揃える倍率
uniform float uRadius;                 // 半径 (短辺 = 1)
uniform float uWater, uPigment;        // 供給量
uniform float uThreshold, uSoftness;   // 接地: 高さがしきい値未満の所には付かない (乾いた筆は水も置かない)
void main() {
  vec2 p = (vUv - uCenter) * uAspect;
  float s = 1.0 - smoothstep(0.7, 1.0, length(p) / uRadius);   // 縁だけ柔らかい円
  float contact = smoothstep(uThreshold, uThreshold + uSoftness, texture(uProps, vUv).a);
  float a = s * contact;
  o = vec4(uWater * a, uPigment * a, 0.0, a);
}
