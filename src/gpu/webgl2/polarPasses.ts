import vertSrc from './rayField.vert.glsl?raw';
import polarSrc from './rayPolar.frag.glsl?raw';
import { compileProgram, type GLProgram } from './glProgram';
import type { ExactFrame } from '../exactLight';

/**
 * The exact light's three polar passes on WebGL2 (round 33) — the prefix sum
 * `rayPolar.frag.glsl` describes, built once per frame (or not at all when the
 * light centre and mask have not moved) into textures whose size is fixed by
 * the angular resolution, never by the screen.
 *
 * Formats, chosen for reach rather than elegance:
 *   PASS 1  RGBA8      always renderable
 *   PASS 2  RGBA32UI   fp32 bits; integer formats are CORE-renderable in WebGL2,
 *                      RGBA32F is not — and nothing reads it filtered
 *   PASS 3  RGBA16F    where EXT_color_buffer_(half_)float allows; otherwise
 *           RGBA32UI   too, and the final pass reads it with a hand-made bilinear
 * So the exact light exists on every WebGL2 device. A self-test renders a known
 * answer before the light is trusted; only a failure there leaves the old march.
 *
 * STATE HYGIENE: each pass binds its own framebuffer and viewport, disables
 * scissor and blend, and binds exactly the units it reads. «О Крестах» enables
 * scissor on EVERY frame, so a leaked scissor would clip these passes to the
 * on-screen band — broken on that one page and nowhere else.
 */

const NAMES = [
  'u_mask',
  'u_bins',
  'u_prefix',
  'u_c',
  'u_nTheta',
  'u_ds',
  'u_maskSize',
  'u_lodFloor',
  'u_penLod',
  'u_edge',
] as const;

const UNIT_MASK = 0;
const UNIT_BINS = 2;
const UNIT_PREFIX = 3;

/** reads back PASS 3 at four texels, ×(1, 2, 3, 4): a white mask must give 1 */
const TEST_FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_polar;
uniform highp usampler2D u_polarBits;
uniform float u_manual;
out vec4 outF;
void main() {
  ivec2 at = ivec2(int(gl_FragCoord.x) * 37 + 5, 40 + int(gl_FragCoord.x) * 11);
  vec4 n = u_manual > 0.5
    ? uintBitsToFloat(texelFetch(u_polarBits, at, 0))
    : texelFetch(u_polar, at, 0);
  outF = n * vec4(1.0, 2.0, 3.0, 4.0);
}`;

export class GLPolarPasses {
  /** PASS 3 is RGBA32UI and the final pass reads it with a hand-made bilinear */
  manual: boolean;
  builds = 0;
  private p1: GLProgram;
  private p2: GLProgram;
  private p3: GLProgram;
  private t1: WebGLTexture | null = null;
  private t2: WebGLTexture | null = null;
  private t3: WebGLTexture | null = null;
  private fbs: WebGLFramebuffer[] = [];
  private dims = { nTheta: 0, nS: 0 };
  private lastKey = '';

  private constructor(
    private gl: WebGL2RenderingContext,
    manual: boolean,
  ) {
    this.manual = manual;
    const src = (pass: number) =>
      polarSrc.replace('#version 300 es', `#version 300 es\n#define PASS ${pass}\n#define POLAR_UINT ${manual ? 1 : 0}`);
    this.p1 = compileProgram(gl, vertSrc, src(1), NAMES, 'rayPolar/1');
    this.p2 = compileProgram(gl, vertSrc, src(2), NAMES, 'rayPolar/2');
    this.p3 = compileProgram(gl, vertSrc, src(3), NAMES, 'rayPolar/3');
  }

  /** null when no format chain works on this device — the caller keeps the march */
  static create(gl: WebGL2RenderingContext): GLPolarPasses | null {
    const half = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    for (const manual of half ? [false, true] : [true]) {
      try {
        const pp = new GLPolarPasses(gl, manual);
        if (pp.selfTest()) return pp;
        console.warn(`[kresty] exact light: self-test failed (${manual ? 'RGBA32UI' : 'RGBA16F'})`);
        pp.destroy();
      } catch (err) {
        console.warn('[kresty] exact light: polar passes unavailable', err);
      }
    }
    return null;
  }

  /** the texture the final pass reads: unit 1 (RGBA16F) or unit 4 (RGBA32UI) */
  get texture(): WebGLTexture | null {
    return this.t3;
  }

  private alloc(nTheta: number, nS: number) {
    const gl = this.gl;
    for (const t of [this.t1, this.t2, this.t3]) if (t) gl.deleteTexture(t);
    for (const f of this.fbs) gl.deleteFramebuffer(f);
    const tex = (w: number, h: number, fmt: number, filter: number, wrapS: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.t1 = tex(nTheta, nS / 4, gl.RGBA8, gl.NEAREST, gl.CLAMP_TO_EDGE);
    this.t2 = tex(nTheta, nS / 16, gl.RGBA32UI, gl.NEAREST, gl.CLAMP_TO_EDGE);
    this.t3 = this.manual
      ? tex(nTheta, nS, gl.RGBA32UI, gl.NEAREST, gl.CLAMP_TO_EDGE)
      : tex(nTheta, nS, gl.RGBA16F, gl.LINEAR, gl.REPEAT);
    this.fbs = [this.t1, this.t2, this.t3].map((t) => {
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        throw new Error('polar framebuffer incomplete');
      }
      return fb;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.dims = { nTheta, nS };
    this.lastKey = '';
  }

  /**
   * Build the polar texture for this frame, unless nothing it depends on moved.
   * Returns true when it rebuilt. Leaves the default framebuffer bound; the
   * caller restores its own viewport and scissor.
   */
  run(f: ExactFrame, mask: WebGLTexture, maskSize: number): boolean {
    if (f.key === this.lastKey) return false;
    const gl = this.gl;
    if (f.nTheta !== this.dims.nTheta || f.nS !== this.dims.nS) this.alloc(f.nTheta, f.nS);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0 + UNIT_MASK);
    gl.bindTexture(gl.TEXTURE_2D, mask);
    const passes: [GLProgram, number, number, (WebGLTexture | null)[]][] = [
      [this.p1, 0, f.nS / 4, [null, null]],
      [this.p2, 1, f.nS / 16, [this.t1, null]],
      [this.p3, 2, f.nS, [this.t1, this.t2]],
    ];
    for (const [prog, fbIdx, h, [bins, prefix]] of passes) {
      gl.activeTexture(gl.TEXTURE0 + UNIT_BINS);
      gl.bindTexture(gl.TEXTURE_2D, bins);
      gl.activeTexture(gl.TEXTURE0 + UNIT_PREFIX);
      gl.bindTexture(gl.TEXTURE_2D, prefix);
      gl.useProgram(prog.program);
      gl.uniform1i(prog.u('u_mask'), UNIT_MASK);
      gl.uniform1i(prog.u('u_bins'), UNIT_BINS);
      gl.uniform1i(prog.u('u_prefix'), UNIT_PREFIX);
      gl.uniform2f(prog.u('u_c'), f.c[0], f.c[1]);
      gl.uniform1f(prog.u('u_nTheta'), f.nTheta);
      gl.uniform1f(prog.u('u_ds'), f.ds);
      gl.uniform1f(prog.u('u_maskSize'), maskSize);
      gl.uniform1f(prog.u('u_lodFloor'), f.lodFloor);
      gl.uniform1f(prog.u('u_penLod'), f.penLod);
      gl.uniform1f(prog.u('u_edge'), f.edge);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbs[fbIdx]);
      gl.viewport(0, 0, f.nTheta, h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.lastKey = f.key;
    this.builds++;
    return true;
  }

  /** forget the last key — the mask texture changed under the same numbers */
  invalidate() {
    this.lastKey = '';
  }

  /**
   * A white 1×1 mask seen from its centre has Nₙ = 1/(n+1) everywhere, so
   * PASS 3 × (1, 2, 3, 4) reads back as 255 on all four channels. Proves the
   * formats render, the integer prefix round-trips and the passes agree —
   * on THIS device, before anything is drawn with it.
   */
  private selfTest(): boolean {
    const gl = this.gl;
    // getError is sticky: an unrelated earlier error must not fail the test
    for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++);
    const white = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, white);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const nS = 256;
    const frame = {
      c: [0.5, 0.5],
      nTheta: 512,
      nS,
      ds: 0.45 / (nS - 0.5),
      lodFloor: 0,
      penLod: 0,
      edge: 0,
      key: 'self-test',
    } as unknown as ExactFrame;
    let ok = false;
    const test = compileProgram(gl, vertSrc, TEST_FRAG, ['u_polar', 'u_polarBits', 'u_manual'], 'rayPolar/test');
    const out = gl.createTexture()!;
    const fb = gl.createFramebuffer()!;
    try {
      this.run(frame, white, 1);
      gl.bindTexture(gl.TEXTURE_2D, out);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 4, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
      gl.useProgram(test.program);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.manual ? null : this.t3);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.manual ? this.t3 : null);
      gl.uniform1i(test.u('u_polar'), 1);
      gl.uniform1i(test.u('u_polarBits'), 4);
      gl.uniform1f(test.u('u_manual'), this.manual ? 1 : 0);
      gl.viewport(0, 0, 4, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Uint8Array(16);
      gl.readPixels(0, 0, 4, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      ok = gl.getError() === gl.NO_ERROR && px.every((v) => v >= 250);
    } catch {
      ok = false;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(out);
      gl.deleteTexture(white);
      gl.deleteProgram(test.program);
      this.invalidate();
    }
    return ok;
  }

  destroy() {
    const gl = this.gl;
    for (const t of [this.t1, this.t2, this.t3]) if (t) gl.deleteTexture(t);
    for (const f of this.fbs) gl.deleteFramebuffer(f);
    for (const p of [this.p1, this.p2, this.p3]) gl.deleteProgram(p.program);
  }
}
