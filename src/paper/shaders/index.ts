import { compile, Program } from '../../gl/program.ts';
import quadVert from '../../shaders/quad.vert';
import display from './display-paper.frag';
import paperGen from './paper-gen.frag';

export function createPaperPrograms(gl: WebGL2RenderingContext) {
  const vert = compile(gl, gl.VERTEX_SHADER, quadVert);
  return { paperGen: new Program(gl, vert, paperGen), display: new Program(gl, vert, display) };
}
export type PaperPrograms = ReturnType<typeof createPaperPrograms>;
