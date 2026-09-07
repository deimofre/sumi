// ============================================================
// WebGL2 セットアップ: コンテキスト取得と半精度 float レンダーターゲットの選定
// ============================================================
export interface TexFormat { internalFormat: number; format: number; type: number }
export interface Formats { rgba: TexFormat; rg: TexFormat; r: TexFormat }
export interface GLContext { gl: WebGL2RenderingContext; formats: Formats }

/** null を返す WebGL API の結果を確定させる。失敗はそのまま例外にして window の error ハンドラに任せる */
export function must<T>(v: T | null, what: string): T {
  if (v === null) throw new Error(what + ' failed');
  return v;
}

export function getContext(canvas: HTMLCanvasElement): GLContext | null {
  const gl = canvas.getContext('webgl2', { alpha: false, depth: false, stencil: false, antialias: false, premultipliedAlpha: false });
  if (!gl) return null;

  // 半精度 float をレンダーターゲットに使う (流体は負の値と精度が要る)
  if (!gl.getExtension('EXT_color_buffer_float')) gl.getExtension('EXT_color_buffer_half_float');

  function supportsRT(internalFormat: number, format: number, type: number): boolean {
    const g = gl!;
    const tex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, tex);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
    g.texImage2D(g.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    const fbo = g.createFramebuffer();
    g.bindFramebuffer(g.FRAMEBUFFER, fbo);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
    const ok = g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE;
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.deleteFramebuffer(fbo); g.deleteTexture(tex);
    return ok;
  }
  function pickFormat(internalFormat: number, format: number, type: number): TexFormat | null {
    const g = gl!;
    if (supportsRT(internalFormat, format, type)) return { internalFormat, format, type };
    if (internalFormat === g.R16F)  return pickFormat(g.RG16F, g.RG, type);
    if (internalFormat === g.RG16F) return pickFormat(g.RGBA16F, g.RGBA, type);
    return null;
  }
  const rgba = pickFormat(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
  const rg   = pickFormat(gl.RG16F,   gl.RG,   gl.HALF_FLOAT);
  const r    = pickFormat(gl.R16F,    gl.RED,  gl.HALF_FLOAT);
  if (!rgba || !rg || !r) return null;
  return { gl, formats: { rgba, rg, r } };
}
