#version 300 es
#include ../../shaders/common/head.glsl
#include ../../shaders/common/noise.glsl
#include ../../shaders/common/inkColor.glsl
// ---- paper モードの表示 ----
// 下から順に: 和紙 → 染み込んだ墨 (固定顔料 F + 水に乗った顔料 P、マット) → 文字と落款 → 表面の膜 (濃く艶のある液体)。
// 色の設計 (濃墨・薄墨・湿り墨・和紙・落款・光の向き) と艶の当て方は fluid の display.frag と同じ。
// 膜は細かい格子にあるので、液だまりの縁の丸みと光沢が水面モードと同じ解像度で出る
uniform sampler2D uPaper;     // 細かい格子: RGB = 和紙の色、A = 高さ
uniform sampler2D uFixed;     // 細かい格子: R = 固定顔料 F
uniform sampler2D uFilm;      // 細かい格子: R = 膜の水、G = 膜の顔料
uniform sampler2D uFlow;      // 粗い格子: R = 水 W、G = 移動顔料 P、A = 湿り年齢
uniform sampler2D uProps;     // 粗い格子: A = 高さの平均
uniform sampler2D uText;      // 文字レイヤー: r = 文字、g = 落款
uniform vec2 uPaperPx;        // CSS ピクセル寸法 (ディザ・ノイズ用)
uniform vec2 uFineTexel, uCoarseTexel;
uniform float uAspect, uInkOpacity, uFilmOpacity, uCapacity, uSettle, uViewScale;
uniform float uTime, uGloss, uBump, uWetDarken;
uniform int uView;            // 0 通常 / 1 高さ / 2 膜 / 3 水 / 4 移動顔料 / 5 固定顔料 / 6 診断

void main() {
  vec2 px = vUv * uPaperPx;
  vec4 paper = texture(uPaper, vUv);
  float h = paper.a;
  float F = texture(uFixed, vUv).r;
  vec4 film = texture(uFilm, vUv);
  float fw = film.r, fp = film.g;
  vec4 flow = texture(uFlow, vUv);
  float W = flow.r, P = flow.g;
  float hAvg = texture(uProps, vUv).a;
  if (uView == 1) { o = vec4(vec3(h), 1.0); return; }
  // 状態の層は平方根で符号化して出す (8bit でも薄い値の分解能を保つ。読み戻し側で二乗して戻す)
  if (uView == 2) { o = vec4(vec3(sqrt(clamp(fw * uViewScale, 0.0, 1.0))), 1.0); return; }
  if (uView == 3) { o = vec4(vec3(sqrt(clamp(W * uViewScale, 0.0, 1.0))), 1.0); return; }
  if (uView == 4) { o = vec4(vec3(sqrt(clamp(P * uViewScale, 0.0, 1.0))), 1.0); return; }
  if (uView == 5) { o = vec4(vec3(sqrt(clamp(F * uViewScale, 0.0, 1.0))), 1.0); return; }
  // 診断: 負や NaN を赤 (F)、緑 (P)、青 (W か膜) で示す (>= の比較は NaN で偽になる)
  if (uView == 6) { o = vec4(F >= 0.0 ? 0.0 : 1.0, P >= 0.0 ? 0.0 : 1.0, (W >= 0.0 && fw >= 0.0 && fp >= 0.0) ? 0.0 : 1.0, 1.0); return; }

  // --- 染み込んだ墨: 固定顔料 + 水に乗った顔料 (紙の局所的な凹凸で沈殿ムラ)。マット ---
  float Pd = P * clamp(1.0 + uSettle * (h - hAvg) * 2.5, 0.0, 2.0);
  float a = 1.0 - exp(-(F + Pd) * uInkOpacity);                     // 濃度 → 不透明度 (重ねるほど飽和)
  float wetness = clamp(W / uCapacity, 0.0, 1.0);
  vec3 inkCol = mix(INK_THIN, INK_DENSE, smoothstep(0.0, 0.85, a));  // 薄い所は青みが出る
  inkCol = mix(inkCol, INK_WET, wetness * a * 0.5);                  // 染み込んだ水が残る間は少し深い

  // --- 紙: 濡れた所は暗く透ける ---
  vec3 col = paper.rgb * (1.0 - uWetDarken * wetness);

  // --- 文字 (r) と落款 (g)。湿った墨が乗ると文字の縁がにじむ ---
  vec2 tx = texture(uText, vUv).rg;
  float txt = tx.x, seal = tx.y;
  float bl = clamp(wetness * a, 0.0, 1.0);
  if (bl > 0.002) {
    vec2 r = uFineTexel * 2.5 * bl;
    float b4 = 0.25 * (texture(uText, vUv + vec2(r.x, 0.0)).r + texture(uText, vUv - vec2(r.x, 0.0)).r
                     + texture(uText, vUv + vec2(0.0, r.y)).r + texture(uText, vUv - vec2(0.0, r.y)).r);
    txt = mix(txt, max(txt, b4) * 0.95, bl);
  }
  float grain = vnoise(px * 0.6);                                  // 細かい目 (fluid と同じ)
  col = mix(col, INK_DENSE * (1.0 + 0.18 * h), txt * (0.9 + 0.1 * grain));
  float sealA = seal * (0.5 + 0.5 * smoothstep(0.3, 0.7, vnoise(px * 0.7)));   // 印影のかすれ
  col = mix(col, SEAL_RED, sealA * 0.92);
  col = mix(col, inkCol, a);

  // --- 表面の膜: 濃く艶のある液体。厚みを高さとみなし、勾配から法線を作って光を当てる (fluid と同じ式) ---
  float wet = smoothstep(0.0, 0.08, fw);                            // 膜がある所
  float fa = 1.0 - exp(-fp * uFilmOpacity);                         // 膜の顔料の濃さ
  vec3 filmCol = mix(col * 0.9, INK_WET, fa);                       // 顔料の無い水だけの膜は紙を少し暗くする
  vec2 e = uFineTexel * 2.0;
  float gx = texture(uFilm, vUv + vec2(e.x, 0.0)).r - texture(uFilm, vUv - vec2(e.x, 0.0)).r;
  float gy = texture(uFilm, vUv + vec2(0.0, e.y)).r - texture(uFilm, vUv - vec2(0.0, e.y)).r;
  vec3 N = normalize(vec3(-gx * uBump, -gy * uBump, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 Hv = normalize(LIGHT_DIR + V);
  float gloss = mix(0.12, 1.0, wet);
  float spec = pow(max(dot(N, Hv), 0.0), mix(14.0, 110.0, gloss)) * gloss;    // ハイライト
  float fres = pow(1.0 - max(N.z, 0.0), 3.0) * gloss;                         // 縁の反射
  vec3 R = reflect(-V, N);
  float winRefl = smoothstep(0.15, 0.85, R.y) * smoothstep(0.6, 0.0, abs(R.x + 0.3)) * gloss;   // 窓の映り込み
  float ndl = 0.82 + 0.18 * max(dot(N, LIGHT_DIR), 0.0);
  vec3 lit = filmCol * ndl
           + vec3(0.92, 0.95, 1.0) * (spec * 0.45 + winRefl * 0.10)
           + vec3(0.75, 0.80, 0.88) * fres * 0.12;
  filmCol = mix(filmCol, lit, uGloss);
  float sheen = wet * fa * 0.05 * (0.5 + 0.5 * vnoise(px * 0.05 + uTime * 0.15));
  col = mix(col, filmCol, wet);
  col += sheen;

  // --- 合成 ---
  float vig = smoothstep(1.35, 0.3, length((vUv - 0.5) * vec2(uAspect, 1.0)));   // display.frag と同じ周辺減光
  col *= 0.94 + 0.06 * vig;
  col += (hash(px) - 0.5) / 255.0;   // ディザ
  o = vec4(col, 1.0);
}
