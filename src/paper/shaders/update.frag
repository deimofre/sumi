#version 300 es
#include ../../shaders/common/head.glsl
// ---- 粗い格子の 1 ステップ: Diffuse → Transport → Evaporate & Fix (順序はこの通り) ----
// 状態 (uFlow): R = W 水量、G = P 移動顔料、B = Fx このフレームに定着した顔料 (settle が細かい格子の F に写す)、A = 湿り年齢
// 各テクセルが 8 近傍との水のやり取りを「自分から相手への流出」と「相手から自分への流入」の両方について
// 同じ式で計算する。相手側でも同じ値が出るので、流束テクスチャ無しで質量が保存される。
uniform sampler2D uFlow, uProps;
uniform float uK;                 // 拡散係数: 1 ステップで隣へ流れる割合 (0..1 未満で安定)
uniform float uAniso;             // 繊維方向の効き (0..1)
uniform float uPin;               // ピン止め: W がこれ以下の点からは流出しない
uniform float uCapacity;          // 保水容量の基準
uniform float uPigDiff;           // 顔料の微小な等方拡散
uniform float uEvap, uEvapThin;   // 蒸発: 1 秒に減る W と、薄い水ほど速く乾く度合い
uniform float uFix;               // 定着: 乾いた所で 1 秒に定着する P の割合
uniform float uAgeDecay;          // 湿り年齢の 1 ステップあたりの減衰率
uniform float uDt;                // このステップの秒数。0 なら状態を変えない
uniform float uResetFix;          // フレーム最初のステップで 1: 前フレームぶんの Fx を捨てる (settle が写し終えている)

const ivec2 DIRS[8] = ivec2[8](ivec2(-1, 0), ivec2(1, 0), ivec2(0, 1), ivec2(0, -1),
                               ivec2(-1, 1), ivec2(1, 1), ivec2(-1, -1), ivec2(1, -1));
// 軸方向と斜め方向の重み。等方的な 9 点ラプラシアン (軸 1/6、斜め 1/12) で、にじみの輪郭が八角形にならない。
// 合計が 1 なので流出の合計が uK × W を超えない
const float W_AXIS = 1.0 / 6.0, W_DIAG = 1.0 / 12.0;

float capOf(vec4 props) { return uCapacity * (0.6 + 0.8 * props.a); }   // 高い所 (繊維) ほど水を持てる
float pinGate(float w) { return smoothstep(uPin, uPin * 2.0, w); }
// 相手 j の透過率。繊維に沿う向きは通りやすく、直交する向きは (揃い具合 × uAniso) だけ通りにくい
float permOf(vec4 props, vec2 dir) {
  vec2 f = props.rg * 2.0 - 1.0;
  float along = abs(dot(dir, f));
  return 1.0 - uAniso * props.b * (1.0 - along);
}

void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(uFlow, 0);
  vec4 s = texelFetch(uFlow, ij, 0);
  float W = s.r, P = s.g, Fx = uResetFix > 0.5 ? 0.0 : s.b, age = min(s.a, 1.0);
  if (uDt <= 0.0) { o = vec4(W, P, Fx, age); return; }

  vec4 props_i = texelFetch(uProps, ij, 0);
  float cap_i = capOf(props_i);
  float pin_i = pinGate(W);
  float sat_i = clamp(1.0 - W / cap_i, 0.0, 1.0);
  float c_i = P / max(W, 1e-4);   // 顔料の濃度

  // --- Diffuse (水) + Transport (顔料は水の流れに乗る) ---
  float dW = 0.0, dP = 0.0, lapP = 0.0;
  for (int n = 0; n < 8; n++) {
    ivec2 jj = ij + DIRS[n];
    if (jj.x < 0 || jj.y < 0 || jj.x >= size.x || jj.y >= size.y) continue;   // 紙の端は流れない
    vec4 t = texelFetch(uFlow, jj, 0);
    float Wj = t.r, Pj = t.g;
    float wgt = (n < 4) ? W_AXIS : W_DIAG;
    vec2 dir = normalize(vec2(DIRS[n]));
    vec4 props_j = texelFetch(uProps, jj, 0);
    // 自分 → 相手: 相手が受け取れる分 (飽和) だけ、自分がピン止めされていなければ
    float outF = uK * wgt * max(W - Wj, 0.0) * permOf(props_j, dir) * clamp(1.0 - Wj / capOf(props_j), 0.0, 1.0) * pin_i;
    // 相手 → 自分: 相手の側で計算した流出と同じ式・同じ順序 (bit 単位で一致する)
    float inF  = uK * wgt * max(Wj - W, 0.0) * permOf(props_i, dir) * sat_i * pinGate(Wj);
    dW += inF - outF;
    dP += inF * (Pj / max(Wj, 1e-4)) - outF * c_i;
    lapP += wgt * (Pj - P);
  }
  W += dW;
  P += dP + uPigDiff * lapP;
  W = min(W, cap_i);   // 筆から容量以上に載った水は紙に入らない

  // --- Evaporate: 薄い水ほど速く乾く (縁から乾く) ---
  float thin = 1.0 - clamp(W / cap_i, 0.0, 1.0);
  W = max(W - uEvap * uDt * (1.0 + uEvapThin * thin), 0.0);

  // --- Fix: 乾いた所から順に顔料が定着し、以後動かない ---
  float dry = 1.0 - clamp(W / cap_i, 0.0, 1.0);
  float fix = P * min(1.0, uFix * uDt * dry);
  if (P - fix < 0.002 && dry > 0.5) fix = P;   // 残りわずかは全部定着させる (fp16 の丸めで永遠に残らないように)
  Fx += fix; P -= fix;

  age *= uAgeDecay;
  o = vec4(W, P, Fx, age);
}
