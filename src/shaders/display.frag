#version 300 es
#include common/head.glsl
#include common/noise.glsl
#include common/inkColor.glsl
// ---- 表示パス: 紙・墨の質感・文字の歪み・落款 ----
uniform sampler2D uDye, uVelocity, uText;
uniform vec2 uPaperPx, uDyeTexel, uSimTexel;
uniform float uTime, uAspect, uWarp;
uniform float uBump, uGloss;   // 立体感の高さ倍率 / 光沢の強さ (0 で無効)

void main() {
  vec2 px = vUv * uPaperPx;                       // CSSピクセル座標 (紙の目の粗さをDPRに依存させない)
  vec2 vel = texture(uVelocity, vUv).xy;

  // --- 和紙 ---
  vec3 paper = PAPER_BASE;
  float fiber  = fbm(px * 0.045);                 // 大きなムラ
  float grain  = vnoise(px * 0.6);                // 細かい目
  float laid   = vnoise(vec2(px.x * 0.02, px.y * 0.35)); // 簀の目 (横筋)
  paper *= 0.955 + 0.055 * fiber + 0.025 * grain + 0.02 * laid;
  float vig = smoothstep(1.35, 0.3, length((vUv - 0.5) * vec2(uAspect, 1.0)));
  paper *= 0.94 + 0.06 * vig;

  // --- 墨 ---
  vec2 dye = texture(uDye, vUv).xy;
  float d = dye.x, wet = dye.y;
  vec2 e = uDyeTexel * 2.0;
  float gx = texture(uDye, vUv + vec2(e.x, 0.0)).x - texture(uDye, vUv - vec2(e.x, 0.0)).x;
  float gy = texture(uDye, vUv + vec2(0.0, e.y)).x - texture(uDye, vUv - vec2(0.0, e.y)).x;
  float grad = length(vec2(gx, gy));

  float gran = fbm(px * 0.12);                                   // 顔料の沈殿ムラ
  float body = smoothstep(0.02, 0.55, d);
  body *= 1.0 - 0.38 * gran * (1.0 - body);                      // 中間調ほどムラが出る
  float rim = smoothstep(0.05, 0.6, grad) * (1.0 - body) * 0.55; // にじみ縁の濃い輪郭 (バックラン)
  float halo = smoothstep(0.0, 0.06, d) * (0.45 + 0.55 * vnoise(px * 0.9)); // 薄い水の輪
  float inkA = clamp(body + rim + 0.22 * halo, 0.0, 1.0);

  vec3 inkDense = INK_DENSE, inkThin = INK_THIN, inkWet = INK_WET;   // 色は common/inkColor.glsl
  vec3 inkCol = mix(inkThin, inkDense, body);
  inkCol = mix(inkCol, inkWet, wet * body * 0.85);

  // --- 立体感: 墨の厚みを高さとみなし、勾配から法線を作って光を当てる (v2 由来) ---
  float thick = mix(0.4, 1.0, wet);                              // 湿った墨ほど盛り上がる
  vec3 N = normalize(vec3(-gx * uBump * thick, -gy * uBump * thick, 1.0));
  float speed = length(vel);
  float ripple = wet * smoothstep(0.0, 60.0, speed) * 0.35;      // 流れている表面のさざ波
  N.xy += ripple * (vnoise(px * 0.25 + vel * 0.02) - 0.5) * 2.0 * vec2(-vel.y, vel.x) / max(speed, 0.001);
  N = normalize(N);

  vec3 L = LIGHT_DIR;                                             // 左上からの光
  vec3 V = vec3(0.0, 0.0, 1.0);                                   // 視線は真上
  vec3 Hv = normalize(L + V);
  float gloss = mix(0.12, 1.0, wet);                              // 乾くとマット
  float spec = pow(max(dot(N, Hv), 0.0), mix(14.0, 110.0, gloss)) * gloss;   // ハイライト
  float fres = pow(1.0 - max(N.z, 0.0), 3.0) * gloss;                        // 縁の反射
  vec3 R = reflect(-V, N);
  float winRefl = smoothstep(0.15, 0.85, R.y) * smoothstep(0.6, 0.0, abs(R.x + 0.3)) * gloss; // 窓の映り込み
  float ndl = 0.82 + 0.18 * max(dot(N, L), 0.0);                 // ごく弱い陰影

  vec3 lit = inkCol * ndl
           + vec3(0.92, 0.95, 1.0) * (spec * 0.45 + winRefl * 0.10)
           + vec3(0.75, 0.80, 0.88) * fres * 0.12;
  inkCol = mix(inkCol, lit, uGloss);

  float sheen = wet * smoothstep(0.6, 1.0, body) * 0.05 * (0.5 + 0.5 * vnoise(px * 0.05 + uTime * 0.15));

  // --- 文字 (r) と落款 (g): 速度場で引きずる ---
  vec2 disp = vel * uSimTexel * uWarp;
  float txt = 0.0, seal = 0.0, ws = 0.0;
  for (int k = -3; k <= 3; k++) {
    float w = 1.0 - abs(float(k)) / 4.0;
    vec2 s = texture(uText, vUv - disp * (1.0 + float(k) * 0.3)).rg;
    txt += w * s.x; seal += w * s.y; ws += w;
  }
  txt /= ws; seal /= ws;
  // 湿った墨が乗ると文字の縁がにじむ
  float bl = clamp(wet * body, 0.0, 1.0);
  if (bl > 0.002) {
    vec2 r = uDyeTexel * 2.5 * bl;
    float b4 = 0.25 * (texture(uText, vUv + vec2(r.x, 0.0)).r + texture(uText, vUv - vec2(r.x, 0.0)).r
                     + texture(uText, vUv + vec2(0.0, r.y)).r + texture(uText, vUv - vec2(0.0, r.y)).r);
    txt = mix(txt, max(txt, b4) * 0.95, bl);
  }

  // --- 合成 ---
  vec3 col = paper;
  col = mix(col, inkDense * (1.0 + 0.18 * gran), txt * (0.9 + 0.1 * grain));
  float sealA = seal * (0.5 + 0.5 * smoothstep(0.3, 0.7, vnoise(px * 0.7)));   // 印影のかすれ
  col = mix(col, SEAL_RED, sealA * 0.92);
  col = mix(col, inkCol, inkA);
  col += sheen;
  col += (hash(px) - 0.5) / 255.0;   // ディザ
  o = vec4(col, 1.0);
}
