#version 300 es
#include ../../shaders/common/head.glsl
// ---- Settle (細かい格子): 粗い格子でこのフレームに定着した顔料 (Fx) を、紙の目に沿って F に写す ----
// 重みは高さの「局所的な凹凸」(粗い格子の平均からの差) で決める。大きなムラには反応せず、繊維の稜線に集まる
uniform sampler2D uFixed;   // R = F
uniform sampler2D uFlow;    // B = Fx (粗い格子、バイリニアで補間)
uniform sampler2D uPaper;   // A = 高さ
uniform sampler2D uProps;   // A = 高さの平均 (粗い格子)
uniform float uSettle;      // 稜線に集まる度合い 0..1。平均はおよそ 1 のまま
void main() {
  float F = texture(uFixed, vUv).r;
  float fx = texture(uFlow, vUv).b;
  float h = texture(uPaper, vUv).a, hAvg = texture(uProps, vUv).a;
  float settle = clamp(1.0 + uSettle * (h - hAvg) * 2.5, 0.0, 2.0);
  o = vec4(F + fx * settle, 0.0, 0.0, 1.0);
}
