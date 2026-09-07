#version 300 es
#include ../../shaders/common/head.glsl
#include ../../shaders/common/noise.glsl
#include footprint.glsl
// ---- Deposit (細かい格子): 筆が置いた墨を表面の膜として載せる。加算ブレンドで film テクスチャに足す ----
// R += 水、G += 顔料。掠れは footprint の毛の割れ (進行方向の筋) で決まり、紙の目は uGrip の分だけ膜をむらにする
uniform sampler2D uPaper;              // A = 高さ
uniform float uWater, uPigment;
uniform float uGrip;                   // 紙の目の影響 0..1
void main() {
  float s = footprint(vUv);
  float h = texture(uPaper, vUv).a;
  float grain = mix(1.0, smoothstep(0.15, 0.85, h) * 1.4, uGrip);   // 高い所に少し多く、谷に少し少なく (平均はほぼ 1)
  float a = s * grain;
  o = vec4(uWater * a, uPigment * a, 0.0, 0.0);
}
