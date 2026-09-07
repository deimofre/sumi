#version 300 es
#include ../../shaders/common/head.glsl
#include ../../shaders/common/noise.glsl
#include footprint.glsl
// ---- Deposit (細かい格子): 筆が置いた墨を表面の膜として載せる。加算ブレンドで film テクスチャに足す ----
// R += 水、G += 顔料。接地判定に紙の高さを使う。しきい値は墨残量が少ないほど・筆圧が低いほど・速いほど上がるので、
// 墨のある筆はべったり付き、乾いた筆や速い払いでは高い繊維にだけ付いて掠れの筋が紙の凹凸と一致する
uniform sampler2D uPaper;              // A = 高さ
uniform float uWater, uPigment;
uniform float uThreshold, uSoftness;
void main() {
  float s = footprint(vUv);
  float contact = smoothstep(uThreshold, uThreshold + uSoftness, texture(uPaper, vUv).a);
  float a = s * contact;
  o = vec4(uWater * a, uPigment * a, 0.0, 0.0);
}
