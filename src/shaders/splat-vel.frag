#version 300 es
#include common/head.glsl
// 速度の注入 (ガウシアン)
uniform sampler2D uTarget; uniform float aspectRatio, radius; uniform vec2 point, force;
void main() {
  vec2 p = vUv - point; p.x *= aspectRatio;
  float s = exp(-dot(p, p) / radius);
  o = vec4(texture(uTarget, vUv).xy + s * force, 0.0, 1.0);
}
