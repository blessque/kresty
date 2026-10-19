import type { LightMaskData } from '../rayFieldTypes';
import { HAZE_SIZE, hazeNoise } from '../hazeNoise';

/**
 * The exact light's textures on WebGL2 (round 33). Every upload states its pixel
 * store explicitly: the old mask upload set `UNPACK_FLIP_Y_WEBGL = true` and
 * never reset it — global state that would silently mirror the next upload.
 * These uploads carry rows that are ALREADY bottom-up (`shared/lightMask.ts`),
 * so the flip must be off, and the twins receive identical bytes.
 */

function store(gl: WebGL2RenderingContext, alignment: number) {
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, alignment);
}

/** the emblem mask, every mip level: RGBA8, bottom-up rows, clamped */
export function uploadMask(gl: WebGL2RenderingContext, tex: WebGLTexture, data: LightMaskData) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  store(gl, 4);
  data.levels.forEach((lv, k) => {
    const n = Math.max(1, data.size >> k);
    gl.texImage2D(gl.TEXTURE_2D, k, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, lv);
  });
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, data.levels.length - 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** the baked bloom: RG16F straight from the halves `lightMask` produced */
export function uploadBloom(gl: WebGL2RenderingContext, tex: WebGLTexture, bloom: LightMaskData['bloom']) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  store(gl, 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, bloom.size, bloom.size, 0, gl.RG, gl.HALF_FLOAT, bloom.halves);
  linearClamp(gl);
}

/** the haze's tiling FBM: R8, box mips, repeated */
export function createHaze(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  store(gl, 1);
  hazeNoise().forEach((lv, k) => {
    const n = Math.max(1, HAZE_SIZE >> k);
    gl.texImage2D(gl.TEXTURE_2D, k, gl.R8, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, lv);
  });
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  store(gl, 4);
  return tex;
}

/**
 * A 1×1 texture of the right TYPE for a sampler the current mode does not read.
 * WebGL2 refuses a draw (INVALID_OPERATION) when a statically used sampler's
 * unit holds a texture of the wrong kind — float vs uint — even on a branch that
 * never runs, so every unit is always bound to something compatible.
 */
export function placeholder(gl: WebGL2RenderingContext, uint: boolean): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  store(gl, 4);
  if (uint) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32UI, 1, 1, 0, gl.RGBA_INTEGER, gl.UNSIGNED_INT, new Uint32Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    linearClamp(gl);
  }
  return tex;
}

export function linearClamp(gl: WebGL2RenderingContext) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
