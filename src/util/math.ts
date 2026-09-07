export const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
/** smoothstep。a 以下で 0、b 以上で 1、間は 3t²−2t³ */
export const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
