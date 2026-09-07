#version 300 es
#include common/head.glsl
#include common/noise.glsl
// 墨の注入。r=濃度 g=湿り。速い筆はかすれる (筆の毛の筋を進行方向に沿ったノイズで作る)
uniform sampler2D uTarget; uniform float aspectRatio, radius, amount, wet, kasure, seed; uniform vec2 point, dir;
void main() {
  vec2 p = vUv - point; p.x *= aspectRatio;
  float s = exp(-dot(p, p) / radius);
  vec2 q = vUv * vec2(aspectRatio, 1.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float hair = vnoise(vec2(dot(q, dir) * 70.0, dot(q, perp) * 1100.0) + seed);
  s *= mix(1.0, smoothstep(0.30, 0.78, hair), kasure);
  vec2 b = texture(uTarget, vUv).xy;
  float d = b.x + s * amount;
  float w = max(b.y, wet * clamp(s * 4.0, 0.0, 1.0));
  o = vec4(d, w, 0.0, 1.0);
}
