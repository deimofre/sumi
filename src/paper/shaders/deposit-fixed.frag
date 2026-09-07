#version 300 es
#include ../../shaders/common/head.glsl
// ---- Deposit (細かい格子): 筆が置いた顔料のうち、接地した繊維にその場で定着する分。加算ブレンドで F に足す ----
// 接地判定に紙の高さを使うので、乾いた筆では高い繊維にだけ墨が付き、掠れの筋が紙の凹凸と一致する
uniform sampler2D uPaper;              // A = 高さ
uniform vec2 uCenter, uAspect;
uniform float uRadius, uPigment;
uniform float uThreshold, uSoftness;
void main() {
  vec2 p = (vUv - uCenter) * uAspect;
  float s = 1.0 - smoothstep(0.7, 1.0, length(p) / uRadius);
  float contact = smoothstep(uThreshold, uThreshold + uSoftness, texture(uPaper, vUv).a);
  o = vec4(uPigment * s * contact, 0.0, 0.0, 0.0);
}
