import { must } from './context.ts';

export function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = must(gl.createShader(type), 'createShader');
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  return sh;
}

/** フラグメントシェーダーごとのプログラム。アクティブな uniform のロケーションを名前で引ける */
export class Program {
  readonly p: WebGLProgram;
  readonly u: Record<string, WebGLUniformLocation | null> = {};
  private readonly gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext, vertShader: WebGLShader, fragSrc: string) {
    this.gl = gl;
    this.p = must(gl.createProgram(), 'createProgram');
    gl.attachShader(this.p, vertShader);
    gl.attachShader(this.p, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(this.p);
    if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.p) ?? 'link failed');
    const n = gl.getProgramParameter(this.p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(this.p, i);
      if (!info) continue;
      this.u[info.name] = gl.getUniformLocation(this.p, info.name);
    }
  }
  bind(): this { this.gl.useProgram(this.p); return this; }
}
