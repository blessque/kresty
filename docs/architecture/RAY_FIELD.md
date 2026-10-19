# Ray Field — Uber-Shader Anatomy

**Four mirrored files, two pairs** (keep each pair in lockstep, same section order and names):
- `src/gpu/webgl2/rayField.frag.glsl` (GLSL ES 3.00) ↔ `src/gpu/webgpu/rayField.wgsl` — the
  final pass, every pixel
- `src/gpu/webgl2/rayPolar.frag.glsl` ↔ `src/gpu/webgpu/rayPolar.wgsl` — round 33's three
  polar passes (see «The exact light» below)

Pixel space: top-left origin in both (GLSL flips `gl_FragCoord.y`; WGSL `@builtin(position)`
is already top-left). Everything is computed in reference px: `p = (fragPx − u_center) / u_scale`.

## Frame state (per-frame, from MainScreen)

| Uniform | Meaning |
|---------|---------|
| `u_center` | convergence point, internal px (stage center +40,+20 scaled) |
| `u_pointer` | smoothed pointer, internal px |
| `u_scale` | internal px per reference px (stageScale × renderScale) |
| `u_beamAngles` vec4 | bisector beam angles (radians, y-down screen space) |
| `u_linkAngles` vec4 | measured link directions (hover zone light + shadows) |
| `u_linkDist` vec4 | link center distances from convergence, reference px |
| `u_linkHalfAng` vec4 | apparent angular half-width of each label (shadow wedge) |
| `u_beamHover` vec4 | eased 0..1 hover per beam |
| `u_bgMix` | 0 flat blue → 1 showreel photos (dims field ×0.72) |
| `u_sceneDim` | hover "gallery dark": light surge |
| `u_modeMix` | 0 holographic white/rainbow (blue bg) → 1 dusty warm amber (dark scene) |
| `u_layers`, `u_octaves` | perf tier: dust parallax layers (≤3), fbm octaves (≤4) |
| `u_raySteps` | god-ray march steps, clamped 8..32 — the frame governor's rung (round 31); was derived as `clamp(layers·8 + octaves·4, 12, 32)`. **The march only** — the exact light reads N_ref = 28 whatever this says |
| `u_raysMode` | round 33: 0 march · 1 exact · 2 pure · 3 ref (`state.rays`, from the governor) |
| `u_lightC`, `u_sLast`, `u_kc`, `u_kA`, `u_kWb`, `u_kRef`, `u_maskLod`, `u_polarDims` | round 33: the exact light's frame, computed ONCE on the CPU by `exactFrame()` and uploaded to every pass |
| `u_frame`, `u_ditherAmp` | round 33: the dither's seed (frame counter) and gain (`state.dither`: 1, or 1.5 below 0.75·DPR) |

## Variant params (preset-driven, tweened on switch)

| Param | Effect |
|-------|--------|
| `primaryK` | angular sharpness of the 4 nav beams (30 soft … 260 razor) |
| `primaryIntensity` | nav beam brightness |
| `falloffL` | radial falloff length `exp(−r/L)` |
| `coreRadius/Intensity` | gaussian hot core at convergence |
| `crossSize/Intensity` | cross-glyph arm length/brightness (0°/90° bright, 45° faint swing) |
| `secCount/K/Intensity` | secondary rotating beams (golden-angle spread) |
| `rotSpeed` | rad/s of secondary beams + dust domain (positive = clockwise) |
| `dustAmount/Scale` | fbm wisps inside beams |
| `moteAmount` | discrete dust specks (Cartesian cells, radial streaks) |
| `grain` | film grain amplitude — **0 in every shipped preset since 31.3**; the film grain is CSS (`shared/filmGrain.ts`, off by default since round 33) |
| `ca` | chromatic fringe: per-channel angular lobe offset (radians); in the slit light, a per-channel RADIAL scale ±`ca`·3.5 — **0 in the presets since round 33**; the shipped look adds **0.02** (33.1), noise-free now |
| `trail` | round 33: multiplier on the decay exponent λ — < 1 longer rays, > 1 shorter. 1 in the presets, **×1.23 shipped** (33.1) |
| `rayEdge` | round 33: the rays' source, 0 = B's radial smear (shipped) … 1 = R crisp — round 5's «razor», noise-free now |
| `penumbra` | round 33: extended light source — ray edges feather with distance. 0 shipped |
| `haze`, `hazeScale`, `hazeDrift`, `hazeWind` | round 33: living haze — drifting air density multiplying the RAYS only (amount, billow size in ref px, drift speed, cursor stir). 0 in the presets; **0.18 / 270 / 0.7 / 1.65 shipped** (33.1) |
| `hazeBase` | ambient glow; the whole field in eclipse mode |
| `channelDark` | eclipse: how dark beams carve into the haze |
| `parallax` | pointer influence on dust layers + wind push |
| `breathe` | slow per-beam width oscillation |
| `refraction` | fiber-bundle visibility inside beams (0..1) |
| `shimmer` | per-beam slow brightness life |
| `fiberDrift` | angular migration speed of the fiber bundles (disco-light life) |
| `angleWarp` | camera-tilt geometry: toward-cursor rods vs away-side fans (0..2) |
| `ghosting` | lens-flare ghost chain on the center↔cursor axis (holographic only) |
| `shadow` | hovered links carve dark shadow wedges out of the light (0..1) |
| `signSize` | «Прорезь»/«Сияние»: emblem span in ref px (mask footprint) |
| `godrays` | «Прорезь»/«Сияние»: radial light-scatter strength through the slits |
| `bloom` | «Прорезь»/«Сияние»: emissive halo around the emblem |
| `dissolve` | 0 crisp logo («Прорезь») … 1 zoom-blur light trails («Сияние») |
| `hoverMode` int | 0 brighten+turb · 1 widen · 2 flood · 3 arm-elongate · 4 mote-stream |
| `compositeMode` int | 0 additive light · 1 eclipse (bright haze, dark channels) |

`slitMix` (state, not a param) crossfades between the procedural field (`«Призма»`, 0) and
the logo-slit light (`«Прорезь»`, 1): `col = mix(field, slit, slitMix)`. The slit path
samples a texture — the rasterized emblem `sign.svg` (`u_signMask`, uploaded via
`setSignMask`); `u_hasMask=0` falls back to the procedural cross glyph so the page is never
blank.

## Section order inside the fragment shader

1. polar coords + pointer offset

Steps 2–8's field half lives in **`proceduralField()`** (round 31), returning a `Field`
struct (`col`, `crossGlyph`, `core`). `main`/`fs` call it only when it can reach the screen:
`slitMix < 0.999` (a crossfade) or no mask (the cross-glyph fallback). Every shipped light
runs `slitMix: 1`, where the field was computed per pixel and multiplied by zero — skipping it
halves the frame (33.8 → 15.1 ms at 5.2 MPx on M1) and is pixel-identical (≤ 1/255, measured
on both backends).

2. dust (layered fbm in rotating polar domain, radial-lattice jitter vs rings,
   constant angular frequency — never scale it by r)
3. motes (Cartesian cells, radially-oriented gaussians, drift + edge fade,
   border envelope vs clipped streaks)
4. primary beams (camera-tilt warp, per-channel CA lobes, `fiberComb` bundles,
   hover boosts, beamMaskW, floods)
5. secondary rotating beams
6. core glow + cross glyph (8 arms: 4 bright axis-aligned + 4 faint diagonal)
7. haze
8. composite branch (`compositeMode`) → `field`; link shadow carve + lens ghosts on
   `field`; then `slitLight` blended in by `slitMix`; dusty amber palette (`u_modeMix`)
9. tint (cool far field / warm core), sceneDim surge, bgMix dim, filmic shoulder,
   grain+dither

`fiberComb` (above `main`/`fs`): non-periodic fiber bundle — 3 staggered generations
at different frequencies (47/65/83 per rad), hash-driven widths/brightness, per-fiber
lifecycle + drift, RGB dispersion across the fiber cross-section, subpixel guards
(generation fade + width floor).

`slitLight` (above `main`/`fs`, «Прорезь»/«Сияние»): samples the emblem mask (`signMask`)
— crisp `core` (readable logo) + spiral-tap `bloom` + radial god-rays (march the mask from
the fragment back to the light-centre uv, per-step decay). Cursor shifts the light-centre
uv (vector form, no atan2) and leans brightness toward it; per-channel chromatic scale =
prism; at `dissolve` 0 rays fade near the centre (`rayGate`) so the emblem's strokes read
there, at `dissolve` 1 the crisp core vanishes, the gate opens (blown bright centre),
decay lengthens and the bloom widens — the strokes become zoom-blur light trails.
The march start and the bloom spiral are **jittered per pixel** (`jit = hash21(fragPx)`,
static) — fixed offsets deposit ghost copies of the mask edges ("ladders"). **That is now the
`march` branch only** (`?rays=march`): since round 33 `slitLight` opens with
`if (raysMode > 0.5) { exact } else { the march, verbatim }` and both branches share `life`,
`rayGate`, the melt, the lean, the tints and the shoulder after it.

## WebGPU uniform packing

Single 416-byte buffer = 26 vec4s (`FLOATS = 104`, was 76), packed in
`WebGPURayFieldRenderer.render()`. Field order there and in the WGSL `struct U` must match
exactly — update both together. p0..p11 comments name the slots; `p10.w` = the dither's frame
seed (round 33; was spare), `p11` = hoverDir.xy, hoverAmt, raySteps. **Round 33 APPENDED
p12–p18, so no older slot moved:**

| slot | x | y | z | w |
|---|---|---|---|---|
| p12 | kc0 | kc1 | kc2 | kc3 |
| p13 | lightC.x | lightC.y | sLast | raysMode |
| p14 | kA | kWb | maskLod | ditherAmp |
| p15 | polarNT | polarNS | — | jitOffset (probe) |
| p16 | bloomPad | bloomDissolve | bloomScale | — |
| p17 | haze | hazeScale | hazeDrift | hazeWind |
| p18 | kRef λ | kRef g | rayEdge | — |

Bindings: 0 `u` · 1 mask (now with mips) · 2 its sampler (mip-linear) · 3 polar Nₙ
(`rgba16float`) · 4 its sampler (repeat θ, clamp s) · 5 baked bloom (`rg16float`) · 6 haze
(`r8unorm`) · 7 its sampler (repeat). Rebuilt on `setSignMask`. The polar passes have their own
32-byte `struct P` (`c, nTheta, ds, maskSize, lodFloor, penLod, edge`).

**WebGL2 texture units**: mask 0 · polar 1 · polar bits 4 (the RGBA32UI fallback) · bloom 5 ·
haze 6; inside the polar passes mask 0 · bins 2 · prefix 3. Every unit gets a TYPE-CORRECT
texture every frame (1×1 placeholders): WebGL2 rejects a draw whose sampler type does not match
its unit's texture with `INVALID_OPERATION` — nothing draws, and nothing says so unless someone
reads `getError`.
`glProgram.ts` compiles every program and runs the DEV name-list self-check on each — the
regex is qualifier-aware (`uniform highp usampler2D u_x` is a declaration too).

## The exact light (round 33) — `rays: 'exact'`, the default

Porting it to another site, 1:1: `docs/LIGHT_PORT.md`.

The slit light's rays were a **Monte-Carlo estimate**: 16–32 jittered steps toward the light
centre plus 24 jittered bloom taps. Its noise WAS the grain the client saw, its half-step comb
the ladders, its three chromatic taps the colour speckle, and rendering it below the screen's
resolution magnified all three. **Seen from the light centre c every ray is a straight line**,
so a pixel's ray sum is a 1D integral along its own angle — in polar coordinates about c, a
prefix sum. Three small passes compute it exactly once per frame in a fixed-size texture; each
pixel reads it with three fetches (one along its angle, two for the band behind the centre). No random samples → nothing to dither away, on any device.

CPU half (shared by both backends): `gpu/exactLight.ts` — c, the kernel fit, the LODs, the
rebuild key, the detail cap. Plumbing: `webgl2/{glProgram,glTextures,polarPasses}.ts`,
`webgpu/{gpuTextures,polarPasses}.ts`. Mask data: `shared/lightMask.ts` (`buildLightMask` — gaussian mips,
the ink box, the baked bloom), `gpu/hazeNoise.ts`.

**The math.** rays(x) = ∫ m(c + t(x−c)) K(t) dt. Normalised moments
Nₙ(θ,s) = ∫₀ˢ m(c + s′ê_θ) s′ⁿ ds′ / sⁿ⁺¹ ∈ [0, 1/(n+1)] (fp16-safe), K fitted as a cubic
Σcₙτⁿ ⇒ rays = Σ cₙ Nₙ(θ, ρ)·kⁿ⁺¹ with ρ = min(a·r, sLast), k = ρ/(a·r).

**The kernel is MATCHED to the old march's expected value, not the naive ∫₀¹ — that is what
keeps the look.** The march's samples sit at tᵢ = 1 − (i + 1.25 + 0.5·jit)/N, so its weights
carry a gain g = decay^−1.5, its range is [−1/N, 1 − 1/N], and its LAST sample lands BEHIND c,
on the emblem's solid centre — an isotropic glow floor (~15 LSB in the gaps) that a naive
exact integral deletes. So: λ = −28·ln(mix(0.93, 0.968, dissolve))·`trail`; a = 1 − 1/28; the
cubic fits a·g·e^{−λ(1−aτ)}; plus w_b = g·e^{−λ(1+0.5/28)}/28 times the mean of m over
[0.25, 0.75]·r/28 BEHIND c (two N₀ reads along θ+π). Test vectors at dissolve 1:
kc = (0.40707, 0.36185, 0.13886, 0.07207), w_b = 0.01484.
**N_ref = 28 on every device.** The old decay depended on the step count (λ = −N·ln decay), so a
phone at 16 steps drew a different light: +20–57 % in the wedges, 2.3× in the gaps.

| pass | target | what |
|---|---|---|
| P1 bins | RGBA8, Nθ × Ns/4 | m per radial bin, 4 bins a texel; ONE mask fetch per bin at a band-limiting LOD = max(log₂ bin spacing in texels, `lodFloor`, `penLod`) |
| P2 prefix | RGBA32UI (fp32 bits) | exclusive prefix of 16-bin block totals — core-renderable on every WebGL2 |
| P3 normalise | RGBA16F, LINEAR, REPEAT on θ | the four Nₙ. No float render target → RGBA32UI + a hand-made bilinear in the final pass (`u_polarManual`) |

Nθ 2048 (1024 at the last rung), Ns 384 (256 below 2048). **Conventions — each one a silent
distortion if broken:** bins end at texel centres, sⱼ = (j+½)Δs, bin 0 = [0, ½Δs]; moment
weights in midpoint form h·(1, m, m²+h²/12, m(m²+h²/4)); sLast = the support radius (c to the
farthest corner of the B-ink box) + 1 texel; θᵢ = 2π(i+½)/Nθ − π; offscreen passes index with
RAW fragcoord, never `main`'s y-flip; P3 never re-samples the mask, so passes cannot disagree.

- **Rebuild key**: c, the mask revision, the kernel, Nθ, the LODs, penumbra, edge. Unchanged ⇒
  all three passes skipped — «Музей» and an icon at rest. The main screen's cross turns, so it
  rebuilds every frame: +0.1–0.9 ms on M1.
- **Init self-test**: a white 1×1 mask must read back Nₙ·(n+1) = 255 through the real passes.
  Only a failed self-test drops to the march (`exactAvailable` false). WebGPU builds every
  pipeline with `createRenderPipelineAsync`, so a WGSL error throws and falls back rather than
  rendering blank. Each pass binds its FBO, sets its viewport, disables scissor and blend —
  «О Крестах» enables scissor every frame, and leaked into P1 it would break only that page.
- **Final pass** (`slitLight`'s exact branch): core = R at a uniform LOD (`coreMask`), bloom =
  the baked texture (`bakedBloom`), rays = `exactRays` (1 polar fetch at `ca` 0, 3 with the
  rainbow, + 2 for the behind-c band), haze when on. **`life` (the `vnoise(time)` gate) is
  computed in the shader for BOTH branches** — hoisted to the CPU it biased the look by −2.1 LSB:
  `hash21` is chaotic, so doubles and fp32 disagree.
- **The bloom is baked, not tapped.** The 24-tap spiral's expected kernel is a sum of blurred
  rings, each with a closed form (1/2πσ²)·e^{−(r−ρ)²/2σ²}·I₀ₑ(rρ/σ²); a non-negative gaussian
  fit of it is applied to G (the canvas's own 18 px blur) with deconvolved σ = √(σ² − 18²), by a
  Young–van Vliet recursive gaussian at ¼ res on a 256² grid padded 0.3 uv. RG16F: x = this
  consumer's dissolve, y = dissolve 0. 48 ms per mask, once.
- **Dither**: monochrome TPDF ±1 LSB from a PCG integer hash of (fragcoord, frame) — `hash21`
  tiles every 50×100 px (123.34·50 and 456.21·100 are integers), PCG does not — gated by
  `clamp(max(col)·255, 0, 1)` so black stays EXACTLY black: the scroll seam (reveal 0) reads
  back all zeros. The march branch keeps its `hash21` dither byte-for-byte.
- **Modes** (`state.rays`, `?rays=`): `exact` · `pure` (the naive ∫₀¹, no behind-c floor — for
  comparison) · `march` (the old estimator untouched, rung and all — the A/B) · `ref` (probe
  only: 2048 un-jittered steps with the true kernel).
- **Penumbra** is a LOD bias on P1's mask fetch over the gaussian mips (ε ≤ 5 % of the emblem):
  zero memory, zero fetches. **Haze** is one baked tiling FBM read twice at incommensurate
  scales with drifts ~130° apart and one domain warp, Cartesian (round 3: polar noise makes
  onion rings), multiplying the rays only — ≈ mean-preserving, and multiplicative, so it can add
  neither grain nor a seam.

`npm run probe:light` (both backends, «Сияние» at 1 texel/px, exits non-zero): exact vs `ref`
max 1 / mean 0.05 LSB · vs E[old march] (128 jitter offsets) sector means max 1.46 / mean 0.44 ·
noise 0.45 LSB RMS — the dither alone — vs the march's 1.70 · WebGL2 vs WebGPU mean 0.000 /
max 1 · seam 0.

### Resolution: the light's own detail sets the canvas

A noise-free light needs no more pixels than its finest feature — the mask edge as drawn
(B's 1.5-texel smear floor, R's ~0.7 at `rayEdge` 1, widened by the penumbra).
`detailScale()` (exactLight.ts): ≈ DPR/(1.2 × that feature in device px), clamped to
[½·DPR, DPR]; **native whenever `dissolve` < 0.99** (a visible crisp core: the icons).
`page/lightScale.ts` turns it into every consumer's canvas scale — exact: `detailScale` × the
rung's fraction; march: the old ladder's scale — then caps the allocation at **8 MPx** (Intel,
low tier, unknown GPU) or **16 MPx**, counting «О Крестах»'s full 2-viewport canvas. Measured
at 1440 on the M1: main 1.024, «Музей» 1.0, «О Крестах» 2.0.

## Quality governor (round 31; two ladders since round 33)

**The exact light has its own ladder**: `EXACT_LADDER` = fractions `[1, 0.8, 0.65, 0.5]` of the
detail cap, Nθ 2048 / 2048 / 2048 / 1024. Start rung 0 (Intel / low tier: 1); it never probes
above 0 (`EXACT_PROBE_CEILING`). Everything below — `LADDER`, the trigger, the locks — is the
march's, kept for `?rays=march` so the A/B is against the real old light. Both ladders share the
measuring logic. GPU time per frame on M1, 1440×900 viewport (`npm run bench:light`, 2026-10-20):

| | scale | MPx | c still | c moving |
|---|---|---|---|---|
| exact | 2 (native) | 5.18 | 3.4 ms | 4.2 ms |
| exact | 1.5 | 2.92 | 2.3 | 2.9 |
| exact | 1 | 1.30 | 2.1 | 2.3 |
| march, old default rung 2 | 1.25 | 2.02 | 7.1 | |
| march, rung 0 | 2 | 5.18 | 18.4 | |

**The exact light at native 2× costs less than the march did at its reduced M1 default** — the
canvas no longer has to shrink to afford the light, which is what made it grainy.

### The march's ladder (round 31)

Cost is fill rate: pixels × (12 bloom taps + `raySteps` × 3 chromatic taps). `shared/frameGovernor.ts`
picks a rung from `LADDER` — `{scale 2, 32} → {1.5, 32} → {1.25, 28} → {1, 24} → {0.75, 24} →
{0.6, 20}` — from measured frame time: > 10 % of a 60-frame window over 20 ms steps down; 5 s
with no slow frames probes one rung up, never above the default rung 2; a probe that has to be
undone locks it for the session, as do two step-downs. The GPU name (`RayFieldRenderer.gpuName`)
only seeds the start (Intel / low tier → rung 3, else 2).
**Pixels go before steps**: fewer steps turn the march's per-pixel jitter into a stipple,
fewer pixels only soften a light that is soft anyway (`dissolve 1`, grain in CSS `#grain`).

Consumers: `MainScreen`, `museumLight` and `pageLight` (live since 31.1) all feed it and resize on
a change; since round 33 all three size their canvas through `page/lightScale.ts` and re-lay
out on a DPR change (`matchMedia('(resolution: …dppx)')`). `RayFieldState.scissorPx` shades a sub-rectangle — how «О Крестах»'s 2-viewport canvas
pays for one viewport. `?bake` restores the concept page's old bake. Dev switches: `?perf` (HUD), `?rung=N`, `?rs=`, `?steps=`, `?light=off`
(no GPU submit — the compositor baseline), `?field=on` (the pre-31 cost). Query goes BEFORE
the hash: `/?perf#museum`. `npm run bench:light` times the shader per rung, synced per
frame — Apple GPUs' hidden-surface removal otherwise shades only the last of N opaque draws.

## The light lab — `?lab` (round 33) and the shipped look (33.1)

**What ships is the preset THROUGH the look**: `shared/lightLook.ts`'s `LOOK_DEFAULTS` is the
user's own pick from the lab (2026-10-20) — exposure 1.05 · trail 1.23 · bloom 1.07 · core 1.01 ·
rainbow 0.02 · haze 0.18 / scale 270 / drift 0.7 / wind 1.65 — applied by every light builder on
top of its preset (`applyLook`), plus the film grain at 0.015, moving (`GRAIN_DEFAULTS`). The
presets themselves are untouched, so `?rays=march` and the probes still compare like with like.
To bake a new look: change those two constants and bump the lab's store key.

`screens/lab/lightLab.ts`, dynamically imported, absent from a normal visit — **including on the
deployed site** (`/?lab`, `/?lab#museum`, `/?lab#concept`). The designer's handles on main,
«Музей» and «О Крестах», live, every default the shipped look:
exposure · trail · ray edge · bloom · core · rainbow · penumbra · haze (amount, scale, drift,
wind) · film grain (amount, speck size, still/film) · estimator (exact / pure / old) ·
resolution (auto / native / 1 / ¾ / ½) · polar θ. **Copy URL** hands a look back as `lab.*`
query keys (`?exp=` and `?rs=` were taken). It writes `shared/lightLook.ts`'s `LOOK`, which
every light builder passes its params through (`applyLook` — the identity at defaults), plus
`governor.setOverrides` and `setGrain`. Its panel is the contacts showcase's `ControlPanel`,
moved to `shared/controlPanel.ts` and parameterised (store key, URL prefix, flag, title).

**The film grain** (`shared/filmGrain.ts`) ships at **0.015, 1 CSS px, moving** (33.1) and shows
on main and «Музей» only — «О Крестах» and the content pages hide `#grain` by design (round 16:
over the map and white pages it reads as dirt). The speck size is set in CSS px (≈ constant
visual angle, phone to TV) and drawn at
device resolution: white noise per device pixel, gaussian-blurred to that size, in three
prime-edged tiles (509 / 761 / 1021 device px) at equal weight, so nothing repeats on any
screen. The old `#grain` was one 128-CSS-px tile — measured autocorrelation 0.59 at 256 device
px, the "grid" in the client's screenshots; the new one measures 0.003 there. At amount 0 the
layer is `display: none`, which also takes a full-screen overlay blend off every frame. **The
tiles are built one per task, 1.5 s after load** — all three in one task blocked the main thread
for 130–190 ms on an M1 (ten dropped frames at every load); now the largest task is ~14 ms and
the output is byte-identical.

