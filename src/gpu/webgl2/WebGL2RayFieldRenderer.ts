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
  'hoverMode',
  'compositeMode',
] as const;

export class WebGL2RayFieldRenderer implements RayFieldRenderer {
  readonly backend = 'webgl2' as const;
  private gl!: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private uniforms = new Map<string, WebGLUniformLocation | null>();

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
      'u_beamHover',
      'u_bgMix',
      'u_sceneDim',
      'u_layers',
      'u_octaves',
      ...PARAM_UNIFORMS.map((k) => `u_${k}`),
    ];
    for (const n of names) this.uniforms.set(n, gl.getUniformLocation(program, n));

    // bufferless triangle still needs a bound VAO on some drivers
    gl.bindVertexArray(gl.createVertexArray());
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
    gl.uniform4f(u('u_beamHover'), ...s.beamHover);
    gl.uniform1f(u('u_bgMix'), s.bgMix);
    gl.uniform1f(u('u_sceneDim'), s.sceneDim);
    gl.uniform1f(u('u_layers'), s.layers);
    gl.uniform1f(u('u_octaves'), s.octaves);
    for (const k of PARAM_UNIFORMS) {
      gl.uniform1f(u(`u_${k}`), s.params[k]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy(): void {
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
