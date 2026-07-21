#version 300 es
precision highp float;

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

out vec4 fragColor;

// ---- noise ------------------------------------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
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
  return texture(u_signMask, uv).r;
}

// round-blurred emblem channel — bloom taps sample this: sparse jittered taps
// of the hard-edged crisp channel have huge per-pixel variance (stipple noise)
float signMaskSoft(vec2 uv) {
  vec2 c = clamp(uv, 0.0, 1.0);
  if (c != uv) return 0.0;
  return texture(u_signMask, uv).g;
}

// RADIALLY-smeared emblem channel — the god-ray march samples this: the march
// integrates along the ray, so only that direction needs smoothing; a round
// blur here would also melt the razor-sharp tangential trail edges (the look)
float signMaskRay(vec2 uv) {
  vec2 c = clamp(uv, 0.0, 1.0);
  if (c != uv) return 0.0;
  return texture(u_signMask, uv).b;
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
  vec2 uv0 = 0.5 + p / S;

  // the light "behind the cloth" shifts with the cursor (seam-free vector
  // form — no atan2) and leans toward a hovered link
  vec2 par = (q * 0.06 + hoverDir * 26.0) * u_parallax;
  vec2 lightUv = 0.5 - par / S;

  // crisp emblem core — fades out entirely as the logo dissolves into light
  float core = signMask(uv0) * (1.0 - u_dissolve);

  // bloom halo: spiral taps of the mask -> a glow that keeps the shape;
  // per-pixel spiral rotation turns 12 discrete taps into smooth noise
  float bloomR = 0.085 * (1.0 + 1.2 * u_dissolve); // dissolved = wider, softer
  float bloom = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float rad = (fi + 0.5) / 12.0 * bloomR;
    float ang = fi * 2.399963 + jit * 6.2831;
    bloom += signMaskSoft(uv0 + vec2(cos(ang), sin(ang)) * rad) * (1.0 - rad / (bloomR * 1.06));
  }
  bloom /= 6.0;

  // god-rays: march from the fragment back toward the light center,
  // accumulating the mask — light streaming out through the slits.
  // per-channel chromatic scale about the center = prism fringing.
  int N = int(clamp(u_layers * 8.0 + u_octaves * 4.0, 12.0, 32.0));
  float caS = u_ca * 3.5;
  vec2 duv = (uv0 - lightUv) / float(N);
  vec3 acc = vec3(0.0);
  float illum = 1.0;
  float decay = mix(0.93, 0.968, u_dissolve); // dissolved trails reach further
  vec2 s = uv0 - duv * jit; // dithered march start: banding -> hidden noise
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
  // crisp register: fade the rays near the very center so the emblem's own
  // strokes read there. Dissolved register WANTS the blown featureless core.
  float rayGate = mix(smoothstep(0.02, 0.17, length(uv0 - vec2(0.5))), 1.0, u_dissolve);
  vec3 rays = acc / float(N) * rayGate;
  // dissolved trails melt toward the screen edges instead of staying constant
  rays *= mix(1.0, exp(-r / (u_falloffL * 1.15)), u_dissolve);

  // rays toward the cursor sharpen/brighten (scheme.jpg), far side calms —
  // vector dot, continuous everywhere
  float pd = clamp(length(q) / 380.0, 0.0, 1.0);
  float lean = 1.0 + 0.7 * clamp(dot(normalize(p + 1e-4), normalize(q + 1e-4)), -1.0, 1.0) * pd;

  // living light: gentle breathing, no rave flicker
  float life = 1.0 + u_breathe * 0.12 * sin(u_time * 0.6)
    + u_shimmer * 0.12 * (vnoise(vec2(u_time * 0.5, 7.3)) - 0.5);
  life *= 1.0 + 0.4 * hoverAmt;

  // crisp emblem core (readable logo) carries the shape; bloom + rays are light
  vec3 col = vec3(core) * u_coreIntensity * 1.8
    + vec3(bloom) * u_bloom * 1.9
    + rays * u_godrays * 2.2 * lean;
  return col * life;
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

  // ---- «Прорезь»: the logo as light, blended over the field ------------
  vec3 col = field;
  if (u_slitMix > 0.001) {
    vec2 hoverDir = vec2(0.0);
    float hoverAmt = 0.0;
    for (int j = 0; j < 4; j++) {
      hoverAmt += u_beamHover[j];
      hoverDir += u_beamHover[j] * vec2(cos(u_linkAngles[j]), sin(u_linkAngles[j]));
    }
    // never blank: fall back to the procedural cross glow if the mask is absent
    vec3 slit = (u_hasMask > 0.5)
      ? slitLight(p, q, r, hoverDir, min(hoverAmt, 1.0), hash21(fragPx))
      : (crossGlyph + vec3(core));
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

  // filmic shoulder — soft highlights instead of clipped white
  col = 1.0 - exp(-col * 1.6);

  // grain + dither (kills banding on the soft gradients)
  float g = hash21(fragPx + fract(u_time) * vec2(113.1, 271.7));
  col += (g - 0.5) * u_grain;
  col += (g - 0.5) / 255.0;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
