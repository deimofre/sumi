#version 300 es
#include common/head.glsl
uniform sampler2D uTexture; uniform float value;
void main() { o = value * texture(uTexture, vUv); }
