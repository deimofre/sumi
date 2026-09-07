import { compile, Program } from '../gl/program.ts';
import quadVert from './quad.vert';
import splatVel from './splat-vel.frag';
import splatDye from './splat-dye.frag';
import advect from './advect.frag';
import curl from './curl.frag';
import vorticity from './vorticity.frag';
import divergence from './divergence.frag';
import pressure from './pressure.frag';
import gradient from './gradient.frag';
import clear from './clear.frag';
import display from './display.frag';

export function createPrograms(gl: WebGL2RenderingContext) {
  const vert = compile(gl, gl.VERTEX_SHADER, quadVert);
  return {
    splatVel: new Program(gl, vert, splatVel), splatDye: new Program(gl, vert, splatDye),
    advect: new Program(gl, vert, advect), curl: new Program(gl, vert, curl), vorticity: new Program(gl, vert, vorticity),
    divergence: new Program(gl, vert, divergence), pressure: new Program(gl, vert, pressure), gradient: new Program(gl, vert, gradient),
    clear: new Program(gl, vert, clear), display: new Program(gl, vert, display),
  };
}
export type Programs = ReturnType<typeof createPrograms>;
