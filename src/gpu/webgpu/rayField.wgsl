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
  beamHover: vec4f,
  p0: vec4f, // primaryK, primaryIntensity, falloffL, coreRadius
  p1: vec4f, // coreIntensity, crossSize, crossIntensity, secCount
  p2: vec4f, // secK, secIntensity, rotSpeed, dustAmount
  p3: vec4f, // dustScale, moteAmount, grain, ca
  p4: vec4f, // hazeBase, channelDark, parallax, breathe
  p5: vec4f, // hoverMode, compositeMode, bgMix, layers
  p6: vec4f, // octaves, refraction, shimmer, sceneDim
};

@group(0) @binding(0) var<uniform> u: U;

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
    let dc = p + q * (0.05 * parallax * depth) * 60.0 / (r * 0.02 + 6.0) + swirl;
    let rr = length(dc) + 1e-3;
    let aa = atan2(dc.y, dc.x) - rotSpeed * u.time * (1.2 + 0.6 * fi);
    let rJit = vnoise(vec2f(aa * 1.7 + fi * 9.0, 3.7)) * 0.55;
    let nUv = vec2f(
      rr * 0.008 * dustScale - u.time * (0.025 + 0.012 * fi) + rJit,
      aa * (3.0 + rr * 0.018) * dustScale + fi * 17.0
    );
    dust = dust + (fbm(nUv) - 0.34) / (1.0 + fi);
  }
  dust = max(dust, 0.0) * dustAmount;

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
    let sigmaR = cellS * 0.22 * (1.0 + 1.2 * streamBoost + 1.4 * wind);
    let sigmaT = cellS * 0.055;
    let m = exp(-(dr * dr / (sigmaR * sigmaR) + dtv * dtv / (sigmaT * sigmaT)));
    let edge = abs(mposFrac - 0.5);
    let alive = 1.0 - smoothstep(0.42, 0.62, max(edge.x, edge.y));
    motes = m * step(0.6, h) * alive * (0.6 + 0.4 * sin(u.time * (1.0 + h * 3.0) + h * 40.0))
      * (1.0 + 1.8 * wind);
  }
  motes = motes * moteAmount;

  // ---- primary beams ----
  let radial = exp(-r / falloffL);
  var beams = vec3f(0.0);
  var beamMaskW = 0.0;
  var hoverTurbGate = 0.0;
  var flood = 0.0;

  for (var i = 0; i < 4; i++) {
    var a = u.beamAngles[i];
    let dAng = atan2(sin(pa - a), cos(pa - a));
    a = a + clamp(dAng, -1.0, 1.0) * 0.1 * pd * parallax;
    let hov = u.beamHover[i];
    var k = primaryK;
    if (hm == 1) { k = mix(k, k * 0.22, hov); }
    k = k * (1.0 + breathe * 0.22 * sin(u.time * 0.45 + f32(i) * 1.7));

    let lr = lobe(th, a - ca, k);
    let lg = lobe(th, a, k);
    let lb = lobe(th, a + ca, k);

    var boost = 1.0;
    if (hm == 0 || hm == 4) { boost = boost + 0.75 * hov; }
    if (hm == 1) { boost = boost + 0.35 * hov; }
    if (hm == 3) { boost = boost + 0.25 * hov; }

    let toward = max(cos(pa - a), 0.0);
    boost = boost * (1.0 + 1.0 * toward * toward * pd * parallax);
    boost = boost * (1.0 - 0.3 * max(-cos(pa - a), 0.0) * pd);

    let flick = 1.0 + shimmer * (vnoise(vec2f(u.time * 0.55 + f32(i) * 13.7, 4.2)) - 0.5) * 1.5;

    let dTh = th - a;
    let bandPhase = dTh * 140.0 + r * 0.012 - u.time * 0.9;
    let bands = mix(
      vec3f(1.0),
      vec3f(
        0.62 + 0.55 * sin(bandPhase),
        0.62 + 0.55 * sin(bandPhase + 2.094),
        0.62 + 0.55 * sin(bandPhase + 4.188)
      ),
      refraction
    );

    let halo = lobe(th, a, max(k * 0.10, 2.5)) * 0.3;

    beams = beams + (vec3f(lr, lg, lb) * bands + vec3f(halo)) * boost * flick;
    beamMaskW = beamMaskW + lobe(th, a, primaryK * 0.3);
    hoverTurbGate = hoverTurbGate + hov * lg;
    if (hm == 2) { flood = flood + hov * lobe(th, a, primaryK * 0.5); }
  }
  beams = beams * radial * primaryIntensity;
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
      lobe(th, a - ca * 2.0, 600.0),
      lobe(th, a, 600.0),
      lobe(th, a + ca * 2.0, 600.0)
    ) * fall * armBoost;
    let ad = a + 0.7853982 + sin(u.time * 0.1) * 0.22;
    crossGlyph = crossGlyph + vec3f(lobe(th, ad, 900.0)) * exp(-r / (armLen * 0.6)) * 0.4;
  }
  crossGlyph = crossGlyph * crossIntensity;

  // ---- haze ----
  let hazeN = 0.8 + 0.4 * fbm(p * 0.004 + u.time * 0.02);
  let haze = hazeBase * exp(-r / (falloffL * 1.6)) * hazeN;

  // ---- composite ----
  var col: vec3f;
  if (cm == 1) {
    var channel = 0.0;
    for (var i = 0; i < 4; i++) {
      channel = channel + lobe(th, u.beamAngles[i], primaryK * 0.4);
    }
    channel = min(channel, 1.0);
    col = vec3f(haze * (1.0 - channelDark * channel) * (0.9 + 0.25 * dust));
    col = col + vec3f(flood) * radial * 1.25;
    col = col + crossGlyph * 0.6 + vec3f(core * 0.7);
  } else {
    col = beams * (0.72 + 0.5 * dust * turb);
    col = col + vec3f(sec * (0.85 + 0.35 * dust));
    col = col + crossGlyph + vec3f(core);
    col = col + vec3f(haze * 0.35);
    col = col + vec3f(motes * min(beamMaskW + sec * 2.2, 1.0) * exp(-r / (falloffL * 1.1)));

    var zone = 0.0;
    for (var j = 0; j < 4; j++) {
      zone = zone + u.beamHover[j] * pow(max(cos(th - u.linkAngles[j]), 0.0), 5.0);
    }
    col = col + vec3f(1.06, 1.0, 0.9) * zone * exp(-r / (falloffL * 0.55)) * 1.35;
  }

  let tint = mix(vec3f(1.0, 0.99, 0.955), vec3f(0.9, 0.97, 1.08), clamp(r / 900.0, 0.0, 1.0));
  col = col * tint;
  col = col * (1.0 + 1.25 * sceneDim);
  col = mix(col, col * vec3f(1.14, 0.98, 0.80), sceneDim * 0.45);
  col = col * mix(1.0, 0.72, bgMix);
  col = 1.0 - exp(-col * 1.6);

  let g = hash21(fragPx + fract(u.time) * vec2f(113.1, 271.7));
  col = col + (g - 0.5) * grain;
  col = col + (g - 0.5) / 255.0;

  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
