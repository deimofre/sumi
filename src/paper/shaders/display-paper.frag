#version 300 es
#include ../../shaders/common/head.glsl
#include ../../shaders/common/noise.glsl
#include ../../shaders/common/inkColor.glsl
// ---- paper モードの表示: 紙・墨の濃度と沈殿ムラ・湿り艶・文字と落款 ----
// 色の設計 (濃墨・薄墨・湿り墨・和紙・落款・光の向き) は common/inkColor.glsl を fluid と共有する。
// 艶の当て方も fluid の display.frag と同じ式だが、高さの元が「墨の厚み」ではなく「水の膜」になる
uniform sampler2D uPaper;     // 細かい格子: RGB = 和紙の色、A = 高さ
uniform sampler2D uFixed;     // 細かい格子: R = 固定顔料 F
uniform sampler2D uFlow;      // 粗い格子: R = 水 W、G = 移動顔料 P、A = 湿り年齢
uniform sampler2D uProps;     // 粗い格子: A = 高さの平均
uniform sampler2D uText;      // 文字レイヤー: r = 文字、g = 落款
uniform vec2 uPaperPx;        // CSS ピクセル寸法 (ディザ・ノイズ用)
uniform vec2 uFineTexel, uCoarseTexel;
uniform float uAspect, uInkOpacity, uCapacity, uSettle, uViewScale;
uniform float uTime, uGloss, uBump, uWetDarken;
uniform int uView;            // 0 通常 / 1 高さ / 2 水 / 3 移動顔料 / 4 固定顔料 / 5 診断

void main() {
  vec2 px = vUv * uPaperPx;
  vec4 paper = texture(uPaper, vUv);
  float h = paper.a;
  float F = texture(uFixed, vUv).r;
  vec4 flow = texture(uFlow, vUv);
  float W = flow.r, P = flow.g, age = flow.a;
  float hAvg = texture(uProps, vUv).a;
  if (uView == 1) { o = vec4(vec3(h), 1.0); return; }
  // 状態の層は平方根で符号化して出す (8bit でも薄い値の分解能を保つ。読み戻し側で二乗して戻す)
  if (uView == 2) { o = vec4(vec3(sqrt(clamp(W * uViewScale, 0.0, 1.0))), 1.0); return; }
  if (uView == 3) { o = vec4(vec3(sqrt(clamp(P * uViewScale, 0.0, 1.0))), 1.0); return; }
  if (uView == 4) { o = vec4(vec3(sqrt(clamp(F * uViewScale, 0.0, 1.0))), 1.0); return; }
  // 診断: 負や NaN を赤 (F)、緑 (P)、青 (W) で示す (>= の比較は NaN で偽になる)
  if (uView == 5) { o = vec4(F >= 0.0 ? 0.0 : 1.0, P >= 0.0 ? 0.0 : 1.0, W >= 0.0 ? 0.0 : 1.0, 1.0); return; }

  // --- 濃度: 固定顔料 + 水に乗った顔料 (紙の局所的な凹凸で沈殿ムラ、settle.frag と同じ重み) ---
  float Pd = P * clamp(1.0 + uSettle * (h - hAvg) * 2.5, 0.0, 2.0);
  float a = 1.0 - exp(-(F + Pd) * uInkOpacity);                     // 濃度 → 不透明度 (重ねるほど飽和)
  float wetness = clamp(W / uCapacity, 0.0, 1.0);
  float wet = smoothstep(0.02, 0.35, W) * mix(0.5, 1.0, age);        // 湿り: 水の膜があり、載せたばかりほど艶がある
  vec3 inkCol = mix(INK_THIN, INK_DENSE, smoothstep(0.0, 0.9, a));  // 薄い所は青みが出る
  inkCol = mix(inkCol, INK_WET, wet * a * 0.85);                     // 生乾きは深く艶がある

  // --- 艶: 水の膜の厚みを高さとみなし、勾配から法線を作って光を当てる (fluid と同じ光) ---
  vec2 e = uCoarseTexel;
  float gx = texture(uFlow, vUv + vec2(e.x, 0.0)).r - texture(uFlow, vUv - vec2(e.x, 0.0)).r;
  float gy = texture(uFlow, vUv + vec2(0.0, e.y)).r - texture(uFlow, vUv - vec2(0.0, e.y)).r;
  gx += (h - hAvg) * 0.6; gy += (texture(uPaper, vUv + vec2(0.0, uFineTexel.y)).a - h) * 0.6;   // 紙の目が膜の表面に写る
  vec3 N = normalize(vec3(-gx * uBump * wet, -gy * uBump * wet, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Hv = normalize(LIGHT_DIR + V);
  float gloss = mix(0.05, 1.0, wet);
  float spec = pow(max(dot(N, Hv), 0.0), mix(14.0, 110.0, gloss)) * gloss;
  float fres = pow(1.0 - max(N.z, 0.0), 3.0) * gloss;
  vec3 R = reflect(-V, N);
  float winRefl = smoothstep(0.15, 0.85, R.y) * smoothstep(0.6, 0.0, abs(R.x + 0.3)) * gloss;   // 窓の映り込み
  float ndl = 0.82 + 0.18 * max(dot(N, LIGHT_DIR), 0.0);
  vec3 lit = inkCol * ndl
           + vec3(0.92, 0.95, 1.0) * (spec * 0.45 + winRefl * 0.10)
           + vec3(0.75, 0.80, 0.88) * fres * 0.12;
  inkCol = mix(inkCol, lit, uGloss);
  float sheen = wet * smoothstep(0.6, 1.0, a) * 0.05 * (0.5 + 0.5 * vnoise(px * 0.05 + uTime * 0.15));

  // --- 紙: 濡れた所は暗く透ける ---
  vec3 col = paper.rgb * (1.0 - uWetDarken * wetness);

  // --- 文字 (r) と落款 (g)。湿った墨が乗ると文字の縁がにじむ ---
  vec2 tx = texture(uText, vUv).rg;
  float txt = tx.x, seal = tx.y;
  float bl = clamp(wet * a, 0.0, 1.0);
  if (bl > 0.002) {
    vec2 r = uFineTexel * 2.5 * bl;
    float b4 = 0.25 * (texture(uText, vUv + vec2(r.x, 0.0)).r + texture(uText, vUv - vec2(r.x, 0.0)).r
                     + texture(uText, vUv + vec2(0.0, r.y)).r + texture(uText, vUv - vec2(0.0, r.y)).r);
    txt = mix(txt, max(txt, b4) * 0.95, bl);
  }
  float grain = vnoise(px * 0.6);                                  // 細かい目 (fluid と同じ)
  col = mix(col, INK_DENSE * (1.0 + 0.18 * h), txt * (0.9 + 0.1 * grain));   // 印刷された文字も紙の高さでムラが出る
  float sealA = seal * (0.5 + 0.5 * smoothstep(0.3, 0.7, vnoise(px * 0.7)));   // 印影のかすれ
  col = mix(col, SEAL_RED, sealA * 0.92);

  // --- 合成 ---
  col = mix(col, inkCol, a);
  col += sheen;
  float vig = smoothstep(1.35, 0.3, length((vUv - 0.5) * vec2(uAspect, 1.0)));   // display.frag と同じ周辺減光
  col *= 0.94 + 0.06 * vig;
  col += (hash(px) - 0.5) / 255.0;   // ディザ
  o = vec4(col, 1.0);
}
