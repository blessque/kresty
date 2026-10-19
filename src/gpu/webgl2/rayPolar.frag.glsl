#version 300 es
// PASS (1 · 2 · 3) and POLAR_UINT (0 · 1) are #defined by polarPasses.ts.
//
// THE EXACT LIGHT'S POLAR PASSES (round 33) — mirrored twin of
// webgpu/rayPolar.wgsl: same helpers, same order, same names.
//
// Seen from the light centre c every god-ray is a straight line, so the old
// march — a 1D integral toward c — is a PREFIX SUM in polar coordinates about c.
// These passes build that prefix sum exactly, once per frame, in a texture whose
// size does not depend on the screen:
//
//   PASS 1  m(θ, s) at the midpoint of every radial bin, 4 bins per RGBA8 texel
//   PASS 2  exclusive prefix of the 16-bin block totals, fp32 bits (RGBA32UI —
//           core-renderable in WebGL2, where RGBA32F needs an extension)
//   PASS 3  normalized moments Nₙ(θ, s) = Mₙ(s)/s^{n+1}, Mₙ(s) = ∫₀ˢ m s′ⁿ ds′
//
// PASS 3 never re-samples the mask, so the passes cannot disagree.
//
// CONVENTIONS, each a silent distortion if broken:
//  - bins END on texel centres: bin j = [max(0, (j−½)Δs), (j+½)Δs], texel j
//    stores the prefix up to (j+½)Δs, so the final pass's bilinear read is a
//    read between bin ends;
//  - these are OFFSCREEN passes: rows are indexed with the RAW gl_FragCoord —
//    main()'s `u_resolution.y − gl_FragCoord.y` flip would mirror s or θ here
//    on WebGL2 only.

precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D u_mask;            // emblem mask, RGBA8 + gaussian mips (unit 0)
uniform sampler2D u_bins;            // PASS 1 output (unit 2)
uniform highp usampler2D u_prefix;   // PASS 2 output (unit 3)
uniform vec2 u_c;                    // light centre, mask uv (gpu/exactLight.ts)
uniform float u_nTheta;              // angular texels
uniform float u_ds;                  // radial bin width, uv
uniform float u_maskSize;            // mask texels across
uniform float u_lodFloor;            // log2(mask texels per canvas px), ≥ 0
uniform float u_penLod;              // penumbra: log2 of the blur in mask texels, 0 = off
uniform float u_edge;                // ray source: 0 = B radial smear, 1 = R crisp

#if PASS == 2 || (PASS == 3 && POLAR_UINT == 1)
out uvec4 outU;
#else
out vec4 outF;
#endif

const float TAU = 6.28318530718;

// angle of polar column i — at texel centres, so the final pass's
// u = θ/2π + ½ lands exactly on them
float thetaOf(float i) {
  return TAU * (i + 0.5) / u_nTheta - 3.14159265359;
}

float binMid(float j) {
  return j < 0.5 ? 0.25 * u_ds : j * u_ds;
}

float binLen(float j) {
  return j < 0.5 ? 0.5 * u_ds : u_ds;
}

// ∫ over bin j of (1, s, s², s³) ds, in the midpoint form (no cancellation)
vec4 binW(float j) {
  float h = binLen(j);
  float m = binMid(j);
  return h * vec4(1.0, m, m * m + h * h / 12.0, m * (m * m + h * h / 4.0));
}

// the ray source at (θ, s), band-limited to this grid's own spacing at that
// radius — so nothing the grid cannot hold aliases into it as the light turns —
// and to the emblem's size on screen; `penumbra` is a further LOD bias over the
// mask's gaussian mips (an extended source: each slit edge blurred sideways)
float polarMask(float th, float s) {
  vec2 uv = u_c + s * vec2(cos(th), sin(th));
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  float spacing = max(TAU * s / u_nTheta, u_ds) * u_maskSize;
  float lod = max(max(log2(max(spacing, 1.0)), u_lodFloor), u_penLod);
  vec4 t = textureLod(u_mask, uv, lod);
  return mix(t.b, t.r, u_edge);
}

#if PASS == 1
void main() {
  float i = floor(gl_FragCoord.x);
  float q = floor(gl_FragCoord.y);
  float th = thetaOf(i);
  outF = vec4(
    polarMask(th, binMid(q * 4.0)),
    polarMask(th, binMid(q * 4.0 + 1.0)),
    polarMask(th, binMid(q * 4.0 + 2.0)),
    polarMask(th, binMid(q * 4.0 + 3.0))
  );
}
#endif

#if PASS == 2
void main() {
  int i = int(gl_FragCoord.x);
  int b = int(gl_FragCoord.y);
  vec4 acc = vec4(0.0);
  for (int q = 0; q < 1024; q++) {
    if (q >= b * 4) break;
    vec4 m = texelFetch(u_bins, ivec2(i, q), 0);
    float j0 = float(q * 4);
    acc += m.x * binW(j0) + m.y * binW(j0 + 1.0) + m.z * binW(j0 + 2.0) + m.w * binW(j0 + 3.0);
  }
  outU = floatBitsToUint(acc);
}
#endif

#if PASS == 3
void main() {
  int i = int(gl_FragCoord.x);
  int j = int(gl_FragCoord.y);
  int b = j / 16;
  vec4 acc = uintBitsToFloat(texelFetch(u_prefix, ivec2(i, b), 0));
  for (int jj = b * 16; jj <= j; jj++) {
    vec4 m4 = texelFetch(u_bins, ivec2(i, jj / 4), 0);
    acc += m4[jj - (jj / 4) * 4] * binW(float(jj));
  }
  float s = (float(j) + 0.5) * u_ds;
  float s2 = s * s;
  vec4 n = acc / vec4(s, s2, s2 * s, s2 * s2);
#if POLAR_UINT == 1
  outU = floatBitsToUint(n);
#else
  outF = n;
#endif
}
#endif
