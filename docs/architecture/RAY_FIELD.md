# Ray Field — Uber-Shader Anatomy

Two mirrored implementations (keep in lockstep, same section order and names):
- `src/gpu/webgl2/rayField.frag.glsl` (GLSL ES 3.00)
- `src/gpu/webgpu/rayField.wgsl`

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
| `u_raySteps` | god-ray march steps, clamped 8..32 — the frame governor's rung (round 31); was derived as `clamp(layers·8 + octaves·4, 12, 32)` |

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
| `grain` | film grain amplitude (also anti-banding with 1/255 dither) |
| `ca` | chromatic fringe: per-channel angular lobe offset (radians) |
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
static) — fixed offsets deposit ghost copies of the mask edges ("ladders").

## WebGPU uniform packing

Single 304-byte buffer = 19 vec4s (`FLOATS = 76`), packed in `WebGPURayFieldRenderer.render()`. The mask
texture + sampler bind at `@binding(1)`/`@binding(2)` (bind group rebuilt on `setSignMask`).
Field order there and in the WGSL `struct U` must match exactly — update both together
(p0..p11 comments name the slots; `p10.w` is spare, `p11` = hoverDir.xy, hoverAmt, raySteps).

## Quality governor (round 31)

Cost is fill rate: pixels × (12 bloom taps + `raySteps` × 3 chromatic taps). `shared/frameGovernor.ts`
picks a rung from `LADDER` — `{scale 2, 32} → {1.5, 32} → {1.25, 28} → {1, 24} → {0.75, 24} →
{0.6, 20}` — from measured frame time: > 10 % of a 60-frame window over 20 ms steps down; 5 s
with no slow frames probes one rung up, never above the default rung 2; a probe that has to be
undone locks it for the session, as do two step-downs. The GPU name (`RayFieldRenderer.gpuName`)
only seeds the start (Intel / low tier → rung 3, else 2).
**Pixels go before steps**: fewer steps turn the march's per-pixel jitter into a stipple,
fewer pixels only soften a light that is soft anyway (`dissolve 1`, grain in CSS `#grain`).

Consumers: `MainScreen`, `museumLight` and `pageLight` (live since 31.1) all feed it and resize on
a change. `RayFieldState.scissorPx` shades a sub-rectangle — how «О Крестах»'s 2-viewport canvas
pays for one viewport. `?bake` restores the concept page's old bake. Dev switches: `?perf` (HUD), `?rung=N`, `?rs=`, `?steps=`, `?light=off`
(no GPU submit — the compositor baseline), `?field=on` (the pre-31 cost). Query goes BEFORE
the hash: `/?perf#museum`. `npm run bench:light` times the shader per rung, synced per
frame — Apple GPUs' hidden-surface removal otherwise shades only the last of N opaque draws.
