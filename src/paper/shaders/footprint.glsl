// 筆の接地面 (両方の Deposit で共有)。
// 中心 uCenter、傾きによる楕円 (長軸 uAxes.x、短軸 uAxes.y、回転 uRot = (cos, sin))、毛の割れ (uSplit)。
// 毛の割れは進行方向に沿った筋で、絶対座標で計算するので隣り合うサンプルの間でつながる
uniform vec2 uCenter, uAspect;   // 中心 (uv)、短辺 = 1 に揃える倍率
uniform vec2 uAxes, uRot;        // 楕円の半径 (短辺 = 1) と回転
uniform vec2 uDir;               // 進行方向 (短辺 = 1 の座標系)
uniform float uSplit;            // 毛の割れの強さ 0..1
uniform float uHairFreq;         // 筋の細かさ
uniform float uSeed;             // ストロークごとの乱数シード
float footprint(vec2 uv) {
  vec2 p = (uv - uCenter) * uAspect;
  vec2 q = vec2(uRot.x * p.x + uRot.y * p.y, -uRot.y * p.x + uRot.x * p.y);   // 楕円の軸に揃える
  float s = 1.0 - smoothstep(0.7, 1.0, length(q / uAxes));                    // 縁だけ柔らかい
  vec2 g = uv * uAspect;
  vec2 perp = vec2(-uDir.y, uDir.x);
  float hair = vnoise(vec2(dot(g, perp) * uHairFreq, dot(g, uDir) * uHairFreq * 0.08) + uSeed);
  return s * mix(1.0, smoothstep(0.3, 0.7, hair), uSplit);
}
