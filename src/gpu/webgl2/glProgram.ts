/**
 * Compile + link a WebGL2 program and resolve its uniforms from an explicit name
 * list — extracted from `WebGL2RayFieldRenderer` in round 33, when one program
 * became four (the main pass + three polar passes).
 *
 * THE TRAP THIS EXISTS FOR: `gl.getUniformLocation` returns null for a name that
 * is not active, and `gl.uniform*(null, …)` is a legal no-op. A uniform the shader
 * reads but the list forgets is uploaded every frame — to nowhere, with no error,
 * no warning and often no visible artefact (round 11's lean, round 25's rotation).
 * So in dev every program checks its own source: anything it declares that the
 * list omits is reported. The regex accepts precision qualifiers — `uniform highp
 * usampler2D u_x` would slip past a plain `uniform \w+ (u_\w+)`.
 */
export interface GLProgram {
  program: WebGLProgram;
  /** location by name; null for an inactive or unknown uniform */
  u: (name: string) => WebGLUniformLocation | null;
}

export function compileProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
  names: readonly string[],
  label: string,
): GLProgram {
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`[${label}] shader compile failed: ${gl.getShaderInfoLog(sh)}`);
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
    throw new Error(`[${label}] program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  const locs = new Map<string, WebGLUniformLocation | null>();
  for (const n of names) locs.set(n, gl.getUniformLocation(program, n));

  if (import.meta.env.DEV) {
    const declared = [
      ...fragSrc.matchAll(/^\s*uniform\s+(?:(?:lowp|mediump|highp)\s+)?\w+\s+(u_\w+)/gm),
    ].map((m) => m[1]);
    const missing = declared.filter((n) => !locs.has(n));
    if (missing.length) {
      console.error(
        `[kresty] ${label}: ${missing.length} uniform(s) declared in the shader but not in the ` +
          `name list — every upload to them is a SILENT no-op: ${missing.join(', ')}`,
      );
    }
  }
  return { program, u: (n) => locs.get(n) ?? null };
}
