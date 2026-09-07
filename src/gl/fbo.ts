import { must, type TexFormat } from './context.ts';

export interface FBO {
  texture: WebGLTexture; fbo: WebGLFramebuffer;
  width: number; height: number; texelX: number; texelY: number;
  /** テクスチャユニットにバインドしてそのユニット番号を返す */
  attach(unit: number): number;
}
export interface DoubleFBO {
  width: number; height: number; texelX: number; texelY: number;
  readonly read: FBO; readonly write: FBO;
  swap(): void;
}

export function createFBO(gl: WebGL2RenderingContext, w: number, h: number, fmt: TexFormat): FBO {
  const texture = must(gl.createTexture(), 'createTexture');
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, w, h, 0, fmt.format, fmt.type, null);
  const fbo = must(gl.createFramebuffer(), 'createFramebuffer');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  return { texture, fbo, width: w, height: h, texelX: 1 / w, texelY: 1 / h,
    attach(unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture); return unit; } };
}

export function createDoubleFBO(gl: WebGL2RenderingContext, w: number, h: number, fmt: TexFormat): DoubleFBO {
  let a = createFBO(gl, w, h, fmt), b = createFBO(gl, w, h, fmt);
  return { width: w, height: h, texelX: 1 / w, texelY: 1 / h,
    get read() { return a; }, get write() { return b; }, swap() { const t = a; a = b; b = t; } };
}

/** 画面いっぱいの四角形 (VAO) を作り、それを描く blit 関数を返す。target が null なら画面へ */
export function createQuad(gl: WebGL2RenderingContext): (target: FBO | null) => void {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return function blit(target) {
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.width, target.height); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}
