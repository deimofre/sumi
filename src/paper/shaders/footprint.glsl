// 筆の接地面 (Deposit で使う)。
// 中心 uCenter、楕円 (長軸 uAxes.x、短軸 uAxes.y、回転 uRot = (cos, sin))、毛の割れ (uSplit)。
// 毛の割れは進行方向に沿った筋で、絶対座標で計算するので隣り合うサンプルの間でつながる。
// uSplit が上がるほど墨を運ぶ毛が減り、ノイズの高い所だけが残って筋になる (掠れ・飛白)
uniform vec2 uCenter, uAspect;   // 中心 (uv)、短辺 = 1 に揃える倍率
uniform vec2 uAxes, uRot;        // 楕円の半径 (短辺 = 1) と回転
uniform vec2 uDir;               // 進行方向 (短辺 = 1 の座標系)
uniform float uSplit;            // 毛の割れの強さ 0..1
uniform float uHairFreq;         // 筋の細かさ (短辺あたりの本数)
uniform float uHairLength;       // 筋の長さ (進行方向の周波数の比。小さいほど長い)
uniform float uSeed;             // ストロークごとの乱数シード
float footprint(vec2 uv) {
  vec2 p = (uv - uCenter) * uAspect;
  vec2 q = vec2(uRot.x * p.x + uRot.y * p.y, -uRot.y * p.x + uRot.x * p.y);   // 楕円の軸に揃える
  float s = 1.0 - smoothstep(0.7, 1.0, length(q / uAxes));                    // 縁だけ柔らかい
  vec2 g = uv * uAspect;
  vec2 perp = vec2(-uDir.y, uDir.x);
  float hair = vnoise(vec2(dot(g, perp) * uHairFreq, dot(g, uDir) * uHairFreq * uHairLength) + uSeed);
  // 割れるほど、墨を運ぶ毛が減る: 割れ 0 で全部、0.5 で約 7 割、0.7 で約 4 割、1 でほとんど無し
  float cut = mix(-0.2, 0.85, uSplit);
  return s * smoothstep(cut - 0.1, cut + 0.1, hair);
}
