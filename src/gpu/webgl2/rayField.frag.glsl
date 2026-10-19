#version 300 es
precision highp float;
// round 33: the dither's PCG hash needs 32-bit uints, and the fragment default
// is mediump — on mobile that prints patterns. The default SAMPLER precision is
// left alone on purpose: changing it would move the old march's numbers.
precision highp int;

// ---- frame state ------------------------------------------------------
uniform vec2 u_resolution;   // internal canvas px
uniform vec2 u_center;       // convergence point, internal px, top-left origin
uniform vec2 u_pointer;      // smoothed pointer, internal px, top-left origin
uniform float u_time;        // seconds
uniform float u_scale;       // internal px per reference(1440-frame) px
uniform vec4 u_beamAngles;   // radians, screen space (y down)
uniform vec4 u_linkAngles;   // directions of the nav links (hover zone light)
uniform vec4 u_linkDist;     // link center distances from convergence, reference px
uniform vec4 u_linkHalfAng;  // apparent angular half-width of each label, rad
uniform vec4 u_beamHover;    // 0..1 per nav beam
uniform float u_bgMix;       // 0 flat blue, 1 photo showreel underneath
uniform float u_layers;      // parallax dust layers (perf tier)
uniform float u_octaves;     // fbm octaves (perf tier)
uniform float u_raySteps;    // god-ray march steps, 8..32 (quality governor)

// ---- variant params (reference-px distances) --------------------------
uniform float u_primaryK;
uniform float u_primaryIntensity;
uniform float u_falloffL;
uniform float u_coreRadius;
uniform float u_coreIntensity;
uniform float u_crossSize;
uniform float u_crossIntensity;
uniform float u_secCount;
uniform float u_secK;
uniform float u_secIntensity;
uniform float u_rotSpeed;
uniform float u_dustAmount;
uniform float u_dustScale;
uniform float u_moteAmount;
uniform float u_grain;
uniform float u_ca;
uniform float u_hazeBase;
uniform float u_channelDark;
uniform float u_parallax;
uniform float u_breathe;
uniform float u_refraction;    // fiber-bundle visibility inside beams
uniform float u_shimmer;       // per-beam slow brightness life
uniform float u_fiberDrift;    // angular migration speed of the fiber bundles
uniform float u_angleWarp;     // camera-tilt geometry: toward rods vs away fans
uniform float u_ghosting;      // lens-flare ghost chain on the camera axis
uniform float u_shadow;        // hovered links carve dark shadow paths
uniform float u_modeMix;       // 0 holographic white/rainbow, 1 dusty warm amber
uniform float u_sceneDim;      // hover gallery-dark: boost + warm
uniform float u_hoverMode;     // 0 brighten+turb | 1 widen | 2 flood | 3 arm | 4 stream
uniform float u_compositeMode; // 0 additive | 1 eclipse

// ---- «Прорезь» slit path ----------------------------------------------
uniform sampler2D u_signMask;  // rasterized emblem (sign.svg): white = slit open
uniform float u_hasMask;       // 1 if the mask texture is uploaded, else 0
uniform float u_signSize;      // emblem span in reference px (mask footprint)
uniform float u_godrays;       // radial light-scatter strength through the slits
uniform float u_bloom;         // emissive halo around the emblem
uniform float u_slitMix;       // 0 procedural field, 1 logo-slit light
uniform float u_dissolve;      // 0 crisp logo, 1 dissolved into zoom-blur trails
uniform float u_signRot;       // slow continuous rotation of the light pattern, rad
uniform vec2 u_hoverDir;       // Σ hover[j]·(cos aj, sin aj) over EVERY nav link
uniform float u_hoverAmt;      // Σ hover[j] over EVERY nav link (unclamped)
uniform float u_lightR;        // colour of the light itself, per channel;
uniform float u_lightG;        //   (1,1,1) = white = every shipped variant.
uniform float u_lightB;        //   Applied before the tone curve — see main().

// ---- round 33: the exact light (gpu/exactLight.ts, webgl2/polarPasses.ts) ---
uniform float u_raysMode;            // 0 march (the old estimator) · 1 exact · 2 pure · 3 reference
uniform highp sampler2D u_polar;     // Nₙ(θ, s), RGBA16F, REPEAT on θ (unit 1)
uniform highp usampler2D u_polarBits; // the same as fp32 bits, where RGBA16F cannot be rendered (unit 4)
uniform float u_polarManual;         // 1 → read u_polarBits with a hand-made bilinear
uniform vec2 u_lightC;               // light centre, mask uv — CPU-computed, shared with the passes
uniform float u_sLast;               // radius of the last polar texel centre, uv
uniform vec2 u_polarDims;            // (Nθ, Ns)
uniform vec4 u_kc;                   // the forward kernel, a cubic in τ
uniform float u_kA;                  // forward radius scale: 1 − 1/28 matched, 1 pure
uniform float u_kWb;                 // behind-centre weight (0 pure)
uniform vec2 u_kRef;                 // probe-only reference march: (λ, g)
uniform float u_maskLod;             // LOD of the core fetch: the emblem's size on screen
uniform highp sampler2D u_bloomTex;  // baked bloom, RG16F: x at the bake dissolve, y at 0 (unit 5)
uniform vec3 u_bloomMap;             // pad (uv), bake dissolve, 1/(1 + 2·pad)
uniform highp sampler2D u_hazeTex;   // tiling FBM for the living haze (unit 6)
uniform float u_rayEdge;             // ray source: 0 = B radial smear, 1 = R crisp
uniform float u_haze;                // living haze, 0 = off
uniform float u_hazeScale;           // haze feature size, ref px
uniform float u_hazeDrift;           // haze drift, × the default
uniform float u_hazeWind;            // cursor stir, × the default
uniform float u_frame;               // dither seed, a frame counter
uniform float u_ditherAmp;           // TPDF amplitude in LSB (0 = off: probes)
uniform float u_jitOffset;           // probe-only: shifts the old march's jitter

out vec4 fragColor;

// ---- noise ------------------------------------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// round 33: the dither's hash. `hash21` above repeats EXACTLY every 50 × 100 px
// on pixel centres (123.34·50 and 456.21·100 are integers) and loses its fraction
// bits at large coordinates — a grid in the dither on big canvases.
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= u_octaves) break;
    v += amp * vnoise(p);
    p = p * 2.13 + 7.7;
    amp *= 0.5;
  }
  return v;
}

// angular lobe: a narrow beam of light along direction `a`
float lobe(float th, float a, float k) {
  float c = cos(th - a);
  return c > 0.0 ? pow(c, k) : 0.0;
}

// Fiber bundle inside a beam: NON-periodic comb of hashed sub-rays that drift
// angularly, are born and die on individual cycles ("disco lights"), with
// unequal widths/brightness. Replaces the old sin() prismatic bands, whose
// strict periodicity produced the "ladder" artifact — real light never splits
// into equal lines. `disp` spreads RGB across each fiber's cross-section
// (prism dispersion); returns per-channel fiber luminance.
vec3 fiberComb(float dTh, float r, float t, float seed, float disp) {
  // slight shear so fibers are not laser-straight along their length
  float shear = (vnoise(vec2(dTh * 26.0 + seed, r * 0.0035 + t * 0.04)) - 0.5) * 0.6;
  vec3 acc = vec3(0.0);
  // staggered generations (golden-ratio offsets) so births/deaths overlap;
  // each generation runs its OWN comb frequency — equal spacing would both
  // read as fake and alias into concentric moiré rings near the center
  for (int g = 0; g < 3; g++) {
    float fg = float(g);
    float freq = 47.0 + fg * 18.0;
    // fade a generation out where its fibers shrink below ~2 device px,
    // otherwise the converging lines alias into arc-shaped moiré
    float cellPx = r * u_scale / freq;
    float vis = smoothstep(2.2, 5.5, cellPx);
    if (vis < 0.003) continue;
    float x = dTh * freq + shear + fg * 4.3262;
    x += t * u_fiberDrift * (0.55 + 0.37 * fg);
    float id = floor(x);
    float fx = fract(x);
    float h1 = hash21(vec2(id, seed + fg * 31.7));
    float h2 = hash21(vec2(id, seed + fg * 31.7 + 5.3));
    float h3 = hash21(vec2(id, seed + fg * 31.7 + 9.1));
    // lifecycle: each fiber fades in, lives ~4-9 s, dies, gets replaced
    float life = 0.5 + 0.5 * sin(t * (0.7 + h1 * 0.9) + h1 * 6.2831);
    life = smoothstep(0.12, 0.62, life) * step(0.2, h2);
    // unequal widths, jittered positions, a few bright "soloists";
    // a fiber never goes subpixel — that aliased into concentric moiré
    float w = max(0.07 + 0.17 * h2, 1.6 / cellPx);
    float c = 0.22 + 0.56 * h3;
    float d = (fx - c) / w;
    float bright = 0.3 + 2.2 * pow(h1, 6.0);
    float dd = disp * 0.6;
    acc += vec3(
      exp(-(d - dd) * (d - dd)),
      exp(-d * d),
      exp(-(d + dd) * (d + dd))
    ) * bright * life * vis;
  }
  return acc * 0.55;
}

// emblem mask, crisp channel; 0 outside the footprint (CLAMP would smear)
float signMask(vec2 uv) {
  vec2 c = clamp(uv, 0.0, 1.0);
  if (c != uv) return 0.0;
  return textureLod(u_signMask, uv, 0.0).r; // LOD 0: the mask has mips since round 33
}

// round-blurred emblem channel — bloom taps sample this: sparse jittered taps
// of the hard-edged crisp channel have huge per-pixel variance (stipple noise)
float signMaskSoft(vec2 uv) {
  vec2 c = clamp(uv, 0.0, 1.0);
  if (c != uv) return 0.0;
  return textureLod(u_signMask, uv, 0.0).g; // LOD 0: the mask has mips since round 33
}

// RADIALLY-smeared emblem channel — the god-ray march samples this: the march
// integrates along the ray, so only that direction needs smoothing; a round
// blur here would also melt the razor-sharp tangential trail edges (the look)
float signMaskRay(vec2 uv) {
  vec2 c = clamp(uv, 0.0, 1.0);
  if (c != uv) return 0.0;
  return textureLod(u_signMask, uv, 0.0).b; // LOD 0: the mask has mips since round 33
}

// ---- round 33: the exact light ----------------------------------------------
// The god-rays as a polar prefix sum (gpu/exactLight.ts has the derivation), the
// bloom baked once (shared/lightMask.ts), the core at the LOD it is drawn at. No
// per-pixel jitter anywhere on this path: there is nothing left to estimate.

// the crisp core, read at the emblem's on-screen size — an icon drawn smaller
// than its 640 texels no longer stair-steps its edges
float coreMask(vec2 uv) {
  vec2 c = clamp(uv, 0.0, 1.0);
  if (c != uv) return 0.0;
  return textureLod(u_signMask, uv, u_maskLod).r;
}

// the bloom, baked: the old 24-tap spiral's EXPECTED kernel, applied once
float bakedBloom(vec2 uv0) {
  vec2 b = textureLod(u_bloomTex, (uv0 + u_bloomMap.x) * u_bloomMap.z, 0.0).rg;
  float t = u_bloomMap.y > 0.0 ? clamp(u_dissolve / u_bloomMap.y, 0.0, 1.0) : 1.0;
  return mix(b.y, b.x, t);
}

// the polar texture with a hand-made bilinear, for devices that can render
// RGBA32UI (core WebGL2) but not RGBA16F: θ wraps, s clamps
vec4 polarManual(float u, float v) {
  float x = u * u_polarDims.x - 0.5;
  float y = clamp(v * u_polarDims.y - 0.5, 0.0, u_polarDims.y - 1.0);
  float x0 = floor(x);
  float y0 = floor(y);
  vec2 f = vec2(x - x0, y - y0);
  int xa = int(mod(x0, u_polarDims.x));
  int xb = int(mod(x0 + 1.0, u_polarDims.x));
  int ya = int(y0);
  int yb = int(min(y0 + 1.0, u_polarDims.y - 1.0));
  vec4 a = uintBitsToFloat(texelFetch(u_polarBits, ivec2(xa, ya), 0));
  vec4 b = uintBitsToFloat(texelFetch(u_polarBits, ivec2(xb, ya), 0));
  vec4 c = uintBitsToFloat(texelFetch(u_polarBits, ivec2(xa, yb), 0));
  vec4 d = uintBitsToFloat(texelFetch(u_polarBits, ivec2(xb, yb), 0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Nₙ·k^{n+1} at radius rr along u = θ/2π + ½: beyond the mask's support the
// moments stop growing, so the far tail is exact rather than clipped
vec4 polarN(float u, float rr) {
  float s = min(rr, u_sLast);
  // texel j's centre is s = (j + ½)·Δs, and Δs = sLast/(Ns − ½)
  float v = s / u_sLast * (u_polarDims.y - 0.5) / u_polarDims.y;
  vec4 n = u_polarManual > 0.5 ? polarManual(u, v) : textureLod(u_polar, vec2(u, v), 0.0);
  float k = s / max(rr, 1e-9);
  float k2 = k * k;
  return n * vec4(k, k2, k2 * k, k2 * k2);
}

float polarRays(float u, float rr) {
  return max(dot(u_kc, polarN(u, rr)), 0.0);
}

// the matched kernel: Σ cₙ·Nₙ at a·r, plus the old march's LAST sample, which
// landed behind the centre on the emblem's solid disc — an isotropic glow floor
// the look was signed off with. Rainbow = today's per-channel radial scale,
// which is exactly a per-channel radius.
vec3 exactRays(vec2 uv0, float caS) {
  vec2 d = uv0 - u_lightC;
  float rd = length(d);
  // atan(0, 0) is undefined in GLSL ES, and a centred cursor puts c on a pixel
  float th = rd < 1e-7 ? 0.0 : atan(d.y, d.x);
  float u = th * 0.15915494309 + 0.5;
  float ra = rd * u_kA;
  vec3 rays = caS > 0.0
    ? vec3(polarRays(u, ra * (1.0 + caS)), polarRays(u, ra), polarRays(u, ra * (1.0 - caS)))
    : vec3(polarRays(u, ra));
  // the old march's last sample sat UNIFORMLY in [¼, ¾] of a step behind c:
  // the mean over that band, from two prefix reads (N₀(s) = mean over [0, s])
  float b0 = rd * (0.25 / 28.0);
  float b1 = rd * (0.75 / 28.0);
  float behind = (b1 * polarN(u + 0.5, b1).x - b0 * polarN(u + 0.5, b0).x) / max(b1 - b0, 1e-9);
  return rays + u_kWb * behind;
}

// probe-only: the same kernel with the TRUE exponential as a dense un-jittered
// march, so one comparison measures the polar texture and the cubic fit at once
float refMask(vec2 uv) {
  vec2 c = clamp(uv, 0.0, 1.0);
  if (c != uv) return 0.0;
  // the same band-limit the polar pass applies, so the comparison is like for like
  vec4 t = textureLod(u_signMask, uv, u_maskLod);
  return mix(t.b, t.r, u_rayEdge);
}
vec3 refRays(vec2 uv0) {
  vec2 d = uv0 - u_lightC;
  float acc = 0.0;
  for (int i = 0; i < 2048; i++) {
    float t = (float(i) + 0.5) / 2048.0;
    acc += refMask(u_lightC + d * (u_kA * t)) * u_kA * u_kRef.y * exp(-u_kRef.x * (1.0 - u_kA * t));
  }
  acc /= 2048.0;
  float back = 0.0;
  for (int i = 0; i < 64; i++) back += refMask(u_lightC - d * ((0.25 + 0.5 * (float(i) + 0.5) / 64.0) / 28.0));
  return vec3(acc + u_kWb * back / 64.0);
}

// living haze: visible scattered light = light × air density. ONE tiling FBM
// read twice at incommensurate scales drifting ~130° apart, one domain warp —
// the river's recipe (map rounds 11/14): no tiling, no conveyor belt, nothing
// trackable. Cartesian on purpose: round 3's onion rings came from polar noise.
// The cursor's wind pushes the air near it — disturbed dust, never following.
float hazeDensity(vec2 p, vec2 q) {
  float sc = max(u_hazeScale, 8.0);
  float t = u_time * u_hazeDrift;
  float ql = length(q);
  float pd = clamp(ql / 380.0, 0.0, 1.0);
  vec2 wind = (q / max(ql, 1e-3)) * pd * u_hazeWind * 40.0 * exp(-length(p - q) / 320.0);
  vec2 pw = p - wind;
  float lod = max(0.0, log2(256.0 / (sc * u_scale)));
  vec2 uvB = (mat2(0.8, 0.6, -0.6, 0.8) * pw) / (sc * 1.618) + t * vec2(-0.0047, 0.0031);
  float nB = textureLod(u_hazeTex, uvB, max(0.0, lod - 0.694)).r;
  vec2 uvA = pw / sc + t * vec2(0.0061, 0.0019) + (nB - 0.5) * 0.35;
  float nA = textureLod(u_hazeTex, uvA, lod).r;
  return max(0.0, 1.0 + u_haze * 2.0 * (nA * 0.62 + nB * 0.38 - 0.5));
}

// «Прорезь»/«Сияние»: the logo as light through a cross-shaped slit. At
// dissolve 0: crisp readable emblem core + bloom halo + radial god-rays
// bursting out through the slits toward the viewer (Z-throw). At dissolve 1
// the crisp paths vanish and the strokes elongate into soft zoom-blur light
// trails with a blown bright center (the wish-image register). Cursor shifts
// the light behind the cloth (parallax + lean), rainbow fringing on ray edges.
// hoverDir/hoverAmt gently pull + brighten the light toward a hovered link.
// jit = per-pixel dither seed: the god-ray march and the bloom spiral MUST be
// jittered per pixel — their fixed offsets otherwise deposit visible ghost
// copies of the mask edges (the "ladder" artifact).
vec3 slitLight(vec2 p, vec2 q, float r, vec2 hoverDir, float hoverAmt, float jit) {
  float S = max(u_signSize, 1.0);
  // slow rotation: the mask is sampled in rotated space — rotate p AND the
  // parallax vector (below), never q/lean, so the pattern turns rigidly while
  // the cursor still displaces the light along the true screen direction
  float cR = cos(u_signRot);
  float sR = sin(u_signRot);
  mat2 R = mat2(cR, sR, -sR, cR);
  vec2 uv0 = 0.5 + (R * p) / S;

  // the light "behind the cloth" shifts with the cursor (seam-free vector
  // form — no atan2) and leans toward a hovered link
  vec2 par = (q * 0.06 + hoverDir * 26.0) * u_parallax;
  vec2 lightUv = 0.5 - (R * par) / S;

  float caS = u_ca * 3.5;
  float core;
  float bloom;
  vec3 rays;
  if (u_raysMode > 0.5) {
    // round 33: computed, not estimated — see the exact-light section above
    core = coreMask(uv0) * (1.0 - u_dissolve);
    bloom = bakedBloom(uv0);
    rays = u_raysMode > 2.5 ? refRays(uv0) : exactRays(uv0, caS);
    if (u_haze > 0.001) rays *= hazeDensity(p, q);
  } else {
  // ---- the old estimator, VERBATIM — `?rays=march` is the A/B baseline -----
  // crisp emblem core — fades out entirely as the logo dissolves into light
  core = signMask(uv0) * (1.0 - u_dissolve);

  // bloom halo: spiral taps of the mask -> a glow that keeps the shape;
  // per-pixel spiral rotation turns discrete taps into smooth noise.
  // ROUND 31.4: 24 taps, was 12 — the jitter's residue is 1/√taps, and below
  // display resolution (the frame governor's rungs) it read as sand in the rays
  float bloomR = 0.085 * (1.0 + 1.2 * u_dissolve); // dissolved = wider, softer
  bloom = 0.0;
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float rad = (fi + 0.5) / 24.0 * bloomR;
    float ang = fi * 2.399963 + jit * 6.2831;
    bloom += signMaskSoft(uv0 + vec2(cos(ang), sin(ang)) * rad) * (1.0 - rad / (bloomR * 1.06));
  }
  bloom /= 12.0;

  // god-rays: march from the fragment back toward the light center,
  // accumulating the mask — light streaming out through the slits.
  // per-channel chromatic scale about the center = prism fringing.
  int N = int(clamp(u_raySteps, 8.0, 32.0));
  vec2 duv = (uv0 - lightUv) / float(N);
  vec3 acc = vec3(0.0);
  float illum = 1.0;
  float decay = mix(0.93, 0.968, u_dissolve); // dissolved trails reach further
  // dithered march start: banding -> hidden noise. ROUND 31.4: across HALF a
  // step, centred, not a whole one — the full span was the other half of the
  // sand; half still hides the ladders (checked at the lowest rung, 0.6 / 20)
  vec2 s = uv0 - duv * (0.25 + 0.5 * jit);
  for (int i = 0; i < 32; i++) {
    if (i >= N) break;
    s -= duv;
    vec2 rel = s - lightUv;
    acc += vec3(
      signMaskRay(lightUv + rel * (1.0 + caS)),
      signMaskRay(s),
      signMaskRay(lightUv + rel * (1.0 - caS))
    ) * illum;
    illum *= decay;
  }
  rays = acc / float(N);
  }

  // living light: gentle breathing, no rave flicker. Both paths compute it here,
  // in the shader: `hash21` is chaotic, so a CPU copy in doubles and this one in
  // fp32 land on DIFFERENT shimmer values — round 33 measured a 1.8 % brightness
  // gap between the exact light and the march from exactly that
  float life = 1.0 + u_breathe * 0.12 * sin(u_time * 0.6)
    + u_shimmer * 0.12 * (vnoise(vec2(u_time * 0.5, 7.3)) - 0.5);
  life *= 1.0 + 0.4 * hoverAmt;

  // crisp register: fade the rays near the very center so the emblem's own
  // strokes read there. Dissolved register WANTS the blown featureless core.
  float rayGate = mix(smoothstep(0.02, 0.17, length(uv0 - vec2(0.5))), 1.0, u_dissolve);
  rays *= rayGate;
  // dissolved trails melt toward the screen edges instead of staying constant
  rays *= mix(1.0, exp(-r / (u_falloffL * 1.15)), u_dissolve);

  // rays toward the cursor sharpen/brighten (scheme.jpg), far side calms —
  // vector dot, continuous everywhere
  float pd = clamp(length(q) / 380.0, 0.0, 1.0);
  float lean = 1.0 + 0.7 * clamp(dot(normalize(p + 1e-4), normalize(q + 1e-4)), -1.0, 1.0) * pd;

  // crisp emblem core (readable logo) carries the shape; bloom + rays are light
  vec3 col = vec3(core) * u_coreIntensity * 1.8
    + vec3(bloom) * u_bloom * 1.9
    + rays * u_godrays * 2.2 * lean;
  return col * life;
}

// ROUND 31: THE PROCEDURAL FIELD IS A FUNCTION SO IT CAN BE SKIPPED. Every
// shipped light runs `slitMix: 1`, where `col = mix(field, slit, 1)` throws the
// field away — yet it was computed for every pixel: ~10 fbm evaluations (dust
// layers × octaves, turbulence, haze), four beams with fiber combs, motes, ten
// secondary lobes and the ghost chain. Pure ALU, which is exactly what an Intel
// iGPU is short of. `main` now calls this only when the result can reach the
// screen: a crossfade (`slitMix` < 1, variant switches) or no mask yet (the
// cross-glyph fallback reads `crossGlyph`/`core` from here). Output is
// unchanged by construction — the skipped branch was multiplied by zero.
struct Field {
  vec3 col;
  vec3 crossGlyph;
  float core;
};

Field proceduralField(vec2 p, vec2 q, float r, float th) {
  int hm = int(u_hoverMode + 0.5);
  int cm = int(u_compositeMode + 0.5);

  // pointer as wind: direction + strength (0 at center, 1 near edges)
  float pd = clamp(length(q) / 380.0, 0.0, 1.0);
  float pa = atan(q.y, q.x);
  vec2 qn = q / max(length(q), 1e-3);

  // ---- dust: layered fbm sampled in a slowly rotating polar domain ----
  // Wind pushes the wisps downwind of the cursor (no vortex swirl).
  vec2 dp = p - q;
  float pinf = exp(-length(dp) / 220.0);
  vec2 swirl = -qn * pinf * 46.0 * pd * u_parallax;

  float dust = 0.0;
  for (int i = 0; i < 3; i++) {
    if (float(i) >= u_layers) break;
    float fi = float(i);
    float depth = 0.55 + fi * 0.45;
    // pure per-layer translation: the old 1/r amplification radially squeezed
    // the noise domain whenever the pointer left center, compressing the
    // wisps into concentric "onion shell" arcs
    vec2 dc = p + q * (0.05 * u_parallax * depth) * 5.0 + swirl;
    float rr = length(dc) + 1e-3;
    float aa = atan(dc.y, dc.x) - u_rotSpeed * u_time * (1.2 + 0.6 * fi);
    // radial coord varies slowly, angular quickly -> radially elongated wisps.
    // jitter the radial lattice by TWO angular noise terms: the slow one bends
    // would-be rings, the fast strong one breaks their local coherence — one
    // smooth term alone only bent the "sonar rings", every fbm octave still
    // lined its rows up into visible concentric arcs
    float rJit = vnoise(vec2(aa * 1.7 + fi * 9.0, 3.7)) * 0.55
      + vnoise(vec2(aa * 6.1 + fi * 9.0, 13.7)) * 1.15;
    // the angular frequency must NOT grow with rr: `aa*(3+rr*0.018)` made the
    // y-lattice get crossed periodically along the radius (period ≈
    // 1/(|aa|·0.018) px) — spiral arc bands no radial jitter could hide
    vec2 nUv = vec2(
      rr * 0.008 * u_dustScale - u_time * (0.025 + 0.012 * fi) + rJit,
      aa * 6.0 * u_dustScale + fi * 17.0
    );
    dust += (fbm(nUv) - 0.34) / (1.0 + fi);
  }
  dust = max(dust, 0.0) * u_dustAmount;
  // dusty register: the air is the protagonist
  dust *= 1.0 + 1.7 * u_modeMix;

  // ---- motes: hashed sparse specks in beam-aligned (r, arc) cells -----
  float thD = th - u_rotSpeed * u_time * 0.6;
  float motes = 0.0;
  {
    // stream mode: hover accelerates motes inward within the hovered beam
    float streamBoost = 0.0;
    if (hm == 4) {
      for (int j = 0; j < 4; j++) {
        streamBoost += u_beamHover[j] * lobe(th, u_beamAngles[j], u_primaryK * 0.4);
      }
      streamBoost = min(streamBoost, 1.0);
    }
    // Cartesian cell grid (immune to ring/spiral artifacts); each cell may
    // hold one mote whose streak is oriented along the true radial
    // direction and drifts along it, fading at cell edges (respawn).
    float cellS = 70.0 / max(u_dustScale, 0.25);
    vec2 g = p / cellS;
    vec2 cid = floor(g);
    vec2 f = fract(g);
    float h = hash21(cid);
    vec2 cellCenter = (cid + 0.5) * cellS;
    vec2 rd = normalize(cellCenter + vec2(1e-3));
    float dirSign = (hm == 4 && streamBoost > 0.01) ? -1.0 : 1.0;
    // wind: motes downwind of the cursor blast outward from the origin
    float windAlign = max(dot(rd, qn), 0.0);
    float wind = windAlign * pd * u_parallax;
    float speed = (0.05 + 0.06 * hash21(cid + 11.7)) * (1.0 + 6.0 * streamBoost + 5.0 * wind);
    float phase = fract(hash21(cid + 3.1) + u_time * speed * dirSign) - 0.5;
    vec2 mp = vec2(0.2) + 0.6 * vec2(hash21(cid + 7.3), hash21(cid + 5.9));
    vec2 mposFrac = mp + rd * phase * 1.1;
    vec2 deltaPx = (f - mposFrac) * cellS;
    float dr = dot(deltaPx, rd);
    float dtv = dot(deltaPx, vec2(-rd.y, rd.x));
    // per-mote size variance (identical stamped "rice seeds" read as fake);
    // wind stretches the streak but the cap keeps tails inside the cell
    float sigmaR = cellS * (0.15 + 0.10 * hash21(cid + 9.4))
      * (1.0 + 1.2 * streamBoost + 1.4 * wind);
    sigmaR = min(sigmaR, cellS * 0.28);
    float sigmaT = cellS * (0.038 + 0.035 * hash21(cid + 13.2));
    float m = exp(-(dr * dr / (sigmaR * sigmaR) + dtv * dtv / (sigmaT * sigmaT)));
    // border envelope: whatever the stretch, a streak is exactly zero at the
    // cell edge — the hard rectangular cuts came from clipped tails
    m *= smoothstep(0.5, 0.4, max(abs(f.x - 0.5), abs(f.y - 0.5)));
    // fade out as the mote slides past its cell so it never pops
    vec2 edge = abs(mposFrac - 0.5);
    float alive = (1.0 - smoothstep(0.38, 0.58, max(edge.x, edge.y)));
    motes = m * smoothstep(0.55, 0.72, h) * alive
      * (0.6 + 0.4 * sin(u_time * (1.0 + h * 3.0) + h * 40.0))
      * (1.0 + 1.8 * wind);
  }
  motes *= u_moteAmount * (1.0 + 1.5 * u_modeMix);

  // ---- primary nav beams (camera-tilt optics + fiber bundles) ---------
  float radial = exp(-r / u_falloffL);
  vec3 beams = vec3(0.0);
  float beamMaskW = 0.0; // wide mask, gates dust/motes into the light
  float hoverTurbGate = 0.0;
  float flood = 0.0; // eclipse hover: channel floods with light
  // rainbow dispersion belongs to the blue-sky register only
  float caM = u_ca * (1.0 - u_modeMix);
  float disp = clamp(u_ca * 55.0, 0.0, 1.0) * (1.0 - u_modeMix);

  for (int i = 0; i < 4; i++) {
    float a = u_beamAngles[i];
    // beams lean toward the cursor — light noticing your hand
    float dAng = atan(sin(pa - a), cos(pa - a));
    a += clamp(dAng, -1.0, 1.0) * 0.1 * pd * u_parallax;
    float hov = u_beamHover[i];

    // camera tilt: beams facing the cursor contract into thin hard rods,
    // the far side opens into wide soft fans (scheme.jpg physics)
    float toward = max(cos(pa - a), 0.0);
    float away = max(-cos(pa - a), 0.0);
    float warp = u_angleWarp * pd;
    float k = u_primaryK * (1.0 + 1.1 * warp * toward);
    k /= 1.0 + 0.55 * warp * away;
    // dusty beams contract into defined cones cutting the darkness
    k *= 1.0 + 0.45 * u_modeMix;
    if (hm == 1) k = mix(k, k * 0.22, hov); // widen: the wedge opens
    k *= 1.0 + u_breathe * 0.22 * sin(u_time * 0.45 + float(i) * 1.7);

    float lr = lobe(th, a - caM, k);
    float lg = lobe(th, a, k);
    float lb = lobe(th, a + caM, k);

    float boost = 1.0;
    if (hm == 0 || hm == 4) boost += 0.75 * hov;
    if (hm == 1) boost += 0.35 * hov;
    if (hm == 3) boost += 0.25 * hov;

    // toward-beams burn brighter and harder, the far side calms down
    boost *= 1.0 + (0.55 + 0.75 * u_angleWarp) * toward * toward * pd * u_parallax;
    boost *= 1.0 - min(0.25 + 0.28 * u_angleWarp, 0.62) * away * pd;

    // shimmer: slow independent life per beam
    float flick = 1.0 + u_shimmer * (vnoise(vec2(u_time * 0.55 + float(i) * 13.7, 4.2)) - 0.5) * 1.5;

    // fiber bundles: drifting, dying, unequal sub-rays (see fiberComb)
    float dTh = atan(sin(th - a), cos(th - a));
    vec3 bands = vec3(1.0);
    if (u_refraction > 0.003 && lr + lg + lb > 0.004) {
      vec3 fib = fiberComb(dTh, r, u_time, float(i) * 17.0, disp);
      bands = mix(vec3(1.0), vec3(0.5) + fib * 1.25, u_refraction);
    }

    // broad soft halo; the away side melts further into its halo
    float halo = lobe(th, a, max(k * 0.10, 2.5)) * (0.3 + 0.5 * warp * away);

    // tilt also stretches the toward-rod, shortens the far fans
    float lenWarp = 1.0 + 0.35 * warp * toward - 0.18 * warp * away;
    float radialB = exp(-r / (u_falloffL * lenWarp));

    beams += (vec3(lr, lg, lb) * bands + vec3(halo)) * boost * flick * radialB;
    beamMaskW += lobe(th, a, u_primaryK * 0.3);
    hoverTurbGate += hov * lg;
    if (hm == 2) flood += hov * lobe(th, a, u_primaryK * 0.5);
  }
  beams *= u_primaryIntensity;
  beamMaskW = min(beamMaskW, 1.0);

  // hover turbulence: extra agitation gated to the hovered beam only
  float turb = 1.0 + 2.2 * hoverTurbGate * fbm(p * 0.02 + u_time * vec2(0.35, -0.28));

  // ---- secondary rotating beams (the slow clockwise drift) ------------
  float sec = 0.0;
  for (int i = 0; i < 10; i++) {
    if (float(i) >= u_secCount) break;
    float a = float(i) * 2.399963 + u_rotSpeed * u_time;
    sec += lobe(th, a, u_secK);
  }
  sec *= exp(-r / (u_falloffL * 1.2)) * u_secIntensity;

  // ---- core glow + cross glyph ----------------------------------------
  float coreBoost = 1.0 + 0.15 * exp(-length(q) / 120.0); // pointer near center
  float core = exp(-r * r / (2.0 * u_coreRadius * u_coreRadius)) * u_coreIntensity * coreBoost;

  vec3 crossGlyph = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float a = 1.5707963 * float(i);
    float armLen = u_crossSize;
    if (hm == 3) {
      // elongate the arm nearest a hovered link, with a chromatic streak
      float hovArm = 0.0;
      for (int j = 0; j < 4; j++) {
        if (cos(a - u_beamAngles[j]) > 0.7) hovArm = max(hovArm, u_beamHover[j]);
      }
      armLen *= 1.0 + 2.5 * hovArm;
    }
    // the arm facing the cursor reaches out toward it and burns brighter
    float toward = max(cos(pa - a), 0.0);
    armLen *= 1.0 + 1.4 * toward * pd * u_parallax;
    float armBoost = 1.0 + 1.2 * toward * toward * pd * u_parallax;
    float fall = exp(-r / armLen);
    crossGlyph += vec3(
      lobe(th, a - caM * 2.0, 600.0),
      lobe(th, a, 600.0),
      lobe(th, a + caM * 2.0, 600.0)
    ) * fall * armBoost;
    // fainter diagonal arms, slowly swinging
    float ad = a + 0.7853982 + sin(u_time * 0.1) * 0.22;
    crossGlyph += vec3(lobe(th, ad, 900.0)) * exp(-r / (armLen * 0.6)) * 0.4;
  }
  crossGlyph *= u_crossIntensity;

  // ---- haze -------------------------------------------------------------
  float hazeN = 0.8 + 0.4 * fbm(p * 0.004 + u_time * 0.02);
  float haze = u_hazeBase * exp(-r / (u_falloffL * 1.6)) * hazeN;

  // ---- composite (procedural field) -------------------------------------
  vec3 field;
  if (cm == 1) {
    // eclipse: bright haze, beams carved as dark channels; hover floods with light
    float channel = 0.0;
    for (int i = 0; i < 4; i++) {
      channel += lobe(th, u_beamAngles[i], u_primaryK * 0.4);
    }
    channel = min(channel, 1.0);
    field = vec3(haze * (1.0 - u_channelDark * channel) * (0.9 + 0.25 * dust));
    field += vec3(flood) * radial * 1.25;
    field += crossGlyph * 0.6 + vec3(core * 0.7);
  } else {
    // dusty mode confines the air strictly inside the cones: the beams
    // highlight dust, everything outside stays black (dust perfect ref)
    float inBeam = mix(1.0, min(beamMaskW * 1.6, 1.0), u_modeMix * 0.9);
    field = beams * (0.72 + 0.5 * dust * turb);
    field += vec3(sec * (0.85 + 0.35 * dust)) * inBeam;
    field += crossGlyph + vec3(core);
    field += vec3(haze * 0.35 * inBeam);
    field += vec3(motes * min(beamMaskW + sec * 2.2, 1.0) * inBeam * exp(-r / (u_falloffL * 1.1)));

    // hover: the hovered link's whole zone blazes far harder than the rest
    float zone = 0.0;
    for (int j = 0; j < 4; j++) {
      zone += u_beamHover[j] * pow(max(cos(th - u_linkAngles[j]), 0.0), 5.0);
    }
    // tight falloff: the blaze lives near the center and breathes toward the
    // link without swallowing the label itself
    field += vec3(1.06, 1.0, 0.9) * zone * exp(-r / (u_falloffL * 0.55)) * 0.95;
  }

  // ---- hovered links occlude the light: clean dark shadow cone ----------
  // (the field is radial from one point, so occlusion is analytic). The cone
  // starts AT the label's outer edge (r ≥ linkDist) — anchoring it earlier is
  // what made the shadow "start from the middle of the link"; no noise contour.
  if (u_shadow > 0.003) {
    float shadowMask = 0.0;
    for (int j = 0; j < 4; j++) {
      float hov = u_beamHover[j];
      float ld = u_linkDist[j];
      if (hov < 0.01 || ld < 1.0) continue;
      float dA = atan(sin(th - u_linkAngles[j]), cos(th - u_linkAngles[j]));
      // gentle penumbra widening with distance behind the label
      float pw = u_linkHalfAng[j] * (1.0 + 0.5 * max(r - ld, 0.0) / ld);
      float occl = 1.0 - smoothstep(pw * 0.6, pw, abs(dA)); // soft cone edges
      float behind = smoothstep(ld, ld * 1.2, r);           // fades in past the label
      shadowMask = max(shadowMask, occl * behind * hov);
    }
    field *= 1.0 - u_shadow * shadowMask * 0.8;
  }

  // ---- lens-flare ghosts on the camera axis (holographic register) -----
  float gAmt = u_ghosting * (1.0 - u_modeMix) * smoothstep(0.3, 0.8, pd);
  // ghosts only sometimes appear — a slow gate, the lens catching the angle
  gAmt *= smoothstep(0.35, 0.75, vnoise(vec2(u_time * 0.06, 23.7)));
  if (gAmt > 0.004) {
    for (int j = 0; j < 4; j++) {
      float fj = float(j);
      vec2 gp = q * (-0.4 + 0.55 * fj);
      float gr = length(p - gp);
      float rad = 30.0 + 26.0 * fj;
      // soft disc with a faint bright rim
      float disc = exp(-pow(gr / rad, 2.4));
      disc += exp(-abs(gr - rad * 0.8) / (rad * 0.14)) * 0.35;
      vec3 gTint = 0.65 + 0.35 * cos(vec3(0.0, 2.1, 4.2) + fj * 1.9);
      field += gTint * disc * 0.05 * gAmt;
    }
  }

  return Field(field, crossGlyph, core);
}

void main() {
  // top-left-origin pixel space (matches DOM measurements + WGSL)
  vec2 fragPx = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  // reference-px space around the convergence point
  vec2 p = (fragPx - u_center) / max(u_scale, 1e-4);
  float r = length(p) + 1e-4;
  float th = atan(p.y, p.x);

  // pointer offset from convergence, reference px
  vec2 q = (u_pointer - u_center) / max(u_scale, 1e-4);

  // only when the field can reach the screen — see proceduralField()
  Field f = Field(vec3(0.0), vec3(0.0), 0.0);
  if (u_slitMix < 0.999 || u_hasMask < 0.5) f = proceduralField(p, q, r, th);
  vec3 field = f.col;

  // ---- «Прорезь»: the logo as light, blended over the field ------------
  vec3 col = field;
  if (u_slitMix > 0.001) {
    // ROUND 11: these two sums used to be a `for (j < 4)` loop right here. They
    // have no per-pixel term, so they are now reduced on the CPU over ALL nav
    // links — byte-identical, and it is what let the nav go to five without
    // touching the vec4 link slots (see rayFieldTypes.ts).
    // never blank: fall back to the procedural cross glow if the mask is absent
    vec3 slit = (u_hasMask > 0.5)
      ? slitLight(p, q, r, u_hoverDir, min(u_hoverAmt, 1.0), fract(hash21(fragPx) + u_jitOffset))
      : (f.crossGlyph + vec3(f.core));
    col = mix(field, slit, u_slitMix);
  }

  // dusty register: hot yellowish core falling to deep amber (dust perfect ref)
  vec3 dusty = mix(vec3(1.08, 0.94, 0.62), vec3(1.0, 0.62, 0.27), clamp(r / 620.0, 0.0, 1.0));
  col = mix(col, col * dusty, u_modeMix);

  // slightly cool the far field, warm the core — subtle temperature drift
  vec3 tint = mix(vec3(1.0, 0.99, 0.955), vec3(0.9, 0.97, 1.08), clamp(r / 900.0, 0.0, 1.0));
  col *= tint;

  // hover gallery-dark scene: the light surges (modeMix owns the warmth now);
  // tempered from 1.25 — the old surge whited out the shadow wedge
  col *= 1.0 + 0.75 * u_sceneDim;
  col = mix(col, col * vec3(1.14, 0.98, 0.80), u_sceneDim * 0.2);

  // dim a touch over photos so the showreel reads through
  col *= mix(1.0, 0.72, u_bgMix);

  // colour of the light itself. LAST word before the tone curve, so it is the
  // dial that wins over the register tints above — and BEFORE the shoulder, so
  // a hot core still blooms toward white while the falloff keeps the hue. Move
  // it after the shoulder and it flattens into a gel laid over a white lamp.
  col *= vec3(u_lightR, u_lightG, u_lightB);

  // filmic shoulder — soft highlights instead of clipped white
  col = 1.0 - exp(-col * 1.6);

  if (u_raysMode > 0.5) {
    // round 33: monochrome TPDF from an integer hash — no 50 × 100-px tile — and
    // GATED, so a pixel with no light stays exactly black: the scroll seam swaps
    // to the main screen on a frame that must equal its flat field bit for bit
    uvec2 ip = uvec2(fragPx);
    uint h1 = pcg(ip.x + pcg(ip.y + pcg(uint(u_frame))));
    uint h2 = pcg(h1 ^ 2654435769u);
    float g1 = float(h1 >> 8u) * (1.0 / 16777216.0);
    float g2 = float(h2 >> 8u) * (1.0 / 16777216.0);
    float gate = clamp(max(col.r, max(col.g, col.b)) * 255.0, 0.0, 1.0);
    col += (g1 - 0.5) * u_grain;
    col += (g1 + g2 - 1.0) * (u_ditherAmp / 255.0) * gate;
  } else {
    // grain + dither (kills banding on the soft gradients)
    float g = hash21(fragPx + fract(u_time) * vec2(113.1, 271.7));
    col += (g - 0.5) * u_grain;
    col += (g - 0.5) / 255.0 * u_ditherAmp;
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
