import { compile, Program } from '../../gl/program.ts';
import quadVert from '../../shaders/quad.vert';
import depositFixed from './deposit-fixed.frag';
import depositFlow from './deposit-flow.frag';
import display from './display-paper.frag';
import paperGen from './paper-gen.frag';
import paperImage from './paper-image.frag';
import props from './props.frag';
import settle from './settle.frag';
import splatVert from './splat.vert';
import update from './update.frag';

export function createPaperPrograms(gl: WebGL2RenderingContext) {
  const quad = compile(gl, gl.VERTEX_SHADER, quadVert);
  const splat = compile(gl, gl.VERTEX_SHADER, splatVert);
  return {
    paperGen: new Program(gl, quad, paperGen), paperImage: new Program(gl, quad, paperImage), props: new Program(gl, quad, props),
    depositFlow: new Program(gl, splat, depositFlow), depositFixed: new Program(gl, splat, depositFixed),
    update: new Program(gl, quad, update), settle: new Program(gl, quad, settle), display: new Program(gl, quad, display),
  };
}
export type PaperPrograms = ReturnType<typeof createPaperPrograms>;
