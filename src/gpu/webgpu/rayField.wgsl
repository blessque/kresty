// WGSL mirror of rayField.frag.glsl — keep structure 1:1 with the GLSL file.
// Constants live in TS (variants); this file only implements the math.

struct U {
  resolution: vec2f,
  center: vec2f,
  pointer: vec2f,
  time: f32,
  scale: f32,
  beamAngles: vec4f,
  linkAngles: vec4f,
  linkDist: vec4f,    // link center distances from convergence, reference px
  linkHalfAng: vec4f, // apparent angular half-width of each label, rad
  beamHover: vec4f,
  p0: vec4f, // primaryK, primaryIntensity, falloffL, coreRadius
  p1: vec4f, // coreIntensity, crossSize, crossIntensity, secCount
  p2: vec4f, // secK, secIntensity, rotSpeed, dustAmount
  p3: vec4f, // dustScale, moteAmount, grain, ca
  p4: vec4f, // hazeBase, channelDark, parallax, breathe
  p5: vec4f, // hoverMode, compositeMode, bgMix, layers
  p6: vec4f, // octaves, refraction, shimmer, sceneDim
  p7: vec4f, // fiberDrift, angleWarp, ghosting, shadow
  p8: vec4f, // modeMix, slitMix, hasMask, signSize
  p9: vec4f, // godrays, bloom, dissolve, signRot
  p10: vec4f, // lightR, lightG, lightB, (spare)
};

@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var signMaskTex: texture_2d<f32>;
@group(0) @binding(2) var signSamp: sampler;

fn hash21(pin: vec2f) -> f32 {
  var p = fract(pin * vec2f(123.34, 456.21));
  p = p + dot(p, p + 45.32);
  return fract(p.x * p.y);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let uu = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, uu.x), mix(c, d, uu.x), uu.y);
}

fn fbm(pin: vec2f) -> f32 {
  var v = 0.0;
  var amp = 0.55;
  var p = pin;
  for (var i = 0; i < 4; i++) {
    if (f32(i) >= u.p6.x) { break; }
    v = v + amp * vnoise(p);
    p = p * 2.13 + 7.7;
    amp = amp * 0.5;
  }
  return v;
}

fn lobe(th: f32, a: f32, k: f32) -> f32 {
  let c = cos(th - a);
  return select(0.0, pow(c, k), c > 0.0);
}

// Fiber bundle inside a beam: NON-periodic comb of hashed sub-rays that drift
// angularly, are born and die on individual cycles ("disco lights"), with
// unequal widths/brightness. Replaces the old sin() prismatic bands, whose
// strict periodicity produced the "ladder" artifact — real light never splits
// into equal lines. `disp` spreads RGB across each fiber's cross-section
// (prism dispersion); returns per-channel fiber luminance.
fn fiberComb(dTh: f32, r: f32, t: f32, seed: f32, disp: f32) -> vec3f {
  // slight shear so fibers are not laser-straight along their length
  let shear = (vnoise(vec2f(dTh * 26.0 + seed, r * 0.0035 + t * 0.04)) - 0.5) * 0.6;
  var acc = vec3f(0.0);
  // staggered generations (golden-ratio offsets) so births/deaths overlap;
  // each generation runs its OWN comb frequency — equal spacing would both
  // read as fake and alias into concentric moiré rings near the center
  for (var g = 0; g < 3; g++) {
    let fg = f32(g);
    let freq = 47.0 + fg * 18.0;
    // fade a generation out where its fibers shrink below ~2 device px,
    // otherwise the converging lines alias into arc-shaped moiré
    let cellPx = r * u.scale / freq;
    let vis = smoothstep(2.2, 5.5, cellPx);
    if (vis < 0.003) { continue; }
    var x = dTh * freq + shear + fg * 4.3262;
    x = x + t * u.p7.x * (0.55 + 0.37 * fg);
    let id = floor(x);
    let fx = fract(x);
    let h1 = hash21(vec2f(id, seed + fg * 31.7));
    let h2 = hash21(vec2f(id, seed + fg * 31.7 + 5.3));
    let h3 = hash21(vec2f(id, seed + fg * 31.7 + 9.1));
    // lifecycle: each fiber fades in, lives ~4-9 s, dies, gets replaced
    var life = 0.5 + 0.5 * sin(t * (0.7 + h1 * 0.9) + h1 * 6.2831);
    life = smoothstep(0.12, 0.62, life) * step(0.2, h2);
    // unequal widths, jittered positions, a few bright "soloists";
    // a fiber never goes subpixel — that aliased into concentric moiré
    let w = max(0.07 + 0.17 * h2, 1.6 / cellPx);
    let c = 0.22 + 0.56 * h3;
    let d = (fx - c) / w;
    let bright = 0.3 + 2.2 * pow(h1, 6.0);
    let dd = disp * 0.6;
    acc = acc + vec3f(
      exp(-(d - dd) * (d - dd)),
      exp(-d * d),
      exp(-(d + dd) * (d + dd))
    ) * bright * life * vis;
  }
  return acc * 0.55;
}

// emblem mask, crisp channel; 0 outside the footprint. textureSampleLevel
// avoids derivative/uniformity constraints inside the god-ray loop.
fn signMask(uv: vec2f) -> f32 {
  let c = clamp(uv, vec2f(0.0), vec2f(1.0));
  if (any(c != uv)) { return 0.0; }
  return textureSampleLevel(signMaskTex, signSamp, uv, 0.0).r;
}

// round-blurred emblem channel — bloom taps sample this: sparse jittered taps
// of the hard-edged crisp channel have huge per-pixel variance (stipple noise)
fn signMaskSoft(uv: vec2f) -> f32 {
  let c = clamp(uv, vec2f(0.0), vec2f(1.0));
  if (any(c != uv)) { return 0.0; }
  return textureSampleLevel(signMaskTex, signSamp, uv, 0.0).g;
}

// RADIALLY-smeared emblem channel — the god-ray march samples this: the march
// integrates along the ray, so only that direction needs smoothing; a round
// blur here would also melt the razor-sharp tangential trail edges (the look)
fn signMaskRay(uv: vec2f) -> f32 {
  let c = clamp(uv, vec2f(0.0), vec2f(1.0));
  if (any(c != uv)) { return 0.0; }
  return textureSampleLevel(signMaskTex, signSamp, uv, 0.0).b;
}

// «Прорезь»/«Сияние»: the logo as light through a cross-shaped slit. Mirror of
// the GLSL slitLight(). dissolve 0: crisp emblem core + bloom halo + god-rays;
// dissolve 1: crisp paths vanish, strokes elongate into soft zoom-blur light
// trails with a blown bright center. jit = per-pixel dither seed: the god-ray
// march and the bloom spiral MUST be jittered per pixel — their fixed offsets
// otherwise deposit visible ghost copies of the mask edges ("ladders").
fn slitLight(p: vec2f, q: vec2f, r: f32, hoverDir: vec2f, hoverAmt: f32, jit: f32) -> vec3f {
  let S = max(u.p8.w, 1.0);
  // slow rotation: the mask is sampled in rotated space — rotate p AND the
  // parallax vector (below), never q/lean, so the pattern turns rigidly while
  // the cursor still displaces the light along the true screen direction
  let cR = cos(u.p9.w); // signRot
  let sR = sin(u.p9.w);
  let R = mat2x2f(vec2f(cR, sR), vec2f(-sR, cR));
  let uv0 = vec2f(0.5) + (R * p) / S;
  let par = (q * 0.06 + hoverDir * 26.0) * u.p4.z; // parallax
  let lightUv = vec2f(0.5) - (R * par) / S;
  let dissolve = u.p9.z;

  // crisp emblem core — fades out entirely as the logo dissolves into light
  let core = signMask(uv0) * (1.0 - dissolve);

  // bloom halo; per-pixel spiral rotation turns 12 discrete taps into noise
  let bloomR = 0.085 * (1.0 + 1.2 * dissolve); // dissolved = wider, softer
  var bloom = 0.0;
  for (var i = 0; i < 12; i++) {
    let fi = f32(i);
    let rad = (fi + 0.5) / 12.0 * bloomR;
    let ang = fi * 2.399963 + jit * 6.2831;
    bloom = bloom + signMaskSoft(uv0 + vec2f(cos(ang), sin(ang)) * rad) * (1.0 - rad / (bloomR * 1.06));
  }
  bloom = bloom / 6.0;

  let N = i32(clamp(u.p5.w * 8.0 + u.p6.x * 4.0, 12.0, 32.0)); // layers, octaves
  let caS = u.p3.w * 3.5; // ca
  let duv = (uv0 - lightUv) / f32(N);
  var acc = vec3f(0.0);
  var illum = 1.0;
  let decay = mix(0.93, 0.968, dissolve); // dissolved trails reach further
  var s = uv0 - duv * jit; // dithered march start: banding -> hidden noise
  for (var i = 0; i < 32; i++) {
    if (i >= N) { break; }
    s = s - duv;
    let rel = s - lightUv;
    acc = acc + vec3f(
      signMaskRay(lightUv + rel * (1.0 + caS)),
      signMaskRay(s),
      signMaskRay(lightUv + rel * (1.0 - caS))
    ) * illum;
    illum = illum * decay;
  }
  // crisp register: fade the rays near the very center so the emblem's own
  // strokes read there. Dissolved register WANTS the blown featureless core.
  let rayGate = mix(smoothstep(0.02, 0.17, length(uv0 - vec2f(0.5))), 1.0, dissolve);
  var rays = acc / f32(N) * rayGate;
  // dissolved trails melt toward the screen edges instead of staying constant
  rays = rays * mix(1.0, exp(-r / (u.p0.z * 1.15)), dissolve); // falloffL

  let pd = clamp(length(q) / 380.0, 0.0, 1.0);
  let lean = 1.0 + 0.7 * clamp(dot(normalize(p + vec2f(1e-4)), normalize(q + vec2f(1e-4))), -1.0, 1.0) * pd;

  var life = 1.0 + u.p4.w * 0.12 * sin(u.time * 0.6)
    + u.p6.z * 0.12 * (vnoise(vec2f(u.time * 0.5, 7.3)) - 0.5);
  life = life * (1.0 + 0.4 * hoverAmt);

  // crisp emblem core (readable logo) carries the shape; bloom + rays are light
  let col = vec3f(core) * u.p1.x * 1.8
    + vec3f(bloom) * u.p9.y * 1.9
    + rays * u.p9.x * 2.2 * lean;
  return col * life;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let pos = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(pos * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {
  // @builtin(position) is already top-left origin
  let fragPx = fragPos.xy;
  let p = (fragPx - u.center) / max(u.scale, 1e-4);
  let r = length(p) + 1e-4;
  let th = atan2(p.y, p.x);
  let q = (u.pointer - u.center) / max(u.scale, 1e-4);

  let primaryK = u.p0.x;
  let primaryIntensity = u.p0.y;
  let falloffL = u.p0.z;
  let coreRadius = u.p0.w;
  let coreIntensity = u.p1.x;
  let crossSize = u.p1.y;
  let crossIntensity = u.p1.z;
  let secCount = u.p1.w;
  let secK = u.p2.x;
  let secIntensity = u.p2.y;
  let rotSpeed = u.p2.z;
  let dustAmount = u.p2.w;
  let dustScale = u.p3.x;
  let moteAmount = u.p3.y;
  let grain = u.p3.z;
  let ca = u.p3.w;
  let hazeBase = u.p4.x;
  let channelDark = u.p4.y;
  let parallax = u.p4.z;
  let breathe = u.p4.w;
  let hm = i32(u.p5.x + 0.5);
  let cm = i32(u.p5.y + 0.5);
  let bgMix = u.p5.z;
  let layers = u.p5.w;
  let refraction = u.p6.y;
  let shimmer = u.p6.z;
  let sceneDim = u.p6.w;
  let angleWarp = u.p7.y;
  let ghosting = u.p7.z;
  let shadow = u.p7.w;
  let modeMix = u.p8.x;
  let slitMix = u.p8.y;
  let hasMask = u.p8.z;

  // pointer as wind
  let pd = clamp(length(q) / 380.0, 0.0, 1.0);
  let pa = atan2(q.y, q.x);
  let qn = q / max(length(q), 1e-3);

  // ---- dust ----
  let dpv = p - q;
  let pinf = exp(-length(dpv) / 220.0);
  let swirl = -qn * pinf * 46.0 * pd * parallax;

  var dust = 0.0;
  for (var i = 0; i < 3; i++) {
    if (f32(i) >= layers) { break; }
    let fi = f32(i);
    let depth = 0.55 + fi * 0.45;
    // pure per-layer translation: the old 1/r amplification radially squeezed
    // the noise domain whenever the pointer left center, compressing the
    // wisps into concentric "onion shell" arcs
    let dc = p + q * (0.05 * parallax * depth) * 5.0 + swirl;
    let rr = length(dc) + 1e-3;
    let aa = atan2(dc.y, dc.x) - rotSpeed * u.time * (1.2 + 0.6 * fi);
    // TWO angular jitter terms: the slow one bends would-be rings, the fast
    // strong one breaks their local coherence (single smooth jitter only bent
    // the "sonar rings" — fbm octaves still aligned into concentric arcs)
    let rJit = vnoise(vec2f(aa * 1.7 + fi * 9.0, 3.7)) * 0.55
      + vnoise(vec2f(aa * 6.1 + fi * 9.0, 13.7)) * 1.15;
    // the angular frequency must NOT grow with rr: `aa*(3+rr*0.018)` made the
    // y-lattice get crossed periodically along the radius (period ≈
    // 1/(|aa|·0.018) px) — spiral arc bands no radial jitter could hide
    let nUv = vec2f(
      rr * 0.008 * dustScale - u.time * (0.025 + 0.012 * fi) + rJit,
      aa * 6.0 * dustScale + fi * 17.0
    );
    dust = dust + (fbm(nUv) - 0.34) / (1.0 + fi);
  }
  dust = max(dust, 0.0) * dustAmount;
  // dusty register: the air is the protagonist
  dust = dust * (1.0 + 1.7 * modeMix);

  // ---- motes ----
  let thD = th - rotSpeed * u.time * 0.6;
  var motes = 0.0;
  {
    var streamBoost = 0.0;
    if (hm == 4) {
      for (var j = 0; j < 4; j++) {
        streamBoost = streamBoost + u.beamHover[j] * lobe(th, u.beamAngles[j], primaryK * 0.4);
      }
      streamBoost = min(streamBoost, 1.0);
    }
    let cellS = 70.0 / max(dustScale, 0.25);
    let g = p / cellS;
    let cid = floor(g);
    let f = fract(g);
    let h = hash21(cid);
    let cellCenter = (cid + 0.5) * cellS;
    let rd = normalize(cellCenter + vec2f(1e-3));
    var dirSign = 1.0;
    if (hm == 4 && streamBoost > 0.01) { dirSign = -1.0; }
    let windAlign = max(dot(rd, qn), 0.0);
    let wind = windAlign * pd * parallax;
    let speed = (0.05 + 0.06 * hash21(cid + 11.7)) * (1.0 + 6.0 * streamBoost + 5.0 * wind);
    let phase = fract(hash21(cid + 3.1) + u.time * speed * dirSign) - 0.5;
    let mp = vec2f(0.2) + 0.6 * vec2f(hash21(cid + 7.3), hash21(cid + 5.9));
    let mposFrac = mp + rd * phase * 1.1;
    let deltaPx = (f - mposFrac) * cellS;
    let dr = dot(deltaPx, rd);
    let dtv = dot(deltaPx, vec2f(-rd.y, rd.x));
    // per-mote size variance (identical stamped "rice seeds" read as fake);
    // wind stretches the streak but the cap keeps tails inside the cell
    var sigmaR = cellS * (0.15 + 0.10 * hash21(cid + 9.4))
      * (1.0 + 1.2 * streamBoost + 1.4 * wind);
    sigmaR = min(sigmaR, cellS * 0.28);
    let sigmaT = cellS * (0.038 + 0.035 * hash21(cid + 13.2));
    var m = exp(-(dr * dr / (sigmaR * sigmaR) + dtv * dtv / (sigmaT * sigmaT)));
    // border envelope: whatever the stretch, a streak is exactly zero at the
    // cell edge — the hard rectangular cuts came from clipped tails
    m = m * smoothstep(0.5, 0.4, max(abs(f.x - 0.5), abs(f.y - 0.5)));
    let edge = abs(mposFrac - 0.5);
    let alive = 1.0 - smoothstep(0.38, 0.58, max(edge.x, edge.y));
    motes = m * smoothstep(0.55, 0.72, h) * alive
      * (0.6 + 0.4 * sin(u.time * (1.0 + h * 3.0) + h * 40.0))
      * (1.0 + 1.8 * wind);
  }
  motes = motes * moteAmount * (1.0 + 1.5 * modeMix);

  // ---- primary beams (camera-tilt optics + fiber bundles) ----
  let radial = exp(-r / falloffL);
  var beams = vec3f(0.0);
  var beamMaskW = 0.0;
  var hoverTurbGate = 0.0;
  var flood = 0.0;
  // rainbow dispersion belongs to the blue-sky register only
  let caM = ca * (1.0 - modeMix);
  let disp = clamp(ca * 55.0, 0.0, 1.0) * (1.0 - modeMix);

  for (var i = 0; i < 4; i++) {
    var a = u.beamAngles[i];
    let dAng = atan2(sin(pa - a), cos(pa - a));
    a = a + clamp(dAng, -1.0, 1.0) * 0.1 * pd * parallax;
    let hov = u.beamHover[i];

    // camera tilt: beams facing the cursor contract into thin hard rods,
    // the far side opens into wide soft fans (scheme.jpg physics)
    let toward = max(cos(pa - a), 0.0);
    let away = max(-cos(pa - a), 0.0);
    let warp = angleWarp * pd;
    var k = primaryK * (1.0 + 1.1 * warp * toward);
    k = k / (1.0 + 0.55 * warp * away);
    // dusty beams contract into defined cones cutting the darkness
    k = k * (1.0 + 0.45 * modeMix);
    if (hm == 1) { k = mix(k, k * 0.22, hov); }
    k = k * (1.0 + breathe * 0.22 * sin(u.time * 0.45 + f32(i) * 1.7));

    let lr = lobe(th, a - caM, k);
    let lg = lobe(th, a, k);
    let lb = lobe(th, a + caM, k);

    var boost = 1.0;
    if (hm == 0 || hm == 4) { boost = boost + 0.75 * hov; }
    if (hm == 1) { boost = boost + 0.35 * hov; }
    if (hm == 3) { boost = boost + 0.25 * hov; }

    // toward-beams burn brighter and harder, the far side calms down
    boost = boost * (1.0 + (0.55 + 0.75 * angleWarp) * toward * toward * pd * parallax);
    boost = boost * (1.0 - min(0.25 + 0.28 * angleWarp, 0.62) * away * pd);

    let flick = 1.0 + shimmer * (vnoise(vec2f(u.time * 0.55 + f32(i) * 13.7, 4.2)) - 0.5) * 1.5;

    // fiber bundles: drifting, dying, unequal sub-rays (see fiberComb)
    let dTh = atan2(sin(th - a), cos(th - a));
    var bands = vec3f(1.0);
    if (refraction > 0.003 && lr + lg + lb > 0.004) {
      let fib = fiberComb(dTh, r, u.time, f32(i) * 17.0, disp);
      bands = mix(vec3f(1.0), vec3f(0.5) + fib * 1.25, refraction);
    }

    // broad soft halo; the away side melts further into its halo
    let halo = lobe(th, a, max(k * 0.10, 2.5)) * (0.3 + 0.5 * warp * away);

    // tilt also stretches the toward-rod, shortens the far fans
    let lenWarp = 1.0 + 0.35 * warp * toward - 0.18 * warp * away;
    let radialB = exp(-r / (falloffL * lenWarp));

    beams = beams + (vec3f(lr, lg, lb) * bands + vec3f(halo)) * boost * flick * radialB;
    beamMaskW = beamMaskW + lobe(th, a, primaryK * 0.3);
    hoverTurbGate = hoverTurbGate + hov * lg;
    if (hm == 2) { flood = flood + hov * lobe(th, a, primaryK * 0.5); }
  }
  beams = beams * primaryIntensity;
  beamMaskW = min(beamMaskW, 1.0);

  let turb = 1.0 + 2.2 * hoverTurbGate * fbm(p * 0.02 + u.time * vec2f(0.35, -0.28));

  // ---- secondary rotating beams ----
  var sec = 0.0;
  for (var i = 0; i < 10; i++) {
    if (f32(i) >= secCount) { break; }
    let a = f32(i) * 2.399963 + rotSpeed * u.time;
    sec = sec + lobe(th, a, secK);
  }
  sec = sec * exp(-r / (falloffL * 1.2)) * secIntensity;

  // ---- core + cross glyph ----
  let coreBoost = 1.0 + 0.15 * exp(-length(q) / 120.0);
  let core = exp(-r * r / (2.0 * coreRadius * coreRadius)) * coreIntensity * coreBoost;

  var crossGlyph = vec3f(0.0);
  for (var i = 0; i < 4; i++) {
    let a = 1.5707963 * f32(i);
    var armLen = crossSize;
    if (hm == 3) {
      var hovArm = 0.0;
      for (var j = 0; j < 4; j++) {
        if (cos(a - u.beamAngles[j]) > 0.7) { hovArm = max(hovArm, u.beamHover[j]); }
      }
      armLen = armLen * (1.0 + 2.5 * hovArm);
    }
    let toward = max(cos(pa - a), 0.0);
    armLen = armLen * (1.0 + 1.4 * toward * pd * parallax);
    let armBoost = 1.0 + 1.2 * toward * toward * pd * parallax;
    let fall = exp(-r / armLen);
    crossGlyph = crossGlyph + vec3f(
      lobe(th, a - caM * 2.0, 600.0),
      lobe(th, a, 600.0),
      lobe(th, a + caM * 2.0, 600.0)
    ) * fall * armBoost;
    let ad = a + 0.7853982 + sin(u.time * 0.1) * 0.22;
    crossGlyph = crossGlyph + vec3f(lobe(th, ad, 900.0)) * exp(-r / (armLen * 0.6)) * 0.4;
  }
  crossGlyph = crossGlyph * crossIntensity;

  // ---- haze ----
  let hazeN = 0.8 + 0.4 * fbm(p * 0.004 + u.time * 0.02);
  let haze = hazeBase * exp(-r / (falloffL * 1.6)) * hazeN;

  // ---- composite (procedural field) ----
  var field: vec3f;
  if (cm == 1) {
    var channel = 0.0;
    for (var i = 0; i < 4; i++) {
      channel = channel + lobe(th, u.beamAngles[i], primaryK * 0.4);
    }
    channel = min(channel, 1.0);
    field = vec3f(haze * (1.0 - channelDark * channel) * (0.9 + 0.25 * dust));
    field = field + vec3f(flood) * radial * 1.25;
    field = field + crossGlyph * 0.6 + vec3f(core * 0.7);
  } else {
    // dusty mode confines the air strictly inside the cones: the beams
    // highlight dust, everything outside stays black (dust perfect ref)
    let inBeam = mix(1.0, min(beamMaskW * 1.6, 1.0), modeMix * 0.9);
    field = beams * (0.72 + 0.5 * dust * turb);
    field = field + vec3f(sec * (0.85 + 0.35 * dust)) * inBeam;
    field = field + crossGlyph + vec3f(core);
    field = field + vec3f(haze * 0.35 * inBeam);
    field = field + vec3f(motes * min(beamMaskW + sec * 2.2, 1.0) * inBeam * exp(-r / (falloffL * 1.1)));

    var zone = 0.0;
    for (var j = 0; j < 4; j++) {
      zone = zone + u.beamHover[j] * pow(max(cos(th - u.linkAngles[j]), 0.0), 5.0);
    }
    field = field + vec3f(1.06, 1.0, 0.9) * zone * exp(-r / (falloffL * 0.55)) * 0.95;
  }

  // ---- hovered links occlude the light: clean dark shadow cone ----------
  // starts AT the label's outer edge (r ≥ linkDist); no noise contour.
  if (shadow > 0.003) {
    var shadowMask = 0.0;
    for (var j = 0; j < 4; j++) {
      let hov = u.beamHover[j];
      let ld = u.linkDist[j];
      if (hov < 0.01 || ld < 1.0) { continue; }
      let dA = atan2(sin(th - u.linkAngles[j]), cos(th - u.linkAngles[j]));
      let pw = u.linkHalfAng[j] * (1.0 + 0.5 * max(r - ld, 0.0) / ld);
      let occl = 1.0 - smoothstep(pw * 0.6, pw, abs(dA)); // soft cone edges
      let behind = smoothstep(ld, ld * 1.2, r);           // fades in past the label
      shadowMask = max(shadowMask, occl * behind * hov);
    }
    field = field * (1.0 - shadow * shadowMask * 0.8);
  }

  // ---- lens-flare ghosts on the camera axis (holographic register) -----
  var gAmt = ghosting * (1.0 - modeMix) * smoothstep(0.3, 0.8, pd);
  // ghosts only sometimes appear — a slow gate, the lens catching the angle
  gAmt = gAmt * smoothstep(0.35, 0.75, vnoise(vec2f(u.time * 0.06, 23.7)));
  if (gAmt > 0.004) {
    for (var j = 0; j < 4; j++) {
      let fj = f32(j);
      let gp = q * (-0.4 + 0.55 * fj);
      let gr = length(p - gp);
      let rad = 30.0 + 26.0 * fj;
      // soft disc with a faint bright rim
      var disc = exp(-pow(gr / rad, 2.4));
      disc = disc + exp(-abs(gr - rad * 0.8) / (rad * 0.14)) * 0.35;
      let gTint = 0.65 + 0.35 * cos(vec3f(0.0, 2.1, 4.2) + fj * 1.9);
      field = field + gTint * disc * 0.05 * gAmt;
    }
  }

  // ---- «Прорезь»: the logo as light, blended over the field ------------
  var col = field;
  if (slitMix > 0.001) {
    var hoverDir = vec2f(0.0);
    var hoverAmt = 0.0;
    for (var j = 0; j < 4; j++) {
      hoverAmt = hoverAmt + u.beamHover[j];
      hoverDir = hoverDir + u.beamHover[j] * vec2f(cos(u.linkAngles[j]), sin(u.linkAngles[j]));
    }
    var slit: vec3f;
    if (hasMask > 0.5) {
      slit = slitLight(p, q, r, hoverDir, min(hoverAmt, 1.0), hash21(fragPx));
    } else {
      slit = crossGlyph + vec3f(core); // never blank if the mask failed to load
    }
    col = mix(field, slit, slitMix);
  }

  // dusty register: hot yellowish core falling to deep amber (dust perfect ref)
  let dusty = mix(vec3f(1.08, 0.94, 0.62), vec3f(1.0, 0.62, 0.27), clamp(r / 620.0, 0.0, 1.0));
  col = mix(col, col * dusty, modeMix);

  let tint = mix(vec3f(1.0, 0.99, 0.955), vec3f(0.9, 0.97, 1.08), clamp(r / 900.0, 0.0, 1.0));
  col = col * tint;
  // hover gallery-dark scene: the light surges (modeMix owns the warmth now);
  // tempered from 1.25 — the old surge whited out the shadow wedge
  col = col * (1.0 + 0.75 * sceneDim);
  col = mix(col, col * vec3f(1.14, 0.98, 0.80), sceneDim * 0.2);
  col = col * mix(1.0, 0.72, bgMix);

  // colour of the light itself. LAST word before the tone curve, so it is the
  // dial that wins over the register tints above — and BEFORE the shoulder, so
  // a hot core still blooms toward white while the falloff keeps the hue. Move
  // it after the shoulder and it flattens into a gel laid over a white lamp.
  col = col * u.p10.xyz;

  col = 1.0 - exp(-col * 1.6);

  let g = hash21(fragPx + fract(u.time) * vec2f(113.1, 271.7));
  col = col + (g - 0.5) * grain;
  col = col + (g - 0.5) / 255.0;

  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
