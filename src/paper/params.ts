// ============================================================
// paper モードのパラメータ。定義 (既定値・範囲・説明) はここ 1 か所で、デバッグパネルはこの定義から自動で作る。
// 説明は「何を変えると何が変わるか」。作者はコードを書かずここの値の調整だけ行う前提
// ============================================================
export const VIEWS = ['paper', 'height', 'water', 'pigment', 'fixed', 'invalid'] as const;
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
  { key: 'evapRate', group: '蒸発・定着', label: '蒸発速度', def: 0.15, min: 0.02, max: 1, step: 0.01,
    hint: '1 秒に減る W。W = 1 の水が乾くまで約 1 / この値 秒' },
  { key: 'evapThinBoost', group: '蒸発・定着', label: '薄い所ほど速く乾く', def: 1.5, min: 0, max: 3, step: 0.1,
    hint: '縁から乾く度合い。0 で一様' },
  { key: 'fixRate', group: '蒸発・定着', label: '定着速度', def: 0.6, min: 0.05, max: 3, step: 0.05,
    hint: '乾いた所で 1 秒に定着する移動顔料の割合。濡れている所は遅い' },
  { key: 'settleStrength', group: '蒸発・定着', label: '沈殿ムラ', def: 0.7, min: 0, max: 1, step: 0.05,
    hint: '定着するとき紙の局所的な高い所 (繊維の稜線) に集まる度合い。粒状感' },
  { key: 'wetAgeHalfLife', group: '蒸発・定着', label: '艶の半減期 (秒)', def: 1.5, min: 0.2, max: 5, step: 0.1,
    hint: '載せたばかりの艶が薄れる速さ' },
  // ---- 筆 ----
  { key: 'brushRadius', group: '筆', label: '基準半径', def: 0.015, min: 0.004, max: 0.05, step: 0.001,
    hint: '筆圧 1 のときの半径 (短辺 = 1)' },
  { key: 'pressureMin', group: '筆', label: '筆圧 0 の半径', def: 0.35, min: 0.1, max: 1, step: 0.05,
    hint: '筆圧カーブの下限 (基準半径に対する割合)' },
  { key: 'tiltElongation', group: '筆', label: '傾きの伸び', def: 1.2, min: 0, max: 3, step: 0.1,
    hint: '傾き 60° で接地面の長軸が (1 + この値) 倍' },
  { key: 'inkCapacity', group: '筆', label: '墨容量', def: 1.5, min: 0.3, max: 5, step: 0.1,
    hint: '筆圧 1 でこの長さ (短辺 = 1) を書くと墨が尽きる' },
  { key: 'holdDrain', group: '筆', label: 'とどまりで減る墨', def: 0.1, min: 0, max: 0.5, step: 0.01,
    hint: '押したまま止まっている間に減る墨 (容量に対する割合 / 秒)' },
  { key: 'kasureMin', group: '筆', label: '掠れしきい値 (墨あり)', def: 0.3, min: 0, max: 1, step: 0.05,
    hint: '墨残量 1 での接地しきい値。紙の高さがこれ未満の所には墨が付かない。下げると芯が締まる' },
  { key: 'kasureMax', group: '筆', label: '掠れしきい値 (墨切れ)', def: 0.8, min: 0, max: 1, step: 0.05,
    hint: '墨残量 0 での接地しきい値。上げるほど終端で筋だけになる' },
  { key: 'kasurePressure', group: '筆', label: '低筆圧の掠れ', def: 0.25, min: 0, max: 0.5, step: 0.05,
    hint: '筆圧 0 でしきい値に上乗せする量' },
  { key: 'contactSoftness', group: '筆', label: '接地の柔らかさ', def: 0.12, min: 0.02, max: 0.3, step: 0.01,
    hint: '小さいほど筋の縁がくっきり' },
  { key: 'splitStart', group: '筆', label: '毛の割れ開始', def: 0.4, min: 0, max: 1, step: 0.05,
    hint: 'この墨残量を下回るほど接地面が細い筋に分かれる' },
  { key: 'hairFreq', group: '筆', label: '毛の割れの細かさ', def: 500, min: 100, max: 1500, step: 10,
    hint: '筋の本数 (短辺あたり)。大きいほど細い筋' },
  { key: 'brushFixFraction', group: '筆', label: 'その場で定着する割合', def: 0.5, min: 0, max: 1, step: 0.05,
    hint: '筆が置いた顔料のうち繊維にその場で定着する割合。残りは水に乗ってにじむ。大きいほど線が濃くにじみが薄い' },
  { key: 'brushWater', group: '筆', label: 'なぞりの水', def: 0.5, min: 0, max: 2, step: 0.05,
    hint: '1 サンプル (短辺の 0.5%) あたりの水 (墨残量 1 のとき)' },
  { key: 'brushPigment', group: '筆', label: 'なぞりの顔料', def: 0.2, min: 0, max: 1, step: 0.01,
    hint: '1 サンプルあたりの顔料。水との比が暈の濃さになる' },
  { key: 'holdWater', group: '筆', label: 'とどまりの水 / 秒', def: 6.0, min: 0, max: 15, step: 0.5,
    hint: '押したまま止まっている間の供給。余分は表面の溜まりになり、放した後もにじみを進める' },
  { key: 'holdPigment', group: '筆', label: 'とどまりの顔料 / 秒', def: 2.0, min: 0, max: 6, step: 0.1,
    hint: '' },
  // ---- 表示 ----
  { key: 'inkOpacity', group: '表示', label: '墨の濃さ', def: 2.5, min: 0.5, max: 6, step: 0.1,
    hint: '濃度 → 不透明度の係数。大きいほど薄い墨も黒く見える' },
  { key: 'gloss', group: '表示', label: '湿り艶', def: 1.0, min: 0, max: 1, step: 0.05,
    hint: '0 で無効' },
  { key: 'bump', group: '表示', label: '艶の立体感', def: 3.0, min: 0, max: 10, step: 0.5,
    hint: '水の膜の厚みを高さに変換する倍率' },
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
