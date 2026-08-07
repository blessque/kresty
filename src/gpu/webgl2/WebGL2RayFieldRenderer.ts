import type { RayFieldRenderer, RayFieldState } from '../rayFieldTypes';
import vertSrc from './rayField.vert.glsl?raw';
import fragSrc from './rayField.frag.glsl?raw';

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
  'hoverMode',
  'compositeMode',
] as const;

export class WebGL2RayFieldRenderer implements RayFieldRenderer {
  readonly backend = 'webgl2' as const;
  private gl!: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private signTex: WebGLTexture | null = null;
  private hasMask = 0;

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

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`);
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vertSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    gl.useProgram(program);

    const names = [
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
      'u_bgMix',
      'u_sceneDim',
      'u_modeMix',
      'u_slitMix',
      'u_hasMask',
      'u_signMask',
      'u_layers',
      'u_octaves',
      ...PARAM_UNIFORMS.map((k) => `u_${k}`),
    ];
    for (const n of names) this.uniforms.set(n, gl.getUniformLocation(program, n));
    gl.uniform1i(this.uniforms.get('u_signMask') ?? null, 0); // sampler on unit 0

    // bufferless triangle still needs a bound VAO on some drivers
    gl.bindVertexArray(gl.createVertexArray());
  }

  setSignMask(source: TexImageSource): void {
    const gl = this.gl;
    if (!this.signTex) this.signTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.signTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // top row -> v=0 (p.y is down)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.hasMask = 1;
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
    const u = (n: string) => this.uniforms.get(n) ?? null;
    gl.useProgram(this.program);
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
    gl.uniform1f(u('u_bgMix'), s.bgMix);
    gl.uniform1f(u('u_sceneDim'), s.sceneDim);
    gl.uniform1f(u('u_modeMix'), s.modeMix);
    gl.uniform1f(u('u_slitMix'), s.slitMix);
    gl.uniform1f(u('u_signRot'), s.signRot);
    gl.uniform1f(u('u_hasMask'), this.hasMask);
    gl.uniform1f(u('u_layers'), s.layers);
    gl.uniform1f(u('u_octaves'), s.octaves);
    for (const k of PARAM_UNIFORMS) {
      gl.uniform1f(u(`u_${k}`), s.params[k]);
    }
    if (this.signTex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.signTex);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy(): void {
    if (this.signTex) this.gl?.deleteTexture(this.signTex);
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
