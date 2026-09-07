#version 300 es
#include common/head.glsl
uniform sampler2D uVelocity, uSource; uniform vec2 texelSize; uniform float dt; uniform vec4 dissipation;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  o = dissipation * texture(uSource, coord);
}
