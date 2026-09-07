// ============================================================
// paper モードのパラメータ。定義 (既定値・範囲・説明) はここ 1 か所で、デバッグパネルはこの定義から自動で作る。
// 説明は「何を変えると何が変わるか」。作者はコードを書かずここの値の調整だけ行う前提
// ============================================================
export const VIEWS = ['paper', 'height', 'film', 'water', 'pigment', 'fixed', 'invalid'] as const;
export type View = (typeof VIEWS)[number];
export const isView = (v: unknown): v is View => (VIEWS as readonly unknown[]).includes(v);

export interface ParamDef {
  key: string; group: string; label: string; hint: string;
  def: number; min: number; max: number; step: number;
  /** 変えたら格子や紙を作り直す (墨は消える) */
  rebuild?: boolean;
  /** パネルに出さない (検証用) */
  hidden?: boolean;
}

export const PAPER_SCHEMA = [
  // ---- 格子 ----
  { key: 'resShort', group: '格子', label: '細かい格子 (短辺 px)', def: 0, min: 0, max: 2048, step: 256, rebuild: true,
    hint: '固定顔料と掠れの筋の解像度。0 なら自動 (描画バッファの短辺が 1536px 以上なら 2048、未満なら 1024)' },
  { key: 'flowRes', group: '格子', label: '流れの格子 (短辺 px)', def: 384, min: 192, max: 768, step: 32, rebuild: true,
    hint: '水と移動顔料が流れる粗い格子。端末によらず同じにして、にじみの広がりを揃える。大きいほど縁が細かく、負荷は二乗で増える' },
  // ---- 紙 (プロシージャル) ----
  { key: 'grainScale', group: '紙', label: '目の粗さ', def: 1.0, min: 0.5, max: 3, step: 0.05, rebuild: true,
    hint: '細かい目の周期の倍率。1 で水面モードと同じ。大きいほど粗い目' },
  { key: 'fiberStrength', group: '紙', label: '繊維の筋', def: 1.0, min: 0, max: 1, step: 0.05, rebuild: true,
    hint: '繊維の筋の高さへの寄与。大きいほど筋が高く立ち、掠れの筋がはっきり出る' },
  { key: 'laidStrength', group: '紙', label: '簀の目', def: 0.6, min: 0, max: 1, step: 0.05, rebuild: true,
    hint: '横筋の高さへの寄与' },
  { key: 'heightContrast', group: '紙', label: '高さのコントラスト', def: 1.8, min: 0.5, max: 3, step: 0.1, rebuild: true,
    hint: '大きいほど高低差が広がり、掠れがしきい値に敏感になる' },
  // ---- 拡散 ----
  { key: 'diffusion', group: '拡散', label: '拡散係数 k', def: 0.7, min: 0.05, max: 0.95, step: 0.05,
    hint: '1 ステップで隣へ流れる割合。大きいほど速く広がる' },
  { key: 'flowSteps', group: '拡散', label: 'ステップ数 / フレーム', def: 2, min: 1, max: 8, step: 1,
    hint: 'にじみの時間スケール。多いほど速く広がってすぐ乾き、少ないほど数秒かけてゆっくり進む。負荷は比例' },
  { key: 'anisotropy', group: '拡散', label: '繊維方向の効き', def: 0.7, min: 0, max: 1, step: 0.05,
    hint: '0 で等方、1 で繊維に直交する向きには (揃った所では) 流れない' },
  { key: 'porosityContrast', group: '拡散', label: '粗密の効き', def: 0.8, min: 0, max: 1, step: 0.05,
    hint: '繊維が密な所は通りにくい。大きいほど前線が不揃いになる' },
  { key: 'pinThreshold', group: '拡散', label: 'ピン止め', def: 0.02, min: 0, max: 0.1, step: 0.005,
    hint: 'W がこれ以下の点からは流出しない。小さいほど遠くまでにじむ' },
  { key: 'capacity', group: '拡散', label: '保水容量', def: 1.0, min: 0.5, max: 2, step: 0.05,
    hint: '紙が 1 点に持てる水の基準。高い所 (繊維) ほど多く持てる' },
  { key: 'pigmentDiffusion', group: '拡散', label: '顔料の拡散', def: 0.04, min: 0, max: 0.2, step: 0.005,
    hint: '顔料だけの微小な等方拡散。大きいほど縁がぼける' },
  { key: 'filterRate', group: '拡散', label: '濾過', def: 0.06, min: 0, max: 0.3, step: 0.005,
    hint: '水が隣へ流れるとき運ばれる顔料のうち、その場の繊維に濾し取られる割合。大きいほど暈が外へ向かって速く薄れる' },
  // ---- 蒸発・定着 ----
  { key: 'evapRate', group: '蒸発・定着', label: '蒸発速度', def: 0.05, min: 0.01, max: 1, step: 0.01,
    hint: '1 秒に減る W (紙に染みた水)。W = 1 の水が乾くまで約 1 / この値 秒' },
  { key: 'evapThinBoost', group: '蒸発・定着', label: '薄い所ほど速く乾く', def: 1.0, min: 0, max: 3, step: 0.1,
    hint: '縁から乾く度合い。0 で一様' },
  { key: 'fixRate', group: '蒸発・定着', label: '定着速度', def: 0.4, min: 0.05, max: 3, step: 0.05,
    hint: '乾いた所で 1 秒に定着する移動顔料の割合。濡れている所は遅い' },
  { key: 'settleStrength', group: '蒸発・定着', label: '沈殿ムラ', def: 0.4, min: 0, max: 1, step: 0.05,
    hint: 'にじんだ顔料が定着するとき、紙の局所的な高い所 (繊維の稜線) に集まる度合い。粒状感。筆が直接置いた墨には掛からない' },
  // ---- 表面の膜 (筆が置いた墨。細かい格子) ----
  { key: 'soakRate', group: '表面の膜', label: '染み込む速さ', def: 0.5, min: 0.05, max: 5, step: 0.05,
    hint: '膜の水が 1 秒に紙へ染み込む量 (紙が乾いているとき)。紙が飽和している所では待つので、厚い墨ほど長く艶が残る' },
  { key: 'filmEvap', group: '表面の膜', label: '膜の蒸発', def: 0.02, min: 0, max: 0.5, step: 0.01,
    hint: '染み込まずに表面から乾く分 (1 秒あたり)' },
  { key: 'filmOpacity', group: '表面の膜', label: '膜の墨の濃さ', def: 5.0, min: 0.5, max: 12, step: 0.5,
    hint: '膜の中の顔料 → 不透明度の係数' },
  // ---- 筆 ----
  { key: 'brushRadius', group: '筆', label: '基準半径', def: 0.028, min: 0.004, max: 0.06, step: 0.001,
    hint: '筆圧 1 のときの半径 (短辺 = 1)。筆の腹まで使ったときの太さ' },
  { key: 'pressureMin', group: '筆', label: '筆圧 0 の半径', def: 0.12, min: 0.02, max: 1, step: 0.02,
    hint: '穂先だけが触れたときの太さ (基準半径に対する割合)' },
  { key: 'pressureCurve', group: '筆', label: '筆圧カーブ', def: 0.85, min: 0.3, max: 2.5, step: 0.05,
    hint: '筆圧 → 太さの指数。1 で比例、小さいほど軽い筆圧でも太くなる' },
  { key: 'tiltElongation', group: '筆', label: '傾きの伸び', def: 1.2, min: 0, max: 3, step: 0.1,
    hint: '傾き 60° で接地面の長軸が (1 + この値) 倍' },
  { key: 'inkCapacity', group: '筆', label: '墨容量', def: 0.6, min: 0.1, max: 5, step: 0.05,
    hint: '筆圧 1 でこの長さ (短辺 = 1) を書くと墨が尽きる。一筆の中で濃い書き出しから薄い終わりへ変わる速さ' },
  { key: 'inkFalloff', group: '筆', label: '墨の減り方', def: 1.5, min: 0.5, max: 4, step: 0.1,
    hint: '供給量 = 墨残量 ^ この値。大きいほど早くから薄くなり、終わりが乾く' },
  { key: 'holdDrain', group: '筆', label: 'とどまりで減る墨', def: 0.1, min: 0, max: 0.5, step: 0.01,
    hint: '押したまま止まっている間に減る墨 (容量に対する割合 / 秒)' },
  { key: 'dragElongation', group: '筆', label: '穂の引きずり', def: 0.8, min: 0, max: 3, step: 0.1,
    hint: '動いているとき接地面が進行方向に伸びて後ろへずれる。速さ 1.5 (短辺/秒) で (1 + この値) 倍' },
  // 掠れ = 筆の毛が割れて、進行方向に筋が走る。墨が減る・筆圧が下がる・速く払うほど、墨を運ぶ毛が減る
  { key: 'splitStart', group: '掠れ', label: '墨切れで割れ始める残量', def: 0.6, min: 0, max: 1, step: 0.05,
    hint: '墨残量がこれを下回るほど、墨を運ぶ毛が減って筋になる' },
  { key: 'splitPressure', group: '掠れ', label: '低筆圧で割れる', def: 0.7, min: 0, max: 1, step: 0.05,
    hint: '筆圧 0.5 未満で毛が割れる度合い (抜きの終わりが筋になる)' },
  { key: 'splitSpeed', group: '掠れ', label: '速い払いで割れる (飛白)', def: 0.85, min: 0, max: 1, step: 0.05,
    hint: '速く払うほど毛が割れる度合い。水面モードの「速いほどかすれる」と同じ曲線' },
  { key: 'hairFreq', group: '掠れ', label: '筋の細かさ', def: 500, min: 100, max: 1500, step: 10,
    hint: '筋の本数 (短辺あたり)。大きいほど細い筋' },
  { key: 'hairLength', group: '掠れ', label: '筋の長さ', def: 0.03, min: 0.005, max: 0.2, step: 0.005,
    hint: '筋が進行方向にどれだけ続くか。小さいほど長くつながる' },
  { key: 'paperGrip', group: '掠れ', label: '紙の目の影響', def: 0.2, min: 0, max: 1, step: 0.05,
    hint: '紙の凹凸で膜がわずかにむらになる度合い。0 で紙の目は掠れに関わらない' },
  { key: 'brushFixFraction', group: '筆', label: '線に残る割合', def: 0.85, min: 0, max: 1, step: 0.05,
    hint: '染み込むとき顔料のうち線の場所に定着する割合。残りが水に乗って暈になる。大きいほど暈が薄い (良い墨)' },
  { key: 'brushWater', group: '筆', label: '膜の水', def: 2.0, min: 0, max: 6, step: 0.1,
    hint: '筆が通った所に置く膜の厚さ (水。墨残量 1 のとき)。太さによらず同じ厚さになる' },
  { key: 'brushPigment', group: '筆', label: '膜の顔料', def: 1.2, min: 0, max: 4, step: 0.05,
    hint: '筆が通った所に置く顔料。水との比が墨の濃さ (濃墨・淡墨)' },
  { key: 'holdWater', group: '筆', label: 'とどまりの水 / 秒', def: 3.0, min: 0, max: 15, step: 0.5,
    hint: '押したまま止まっている間の供給。染み込みきらない分が液だまりになり、放した後もにじみを進める' },
  { key: 'holdPigment', group: '筆', label: 'とどまりの顔料 / 秒', def: 1.8, min: 0, max: 8, step: 0.1,
    hint: '' },
  // ---- 表示 ----
  { key: 'inkOpacity', group: '表示', label: '墨の濃さ', def: 4.0, min: 0.5, max: 8, step: 0.1,
    hint: '染み込んだ濃度 → 不透明度の係数。大きいほど薄い墨も黒く見える' },
  { key: 'gloss', group: '表示', label: '膜の艶', def: 1.0, min: 0, max: 1, step: 0.05,
    hint: '表面の膜の光沢。0 で無効 (水面モードの gloss と同じ意味)' },
  { key: 'bump', group: '表示', label: '膜の立体感', def: 6.0, min: 0, max: 12, step: 0.5,
    hint: '膜の厚みを高さに変換する倍率 (液だまりの縁の丸み)' },
  { key: 'wetDarken', group: '表示', label: '濡れた紙の暗さ', def: 0.10, min: 0, max: 0.3, step: 0.01,
    hint: '' },
  { key: 'viewScale', group: '表示', label: '検証表示の倍率', def: 1.0, min: 0.05, max: 4, step: 0.05, hidden: true,
    hint: 'water / pigment / fixed 表示の倍率 (値 × 倍率を平方根で符号化して描く)' },
] as const satisfies readonly ParamDef[];

export type PaperKey = (typeof PAPER_SCHEMA)[number]['key'];
/** 同じ定義を広い型で (パネルなど、省略可能な項目を見る側はこちらを使う) */
export const PAPER_DEFS: readonly ParamDef[] = PAPER_SCHEMA;
export type PaperParams = Record<PaperKey, number> & {
  /** 紙画像の URL (RGB = 和紙の色、A = 高さ)。null ならプロシージャル生成 */
  paperImage: string | null;
  /** 表示: paper = 通常、height = 紙の高さ、water / pigment / fixed = 状態の各層、invalid = 負や NaN の診断 */
  view: View;
};

function defaults(): Record<PaperKey, number> {
  const o = {} as Record<PaperKey, number>;
  for (const d of PAPER_SCHEMA) o[d.key] = d.def;
  return o;
}
export const PAPER: PaperParams = { ...defaults(), paperImage: null, view: 'paper' };
export const isPaperKey = (k: unknown): k is PaperKey => PAPER_SCHEMA.some(d => d.key === k);

/** 数値パラメータだけを取り出す (プリセットの書き出し) */
export function exportParams(): Record<PaperKey, number> {
  const o = {} as Record<PaperKey, number>;
  for (const d of PAPER_SCHEMA) o[d.key] = PAPER[d.key];
  return o;
}
/** 数値パラメータを読み込む (知らないキー・数でない値は無視)。変えたキーを返す */
export function importParams(src: unknown): PaperKey[] {
  const changed: PaperKey[] = [];
  if (!src || typeof src !== 'object') return changed;
  for (const d of PAPER_SCHEMA) {
    const v = (src as Record<string, unknown>)[d.key];
    if (typeof v === 'number' && Number.isFinite(v) && v !== PAPER[d.key]) { PAPER[d.key] = v; changed.push(d.key); }
  }
  return changed;
}
export function resetParams(): PaperKey[] { return importParams(defaults()); }
