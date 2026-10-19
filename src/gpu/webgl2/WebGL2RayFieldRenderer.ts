import type { LightMaskData, RayFieldRenderer, RayFieldState, RaysMode } from '../rayFieldTypes';
import vertSrc from './rayField.vert.glsl?raw';
import fragSrc from './rayField.frag.glsl?raw';
import { compileProgram, type GLProgram } from './glProgram';
import { GLPolarPasses } from './polarPasses';
import { createHaze, linearClamp, placeholder, uploadBloom, uploadMask } from './glTextures';
import { RAYS_CODE, exactFrame, type MaskGeometry } from '../exactLight';

const PARAM_UNIFORMS = [
  'primaryK',
  'primaryIntensity',
  'falloffL',
  'coreRadius',
  'coreIntensity',
  'crossSize',
  'crossIntensity',
  'secCount',
  'secK',
  'secIntensity',
  'rotSpeed',
  'dustAmount',
  'dustScale',
  'moteAmount',
  'grain',
  'ca',
  'hazeBase',
  'channelDark',
  'parallax',
  'breathe',
  'refraction',
  'shimmer',
  'fiberDrift',
  'angleWarp',
  'ghosting',
  'shadow',
  'signSize',
  'godrays',
  'bloom',
  'dissolve',
  'lightR',
  'lightG',
  'lightB',
  // round 33 — `trail` and `penumbra` are consumed on the CPU (exactLight.ts)
  'rayEdge',
  'haze',
  'hazeScale',
  'hazeDrift',
  'hazeWind',
  'hoverMode',
  'compositeMode',
] as const;

/**
 * NOTE: a uniform missing from these lists is a SILENT no-op — `u()` returns
 * null and `gl.uniform*(null, …)` does nothing. `compileProgram` checks the list
 * against the shader source in dev (round 25: `u_signRot` was missing for
 * eighteen rounds and the cross did not turn on WebGL2).
 */
const STATE_UNIFORMS = [
  'u_resolution',
  'u_center',
  'u_pointer',
  'u_time',
  'u_scale',
  'u_beamAngles',
  'u_linkAngles',
  'u_linkDist',
  'u_linkHalfAng',
  'u_beamHover',
  'u_hoverDir',
  'u_hoverAmt',
  'u_bgMix',
  'u_sceneDim',
  'u_modeMix',
  'u_slitMix',
  'u_hasMask',
  'u_signMask',
  'u_layers',
  'u_octaves',
  'u_raySteps',
  'u_signRot',
  // round 33: the exact light
  'u_raysMode',
  'u_polar',
  'u_polarBits',
  'u_polarManual',
  'u_lightC',
  'u_sLast',
  'u_polarDims',
  'u_kc',
  'u_kA',
  'u_kWb',
  'u_kRef',
  'u_maskLod',
  'u_bloomTex',
  'u_bloomMap',
  'u_hazeTex',
  'u_frame',
  'u_ditherAmp',
  'u_jitOffset',
] as const;

/** texture units of the main pass (the polar passes add 2 and 3) */
const UNIT = { mask: 0, polar: 1, polarBits: 4, bloom: 5, haze: 6 } as const;

export class WebGL2RayFieldRenderer implements RayFieldRenderer {
  readonly backend = 'webgl2' as const;
  gpuName = '';
  exactAvailable = false;
  raysActive: RaysMode = 'march';
  private gl!: WebGL2RenderingContext;
  private main!: GLProgram;
  private polar: GLPolarPasses | null = null;
  private signTex: WebGLTexture | null = null;
  private bloomTex: WebGLTexture | null = null;
  private hazeTex: WebGLTexture | null = null;
  private dummyF!: WebGLTexture;
  private dummyU!: WebGLTexture;
  private hasMask = 0;
  /** set by a mask that came with exact data; null = that mask can only be marched */
  private mask: (MaskGeometry & { bloom: LightMaskData['bloom'] }) | null = null;
  private frameNo = 0;
  private debug = { ditherAmp: 1, jitOffset: 0, frame: -1 };

  get polarBuilds(): number {
    return this.polar?.builds ?? 0;
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    // the unmasked name where the browser allows it (Chrome, Firefox); Safari
    // answers "Apple GPU" either way
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpuName = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');

    this.main = compileProgram(
      gl,
      vertSrc,
      fragSrc,
      [...STATE_UNIFORMS, ...PARAM_UNIFORMS.map((k) => `u_${k}`)],
      'rayField',
    );
    gl.useProgram(this.main.program);
    gl.uniform1i(this.main.u('u_signMask'), UNIT.mask);
    gl.uniform1i(this.main.u('u_polar'), UNIT.polar);
    gl.uniform1i(this.main.u('u_polarBits'), UNIT.polarBits);
    gl.uniform1i(this.main.u('u_bloomTex'), UNIT.bloom);
    gl.uniform1i(this.main.u('u_hazeTex'), UNIT.haze);

    // bufferless triangle still needs a bound VAO on some drivers
    gl.bindVertexArray(gl.createVertexArray());

    this.dummyF = placeholder(gl, false);
    this.dummyU = placeholder(gl, true);
    this.hazeTex = createHaze(gl);
    // round 33: the exact light, if this device can build it — a self-test runs
    // first; on failure the light is the old march, never blank
    this.polar = GLPolarPasses.create(gl);
    this.exactAvailable = this.polar !== null;
  }

  setSignMask(source: TexImageSource, data?: LightMaskData): void {
    const gl = this.gl;
    if (!this.signTex) this.signTex = gl.createTexture();
    if (data) {
      uploadMask(gl, this.signTex!, data);
      if (!this.bloomTex) this.bloomTex = gl.createTexture();
      uploadBloom(gl, this.bloomTex!, data.bloom);
      this.mask = {
        size: data.size,
        inkBox: data.inkBox,
        revision: (this.mask?.revision ?? 0) + 1,
        bloom: data.bloom,
      };
      this.polar?.invalidate();
    } else {
      // the pre-round-33 upload, verbatim — a mask without exact data is marched
      gl.bindTexture(gl.TEXTURE_2D, this.signTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // top row -> v=0 (p.y is down)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      // reset: global state, and the next upload must not inherit a flip
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      // a previous exact upload left a mip chain behind; this is one level
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
      linearClamp(gl);
      this.mask = null;
    }
    this.hasMask = 1;
  }

  setDebug(d: { ditherAmp?: number; jitOffset?: number; frame?: number }): void {
    Object.assign(this.debug, d);
  }

  resize(w: number, h: number): void {
    const c = this.gl.canvas as HTMLCanvasElement;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  render(s: RayFieldState): void {
    const gl = this.gl;
    const u = this.main.u;

    // round 33: which estimator draws this frame — exact unless asked otherwise
    // or unable; reported back so the HUD and the probes see the truth
    const want: RaysMode = s.rays ?? 'exact';
    const exact = want !== 'march' && this.polar !== null && this.mask !== null && s.slitMix > 0.001;
    const mode: RaysMode = exact ? want : 'march';
    this.raysActive = mode;
    const f = exact ? exactFrame(s, this.mask!, mode, s.polarTheta ?? 2048) : null;
    if (f) this.polar!.run(f, this.signTex!, this.mask!.size);

    // the final pass: restore everything the polar passes may have touched
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(this.main.program);
    gl.uniform2f(u('u_resolution'), gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(u('u_center'), s.centerPx[0], s.centerPx[1]);
    gl.uniform2f(u('u_pointer'), s.pointerPx[0], s.pointerPx[1]);
    gl.uniform1f(u('u_time'), s.timeSec);
    gl.uniform1f(u('u_scale'), s.scale);
    gl.uniform4f(u('u_beamAngles'), ...s.beamAngles);
    gl.uniform4f(u('u_linkAngles'), ...s.linkAngles);
    gl.uniform4f(u('u_linkDist'), ...s.linkDist);
    gl.uniform4f(u('u_linkHalfAng'), ...s.linkHalfAng);
    gl.uniform4f(u('u_beamHover'), ...s.beamHover);
    gl.uniform2f(u('u_hoverDir'), s.hoverDir[0], s.hoverDir[1]);
    gl.uniform1f(u('u_hoverAmt'), s.hoverAmt);
    gl.uniform1f(u('u_bgMix'), s.bgMix);
    gl.uniform1f(u('u_sceneDim'), s.sceneDim);
    gl.uniform1f(u('u_modeMix'), s.modeMix);
    gl.uniform1f(u('u_slitMix'), s.slitMix);
    gl.uniform1f(u('u_signRot'), s.signRot);
    gl.uniform1f(u('u_hasMask'), this.hasMask);
    gl.uniform1f(u('u_layers'), s.layers);
    gl.uniform1f(u('u_octaves'), s.octaves);
    gl.uniform1f(u('u_raySteps'), s.raySteps);
    for (const k of PARAM_UNIFORMS) {
      gl.uniform1f(u(`u_${k}`), s.params[k]);
    }
    gl.uniform1f(u('u_raysMode'), RAYS_CODE[mode]);
    gl.uniform1f(u('u_frame'), this.debug.frame >= 0 ? this.debug.frame : this.frameNo);
    gl.uniform1f(u('u_ditherAmp'), this.debug.ditherAmp * (s.dither ?? 1));
    gl.uniform1f(u('u_jitOffset'), this.debug.jitOffset);
    if (f) {
      const k = f.kernel;
      const b = this.mask!.bloom;
      gl.uniform2f(u('u_lightC'), f.c[0], f.c[1]);
      gl.uniform1f(u('u_sLast'), f.sLast);
      gl.uniform2f(u('u_polarDims'), f.nTheta, f.nS);
      gl.uniform4f(u('u_kc'), k.kc[0], k.kc[1], k.kc[2], k.kc[3]);
      gl.uniform1f(u('u_kA'), k.a);
      gl.uniform1f(u('u_kWb'), k.wb);
      gl.uniform2f(u('u_kRef'), k.lambda, k.g);
      gl.uniform1f(u('u_maskLod'), f.maskLod);
      gl.uniform1f(u('u_polarManual'), this.polar!.manual ? 1 : 0);
      gl.uniform3f(u('u_bloomMap'), b.pad, b.dissolve, 1 / (1 + 2 * b.pad));
    }
    const manual = this.polar?.manual ?? false;
    const bind = (unit: number, tex: WebGLTexture | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    };
    bind(UNIT.mask, this.signTex ?? this.dummyF);
    bind(UNIT.polar, f && !manual ? this.polar!.texture : this.dummyF);
    bind(UNIT.polarBits, f && manual ? this.polar!.texture : this.dummyU);
    bind(UNIT.bloom, this.bloomTex ?? this.dummyF);
    bind(UNIT.haze, this.hazeTex ?? this.dummyF);
    if (s.scissorPx) {
      // GL's scissor is bottom-left origin; the contract's is top-left
      const [x, y, w, h] = s.scissorPx;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x, gl.drawingBufferHeight - y - h, w, h);
    } else {
      gl.disable(gl.SCISSOR_TEST);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.frameNo = (this.frameNo + 1) & 0xffff;
  }

  destroy(): void {
    const gl = this.gl;
    if (!gl) return;
    for (const t of [this.signTex, this.bloomTex, this.hazeTex, this.dummyF, this.dummyU]) {
      if (t) gl.deleteTexture(t);
    }
    this.polar?.destroy();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
