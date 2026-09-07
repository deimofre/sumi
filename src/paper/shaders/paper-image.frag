#version 300 es
#include ../../shaders/common/head.glsl
// ---- 紙画像を紙テクスチャの解像度に写す。画面比に合わせて中央を切り出す (cover) ----
uniform sampler2D uImage;
uniform vec2 uScale, uOffset;   // 紙の uv → 画像の uv
void main() { o = texture(uImage, vUv * uScale + uOffset); }
