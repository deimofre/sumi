#version 300 es
#include ../../shaders/common/head.glsl
// ---- Soak (細かい格子): 表面の膜が紙に染み込む ----
// film: R = 水、G = 顔料、B = このフレームに染み込んだ顔料 (settle が定着分を F へ、update が残りを流れへ)、A = 染み込んだ水
// 紙 (粗い格子) が飽和している所では染み込まず、膜は液だまりとして残る。膜は表面からも少し乾く
uniform sampler2D uFilm;
uniform sampler2D uFlow;    // 粗い格子: R = W
uniform sampler2D uProps;   // 粗い格子: A = 高さの平均 (容量に使う)
uniform float uSoak;        // 乾いた紙へ 1 秒に染み込む水
uniform float uEvap;        // 表面からの蒸発 (1 秒あたり)
uniform float uCapacity;
uniform float uDt;
void main() {
  vec4 f = texture(uFilm, vUv);
  float w = f.r, p = f.g;
  if (uDt <= 0.0) { o = vec4(w, p, 0.0, 0.0); return; }
  float cap = uCapacity * (0.6 + 0.8 * texture(uProps, vUv).a);
  float sat = clamp(1.0 - texture(uFlow, vUv).r / cap, 0.0, 1.0);
  float soaked = min(w, uSoak * uDt * (0.05 + 0.95 * sat));   // 飽和した紙にはほとんど入らない
  float dried  = min(w - soaked, uEvap * uDt);
  float gone = soaked + dried;
  float pGone = p * gone / max(w, 1e-4);                       // 顔料は水と一緒に膜を離れる
  w -= gone; p -= pGone;
  if (w < 0.002) { pGone += p; w = 0.0; p = 0.0; }             // 膜が無くなったら残りの顔料は全部紙へ
  o = vec4(w, p, pGone, soaked);
}
