// WGSL mirror of webgl2/rayPolar.frag.glsl — keep structure 1:1 with the GLSL
// file (same helpers, same order, same names). See its header for why these
// passes exist and for the conventions; the three PASSes are three entry points
// here instead of three #define builds.
//
//   fsBins       PASS 1  m(θ, s) per radial bin, 4 bins per rgba8unorm texel
//   fsPrefix     PASS 2  exclusive prefix of 16-bin block totals, fp32 bits (rgba32uint)
//   fsNormalize  PASS 3  Nₙ(θ, s) = Mₙ(s)/s^{n+1} (rgba16float)
//
// @builtin(position) is the raw framebuffer coordinate (top-left origin) — the
// same texel indexing as the GLSL twin's raw gl_FragCoord in an offscreen pass.

struct P {
  c: vec2f,        // light centre, mask uv (gpu/exactLight.ts)
  nTheta: f32,     // angular texels
  ds: f32,         // radial bin width, uv
  maskSize: f32,   // mask texels across
  lodFloor: f32,   // log2(mask texels per canvas px), ≥ 0
  penLod: f32,     // penumbra: log2 of the blur in mask texels, 0 = off
  edge: f32,       // ray source: 0 = B radial smear, 1 = R crisp
};

@group(0) @binding(0) var<uniform> u: P;
@group(0) @binding(1) var maskTex: texture_2d<f32>;
@group(0) @binding(2) var maskSamp: sampler;
@group(0) @binding(3) var binsTex: texture_2d<f32>;
@group(0) @binding(4) var prefixTex: texture_2d<u32>;

const TAU = 6.28318530718;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let pos = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(pos * 2.0 - 1.0, 0.0, 1.0);
}

fn thetaOf(i: f32) -> f32 {
  return TAU * (i + 0.5) / u.nTheta - 3.14159265359;
}

fn binMid(j: f32) -> f32 {
  return select(j * u.ds, 0.25 * u.ds, j < 0.5);
}

fn binLen(j: f32) -> f32 {
  return select(u.ds, 0.5 * u.ds, j < 0.5);
}

fn binW(j: f32) -> vec4f {
  let h = binLen(j);
  let m = binMid(j);
  return h * vec4f(1.0, m, m * m + h * h / 12.0, m * (m * m + h * h / 4.0));
}

fn polarMask(th: f32, s: f32) -> f32 {
  let uv = u.c + s * vec2f(cos(th), sin(th));
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return 0.0; }
  let spacing = max(TAU * s / u.nTheta, u.ds) * u.maskSize;
  let lod = max(max(log2(max(spacing, 1.0)), u.lodFloor), u.penLod);
  let t = textureSampleLevel(maskTex, maskSamp, uv, lod);
  return mix(t.b, t.r, u.edge);
}

@fragment
fn fsBins(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  let i = floor(fp.x);
  let q = floor(fp.y);
  let th = thetaOf(i);
  return vec4f(
    polarMask(th, binMid(q * 4.0)),
    polarMask(th, binMid(q * 4.0 + 1.0)),
    polarMask(th, binMid(q * 4.0 + 2.0)),
    polarMask(th, binMid(q * 4.0 + 3.0))
  );
}

@fragment
fn fsPrefix(@builtin(position) fp: vec4f) -> @location(0) vec4u {
  let i = i32(fp.x);
  let b = i32(fp.y);
  var acc = vec4f(0.0);
  for (var q = 0; q < b * 4; q++) {
    let m = textureLoad(binsTex, vec2i(i, q), 0);
    let j0 = f32(q * 4);
    acc = acc + m.x * binW(j0) + m.y * binW(j0 + 1.0) + m.z * binW(j0 + 2.0) + m.w * binW(j0 + 3.0);
  }
  return bitcast<vec4u>(acc);
}

@fragment
fn fsNormalize(@builtin(position) fp: vec4f) -> @location(0) vec4f {
  let i = i32(fp.x);
  let j = i32(fp.y);
  let b = j / 16;
  var acc = bitcast<vec4f>(textureLoad(prefixTex, vec2i(i, b), 0));
  for (var jj = b * 16; jj <= j; jj++) {
    var m4 = textureLoad(binsTex, vec2i(i, jj / 4), 0);
    acc = acc + m4[jj - (jj / 4) * 4] * binW(f32(jj));
  }
  let s = (f32(j) + 0.5) * u.ds;
  let s2 = s * s;
  return acc / vec4f(s, s2, s2 * s, s2 * s2);
}
