#version 300 es
#include ../../shaders/common/head.glsl
// ---- Settle (細かい格子): 固定顔料 F を増やす ----
//   1. 膜から染み込んだ顔料のうち、その場で繊維に定着する分 (brushFixFraction)。筆の接地面の形そのまま
//   2. 粗い格子でこのフレームに定着した顔料 (Fx。にじんだ分)。紙の局所的な凹凸に沿って集まる (沈殿ムラ)
uniform sampler2D uFixed;   // R = F
uniform sampler2D uFilm;    // B = 染み込んだ顔料
uniform sampler2D uFlow;    // B = Fx (粗い格子、バイリニアで補間)
uniform sampler2D uPaper;   // A = 高さ
uniform sampler2D uProps;   // A = 高さの平均 (粗い格子)
uniform float uSettle;      // 稜線に集まる度合い 0..1。平均はおよそ 1 のまま
uniform float uFixFrac;     // 染み込んだ顔料のうちその場で定着する割合
void main() {
  float F = texture(uFixed, vUv).r;
  float fromFilm = texture(uFilm, vUv).b * uFixFrac;
  float fx = texture(uFlow, vUv).b;
  float h = texture(uPaper, vUv).a, hAvg = texture(uProps, vUv).a;
  float settle = clamp(1.0 + uSettle * (h - hAvg) * 2.5, 0.0, 2.0);
  o = vec4(F + fromFilm + fx * settle, 0.0, 0.0, 1.0);
}
