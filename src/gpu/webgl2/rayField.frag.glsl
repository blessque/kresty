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
uniform float u_refraction;    // prismatic bands inside beams
uniform float u_shimmer;       // per-beam slow brightness life
uniform float u_sceneDim;      // hover gallery-dark: boost + warm
uniform float u_hoverMode;     // 0 brighten+turb | 1 widen | 2 flood | 3 arm | 4 stream
uniform float u_compositeMode; // 0 additive | 1 eclipse

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
    vec2 dc = p + q * (0.05 * u_parallax * depth) * 60.0 / (r * 0.02 + 6.0) + swirl;
    float rr = length(dc) + 1e-3;
    float aa = atan(dc.y, dc.x) - u_rotSpeed * u_time * (1.2 + 0.6 * fi);
    // radial coord varies slowly, angular quickly -> radially elongated wisps.
    // jitter the radial lattice by an angular noise term, otherwise the
    // value-noise grid rows align into concentric "sonar ring" artifacts
    float rJit = vnoise(vec2(aa * 1.7 + fi * 9.0, 3.7)) * 0.55;
    vec2 nUv = vec2(
      rr * 0.008 * u_dustScale - u_time * (0.025 + 0.012 * fi) + rJit,
      aa * (3.0 + rr * 0.018) * u_dustScale + fi * 17.0
    );
    dust += (fbm(nUv) - 0.34) / (1.0 + fi);
  }
  dust = max(dust, 0.0) * u_dustAmount;

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
    // sigmas scale with the cell so tails never clip at cell borders;
    // wind stretches the streaks along their flight path
    float sigmaR = cellS * 0.22 * (1.0 + 1.2 * streamBoost + 1.4 * wind);
    float sigmaT = cellS * 0.055;
    float m = exp(-(dr * dr / (sigmaR * sigmaR) + dtv * dtv / (sigmaT * sigmaT)));
    // fade out as the mote slides past its cell so it never pops
    vec2 edge = abs(mposFrac - 0.5);
    float alive = (1.0 - smoothstep(0.42, 0.62, max(edge.x, edge.y)));
    motes = m * step(0.6, h) * alive * (0.6 + 0.4 * sin(u_time * (1.0 + h * 3.0) + h * 40.0))
      * (1.0 + 1.8 * wind);
  }
  motes *= u_moteAmount;

  // ---- primary nav beams (with chromatic fringing) --------------------
  float radial = exp(-r / u_falloffL);
  vec3 beams = vec3(0.0);
  float beamMaskW = 0.0; // wide mask, gates dust/motes into the light
  float hoverTurbGate = 0.0;
  float flood = 0.0; // eclipse hover: channel floods with light

  for (int i = 0; i < 4; i++) {
    float a = u_beamAngles[i];
    // beams lean toward the cursor — light noticing your hand
    float dAng = atan(sin(pa - a), cos(pa - a));
    a += clamp(dAng, -1.0, 1.0) * 0.1 * pd * u_parallax;
    float hov = u_beamHover[i];
    float k = u_primaryK;
    if (hm == 1) k = mix(k, k * 0.22, hov); // widen: the wedge opens
    k *= 1.0 + u_breathe * 0.22 * sin(u_time * 0.45 + float(i) * 1.7);

    float lr = lobe(th, a - u_ca, k);
    float lg = lobe(th, a, k);
    float lb = lobe(th, a + u_ca, k);

    float boost = 1.0;
    if (hm == 0 || hm == 4) boost += 0.75 * hov;
    if (hm == 1) boost += 0.35 * hov;
    if (hm == 3) boost += 0.25 * hov;

    // beams facing the cursor burn brighter, the far side calms down
    float toward = max(cos(pa - a), 0.0);
    boost *= 1.0 + 1.0 * toward * toward * pd * u_parallax;
    boost *= 1.0 - 0.3 * max(-cos(pa - a), 0.0) * pd;

    // shimmer: slow independent life per beam
    float flick = 1.0 + u_shimmer * (vnoise(vec2(u_time * 0.55 + float(i) * 13.7, 4.2)) - 0.5) * 1.5;

    // prismatic refraction: RGB-phased bands flowing outward inside the beam
    float dTh = th - a;
    float bandPhase = dTh * 140.0 + r * 0.012 - u_time * 0.9;
    vec3 bands = mix(
      vec3(1.0),
      vec3(
        0.62 + 0.55 * sin(bandPhase),
        0.62 + 0.55 * sin(bandPhase + 2.094),
        0.62 + 0.55 * sin(bandPhase + 4.188)
      ),
      u_refraction
    );

    // broad soft halo so the beam glows instead of cutting
    float halo = lobe(th, a, max(k * 0.10, 2.5)) * 0.3;

    beams += (vec3(lr, lg, lb) * bands + vec3(halo)) * boost * flick;
    beamMaskW += lobe(th, a, u_primaryK * 0.3);
    hoverTurbGate += hov * lg;
    if (hm == 2) flood += hov * lobe(th, a, u_primaryK * 0.5);
  }
  beams *= radial * u_primaryIntensity;
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
      lobe(th, a - u_ca * 2.0, 600.0),
      lobe(th, a, 600.0),
      lobe(th, a + u_ca * 2.0, 600.0)
    ) * fall * armBoost;
    // fainter diagonal arms, slowly swinging
    float ad = a + 0.7853982 + sin(u_time * 0.1) * 0.22;
    crossGlyph += vec3(lobe(th, ad, 900.0)) * exp(-r / (armLen * 0.6)) * 0.4;
  }
  crossGlyph *= u_crossIntensity;

  // ---- haze -------------------------------------------------------------
  float hazeN = 0.8 + 0.4 * fbm(p * 0.004 + u_time * 0.02);
  float haze = u_hazeBase * exp(-r / (u_falloffL * 1.6)) * hazeN;

  // ---- composite --------------------------------------------------------
  vec3 col;
  if (cm == 1) {
    // eclipse: bright haze, beams carved as dark channels; hover floods with light
    float channel = 0.0;
    for (int i = 0; i < 4; i++) {
      channel += lobe(th, u_beamAngles[i], u_primaryK * 0.4);
    }
    channel = min(channel, 1.0);
    col = vec3(haze * (1.0 - u_channelDark * channel) * (0.9 + 0.25 * dust));
    col += vec3(flood) * radial * 1.25;
    col += crossGlyph * 0.6 + vec3(core * 0.7);
  } else {
    col = beams * (0.72 + 0.5 * dust * turb);
    col += vec3(sec * (0.85 + 0.35 * dust));
    col += crossGlyph + vec3(core);
    col += vec3(haze * 0.35);
    col += vec3(motes * min(beamMaskW + sec * 2.2, 1.0) * exp(-r / (u_falloffL * 1.1)));

    // hover: the hovered link's whole zone blazes far harder than the rest
    float zone = 0.0;
    for (int j = 0; j < 4; j++) {
      zone += u_beamHover[j] * pow(max(cos(th - u_linkAngles[j]), 0.0), 5.0);
    }
    // tight falloff: the blaze lives near the center and breathes toward the
    // link without swallowing the label itself
    col += vec3(1.06, 1.0, 0.9) * zone * exp(-r / (u_falloffL * 0.55)) * 1.35;
  }

  // slightly cool the far field, warm the core — subtle temperature drift
  vec3 tint = mix(vec3(1.0, 0.99, 0.955), vec3(0.9, 0.97, 1.08), clamp(r / 900.0, 0.0, 1.0));
  col *= tint;

  // hover gallery-dark scene: the light surges and warms
  col *= 1.0 + 1.25 * u_sceneDim;
  col = mix(col, col * vec3(1.14, 0.98, 0.80), u_sceneDim * 0.45);

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
