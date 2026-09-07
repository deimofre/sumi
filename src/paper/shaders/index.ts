import { compile, Program } from '../../gl/program.ts';
import quadVert from '../../shaders/quad.vert';
import depositFilm from './deposit-film.frag';
import display from './display-paper.frag';
import paperGen from './paper-gen.frag';
import paperImage from './paper-image.frag';
import props from './props.frag';
import settle from './settle.frag';
import soak from './soak.frag';
import splatVert from './splat.vert';
import update from './update.frag';

export function createPaperPrograms(gl: WebGL2RenderingContext) {
  const quad = compile(gl, gl.VERTEX_SHADER, quadVert);
  const splat = compile(gl, gl.VERTEX_SHADER, splatVert);
  return {
    paperGen: new Program(gl, quad, paperGen), paperImage: new Program(gl, quad, paperImage), props: new Program(gl, quad, props),
    depositFilm: new Program(gl, splat, depositFilm),
    soak: new Program(gl, quad, soak), update: new Program(gl, quad, update), settle: new Program(gl, quad, settle),
    display: new Program(gl, quad, display),
  };
}
export type PaperPrograms = ReturnType<typeof createPaperPrograms>;
