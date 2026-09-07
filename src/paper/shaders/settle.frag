#version 300 es
#include ../../shaders/common/head.glsl
// ---- Settle (細かい格子): 粗い格子でこのフレームに定着した顔料 (Fx) を、紙の目に沿って F に写す ----
uniform sampler2D uFixed;   // R = F
uniform sampler2D uFlow;    // B = Fx (粗い格子、バイリニアで補間)
uniform sampler2D uPaper;   // A = 高さ
uniform float uSettle;      // 高い所 (繊維) に多く沈む度合い 0..1。平均はおよそ 1 のまま
void main() {
  float F = texture(uFixed, vUv).r;
  float fx = texture(uFlow, vUv).b;
  float h = texture(uPaper, vUv).a;
  float settle = 1.0 + uSettle * (h - 0.5) * 2.0;
  o = vec4(F + fx * settle, 0.0, 0.0, 1.0);
}
