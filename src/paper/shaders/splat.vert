#version 300 es
// 筆の接地面だけを描く小さな四角形。全画面ではなく中心と半径で位置決めする
precision highp float;
layout(location = 0) in vec2 aPos;
uniform vec2 uCenter;   // 中心 (uv)
uniform vec2 uHalf;     // 半径 (uv 単位。x と y で別)
out vec2 vUv, vL, vR, vT, vB;
void main() {
  vUv = uCenter + aPos * uHalf;
  vL = vUv; vR = vUv; vT = vUv; vB = vUv;
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}
