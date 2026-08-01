# Effects Tuning Log

Decisions already made and artifacts already fixed. **Do not re-litigate or reintroduce
without an explicit reason.** Append new entries at the bottom of each section, dated.

---

## Hard requirements (from the client brief — never violate)

- ~~4 primary beams point at the 4 nav links at all times.~~ **SUPERSEDED 2026-07-15
  (evening):** user reversed this — beams now strike BETWEEN the links (bisector angles →
  upright cross, the window-grille motif) and are free to sway/wander since they no longer
  track links. Sway: global ±8° (45s period) + per-beam wander ±2°, in `MainScreen.update`.
- The effect must react to cursor/touch subtly ("disturbed dust"), never literally
  follow the mouse.
- Must never look like a 2010 lens-flare sketch. Register: Anthony McCall solid light,
  grainy, sculptural (see `references/reference-light-8.jpg`).
- Must work on mobile (perf tiers, touch) and never render blank (WebGL2 fallback).
- Cross motif is intentional: the prison is cross-shaped, the window-grille light forms
  crosses (refs 9/10) — the cross glyph at the convergence point stays.

## Shader decisions made (2026-07-15)

- **One uber-shader per backend**, variants = uniform presets + `hoverMode` /
  `compositeMode` integer branches. No per-variant shader files.
- Compositing: canvas outputs light-on-black, CSS `mix-blend-mode: screen`. Works over
  flat blue AND showreel photos; Eclipse works because its bright haze lightens
  everything except carved-dark channels.
- All distances in reference px (1440×800 frame) via `u_scale`.
- Beam lobe: `pow(max(cos(θ−a),0), k)`; radial falloff `exp(−r/L)` (no 1/r singularity);
  filmic shoulder `1−exp(−col·1.6)`; hash grain + 1/255 dither vs banding.
- Chromatic fringe: per-channel angular offset of the SAME lobe (±u_ca), not full-screen CA.
- Beam angles measured from live DOM rects (`atan2`), CSS rotations (51.8°/−38.2°) orient
  glyphs only.

## Artifacts fixed — do not reintroduce (2026-07-15)

1. **"Sonar rings"** — value-noise sampled in polar coords aligns its lattice rows into
   concentric circles. Fix: jitter the radial lattice coordinate by an angular noise term
   (`rJit = vnoise(aa·1.7)·0.55`).
2. **"Star-trail swirl" motes** — a cell grid keyed on `(r, θ·r)` is sheared; streak
   orientation rotates with θ. A true polar ring grid instead produces **dotted concentric
   circles** (dense occupancy on rings). Fix that survived: **Cartesian cell grid**
   (immune to circular symmetry) with per-mote streak *oriented* along the true radial
   direction, drifting along it, edge-fading at cell borders.
3. **Rectangular patches** — mote gaussians clipped at cell borders when σ was fixed
   (22px) but cells shrank with `dustScale`. Fix: σ proportional to cell size
   (`σr = cellS·0.22`, `σt = cellS·0.055`).

## Variant presets (all in `src/screens/main/variants.ts`)

| # | id | Register | Hover mode |
|---|----|----------|-----------|
| 1 | signal | soft volumetric + dust | 0: brighten + local turbulence |
| 2 | solid-light | hard mono McCall wedges, heavy grain | 1: wedge widens |
| 3 | eclipse | inverted: bright haze, dark channels | 2: channel floods with light |
| 4 | cross-flare | cross glyph protagonist, rainbow fringe | 3: nearest arm elongates |
| 5 | dust-chamber | particle-forward, faint beams | 4: motes stream to center |

Planned ver 6 «Витраж»: beams as masks revealing section photo content inside each beam
(showreel layer already exists as the base). Not built yet.

## Ray upgrades (2026-07-15 evening — user feedback round 1)

- User favorites: v2 solid-light + v4 cross-flare → v2 is now the DEFAULT variant.
- New shader features (both files): outer glow **halo** per beam (`lobe(k*0.10)*0.3`);
  **prismatic refraction bands** (RGB-phased `sin(dTh*140 + r*0.012 − t*0.9)`, amount =
  `refraction` param); **shimmer** (per-beam vnoise brightness life); `u_sceneDim`
  boost+warm (`×(1+1.25·dim)`, warm tint mix 0.45).
- **Hover = scene change** ("gallery dark"): `.hover-scene` DOM layer (near-black
  `#04070c` at 0.93 + per-link photo at 0.38) under the screen-blended canvas; sceneDim
  eased 250ms in / 500ms out. The light surges & warms via u_sceneDim. Per-link images
  are placeholders (gitignored, see 2026-07-15 late-night hygiene pass).
- Wow pass on presets: falloffL ~780–900, brighter primaries/cores; v4 crossSize 700,
  refraction 0.5.

## Map decisions (2026-07-15 evening — REPLACED first approach)

- ~~Per-building inverse-depth scaling with perspective camera~~ — didn't read; REPLACED.
- Now: **user's real GLB** (`public/resources/scene.glb`, committed to git — archive copy
  also in `references/scene.glb`, normalized: centered, base y=0, max XZ span = 300) +
  **OrthographicCamera straight top-down by default**, `camera.up=(0,0,−1)`.
- **Vertex-level reverse perspective**: `onBeforeCompile` replaces `#include
  <project_vertex>` → `mvPosition.xy *= 1 + K·(depth − refDist)/refScale`, K=0.85,
  refScale=110 (constants atop ConceptScreen.ts). Deeper vertices spread outward →
  walls splay continuously, works across a single mesh.
- Tilt: only when cursor leaves center — deadzone 0.08, max tilt 0.5 rad toward the
  cursor side; touch = drag deltas into the same state.
- Lights: hemisphere + directional (GLB materials need them). No fog.

## Feedback round 2 (2026-07-15, late) — single variant, wind, harsh

- **Segmented control REMOVED; «Cross Flare» is the one and only variant.** Other presets
  remain as data in `variants.ts`; `?fx=` still works for dev comparisons. Don't rebuild
  the switcher without being asked.
- **"Tornado" killed**: v4 has `secCount 0` (no rotating sweep beams), `dustAmount 0.35`
  (no soft vortex wisps), pointer swirl replaced with a straight downwind push. New ref:
  `references/light-ref-new.jpg` — hard source, striated cone, DENSE sharp particles.
- **Cursor = wind (must stay obvious)**: `pd = |q|/380`, `pa = atan2(q)`. Beams lean
  toward cursor (±0.1 rad·pd·parallax) and brighten toward it (×(1+toward²·pd·parallax)),
  far side dims ×(1−0.3·…). Cross-glyph arm toward cursor extends ×(1+1.4·toward·pd·par)
  and brightens. Motes downwind: speed ×(1+5·wind), streak length ×(1+1.4·wind),
  brightness ×(1+1.8·wind). Dial = `parallax` (v4: 1.3).
- **Hover zone light**: new `u_linkAngles` uniform (measured link directions, separate
  from beam bisectors). Hovered link's quadrant gets `pow(cos(θ−linkA),5)` blaze,
  falloff `exp(−r/(L·0.55))·1.35` — tempered from 1.15/1.7 which whited out the label
  and the news text. Combined with sceneDim dark scene = the harsh contrast.
- WGSL uniform buffer grew to 12 vec4s (192 B) — `linkAngles` after `beamHover`; packing
  indices shifted, keep `struct U` and `WebGPURayFieldRenderer.render()` in sync.

## Map round 2 (2026-07-15, late)

- **`REVERSE_K = 0`** — user: divergence at 0.85 read as "too fisheye". The map is now
  pure orthographic: flat plan at rest, clean axonometric on tilt. The vertex-divergence
  mechanism stays wired; raise K gently (0.15–0.3) if reverse perspective is requested back.
  **SUPERSEDED by Map round 3 — the global-divergence shader patch was removed entirely.**

## Repo hygiene (2026-07-15, late night)

- Top-level `resources/` renamed to `references/` — a gitignored mood-board archive
  (all raw reference photos, plan screenshots, .blend files, unused ARTLEBEDEV mark).
- `public/resources/` trimmed to only what the build actually needs, and only those
  ARE committed: 5 font files + `scene.glb`. Everything else that was in there (mood
  board images) moved to `references/`.
- 5 files stay physically in `public/resources/` for local dev (Showreel + hover use
  them) but are gitignored — placeholder content, not part of the repo. See CLAUDE.md
  project structure section for the exact list.
- This also fixed the initial push failing (RPC/HTTP 400) — the old history carried
  ~14MB of mood-board PNGs; squashed to one clean initial commit without them.

## Map round 3 (2026-07-15) — TRUE icon reverse perspective, baked
**SUPERSEDED by Map round 4 — user rejected the splay ("Egyptian pyramids") and
reverted it in `aadd6d2`. Kept for the record only.**

- Root cause of the round-1 "fisheye": the old formula scaled view-space XY around ONE
  global center (the view axis), so off-center roofs sheared sideways relative to their
  bases. Icon perspective is **polycentric** — each building splays around its own
  footprint (user's drawing: `references/reverso.png` — roof + all four walls visible
  from straight above, wall bottoms further out than the roof edge).
- New mechanism: `src/screens/concept/reversePerspective.ts` — **baked into the GLB
  geometry once at load**, zero per-frame cost, tilt untouched (camera-side). Wall faces
  (|n.y| < 0.35) are flood-filled into strips via position-welded vertices; every wall
  vertex is pushed outward along the area-weighted horizontal normal by
  `SPLAY_K · (ownRoofLineY − y)`. Wall tops don't move (stay welded to roofs); normals
  are kept so façades keep flat directional shading. Strips shorter than 4% of model
  height (curbs) are skipped.
- The superseded global-divergence shader patch (`patchMaterial`, `uRevK/uRevDist/
  uRevScale`, `REVERSE_K/REVERSE_SCALE`) was **removed** from ConceptScreen.ts —
  resurrect from git history if ever needed; do NOT re-add it as "reverse perspective",
  it is the wrong model.
- User decisions: splay **always on** at every tilt angle; mechanism free as long as
  cursor/touch tilt works.
- Dials: `SPLAY_K = 0.6` (wall band = 60% of wall height; `?rp=<k>` URL override —
  `?rp=0` flat plan sanity, `?rp=1` overlaps between close buildings). Also
  `WALL_NY_MAX`, `MIN_WALL_H_FRAC`, `WELD_EPS_FRAC` in reversePerspective.ts.
- Accepted-by-construction quirks (also present in the user's drawing): diagonal seams
  where two splayed walls interpenetrate in concave inner corners of the crosses;
  wall overlap between very close buildings at high K.
- Verified via headless screenshots on :5299: rest = top-down roofs + 4 wall bands
  (crosses read clearly), tilt works, `?rp=0`/`?rp=1` behave.
- Taste dial left open: façade shading contrast vs roofs (hemisphere/directional light
  intensities in `buildScene`) — walls read but are close in tone to roofs.

## Feedback round 3 (2026-07-15/16) — camera-tilt optics, two-mode light, 3 solutions

New refs (gitignored `references/`): `scheme.jpg` (cursor vs beam distortion),
`light-angles.png` (holographic star variations + ghosts), `dust perfect.png` +
`dusty-angles.png` (dusty register), `shadow-casting.jpg` (occlusion shadows).

- **Optical model: cursor = cameraman tilting the lens** (`angleWarp` param). Per beam,
  `toward/away = ±cos(pa − a)`: toward-cursor beams contract (`k·(1+1.1·warp·toward)`),
  brighten and lengthen; away-side opens into wide fans (`k/(1+0.55·warp·away)`), dims,
  melts into its halo, shortens. Per-beam radial falloff moved inside the loop.
- **Fiber bundles replaced the sin() prismatic bands** (`fiberComb` in both shaders).
  Non-periodic comb: 3 staggered generations at DIFFERENT frequencies (47/65/83 per rad),
  hash-driven unequal widths/brightness/position, per-fiber 4–9 s birth/death lifecycle,
  angular drift (`fiberDrift`), radial shear, RGB dispersion across each fiber's
  cross-section (amount = `ca`-derived, dies in dusty mode). `refraction` now = fiber
  visibility. **The old periodic bands were the "ladder" artifact — never reintroduce a
  constant-frequency comb.**
- **Two-mode light** (`u_modeMix` state uniform, NOT a variant param): 0 = holographic
  white/rainbow (blue bg only), 1 = dusty warm amber (any dark scene). Driven in
  MainScreen by `max(sceneDim, showreel.dark)`; Showreel gained a delayed dark veil
  (1.6 s after photos settle) that flips the mode during idle. Dusty mode: amber
  radial palette (hot core → deep amber), dispersion/ghosts → 0, dust ×2.7 / motes
  ×2.5 gated strictly inside beam lobes (`inBeam`), beams contract ×1.45.
- **Hover = shadow casting** (`shadow` param + `u_linkDist`/`u_linkHalfAng` uniforms,
  measured in `measureBeams`): the radial field is occluded analytically — behind the
  hovered label a penumbra wedge (`pw = halfAng·(1 + (r−d)/d)`, noise-roughened edge)
  carves the light to 8%. The label itself goes near-black via CSS
  (`.nav-link:hover` color). Zone blaze tempered 1.35→0.95 and sceneDim surge
  1.25→0.75 — the old values whited out the wedge.
- **Lens ghosts** (`ghosting` param): 3–4 chromatic soft discs on the center↔cursor
  axis, gated by `pd²` and a slow noise "sometimes" gate; holographic mode only.
- **Segmented control restored** with 3 NEW variants (one concept, three readings):
  `prism`/«Призма» (crystal: thin rods, ca 0.03, ghosting 0.7), `lens`/«Объектив»
  (photographic: angleWarp 2.0, heaviest dusty cone; **new default**), `disco`/«Диско»
  (living bundles: fiberDrift 0.35, refraction 1.0, shimmer 0.8). Presets crossfade
  600 ms via `lerpParams`. Legacy presets 1–5 kept, `?fx=` only.
- **Gyroscope wind** (pointer.ts): deviceorientation β/γ (clamped ±25°, centered on
  first reading) maps to a virtual pointer from screen center; iOS 13+ permission on
  first touch; any real pointer event outranks it.
- WGSL uniform buffer grew 12 → 16 vec4s (`linkDist`, `linkHalfAng`, `p7`, `p8`);
  packing indices shifted — keep `struct U` ↔ `render()` in sync.

### Artifacts fixed round 3 — do not reintroduce

4. **"Ladders" (equal parallel lines)** — the periodic `sin(dTh·140)` band comb.
   Fixed by the non-periodic multi-frequency fiber system (see above).
5. **"Rice seeds" (hard-cut streak rectangles)** — wind-stretched mote gaussians
   clipped at Cartesian cell borders. Fixed: stretch cap `σr ≤ 0.28·cell`, border
   envelope forcing exact zero at cell edges, per-mote σ/brightness variance,
   smooth density threshold instead of `step`.
6. **Fiber subpixel moiré** — fibers thinner than a device pixel aliased into
   concentric arcs. Fixed: per-generation fade below ~2 px cell size + width floor
   `w ≥ 1.6/cellPx`.
7. **Dust "onion shell" arcs** (the round-3 hunt): TWO independent causes, both in the
   polar dust domain. (a) The parallax term `q·0.06·depth·60/(r·0.02+6)` radially
   squeezed the noise domain whenever the pointer left center → replaced with a pure
   per-layer translation (`·5.0`). (b) `nUv.y = aa·(3 + rr·0.018)` crossed the angular
   lattice periodically ALONG THE RADIUS (period ≈ 1/(|aa|·0.018) ≈ 25–50 px) — spiral
   arc bands immune to radial jitter → angular frequency is now constant (`aa·6.0`).
   Diagnosed by zeroing `dust` in isolation. **Never multiply an angular noise
   coordinate by a function of r.** Also: radial rJit strengthened with a second
   fast angular term (`vnoise(aa·6.1)·1.15`).
## Map round 4 (2026-07-16) — plan-oblique («military») projection

- **Map round 3 (baked icon splay) REJECTED** — user: "looks like we've turned buildings
  into Egyptian pyramids." He reverted it himself (commit `aadd6d2`, via Cursor). Do NOT
  bring back the splay or any icon/reverse-perspective distortion.
- **New hard requirement** (user scheme `references/perspective-guide.png`): the roof
  plan is a 2D drawing that must stay pixel-identical at every cursor position — never
  compressed, never rotated. Tilt only *reveals walls*, one or two sides at a time.
- Camera-rotation tilt inherently violates this (ortho rotation compresses the plan by
  cos θ), so the mechanism is now a **pure shear** (plan-oblique / military projection):
  camera pinned straight top-down forever, and a wrapper `shearGroup` around the GLB
  gets `x' = x + sx·y, z' = z + sz·y` per frame from the same smoothed cursor/touch
  input (deadzone 0.08 kept). Roofs lean toward the cursor; walls extrude on the far
  side (mouse up ⇒ bottom walls — matches the guide's frames).
- Why this construction: every horizontal section of ANY geometry keeps its exact plan
  shape (stacked volumes, cylinders on boxes — automatic); depth stays = height so the
  z-buffer resolves oblique occlusion exactly; zero geometry processing, zero shader
  patches. The leftover `patchMaterial`/`uRev*`/`REVERSE_K` machinery was deleted
  (resurrect from git history only with an explicit user ask).
- Dials: `MAX_SHEAR = 0.55` (≈ tan of the old 0.5 rad max tilt — same reveal magnitude);
  `?ob=<k>` URL override. **STALE — this value was later raised to 1.6 outside this log,
  and Map round 5 set it to 0.8. Read the constant, not this line.**
- Verified 2026-07-16 headless on :5299: rest = flat plan; mouse up/left/corner match
  `perspective-guide.png` directions; roof outlines identical across all frames
  (translate only); no frustum clipping at full shear; `npm run build` passes.

## Feedback round 4 (2026-07-20) — «Прорезь»: the logo as light

Lead designer's new direction: the hero light must **stay recognizable as the Кресты
emblem** ("a logo made of light", not an abstract ray burst) — light pushed from behind
toward the viewer through a **cross-shaped slit cut in cloth**. Refs: `references/sign.svg`
(the emblem — a cluster of thin radiating strokes = the slits), `references/main screen.png`
(the target mood), `scheme.jpg` (cursor distortion, reused).

- **New default variant `prorez`/«Прорезь»** + kept `prism`/«Призма»; **`lens`/«Объектив»
  and `disco`/«Диско» KILLED** from the switcher (`SWITCHER_COUNT = 2`; still `?fx=lens`
  /`?fx=disco` as data). User verdict from round 3 = keep Призма only.
- **First texture in the ray field.** `sign.svg` copied to `src/assets/`, imported `?raw`,
  rasterized in `MainScreen.rasterizeSign()` to a 640² canvas (opaque black bg, white
  emblem → sample `.r` as antialiased slit coverage), uploaded via new
  `RayFieldRenderer.setSignMask()`. WebGL2 = `TEXTURE_2D` unit 0 (`UNPACK_FLIP_Y` so top
  row → v=0, matching `p.y` down); WebGPU = `copyExternalImageToTexture({flipY:true})` +
  `@binding(1)` texture / `@binding(2)` sampler, bind group rebuilt on upload (a 1×1
  placeholder keeps it valid before the mask loads). **Never-blank:** `u_hasMask=0` →
  «Прорезь» falls back to the procedural cross glyph.
- **Slit path** (`slitLight()` in both twins, gated by `u_slitMix`; `col = mix(field,
  slit, slitMix)`): emblem centered at convergence, `uv = 0.5 + p/signSize`. Crisp mask
  `core` (readable logo) + spiral-tap `bloom` halo + **radial god-rays** (march the mask
  from fragment back to the light-centre uv, per-step decay — light streaming out through
  the slits, the Z-throw). Cursor shifts the light-centre uv (`par = q·0.06·parallax`,
  **vector form, no atan2**) and `lean` brightens the cursor side (vector dot). Prism =
  per-channel chromatic scale about the centre (`ca`). Rays fade out near the very centre
  (`rayGate = smoothstep(0.02,0.17,|uv−0.5|)`) so the emblem's own strokes read there
  instead of a blown-white blob. God-ray sample count rides the perf tier.
- New params `signSize`(440), `godrays`, `bloom`; new state `slitMix` (eased ~400 ms in
  MainScreen from the active variant). WGSL buffer grew 16 → 18 vec4s (`p8` now
  modeMix/slitMix/hasMask/signSize, new `p9` godrays/bloom) — keep `struct U` ↔ `render()`
  packing in sync.
- Hover in «Прорезь» = the light gently leans + brightens toward the hovered link
  (`hoverDir`/`hoverAmt`); no hard link shadows there.

### «Призма» cleanup (the kept variant)
- **Laser "bullet" motes REMOVED** (`moteAmount: 0`) — the center-emitted radial streaks
  that reversed direction as the cursor crossed centre were the "star-wars laser" + the
  "rave glitch/jump" the user reported. This was the cursor-crossing jump; the field is
  continuous without them. (Mote code kept for legacy `?fx=` presets.)
- **Link shadow re-anchored:** the cone now starts AT the label's outer edge
  (`behind = smoothstep(ld, ld·1.2, r)` — was `ld·0.88`, which began mid-label — the
  "starts from the middle of a link" bug) with clean soft cone edges and the noise
  "contour" removed. Strength 0.92→0.8.
- Calmer register: `shimmer` 0.45→0.28, `fiberDrift` 0.12→0.06 — "sunlight, not rave".

## Feedback round 5 (2026-07-21) — «Сияние»: the logo dissolved into light

Round-4 «Прорезь» verdict: "good first step in the right approach", but **"too logo with
some glow — I still see full SVG untouched logo plus glow. Glow is good btw."** The
wish-image (soft wide white beams, blown bright centre): the logo must become **zoom-blur
trails** — strokes elongated into light beams from the background, **no sharp SVG paths
visible**. Built as a 3rd variant `siyanie`/«Сияние», now the default
(`SWITCHER_COUNT = 3`: Сияние · Прорезь · Призма).

- **`dissolve` param (0 crisp «Прорезь» → 1 «Сияние»)**, packed in the free `p9.z` slot
  (no buffer growth). Inside `slitLight`: crisp core ×(1−dissolve) (the sharp paths
  vanish), `rayGate → mix(gate, 1, dissolve)` (the dissolved register WANTS the blown
  featureless core the gate was protecting «Прорезь» from), god-ray decay
  `mix(0.93, 0.968, dissolve)` (longer trails), bloom radius ×(1+1.2·dissolve) (wider
  halo — note the tap-weight normalizer must scale with the radius or outer taps go
  NEGATIVE), and a radial melt `rays ×= exp(−r/(falloffL·1.15))` so trails fade at the
  screen edges. `dissolve` is in `NUMERIC_KEYS`, so the switcher crossfade morphs
  crisp↔dissolved.
- **"Ladders" ROOT-CAUSED and fixed — do not reintroduce:** two discrete-sampling
  artifacts in `slitLight`. (a) The god-ray march took N uniform steps, each depositing a
  full offset copy of the hard mask edge → stair-step banding; (b) the 12 fixed spiral
  bloom taps → offset "ghost rectangle" copies of the emblem bars (user screenshot over
  the dark map). Fix: **per-pixel jitter** — dither the march start (`s = uv0 − duv·jit`)
  and rotate the bloom spiral (`ang += jit·2π`), `jit = hash21(fragPx)`. **Rule: never
  march/tap a texture at fixed offsets without per-pixel jitter.** Jitter is STATIC (no
  time term) — temporal jitter would crawl/sparkle; the animated film grain covers the
  fixed noise. Benefits «Прорезь» equally (verified on the same dark-map crop).
- **Appearance burst** replaces the round-4 scale-in (user: "funny, the speed and the
  lack of drama... should be dramatic, hard and epic, like light smashes from nothing
  like an explosion"). CPU-side only, in `MainScreen.update`: `burstT` resets when a slit
  variant activates (load + switch); `signSize ×= 0.25+0.75·(1−e^(−t/0.09))` (violent
  expansion, ~0.25 s) under a flash `k = e^(−t/0.15)`: godrays ×(1+4k), bloom ×(1+3k),
  core ×(1+2.5k). No new uniforms. dt is clamped so a hidden tab can't skip the flash.
- Verified (WebGPU + WebGL2 identical): rest vs wish-image — soft wide beams, blown core,
  zero sharp paths in the centre crop; dark-map hover crop — ladders gone in both slit
  variants; burst frames at 80/200/600 ms; corner parallax + prism fringing intact.

### Noise follow-up (same day) — anisotropic pre-filter, sharpness kept
User: the jitter's stipple looked like "problems with my device GPU" (worst over the dark
scene, where modeMix boosts the light). Root cause: dithering reshapes error, it doesn't
remove it — ~12 bloom taps + ≤32 march steps against a HARD-edged binary mask is a
high-variance estimator; the jitter converted the coherent banding into that variance as
per-pixel noise. First fix (isotropic 6 px pre-blur fed to march + bloom) killed the
noise but ALSO the look — user: razor-blade rays became "diet yoghurt, no charisma".
**The noise and the razor edges live in different directions:** the march integrates the
mask RADIALLY (noise = tap-to-tap jumps along the ray), while the loved sharp edges are
TANGENTIAL (the trail sides). Final fix: **three-channel mask** in `rasterizeSign` —
R = crisp emblem («Прорезь» core), G = round blur 6 px (bloom halo only), **B = radial
smear** (13 copies scaled 0.965–1.035 about the centre, averaged, + 1.5 px blur floor for
the near-centre region where scale steps barely move) → `signMaskRay()` (.b) feeds the
god-ray march. The smear length grows with radius exactly like the march step does, so
the smoothing matches the sampling gap everywhere. Jitter kept. **Rules: dithered sparse
sampling needs a pre-filtered source, and the pre-filter must be ALIGNED with the
integration direction** — a round blur trades noise for the look. Remaining grain = the
intentional `grain` param. Console `contentscript.js` warnings the user saw alongside =
a browser extension (wallet), not the app.

### HOW TO RESTORE the noisy "razor" version (user liked it; kept as an option)
The user's verdict: the pre-filtered version WINS, but the noisy pre-fix render
("razor-blade rays, harsh, charismatic" + heavy stipple) must stay restorable with 100%
accuracy. Two ways, pick either:

1. **Two-line flip on the living codebase** (the ONLY rendering difference): in BOTH
   shader twins make the two filtered samplers read the crisp channel —
   - `src/gpu/webgl2/rayField.frag.glsl`: in `signMaskSoft()` change
     `return texture(u_signMask, uv).g;` → `.r`; in `signMaskRay()` change
     `return texture(u_signMask, uv).b;` → `.r`.
   - `src/gpu/webgpu/rayField.wgsl`: in `signMaskSoft()` change
     `return textureSampleLevel(signMaskTex, signSamp, uv, 0.0).g;` → `.r`; in
     `signMaskRay()` the same for `.b` → `.r`.
   Touch nothing else — the jitter, rasterizer, params are identical in both versions;
   the G/B channels simply go unused. (Caveat: exact only while `slitLight`'s sampling
   structure survives; for bit-exactness after future refactors use option 2.)
2. **Frozen branch `light-v5-prefix`** (commit `34f96c0`) — the complete round-5 state
   with the flip already applied, bit-exact forever. Do NOT delete this branch: its base
   is a stash-snapshot commit reachable only through it. To run it side-by-side:
   `git worktree add ../kresti-prefix light-v5-prefix`, symlink `node_modules` into the
   worktree, copy the GITIGNORED `public/resources` photos from the main checkout (only
   fonts/`scene.glb` are committed; `sign.svg` IS committed on that branch), then
   `npm run dev -- --port 5300 --strictPort` inside the worktree.

## Feedback round 6 (2026-07-23) — «Слайдер»: the star photo slider

Second hero feature: after 4.2 s idle a photo slider takes over. Each slide =
one scene from two angles: zenith shot (looking up) full-bleed behind, nadir
shot (looking down) inside the 4-pointed star mask (`src/assets/star.svg` —
points aligned with the beam bisectors). Real client photos replaced ALL
placeholders (`public/resources/main-*.png`, committed; pairs by filename,
slides 1+3 share the sky `main-1b+3b.png`). Figma: node 252:39.

- **4th switcher tab `slider`/«Слайдер»** (`SWITCHER_COUNT = 4`) — the
  «Сияние» light + the star slider as its idle behavior. Tabs 1–3 keep the
  old crossfade showreel (re-pointed at `main-1a..4a`); exactly one idle
  show is armed at a time (`armIdleShow`).
- **«Проектор» choreography** (user-chosen over constant-glow / light-off):
  the light throws each slide — flash (`k = e^(−t/0.15)`: godrays ×(1+3.5k),
  bloom ×(1+2.5k), core ×(1+2k)) synced with the star scaling out of the
  light centre (0.5 s expo-out; collapse 0.25 s ease-in; hold 6 s) — then
  retreats to an ember (core ×0.08, bloom ×0.3, godrays ×0.45, dust ×0.4 at
  mix 1). CPU-side param modulation in MainScreen.update, like converge/the
  burst: ZERO shader changes, twins untouched.
- **Star geometry** (Figma slider01): 1000×1000 centred at (784, 400) ≠ the
  light centre (760, 420); `transform-origin` is the light centre in
  star-local coords (476, 520) — grows out of the light, lands on the mockup.
  The star lives in `.star-stage`, a stage-transform mirror at z:1 (below
  the canvas); the headline (Chromius Medium 64, w 692, x 784, y 294) lives
  in the REAL stage (z:4) so the screen-blended light never washes the text.
- Photos at natural exposure + flat 0.2 black overlay (user dial; the Figma
  mockup used 0.41 — the fallback if the sky slide fights the white
  headline). The slider does NOT drive modeMix — white/holographic light
  over the photos; dusty amber stays hover/showreel-only. Links dim to 0.5.
- Wake (any pointer/key) = FULL exit (~0.7 s) back to flat blue + default
  light; nothing persists. Cursor-wind, hover shadows etc. untouched.
- Review notes (deferred minors, fix only if they annoy): ~~a flash tail can
  bleed ~300 ms onto another variant if the tab is switched within 1.2 s of
  a slide throw~~ **FIXED (round 6.1):** flash gated to the slider variant;
  permanent `will-change: transform` on `.star-wrap`; StarSlider timer-id
  array grows trivially during one idle session.

### Round 6.1 (2026-07-23, same day) — occlusion instead of ember + airy curves

User feedback on round 6: (1) don't dim the light — put it BEHIND the star,
ideally interfering with the star's contour "like real light beams behind a
physical surface"; (2) the animation "punches user in face: rough, edgy,
rapid" → wanted "smooth, clean, airy and rich".

- **Ember REMOVED — the star now occludes the full-intensity light.** The ray
  canvas gets a two-layer CSS mask while the slider shows: layer 1 =
  `linear-gradient(#fff,#fff)` (keep everything), layer 2 = a feathered star
  texture, combined with `mask-composite: exclude` (legacy twin
  `-webkit-mask-composite: xor`; set the standard prop LAST — the spellings
  can alias, and the legacy keywords differ). Light vanishes inside the star,
  survives untouched outside; the 10 px feather (blur baked into a 1280²
  canvas texture, star 1000² centered) turns the contour into a lit edge —
  beams visibly break around the star. Built in
  `StarSlider.buildOcclusionMask()`; on failure the light simply stays
  unoccluded (never blank).
- **Mask animates in lockstep with the star.** `setMask(k, dur, curve)` sets
  `mask-position`/`mask-size` (viewport px, computed from the same
  light-centre origin math as the CSS `transform-origin`) with a transition
  of the SAME duration+curve as the star's transform. Both longhands are
  linear in the scale factor k, so equal timing functions keep the cutout
  glued to the star through the whole throw/recede. A reflow between the
  initial and target values makes the transition reliable. Durations/curves
  are declared once in StarSlider.ts (STAR_IN/OUT_MS, CURVE_IN/OUT) and
  mirrored in the `.star-wrap` CSS — keep them in sync.
- **Curves rework (the "punch" → "airy"):** throw 0.5 s expo-out from scale
  0.05 → **1.2 s `cubic-bezier(0.22,0.9,0.32,1)` from scale 0.35**; recede
  0.25 s ease-in → 0.6 s soft in-out `cubic-bezier(0.6,0,0.35,1)`; bg
  crossfade 0.8 → 1.4 s; slider fade 0.7 → 1.1 s; headline 0.3 s fade →
  0.7 s fade + 16 px upward drift (0.9 s), entering at 660 ms while the star
  is still landing; hold 6 → 7 s (measured from throw start); swap gap
  60 → 120 ms.
- **Flash softened to a breath and gated:** τ 0.15 → 0.3 s, godrays
  ×(1+1.4k) / bloom ×(1+1.0k) / core ×(1+0.7k) (was 3.5/2.5/2.0), window
  1.2 → 2 s, and the whole block now requires the slider variant to be
  active — the tab-switch flash-tail bleed from the round-6 review is gone.
- On wake the mask recedes with the star (0.6 s) and is dropped ~100 ms
  later (`maskTimer`, cancelled if the slider re-activates) — the light
  closes over the retreating star instead of popping.
- Verified headlessly on BOTH backends (the mask is CSS, backend-agnostic):
  star photo fully clean of light, full-strength rays breaking around all
  four contour points over sky and atrium slides, smooth wake, no errors.

### Round 6.2 (2026-07-23, later) — occlusion KILLED, dissolve-in-air slide change

User verdict on 6.1: the occlusion "looks just weird and cheap", only reads
while the star is small; the throw/recede still "sketchy and childish…
bounce… good for a video game, not a premium website"; and slide changes
must never scale down.

- **Occlusion REMOVED entirely** (all canvas-mask machinery deleted from
  StarSlider; constructor back to `(screenEl, stageEl)`). The light simply
  shines over the whole composition, zero interaction with the star — the
  user's explicit call ("let the light just shine"). Do not resurrect the
  mask without a new ask; if it ever comes back, the round-6.1 entry above
  documents the working recipe.
- **Slide change = dissolve, never scale-down.** TWO double-buffered star
  wraps: the outgoing star gets `.dissolve` — opacity → 0 (1 s), a slight
  FURTHER scale-up 1 → 1.06 (1.2 s), blur 0 → 14 px — smoke in the air; the
  next star blooms up behind it starting 0.6 s in (NEXT_DELAY_MS), fully
  overlapping. The dissolved wrap snaps back to the hidden base state
  (base has NO transition) ~1.3 s later for reuse. Wake-up exits the same
  way: the front star dissolves while the layer fades (dedicated
  `cleanupTimer`, cancelled on re-activate).
- **Bloom made "adult":** 1.6 s, `cubic-bezier(0.3, 0, 0.12, 1)` (gentle
  entry, one long decelerating settle, mathematically zero overshoot), from
  scale 0.55, opacity 0.9 s ease-out. Headline: base state transitionless;
  `.show` rises 16 px on the star's curve (0.8/1.1 s); new `.out` state
  dissolves it upward like vapor (−14 px, 0.55/0.75 s). `will-change`
  dropped (a 6.1-review minor).
- Timings: hold 7 s from throw start; headline enters at 0.9 s; flash
  breath unchanged (×1.4/×1.0/×0.7 @ τ 0.3 s, slider-tab-gated).
- Verified headlessly: bloom/dissolve/second-bloom/wake frames all correct,
  old star reads as a blurred ghost melting into the sky, no scale-down
  anywhere, no page errors.

### Round 6.3 (2026-07-23, evening) — star above the light + dissolve/bg fixes

Three user corrections on 6.2:

- **The light goes BELOW the star** (6.2's "light on top" was wrong): the
  star now lives on its own `.star-layer` — same z-index (3) as the ray
  canvas but appended AFTER it in the DOM, so it paints above. Layering
  bottom→top: bg photos (z:1) → 20% overlay → screen-blended light (z:3) →
  the star (z:3, later sibling) → stage with nav + headline (z:4). The
  light shines over the photos and simply disappears behind the star — the
  "physical surface" read via plain stacking, no masks.
- **Dissolve blurs the whole SHAPE, not the photo inside the star:** CSS
  filters apply before masking on the same element, so a blur on the masked
  element softens only the interior while the mask keeps a razor contour.
  Fix: the star mask moved onto the `img`, the dissolve `filter: blur()`
  stays on the parent `.star-wrap` — filtering the mask's parent blurs the
  already-masked result, so the contour melts too. **Rule: to blur a masked
  shape's silhouette, filter an ancestor of the masked element.**
- **Bg change flicker at the fade tail:** two causes. (a) A symmetric
  crossfade (old fades out while new fades in) drops combined coverage
  below 1 mid-fade and the blue backdrop bleeds through, worst at the tail;
  (b) slides 1 and 3 share the sky file, and "crossfading" to the identical
  src caused a pointless dip. Fix: the incoming photo fades in ON TOP
  (inline z-index 2 vs 1) while the outgoing stays fully opaque underneath,
  hidden only ~100 ms after being completely covered; same-src changes are
  skipped entirely (`bgSrc` guard). **Rule: never symmetric-crossfade two
  stacked full-bleed images over a visible backdrop — fade the new one in
  on top.**
- Verified headlessly: settled slides show a clean star with beams
  disappearing behind its contour; the dissolve reads as a soft-edged ghost
  of the whole star; slide-2 bg in place with no artifacts; clean wake.

## Feedback round 7 (2026-07-27) — centered light, engraved-echo hover, slow rotation, star killed

Four changes off the new Figma frame (node 257:116), verified on both backends
(centering at 1440×800 AND 1100×800, ~24° rotation over 38 s, per-word opacity
cascade, hover echo computed styles):

- **Light + nav re-centered on the EXACT screen center.** `CENTER_X/Y` dropped
  the old +40/+20 Figma offset → `STAGE_W/2, STAGE_H/2` (720, 400). The stage is
  scale-to-fit centered, so the convergence point is the exact pixel center at
  any viewport. `NAV_LINKS` re-anchored to center + Figma offsets, sitting on the
  ±45° diagonals so the measured bisector beams read as an upright cross.
- **Slow continuous rotation of the whole light cross.** New time-driven STATE
  field `signRot` (radians) — NOT a param (no preset/lerp involvement), threaded
  through `RayFieldState` → WebGL2 `u_signRot` uniform / WebGPU free `p9.w` slot
  (no buffer growth). Dial `ROT_SPEED = 0.0105 rad/s` (~0.6°/s, quarter-turn
  ≈ 2.5 min) in MainScreen drives BOTH the slit-mask sampling and the procedural
  `beamAngles` base (it REPLACED the old ±8°/45 s sinusoidal sway; per-beam
  wander kept). **Rule: to rotate the slit light, rotate the mask sample vectors
  `p` AND the parallax vector `par` by the same `R = rot2(signRot)`, but NEVER
  `q`/lean — the pattern turns rigidly while the cursor still displaces the light
  along the true screen direction. `rayGate` is radial ⇒ untouched.** Confirmed
  coexisting with cursor wind/parallax (corner-lean over a rotated cross reads
  clean, no seam) and with the idle showreel/dusty mode.
- **Nav hover = engraved echo, no more black label.** The `color:#070a10` dark
  silhouette rule is gone; the label stays white and gains a soft breathing
  `text-shadow` shine (`@keyframes nav-shine`). A `.nav-rot::after` copy
  (`content: attr(data-label)`, transparent fill, 1 px white `-webkit-text-stroke`)
  lives INSIDE the rotated span, hidden at rest, sliding to `translate(3px,3px)`
  at opacity 0.9 on hover — offset along the glyph axis, echoing the logo's
  doubled contour. The gallery-dark hover scene + shader light surge are
  unchanged (still fire). **The stroke was replaced in round 9.1 — see below.**
- **«Слайдер» star KILLED — one full-bleed photo per slide.** `StarSlider.ts` →
  `PhotoSlider.ts` (`.star-*` → `.photo-*`); deleted the star layer/stage/wraps,
  the SVG mask data-URI, `src/assets/star.svg`, and the `layout(scale)` stage
  mirror. `SLIDER_SLIDES` now `{ photo, headline }` = 4 distinct nadir shots
  (`main-1a..4a`). Idle delay `4200 → 7000 ms`. Kept verbatim: the bg fade-over
  (incoming on top, never symmetric), 20% overlay, mix/rAF, `slider-on` nav dim,
  full exit on wake, and the projector-breath flash in MainScreen (`onFlash`).
- **Headline → left column + word-by-word reveal.** `.slider-headline` moved to
  the Figma left box (x 40, y 304, w 692), `text-align:left`, 56 px / lh 1.15
  (was centered 64 px). Reveal: `PhotoSlider.setHeadline` splits the text into
  `.word` inline-block spans, each with `transition-delay = i × 80 ms`; base is
  hidden + `blur(6px)` + `translateY(14px)` (no transition = instant reset),
  `.show` on the parent rises each word to sharp over 0.7 s on the airy curve
  `cubic-bezier(0.3,0,0.12,1)`. Exit `.out` = the whole block melts upward as one
  (`.out .word` freezes visible, no stagger). Pure CSS spans — no GSAP, no deps.

## Map round 5 (2026-07-28) — new GLB, fitted framing, sky-blue glass

User brief: scene overflows the window (scale it down, but keep good framing); halve the
oblique stretching ("buildings look like skyscrapers"); make the stretch react fast to
small cursor moves but stay limited; swap in `map.glb`; sky-blue semi-transparent /
frosted glass; a three-light setup; dark blue `#060910` page background.

**Geometry.** `scene.glb` (948 tris) → **`map.glb`** (16,903 tris, 1 node / 1 mesh /
2 primitives, has NORMAL). Raw bounds X 22.17 · Y **2.80** · Z 19.45 → after the
span-300 normalize: X 300, Y 37.9, **Z 263**. The two primitives (`FrontColor.001`,
`Color_M00`) are SketchUp colour groups that both span the whole footprint — they are
NOT ground-vs-buildings, so there is no base plate to split off. `scene.glb` deleted.

**Framing root cause.** `resize()` built `halfH = MODEL_SPAN * 0.62 / ZOOM = 124`, i.e. a
248-unit-tall frustum for a **263-unit-deep** model — clipped top and bottom before shear
even applied. It also derived height only, so narrow windows clipped horizontally too.
Replaced with a real fit against the model's **measured** normalized half-extents plus
worst-case shear reach, satisfying BOTH axes:
`halfH = max(halfZ + reach, (halfX + reach)/aspect) · FIT_MARGIN`, `reach = |maxShear|·topY`.
`ZOOM` and the 0.62 magic number are gone; `FIT_MARGIN = 1.06`, `?fit=<k>` override. The
fit tracks `maxShear`, so `?ob=` widens the frustum to match. Extents are captured in the
loader callback (seeded with defaults so an early `resize()` is still sane) and
`this.resize()` is called once the model lands.

**Stretch magnitude.** `MAX_SHEAR` **1.6 → 0.8** (exactly half, per the brief). At 1.6 the
walls threw 60.6 units across a 300-wide plan — 20% of the model width, and verified at
`?ob=1.6` the cross blocks smear into each other and stop reading as crosses.

**Stretch response.** Was linear in cursor distance with a 0.25 s smoothing constant.
Now a saturating exponential, normalized so the screen edge still lands on exactly 1.0:
`resp = (1 − e^(−GAIN·raw)) / (1 − e^(−GAIN))`, `RESPONSE_GAIN = 3.5`, plus
`SMOOTH_TAU 0.25 → 0.12`. Measured: cursor magnitude 0.2 → **37.8%** of full shear
(was 13%), 0.5 → 82.3% (was 45.7%); monotonic, never exceeds the cap, deadzone 0.08 kept.

**Materials — two traps, both verified in `three/build/three.module.js` (r170):**

1. **`transmission` replaces the diffuse lobe, so `color` does nothing at
   `transmission: 1`.** Glass tint has to come from `attenuationColor` with
   `thickness`/`attenuationDistance`. A first pass at `thickness 8 / distance 40`
   (`e^−0.2 ≈ 0.82`) tinted essentially nothing.
2. **Top-down is the worst angle for specular glass.** Fresnel bottoms out at normal
   incidence (~2.8% at `ior 1.4`), and a horizontal roof under this camera reflects the
   environment *straight up*. So roofs get: no diffuse, negligible specular, and
   refraction of a near-black ground → the whole plan renders nearly black. The first
   attempt looked grey only because `RoomEnvironment` is a white studio box and every
   roof was mirroring its white ceiling.

   → `RoomEnvironment` replaced by a **code-built equirect sky gradient**
   (`buildSkyGradient()`: zenith `#b6e6ff` → horizon `#1d4a70` → nadir `#060910`, 16×256
   canvas, PMREM-baked once). The zenith colour IS the roof colour — that is the main
   dial for the map's overall tone. No HDR asset, no new dependency.
   → `transmission` set to **0.7**, not 1.0: enough diffuse survives for the sky blue and
   the light rig to land on, while the refraction still reads. Raise toward 1 for more
   glass, lower for more solid. Rest: `color 0x8fd0f5`, `roughness 0.25` (frosting —
   blurs through the transmission target's mipmaps), `thickness 20`,
   `attenuationColor 0x4a9fd8`, `attenuationDistance 80`, `ior 1.4`, `envMapIntensity 1.2`.
   → `side: FrontSide` although the GLB declares `doubleSided`: r170 renders an EXTRA
   BackSide pass into the transmission target for double-sided transmissive materials.
   If inverted normals ever punch holes, fall back to `DoubleSide` and accept the cost.
   → `transparent` stays **false** — `transmission > 0` already routes the mesh into
   three's dedicated transmissive queue.

**Background is load-bearing, not cosmetic.** `renderTransmissionPass` clears its target
to **white-0.5 whenever `clearAlpha < 1`**. The renderer was `alpha: true` +
`setClearColor(0x000000, 0)`, which would make the glass refract a milky void. Now
`setClearColor(BG, 1)` + `scene.background = BG` (`#060910`), matched by
`concept.css #screen-concept`. The transition's white flash covers the swap from the blue
main screen, so the colour jump is invisible.

**Ground plate.** Only `opaqueObjects` are drawn into the transmission target —
transmissive meshes are invisible to each other, so glass over a flat backdrop refracts
nothing and reads dead. Added a static unlit plane (`GROUND_ON`, `MODEL_SPAN × 5`,
y = −0.5) carrying a code-built radial gradient (`#1b3552` → `#060910`); a flat colour
would refract indistinguishably from the background. Unlit (`MeshBasicMaterial`) so the
key light can't burn a hotspot into it; outside `shearGroup`, so it never shears and
never touches the roof plan.

**Lights** — world-fixed on the scene, NOT on `shearGroup` (user's choice): revealed walls
turn into and out of the key as the plan leans. Key `0xffffff` 2.6 at (−220, 320, −180);
fill `0x9ec9ff` 1.6 at (240, 130, 170); rim `0xd8ecff` 1.8 at (40, 60, 300).
`ACESFilmicToneMapping`. Screen mapping under this camera: **+X = right, −Z = up**.
Note three recomputes `normalMatrix` as the inverse-transpose of the modelView matrix
every frame, so **shear-transformed normals are already correct** — no manual fix needed
despite the shear being non-orthogonal.

**Deleted:** `splitByHorizontal()`, `paintHeightGradient()`, `ROOF_LOW/HIGH`,
`WALL_LOW/HIGH`, `ZOOM` (~65 lines). Their only job was faking shading with vertex
colours; real lights do it now, and dropping the split also removes a `toNonIndexed()`
expansion of a 16.9k-tri mesh at load.

**Perf note:** r170 has **no `transmissionResolutionScale`** — the transmission target is
full-viewport with `samples: 4` and `generateMipmaps: true`, every frame. The only lever
is `renderer.setPixelRatio`, already tiered via `getPerfTier().mapPixelRatio`.

Verified headless at 1440×800, 1100×800 and 900×900 (the square aspect the old
height-only fit got wrong): full plan inside frame at rest and at all four corner cursor
positions, both cross blocks legibly cross-shaped, glass refracting dark blue (not the
white-0.5 trap), no inverted-normal holes, `?ob=1.6` reproducing the old over-stretch.
`npm run build` clean; interact smoke test clean.

### Round 5.1 (2026-07-28, same day) — three bugs behind "grainy, dirty, not glass"

User verdict on round 5: holes in some roofs; "grainy, dirty, dark and not even close to
transparency or glass — just blue bricks". Three separate causes, all found and fixed:

1. **Roof holes = the `side: FrontSide` override, not the model.** Analysing the GLB
   (`weld positions → directed-edge census`) gives, for primitive 0: **1537 down-facing vs
   1245 up-facing triangles** — a closed model seen from above should be roughly balanced,
   so a large set of roof faces are wound facing *down*. Plus 221 flipped-winding edges,
   126 boundary edges and 349 non-manifold edges across the two primitives, and 41
   degenerate triangles. Under `FrontSide` all of those back-face cull and open holes
   straight into the interiors. **The GLB declares `doubleSided: true` for a reason —
   honour it.** Now `side: DoubleSide`; the extra BackSide pass in the transmission stage
   is the price. Do NOT "optimize" this back to FrontSide.
2. **`thickness` is multiplied by the model's WORLD SCALE.** three builds the volume
   transmission ray as `normalize(refract(…)) · thickness · modelScale`, where
   `modelScale` is the length of the model matrix's columns. The normalize scale here is
   **×13.53**, so a nominal `thickness: 10` became an optical path of ~135 against an
   `attenuationDistance` of 55 → attenuation `exp(−(−ln(attenuationColor)/d)·135)` ≈
   **(0.002, 0.10, 0.52)**, i.e. dark navy. *This*, not the colour choices, is why every
   early pass came out dark and lifeless. Fixed by `glass.thickness = thickness / scale`
   in the loader callback, so `thickness` and `attenuationDistance` share one unit system.
   **Rule: any `MeshPhysicalMaterial.thickness` on a scaled model must divide the scale
   back out, or attenuation is silently wrong by that factor.**
3. **The "grain/dirt" was not the 3D render.** `#grain` is a global fixed overlay div in
   `index.html` (opacity 0.07, `mix-blend-mode: overlay`) tuned for the main screen's
   bright blue; over the map's large flat surfaces it reads as dirt. Suppressed with
   `#screen-concept:not(.hidden) ~ #grain { opacity: 0 }` — pure CSS, no JS coupling,
   relies on `#grain` being a later sibling of `#screen-concept`.

**Background direction reopened.** Confirmed by construction: *glass can only read as
glass if something brighter sits behind it*. Transmission shows the backdrop, so over
near-black a transmissive building is just a dark shape no matter how the material is
tuned — the user's instinct that "dark background is a bad idea" is correct. Look presets
added (`?look=<id>`, `LOOKS` in ConceptScreen.ts) so directions can be compared live:
- `sky` (**new default**) — brand `#56b7e6`; most genuinely glassy, buildings read as
  translucent volumes; weakness: low contrast at rest, the flat plan gets washy.
- `daylight` — pale `#dfeaf2`; crispest and most legible, but the blue reads as a solid
  rather than glass.
- `dark` — the rejected `#060910`, kept for comparison. Much cleaner after fixes 1–3, but
  still reads as solid mass; retained only as evidence, not a candidate.

## Map round 6 (2026-07-28) — cut-crystal look, three comparable variants

User verdict on round 5.1: *"the materials and light flatten the render, we can't see the
geometry of the buildings, nor can we see through them… a flat blue blob on a light blue
background. I want the geometry details distinctively recognizable and the model to look
rich and sexy. Not risking the performance."* Reference supplied: cut-crystal glass icons
— near-white field, blown white speculars, crisp bevel highlights, X-shaped glints.
User asked for three implementations behind a segmented control to compare.

### Three measured causes of the flatness

1. **The exporter smoothed normals across hard edges.** Primitive 1 is **73.9%
   smooth-shaded** (7128/9646 triangles have per-face-varying normals); primitive 0 is
   15.8%. Shading was being deliberately blurred exactly where architecture should read
   sharpest. Fixed with `toCreasedNormals(geometry, 35°)` at load — curved surfaces (apse,
   dome) stay smooth. **This was the single biggest win**; roof cornices, stepped profiles
   and detail became legible immediately.
2. **A smooth gradient environment cannot produce sharp speculars.** The reference's
   streaks come from small very bright sources. The r5 probe was a soft vertical ramp — it
   can only ever give soft shading, and no material tuning fixes that.
3. **`transmission` makes transmissive meshes invisible to each other**, which is
   structurally why buildings could not be seen through one another. Only alpha blending
   can do that.

### The environment must be HDR, and its sources must be placed for THIS camera

`buildStudioEnv()` in `mapStudio.ts` is a **`DataTexture` (`FloatType`), not a
`CanvasTexture`** — a canvas clamps at 1.0, and it is the over-1.0 overdrive that makes
speculars blow out white instead of reading as light grey.

Source placement is dictated by what an orthographic top-down camera can actually see
reflected — this is the non-obvious part:
- a **flat roof reflects exactly the zenith** (v = 0), so *every* flat roof samples one
  texel. Putting sources there brightens all roofs identically rather than glinting, so
  the zenith is left as plain base gradient;
- pitched roofs and creased detail sample a ring a few degrees off zenith → sources at
  v ≈ 0.09–0.24;
- a wall tilted by the shear (atan 0.8 ≈ 39°) reflects to just **below** the horizon →
  the strongest sources sit at v ≈ 0.53–0.58, which is what makes revealed walls flash.

Sources are rectangles ("softboxes") plus **cross-shaped emitters** — the project's own
motif (cross-shaped prison, hero screen of light through a cross grille), so the glass
throws cross glints instead of generic streaks.

Also: `roughness` was raised 0.07 → **0.13** on «Кристалл». A mirror-sharp lobe reflects
so small a solid angle that mostly-flat architecture misses the sources entirely; a little
spread is what lets surfaces catch them.

### Ground contrast is load-bearing
The plate's vignette rim went `#dce7f0` → **`#b3c9dc`**. The glass refracts this plate, so
its gradient *is* the tonal variation seen through the buildings; a flat plate makes every
volume read as one dead tone.

### The three variants (`?look=<id>`, switcher reuses `.fx-switch`)

| id | label | strategy | cost |
|---|---|---|---|
| `crystal` | «Кристалл» | physical glass only — creased normals + env speculars + Fresnel | transmission pass |
| `facet` | «Огранка» | + `UnrealBloomPass`; closest to the reference | + bloom mip chain |
| `edges` | «Грани» | alpha fill + ~7,263 fat white edge lines; genuinely see-through | **no transmission pass** |

**Bloom threshold MUST exceed 1.0.** First attempt at 0.85 bloomed the near-white field
itself (~0.95 linear) and turned the whole frame to mush. `EffectComposer`'s buffer is
`HalfFloatType`, so the environment's over-1.0 speculars survive and a threshold of
**1.15** isolates them. Strength 0.75, radius 0.45.

«Грани» uses `LineSegments2` fat lines, not `LineBasicMaterial`: WebGL clamps `linewidth`
to 1, so plain lines would be hairlines that vanish at high DPR. `LineMaterial.resolution`
must be updated in `resize()`. Its fill is deliberately deeper (`0x2f86c4` @ 0.42) — the
white lines are the drawing and need a body to read against.

### Measured performance (headless, 1440×800, 200 frames)
All three: **median 16.7 ms (60 fps, vsync-capped)**, p95 ~17.6 ms. No variant is a perf
problem at this size; the measurement is vsync-limited so real headroom is larger than it
shows. Low tier (`getPerfTier().layers === 1`) never builds the composer.

### Files
`ConceptScreen.ts` split (it had reached 505 lines vs CODE_STYLE's ~350): now 352, with
`mapLooks.ts` (variants + material, 156), `mapStudio.ts` (lights, env probe, ground,
bloom, 212) and `edgeLines.ts` (82). Overlay UI recoloured deep blue `#123a5c` — it was
white and would have vanished on the near-white field; the logo's hard-coded `fill="white"`
is overridden in CSS.

Verified: build clean; all three variants at rest and full lean; switcher changes variant
at runtime with no reload and no geometry rebuild; framing intact at 1440×800 / 1100×800 /
900×900 at full shear; interact smoke test clean.

## Map round 7 (2026-07-28) — «Грани» only, raking light, clickable buildings

Designer picked **«Грани»** out of round 6's three candidates and hand-tuned it. This round
collapses to that one look, fixes the flat roofs, and adds the map's first real interaction.

### Collapsed to one variant
«Кристалл» and «Огранка» deleted along with the segmented control, the `?look=` override,
`MAP_VARIANTS`, and the whole bloom chain (`buildBloomComposer` + four postprocessing
imports) — dead once «Огранка» went. `mapLooks.ts` now exports a single `MAP_LOOK`.

### Flat roofs — TWO causes, and the light angle was the smaller one

1. **The key sat above 50°** (`-220, 320, -180`), so light arrived nearly perpendicular to
   every roof. Moved to `(-300, 170, -230)`, ~24° elevation, and the fill cut to 0.4 (a
   strong fill washes the raking contrast straight back out).
2. **The real limiter was clipping.** The renderer ran `NoToneMapping`, so anything above
   1.0 linear clamps flat to white — and the environment probe alone contributes
   **≈ 3.85** (base luminance 3.5 × `envMapIntensity` 1.1). Every lit face was already
   past the clip point, so raising the key added brightness but **no gradation**; a test at
   intensity 7 washed the model out further instead of sculpting it. Fixed with
   **`NeutralToneMapping`** (Khronos PBR Neutral), which rolls the 1–4 range off while
   preserving hue; the key then settled at 4.2.
   **Rule: on this screen, if the model looks flat, check the tone-mapping shoulder and
   the environment's ambient level before touching light positions.**

Still true by construction (round 6 open issue): an orthographic top-down camera gives
every FLAT roof the same normal, so flat roofs are uniformly toned no matter what the rig
does. Gradation lands on pitched slopes, creased detail and sheared walls.

### Buildings separated — connected components

`map.glb` is one mesh, two primitives, no per-building nodes, so building identity has to
be *derived*: weld vertices on a quantised key, union-find triangles that share a welded
vertex, emit one geometry per component (`buildingSplit.ts`). 27 raw components → **19
buildings** after absorption.

- **Absorb by FOOTPRINT, not triangle count.** The church's four columns are finely
  modelled (44 tris each) but measure 0.02×0.12 in a 22-unit-wide model — a triangle
  threshold keeps them as separate "buildings". `MIN_FOOTPRINT_FRAC = 0.03` of the model's
  longest horizontal span folds them, and every other sliver, into the nearest real part,
  so clicking a column selects the church.
- **IDs are ordered by triangle count desc**, which follows modelling *detail*, not size —
  so `b00` is the 8,482-tri domed church, and the two 9.77×9.77 cross blocks are `b01`/`b02`.
  A first pass at `buildingsInfo.ts` assumed size order and mislabelled the right cross as
  «Церковь». The mapping is now verified against each part's measured footprint and screen
  position, both recorded in comments there.
- The two cross blocks are each welded to their courtyard and apse, so they select as one
  unit. Splitting those further needs manual sub-assignment, not connectivity.
- Replacing `map.glb` re-derives the ids and invalidates `buildingsInfo.ts`.

### Hover / click / drawer

- **Picked per frame, not per pointermove** — the shear moves geometry under a stationary
  cursor, so the hovered building changes without the pointer moving.
- `scene.updateMatrixWorld()` before raycasting: `shearGroup.matrixAutoUpdate` is `false`.
- **`LineSegments2.raycast` is stubbed out** (`edgeLines.ts`) — fat-line raycasting is
  expensive and the lines would intercept hits meant for the mesh they sit on.
- Splitting makes picking *cheaper*: three rejects on bounding sphere → box per mesh, so
  only the few under the cursor reach triangle tests. Measured **median 16.7 ms (60 fps)**,
  p95 17.4 ms with per-frame picking.
- Three body materials and two edge materials total, swapped by REFERENCE — never a
  material clone per building.
- **The drawer freezes the lean.** The lean maps raw cursor position to shear across the
  whole screen and `DEADZONE` is now 0, so without the guard the plan keeps tilting while
  you read the panel. Verified: pose unchanged while the pointer sits on the drawer, and
  the lean still responds once it closes.

Test note: an early "lean not frozen" failure was a **test** bug — the baseline screenshot
was captured before the click, so it lacked the selection highlight. Compare poses only
between captures that share the same selection state.

## Map round 8 (2026-07-28) — isometric focus view

Selecting a building now reframes the map: it zooms into the space right of the drawer,
everything else recedes, and — the main move — the camera swings to a **classic isometric
angle** (reference: an axonometric architectural render).

### The round-4 camera rule is SUSPENDED in focus mode, on purpose
Map round 4 records that camera tilt was built, rejected and replaced by the plan-oblique
shear, because rotating an ortho camera compresses the roof plan by cos θ. That rule
protects the **overview**, where the plan must stay a pixel-exact 2D drawing — verified
still true. A focused detail view of one building is not that state, so it rotates.
Agreed explicitly with the designer before implementing.

### Three things animate together
`shear → 0`, `orientation → isometric`, `frustum → framed on the building`. Shear and
camera rotation compound into a skewed mess if both are applied at once, so
`updateShear()` multiplies by `(1 − mapCam.focus)`. Side effect: the cursor lean is inert
while focused and resumes on exit — which also settles the round-7 "should it still lean"
question, since it falls out of the geometry rather than being a separate choice.

**Bonus: the isometric angle fixes the flat-roof complaint for the focused building.**
Roof plus two wall faces have different normals, so the raking key finally gives three
distinct tones. Top-down never could — every flat roof shares one normal (round-6/7 open
issue), and that remains true of the overview.

### Interpolate ORIENTATION, not azimuth/elevation
An orbit parameterisation is degenerate at 90° elevation — the up vector goes parallel to
the view axis — which is exactly where the overview sits. `mapCamera.ts` slerps between
two explicit quaternions instead, which sidesteps it entirely.

**Trap that cost a debugging round: `Object3D.lookAt()` and camera `lookAt()` use OPPOSITE
conventions.** three branches on `isCamera || isLight`: a camera points **−Z** at the
target (cameras look down their own −Z), a plain `Object3D` points **+Z** at it. The
scratch object used to build both poses was an `Object3D`, so every orientation came out
reversed — the camera sat *beneath* the model looking up, which on a near-flat model reads
as a plausible plan view rather than an obvious error. It was caught by noticing the
overview had become **mirrored** (the round tower and apse jumped from west to east).
`private tmp = new THREE.Camera()` is the fix. **Rule: never derive a camera orientation
from a plain Object3D's `lookAt`.**

### Per-building angle
`buildingSplit.ts` now computes `axisAngle` — the footprint's principal axis by PCA over
the XZ vertices (`0.5·atan2(2·Sxz, Sxx−Szz)`). A bounding box is useless here: several
blocks are rotated, so their axis-aligned box says nothing about which way they face.
View azimuth = `axisAngle + 45°` so both façades read; of the four equivalent diagonals,
the one **nearest the camera's current azimuth** wins, so consecutive clicks swing the
short way. Elevation fixed at the classic 35.26° (`atan(1/√2)`).

### Springs, not tweens
`shared/easing.ts`'s `tween` is fixed-duration and cannot be retargeted mid-flight. The
camera must redirect when a second building is clicked while still settling, so
`mapCamera.ts` uses critically-damped springs (`TAU = 0.26`) on halfH, ndcX, focus, target
and orientation. Verified: clicking B 180 ms into the swing toward A redirects with no
restart or jump.

### Framing and dimming
Off-centre framing is a **frustum offset**, not a camera move: with the target at view
origin, `centreX = −ndcX · halfW`. Overview is the same code path with `ndcX = 0`. The
drawer's width is **measured from the DOM** so the framing tracks its CSS, including the
`max-width: 86vw` clamp. `MIN_HALF_H_FRAC = 0.16` stops a small shed filling the screen.
Unselected buildings drop to `MAP_LOOK_DIMMED` (~40% presence, desaturated) with a faint
edge material — a fourth state in the existing material-swap mechanism, no new machinery.

### ID renumbering hazard — bit us once
Part ids are assigned **after** sliver absorption, so tightening `MIN_FOOTPRINT_FRAC`
renumbered everything from the first dropped part onward: `b13`+ shifted by one and the
labels silently moved (a small building opened as «Строение 13», and two entries pointed
at parts that no longer existed). Re-derive the id table whenever those thresholds change.
Now 19 buildings, `b00`–`b18`, all named.

Verified: all landmarks resolve correctly; overview un-mirrored and still leaning; lean
resumes after closing; focus framing correct at 1440×800, 1100×800 and 900×900 with the
drawer never overlapped; **median 16.7 ms (60 fps)** through transitions.

## Feedback round 8 (2026-07-30) — final copy/photos, 1:1 layout, organic dissolve

Client delivered an updated Figma (file `xtd3isfSuz1gnWxTClA2Vs`, section `366:92`), final
Russian copy, and 9 properly-framed renders. Three separate jobs: asset swap, a 1:1 layout
pass, and a rebuild of the slide handoff.

### The font `wght` axis was wrong site-wide — read this before touching Chromius

`ALS_Chromius_VF_0.8.ttf` does NOT use the standard 100–900 weight scale. Its `fvar`
declares **`wght: min=50 default=120 max=232`**, named instances Thin 50 · Light 90 ·
**Regular 120** · **Medium 150** · Bold 200 · Black 232. Every rule since round 0 asked for
`font-variation-settings: 'wght' 500`, which **clamps to 232 = Black**, and `@font-face`
advertised `font-weight: 100 900`. So all Chromius text — nav links, headline, drawer,
concept hint — has been rendering three weights too heavy for eight rounds.

It stayed invisible because the headline box was 692 px wide; at Black the glyphs are ~5%
wider, and 692 px was loose enough to wrap acceptably. Tightening the box to Figma's 580 px
is what exposed it (the headline went to 4 lines where Figma has 3).

Fixed: `@font-face { font-weight: 50 232 }`, and **plain `font-weight: 150` / `120` at the
use site with NO `font-variation-settings`** — that property overrides `font-weight` and is
exactly how the trap was set. Applies to `main.css` and `concept.css` alike.

With the axis correct, all 8 headlines wrap to Figma's line counts exactly (7 × 3 lines +
«Атмосфера сотрудничества» × 4), and the rendered box heights measure 193/258 px against
Figma's 192/256.

### Layout deltas fixed (all measured off the Figma slide frames)

Logo `top:40→32`, `314×50 → 301.44×48`. News block `271→270` wide, leading `1.2→1.35`,
Chromius **Regular** (it was inheriting ALS Hauss Next), and it gained the **date row** the
mockup always had and the code never rendered — so `NEWS_HEADLINES` became `NEWS_ITEMS
{date, text}`, date and headline fading together. Headline `left:40→32`, `w:692→580`, and
**vertically centred on y=400 rather than pinned to a top edge** — Figma's boxes are 192 px
at top 304 and 256 px at top 272, i.e. the centre is the invariant, so the exit transform
has to carry the `-50%` with it. Nav dim on `.slider-on` `0.5→0.4`. The
«КРЕСТЫ · 2026» text placeholder became the real **ARTLEBEDEV vector** (`src/assets/als-logo.svg`,
node `340:574`, includes its "2026" line) at the designer's odd offsets `right:32.49
bottom:33.7`. Nav link x/y/rot were already correct to within 0.4 px — the *slide* frames
are the authority; the base `308:228` frame has the group nudged ~7 px.

**Nav link positions and rotations were NOT changed.** Don't "fix" them against `308:228`.

### Photos: hard-bound, WebP, 3.1 MB total

`SLIDER_SLIDES` is 8 pairs and each photo is the illustration of its headline — do not
reorder or re-pair. `concept-plan.webp` is the «Концепция» hover image only (Figma
`340:594`) and must never enter the slide list. Other hover links: История → `atrium-roof`,
Аренда → `table`, Контакты → `forum` (index-aligned with `NAV_LINKS`, positional coupling).

Encoding: **centre-crop to 3:2 first, then cap the long edge at 2400**, `libwebp -quality
82` (`concept-plan` at 70 — it is a detail-dense plan shown at 0.38 opacity over near-black,
and was 2× the size of anything else). The crop is the real win, not the quality dial:
those square 2560² renders get `cover`-ed into a ~1.8-aspect viewport, so ~44% of their
height is discarded at paint time — bytes shipped to be thrown away. Any desktop viewport
is ≥1.5 aspect, so full width is always the limiting dimension and a 3:2 crop loses
nothing the browser could have shown. 9 files, 3.1 MB total, against 10 MB for the four
PNGs they replace. `skies_1.png` was byte-identical to `skies.png`.

Preload is now slides 1–2 on attach + one slide ahead per throw; eight photos eagerly was
3 MB on load for nothing, and an 8 s lead is ample for decode.

### The handoff: dissolve + dip, no flash

Round 7's twitch had two causes, and the surge was the bigger one: `onFlash()` multiplied
`godrays ×2.4 / bloom ×2.0 / core ×1.7` at τ 0.3 s, and it fired in the *empty gap*
between headlines — read as a flash terminating each slide. **Removed.** The light now
**dips** with the photos (`×(1 − 0.22·sin)` over 1.6 s, peak at ~0.78 s to match the dark
peak) — it joins the darkness beat instead of punching. `onFlash`→`onSlideStart`,
`sliderFlashT`→`slideT`.

The incoming photo now sits **underneath at opacity 1 from frame one**, so the flat blue
`#56b7e6` is structurally unreachable mid-handoff — round 7's fade-over existed to work
around exactly that bleed. Measured: **0.0% of pixels near `#56b7e6` at every sample across
a whole handoff.**

The outgoing photo is *erased* off it by an organic mask: nine `radial-gradient` holes
unioned via `mask-composite: intersect`, radii driven by nine registered `@property
<length>` customs. Plain CSS cannot interpolate gradient stops — a typed `@property` can,
which is what makes this one declarative animation with no rAF.

**First attempt read as visible circles.** Six big lobes clustered near the centre with a
22%-of-radius feather gave arcs that plainly looked like discs. Two fixes: **nine smaller
lobes spread across the whole frame** so no single arc dominates, and a **48%-of-radius
feather** (`transparent 52%`) so each front is a wide soft ramp rather than a rim.
Overlapping soft ramps read as mottled light burn. Blur is also **front-loaded** (9 px by
25%) so the photo is soft before much of it is eaten — a blurred edge cannot read as a
circle. Radii are in **`vmax`**, not px, so the front scales with the viewport instead of
running out of reach on a wide monitor. The 3% swell on the dying photo keeps the 26 px
blur from sampling transparency past the element edge.

Note `mask-composite: intersect` **multiplies** alpha across layers, so with soft ramps the
interior falls off faster than a hard-edged union would — that is a feature here, it is
what makes the burn smooth.

**One dark layer is both the transient dip and the Figma scrim.** The client asked for the
0.4 scrim (`338:37`) to arrive *late*, so a fresh photo is briefly visible unscrimmed, with
the headline timed to the scrim closing rather than to the photo. One restartable
`@keyframes` track does all of it: `0.40 → 0.62 (dip, 0.75 s) → 0.06 (clean reveal,
1.5 s) → 0.40 (settled, 2.9 s)`, per-keyframe `animation-timing-function`. Measured mean
luminance across a handoff: **98 → 79 → 151 → 109** — it sinks before it rises, and the
reveal is a ~700 ms swell, not a punch. Slide 1 of a run uses `slide-dark-first` (no dip —
there is nothing to dissolve from).

The photo also creeps **3.5% smaller across the whole 8 s dwell** (`1.035 → 1.0`, never
below 1 so `cover` cannot gap).

**Two structural traps found the hard way:**

1. **`.settling` and `.dissolving` collide on the `animation` shorthand.** The outgoing
   element still carried `.settling` from when it was incoming; at equal specificity the
   later rule won, so `photo-burn` never ran at all and the old photo **hard-cut** off
   after 1.2 s. Fix: drop `.settling` when starting `.dissolving`, *and* order the
   `.dissolving` rule after it in the stylesheet. This is also why scale and mask live on
   **different elements** — the wrapper `.bg-layer` drifts, the `<img>` dissolves.
2. **Re-entry after an interrupt left the old front photo opaque on the z:2 layer** with
   its mask stripped, covering the incoming photo. It happened to be invisible because both
   layers held the same `src`. `activate()` now clears `visible` from **both** imgs.

Timeline: `HOLD 8000` · `DISSOLVE 1500` · `HEADLINE_IN 1600` · `HEADLINE_OUT_AT 7400` ·
scrim track 2900. 8 slides × 8 s ≈ 64 s loop. `DISSOLVE_MS` must match `photo-burn` and
`HOLD_MS` must match `photo-drift` in `main.css`.

Fallback (`.dissolve-simple`): gated on `CSS.registerProperty` + `mask-composite`, plus the
low perf tier; `?ds=0` / `?ds=1` force it either way. Same timeline and same dark track,
uniform edge.

Also: one-letter Russian words are bound to the next word with U+00A0 (`bindOrphans`) —
standard Russian typesetting, and it is what reproduces the designer's rag (in «Парковые
зоны и веранды…» the «и» *fits* on line 1 at 580 px, so Figma breaking before it is a
deliberate override, not the greedy result). A bound pair reveals as one beat, which is
right anyway.

Verified: `tsc` + build clean; interact smoke test clean; both dissolve paths at **median
16.7 ms / worst 18.7 ms / zero frames over 20 ms** with the ray field live; 0% blue bleed;
brightness sinks-then-swells; mid-dissolve interrupt and re-entry leave exactly one visible
photo and keep cycling; all 8 headline rags match Figma; logo/news/headline/mark boxes
measure to Figma within a pixel.

## Feedback round 8.1 (2026-07-30) — inverted the scrim, cheaper tail, hover gate

User verdict on 8.0: *"feels laggy… the moment where text already disappeared, image is still
on the screen, it is still dark (which is bad) and then voronoi blur appears, and after that
there is some 'ugh…' lag"* — plus a precise bug report: *"the very last moment, when voronoi
blobs are 99% revealed the new image, something stops the animation for a very short
moment."*

### The dark beat was backwards — the scrim now OPENS with the text exit

8.0 dipped to 0.62, i.e. **darker than the resting 0.40**, during the window when the old
text was already gone and the dissolve had not started. Nothing was moving and the screen
was at its darkest: that is the "laggy" feeling, and it was a choreography mistake, not a
performance one.

Inverted. The scrim now opens as the text melts up, so the photo is bright *before* the
dissolve, and the dissolve is the only thing happening while it runs:

```
  0ms   scrim .40   old headline starts melting up
 416ms  scrim .10   text is gone (measured 433ms) — IN SYNC, as the user asked
 700ms  scrim .06   dissolve starts, on a fully bright photo
1900ms  scrim .06   dissolve done
3000ms  scrim .40   closed, in step with the new headline rising
```

**Nothing on the track is ever darker than the resting 0.40** (measured max 0.400) and there
is no hold or gap anywhere — three continuous phases. `slide-dark`/`slide-dark-first` →
`slide-scrim`/`slide-scrim-first`, 2900 → 3000 ms. `HEADLINE_OUT_AT_MS` is gone: the text
now leaves *at* the throw, so the throw is one event instead of two.

### The end-of-dissolve stall was real, and self-inflicted

CSS masks rasterize on the **paint thread**, so cost is (layers × element pixels) *every
frame* — and 8.0 stacked its three most expensive things at the very end: 9 gradient layers
at max radius, `blur(26px)` at its peak, and `transform: scale(1.03)` forcing a re-raster at
a different size. The final frames were the most expensive in the animation, which is
exactly where the user saw it stop. Then the element was torn down (mask + filter + a
`will-change` release) while still fully visible.

Four changes, all aimed at that peak:

- **9 lobes → 6** (spread, not clustered — the round-8.0 circle fix was the *spread* and the
  48% feather, not the count, so the look survives). −33% paint per frame.
- **Peak blur 26px → 16px**, and the 3% swell **removed**.
- **`will-change` removed** — `filter` already promotes the layer, and declaring
  `will-change: mask-image` on a property that changes every frame buys nothing and costs a
  persistent tile allocation plus a teardown.
- **An opacity tail**: `photo-burn` now fades the photo 1 → 0 over its last 30%. Opacity is
  compositor-only, so the frames where the mask is at its most complex are the frames nobody
  can see, and the element is **already invisible** when its mask and filter are dropped.
  This is the actual fix for "something stops at 99%". Do not remove it.

Measured per-200ms-bucket through the burn: median 16.7 ms in every bucket, worst 18.5 ms,
**0/61 frames over 22 ms**. (Verified on this machine only — the user's stall could not be
reproduced headless, so this is a cost reduction aimed at the reported symptom rather than a
confirmed repro. `?ds=0` forces the cheap fallback for an instant A/B on real hardware.)

### The slider must not run while a nav link is hovered

Parking the cursor on a link and holding still let the idle timer fire and the slider take
over on top of the hover scene — which also collided with `.hover-scene` being z:2 above the
slider's z:1. Fixed with `PhotoSlider.setHoverBlocked()`, driven from MainScreen's existing
`pointerenter`/`pointerleave` handlers. Activation now goes through a single `tryActivate()`
gate gated on `idleElapsed && !hoverBlocked`. Verified: parked 11 s on «Концепция» and 9.5 s
on «Аренда» → slider never activates; moved to empty space → activates; hovered a link while
running → stands down.

### Type: the rags now match Figma on all eight slides

Two corrections found by actually reading the Figma renders instead of just counting lines:

1. **Line height is a flat 64px, not 1.15.** Figma reports `leading-[1.15]` but its boxes are
   192px for 3 lines and 256px for 4 — both exactly /64. 56 × 1.15 = 64.4 drifts 0.4px per
   line (measured 193/258 vs 192/256). Now `line-height: 64px`; measured 192/192 and 256/256.
2. **Slide 2 did not match.** Figma has «Пространство / для объединения / вместо
   заключения»; greedy wrapping gives «Пространство для / …». Root cause is the same rule the
   user asked about — «для» must not be orphaned at a line end.

`bindOrphans` (1-letter words only, local to PhotoSlider) became
**`src/shared/ruTypography.ts` → `bindShortWords()`**, covering 1-letter words *and* the 2–3
letter prepositions (во, до, за, из, ко, на, об, от, по, со, без, для, изо, над, обо, под,
при, про) per Мильчин / «Ководство» §62 — apt, since the studio mark in the corner is
Артлебедев's. Particles («же», «ли», «бы») are deliberately excluded: those must not *start*
a line, which is the opposite binding direction.

Applied to the **news block too**, which the user asked about: «по демонтажу» and «для
начала» now hold together, and on the date row it keeps the day with its month («1 ноября»).
All four news items still fit the 81px / 3-line row.

**All 8 headline rags and both box heights now match Figma exactly.** The remaining seven
rags were already correct and are unchanged by the wider binding rule — only «для» and «по»
occur in the copy at all.

### News metrics re-checked (the user asked): already exact, no change needed

270px wide, `line-height: 1.35` → 27px (20 × 1.35 is exact, unlike the headline), rows
27/81/27, block 151px — matching Figma node `338:48` to the pixel. Chromius Regular = wght
120. Nothing to fix here.

## Feedback round 8.2 (2026-07-30) — voronoi killed, three paces behind a picker

> **SUPERSEDED by round 9.** All three transitions, `transitions.ts`, the `.tr-switch`
> picker, `?tr=`, the T key and `preview()` are deleted — *"all the slider options are bad
> and buggy."* Kept for the record because its **structural** findings still hold (the
> lower layer must stay opaque and cover the frame; `fill-mode: both` on any delayed
> reveal; durations belong in `animation-duration`, not keyframe percentages) and because
> its central mistake — staging the beats in sequence — is the thing round 9 exists to fix.
> **Do not rebuild «Наплыв», «Створ» or «Сдвиг».**

User verdict: *"voronoi effect doesn't do well anyways. Let's consider another smooth
transition effect. make 3 different effects with different pace. add segment control for me
to pick. kill voronoi."*

### Voronoi is DEAD — do not rebuild it

The nine-lobe `mask-composite: intersect` dissolve of rounds 8/8.1 is deleted: all nine
`@property --burnN` registrations, `photo-burn`, `photo-fade-out`, `.dissolving`/`.settling`,
`supportsOrganicDissolve()`, the `dissolve-simple` fallback and the `?ds=` override. It was
rejected on looks, and it was also the only thing on this screen that could drop frames —
CSS masks rasterize on the **paint thread**, so cost is (layers × element pixels) every
frame and never touches the compositor. Two rounds of tuning could not make it read well.
Do not reintroduce a mask-based dissolve here.

### Three transitions, chosen along the axis of PACE

`src/screens/main/transitions.ts` holds three `TransitionSpec`s; the designer picks one from
a visible segmented control or `?tr=<id>`. Default is **«Створ»**.

| id | label | pace | mechanism | layer order |
|---|---|---|---|---|
| `naplyv` | «Наплыв» | slow, 2.2 s (hold 9.5 s) | the old photo defocuses out of existence — `opacity` + `blur(22px)` + a 5% swell; the incoming only resolves focus | incoming UNDER |
| `stvor` | «Створ» | medium, 1.3 s (hold 8 s) | a cross-shaped slit opens out of the light's convergence point and the new photo floods through it | incoming OVER |
| `sdvig` | «Сдвиг» | fast, 0.8 s (hold 7 s) | the new photo pushes in along the light's diagonal while the old one falls away behind it | incoming OVER |

None uses a mask. «Створ» is one `clip-path` polygon per frame; «Сдвиг» is `opacity` +
`transform` on the incoming (compositor-only for the busiest part) plus one blur on the
outgoing. All three measured at **median 16.7 ms, worst 18.8 ms, 0 frames over 22 ms** with
the ray field live.

**«Створ» is the on-brand one** and why it is the default: the cross is centred on 50%/50%,
which *is* the light's convergence point (round 7 put both at the exact stage centre), so the
slit reads as the light itself carving the next photo in — the prison's window-grille motif
rather than a slideshow wipe. Two registered `<percentage>` customs drive one 12-point
polygon: arms shoot to the frame edge over the first half, then thicken to swallow the
corners.

### Two structural rules the specs must obey

1. **`incomingOnTop` decides the z-order, and whichever layer is UNDERNEATH must stay fully
   opaque and cover the frame for the whole handoff.** That is what keeps the flat blue
   `#56b7e6` unreachable (the invariant from round 8). So an effect may scale the lower layer
   **up**, never translate it — a translate would expose the backdrop at the trailing edge.
   «Сдвиг» translates the *incoming* photo, which is on top, precisely for this reason.
2. **The reveal is phased in CSS, not by a JS timer**: `animation-delay: var(--tr-open)` with
   `animation-fill-mode: both`. Without `both`, an `incomingOnTop` effect hard-cuts to the new
   photo for the whole opening beat, because the base `.visible` rule puts it at opacity 1
   before its animation's 0% keyframe applies. This was found by probing computed styles.

### Durations are CSS customs, not keyframe percentages

Keyframe percentages cannot be var-driven, but `animation-duration` and `animation-delay`
can. So the scrim was split into `scrim-open` / `scrim-open-first` / `scrim-close` — three
short animations sequenced by one JS timer — instead of one long track with hand-computed
stops per pace. `applyTransition()` sets `--tr-open`, `--tr-effect`, `--tr-close` and
`--tr-hold` on `.photo-slider`, and one rule set then serves any pace. `photo-drift` (the
dwell-long 3.5% scale-down) reads `--tr-hold`, so it stays in step with each spec's hold.

**The round-8.1 scrim choreography is unchanged and is independent of the mechanism** —
opens as the text melts up, reveal runs on a bright photo, closes as the new text rises,
never darker than the resting 0.40. That was the fix for "feels laggy"; only the reveal
in the middle was replaced.

### Controls

`.tr-switch` (Наплыв · Створ · Сдвиг) ships **visible** — the designer is actively choosing.
The **T** key hides it; **V** still toggles `.fx-switch` exactly as before, and `.fx-switch`
moved to `bottom: 64px` so the two stack instead of overlapping. Collapse `.tr-switch` to
`hidden` by default once a winner is picked.

Clicking a button calls `PhotoSlider.preview()`, which activates the slider and throws a
slide immediately — selecting from the control is itself pointer activity, so without it the
designer would click and then have to sit still for 7 s to see the result.

Verified: build + smoke test clean; all three transitions confirmed by computed-style probe
(opacity/clip-path/transform curves, not eyeballed pixels — the first visual pass wrongly
looked like «Сдвиг» was hard-cutting when it was simply finishing inside the screenshot
latency); segmented control switches class, active state and previews on all three; T
toggles; hover gate and the 9/9 slide pairings still hold.

## Feedback round 9 (2026-07-30) — all three transitions killed, one plain cross-fade

**Verdict on 8.2: "all the slider options are bad and buggy."** All three specs, the
`.tr-switch` picker, `transitions.ts`, `?tr=`, the T key and `PhotoSlider.preview()` are
**deleted**. One transition remains and there is nothing to select.

### The defect was SEQUENTIAL STAGING, not the effects — this is the reusable lesson

8.2 staged every transition as `openMs → effectMs → closeMs` (650 + 1300 + 1100 =
**3050 ms** on the default «Створ»), with the reveal held behind
`animation-delay: var(--tr-open)`. That put a beat in the middle where the old text had
gone, the scrim had finished opening, and **the photos had not started moving.** That gap
is what "lag in the middle" meant. It is the same defect round 8.1 had already fixed once
on the scrim track, reappearing on the photo track — and swapping in a nicer effect would
not have touched it.

**Any future transition here must overlap its beats.** A delayed reveal reads as lag no
matter how good the effect is. Round 9's beats overlap into one continuous move:

```
0.00s  ┌ heading melts up ────┐            OUT_MS 600
       ┌ scrim 0.40 → 0 ──────┐            OPEN_MS 600
0.15s       ┌ photo cross-fade ─────────┐   FADE_DELAY 150 + FADE_MS 800
0.55s       ·  midpoint — scrim fully open, photo unobstructed
0.95s       └ fade done ────────────────┘
0.95s       ┌ scrim 0 → 0.40 ──────┐        CLOSE_MS 750
            ┌ new heading rises ───────┐    0.7s + 80ms/word stagger
~1.8s  settled
6.00s  next throw                          HOLD_MS 6000
```

Pace (0.8 s fade / 6 s hold) is the designer's pick from three offered.

### The mechanism: one animated element, one compositor-only property

The incoming photo goes **UNDERNEATH** at opacity 1 from frame one; only the **outgoing**
animates, fading 1 → 0 on top of it. `.entering` is gone — the incoming needs no animation
at all, just `.visible`.

Two properties follow from that asymmetry, and they are the reason **not** to "improve"
this into a two-layer fade:

1. **`#56b7e6` is structurally unreachable.** The lower layer is opaque and covers the
   frame throughout, so the round-8 invariant is satisfied by construction rather than by
   careful keyframes. Fading BOTH layers would sum to < 1 at the midpoint and flash the
   flat blue through.
2. **No mid-transition dip or bloom**, for the same reason.

Curve `cubic-bezier(0.45, 0, 0.55, 1)` — a symmetric S. Linear reads mechanical at 0.8 s.

The `.bg-layer` wrapper / `img.bg` split **stays**: the wrapper runs `photo-drift`
(`transform`), the img runs `photo-fade` (`opacity`), and one element cannot host two
`animation` shorthands.

### Scrim: unchanged in shape, now opens fully to 0

The client's "the black overlay follows text: appears and disappears with heading" **is**
the round-8.1 choreography — it was already built. Only the depth changed: the open now
reaches **0** instead of 0.06, so the photo is completely unobstructed at the midpoint
("disappears" is the word). Nothing on this track is ever darker than the resting 0.40;
the round-8.0 dip stays dead.

`scrim-open-first` is no longer an animation — on the first throw there is no outgoing
photo to fade and the whole `.photo-slider` layer is still fading in from 0, so the scrim
has nothing to open *from*. It is a static hold at 0 until the first headline arrives.

### Durations: CSS customs, set on `#screen-main` (not on `.photo-slider`)

All six constants live in `PhotoSlider.ts` and are pushed to `--tr-out` / `--tr-open` /
`--tr-fade-delay` / `--tr-fade` / `--tr-close` / `--tr-hold` **once in the constructor**, so
there is no JS↔CSS duration mirror to keep in step (an improvement on the old
`DISSOLVE_MS`/`photo-burn` pairing). **They are set on the SCREEN element, not on the
slider root** — the headline lives in the stage (z above the light), *outside* the slider
subtree, and `.slider-headline.out` needs `--tr-out` to inherit. Setting them on
`this.root` silently drops the headline's timing to its fallback.

`SLIDE_DIP_S` in `MainScreen.ts` (1.1 s, was 1.6) mirrors this: it is a half-sine, so its
peak lands at `FADE_DELAY + FADE_MS / 2` = 550 ms — the cross-fade's midpoint. The dip
depth is unchanged (−22 % godrays / −18 % bloom) and CLAUDE.md's "no flash, it dips" rule
is untouched.

### Verified (computed-style probe, not eyeballed pixels)

- **No dead beat:** sampled both `img.bg` opacities, the overlay, the headline **and every
  `.word` span** at 40 ms across a full throw — **0 stalled samples** before 1.9 s. Note the
  first pass reported two stalls at t≈1008 ms and t≈1747 ms; both were the probe's blind
  spot, not the animation — the word spans are the only thing moving in that window
  (measured animating t=1025→1802 ms). Sample the words or the result is wrong.
- **Outgoing opacity monotonic** 1 → 0, no reversal.
- **Lower layer min opacity 1.000** across the whole move, covering the viewport, decoded —
  `#56b7e6` unreachable. Confirmed visually at the midpoint: a clean 50/50 dissolve.
- **Scrim max 0.400 / min 0.000**, never darker than resting.
- **Frames: median 16.7 ms, p95 17.4 ms, worst 17.7 ms, 0 of 841 over 22 ms** — better than
  8.2's worst of 18.8 ms, as expected when `clip-path` + `blur` collapse to one `opacity`.
- Picker gone from the DOM, T inert, V still toggles `.fx-switch` (back at `bottom: 20px`);
  hover gate holds, slider re-arms after leaving a link, exit from mid-fade is clean.

## Feedback round 9.1 (2026-07-30) — nav doubling: filled + translucent, not a stroke

User verdict on the round-7 echo: *"Now you add a stroke layer. It looks cheap. Instead
it's better to add another filled layer, but with transparency. The upper level can get
some glow."*

**Do not go back to `-webkit-text-stroke` here.** The outline copy (`color: transparent` +
1 px stroke) left the glyph interiors *hollow*, so what you actually saw through the
doubled letters was the backdrop photo, framed by a hairline. That is a graphic-editor
artifact, not light, and it is the opposite of this project's register. The replacement is
a **filled** copy at `rgba(255,255,255,0.45)` — the same doubling reads as a second pane of
glass, with weight, and it varies with what is behind it instead of being a constant
hairline.

Three details that are load-bearing:

- **`text-shadow: none` on the `::after` is required, not cosmetic.** `text-shadow`
  inherits, and `nav-shine` animates it on the parent `.nav-rot`, so without the override
  the echo inherits the breathing glow and *both* layers glow — which smears the two into
  one blob and destroys the offset. The asymmetry is the effect: lower layer flat and
  dimmer, upper layer the only one that glows.
- **Offset 3 px → 4 px.** An outline only had to clear the glyph *edge* to be legible; a
  filled copy has to clear the stroke *width* or it hides under the label it doubles.
- **Alpha 0.45, not the ~0.3 that looks right in isolation.** The nav sits close to the
  light's convergence and `u_sceneDim` surges on hover, so the backdrop behind these labels
  is the brightest part of the screen. A white fill has to clear that, and white-on-white
  has no contrast to spare. At 0.34 the doubling was verified present but barely readable.

Glow is now two-tier — a tight 6–10 px core plus an 18–34 px halo — so it survives both a
bright backdrop (the core) and a dark one (the halo), rather than depending on a hover
scene whose brightness is itself an open issue.

Verified by computed-style probe (`::after` colour/transform/`text-shadow`/stroke-width and
the parent's animated shadow, caught mid-breath) plus 2× DPR hover screenshots on
«Концепция» and «История».

## Map round 9 (2026-07-31) — the flat site plan, and geographic north

New GLB `map-w-river.glb` (supersedes `map.glb`): same buildings, plus the Neva, the two
roads and the neighbouring city blocks as zero-thickness surfaces.

### The plan does not need anti-distortion machinery — y = 0 is the shear's fixed point

The requirement was "the schematic must not distort on cursor movement". That is free, and
it is worth understanding why rather than re-solving it later. The plan-oblique shear is

    x' = x + sx·y      z' = z + sz·y

so at `y = 0` it is the identity, for every `sx`/`sz`. Flat geometry on that plane is
pointwise invariant under any lean. No second render pass, no CSS underlay, no
special-casing — the layer just has to LIE on the invariant plane.

The GLB cooperates exactly: all three flat prims sit on one plane (local z ≡ 614.914)
which, after the node's Z-up→Y-up rotation, is the model's minimum world y — and the
normalize already puts the minimum at y = 0. `groundY` is nevertheless taken from the flat
surfaces rather than from `box.min.y`, so an export whose foundations dip below grade
cannot silently drag the plan off the invariant plane.

**Verified numerically, not by eye:** two plan-only screen regions (shoreline/water, and
road/blocks) are byte-identical between cursor-centre, one corner and the opposite corner —
`max` pixel delta **0**. A control region over the west cross moves by max 152 / mean 12.6
in the same comparison, so the test is not vacuous.

The same geometry becomes a real ground surface in focus mode for free, because focus
rotates the CAMERA and no plane is invariant under that.

### The node transform must be BAKED, not discarded

The old loader dropped the GLB's node transform and used raw local geometry. That worked
only because `map.glb` happened to ship Y-up geometry. `map-w-river.glb` is a Blender Z-up
export whose entire orientation lives in the node quaternion `[0.5,−0.5,0.5,0.5]` (local
+Z → world −Y) — discarding it loads the model on its side. `onModelLoaded` now bakes
`mesh.matrixWorld` into the geometry. **Do not "simplify" this back out.**

### North: yaw 189°, baked into the same matrix

The model is authored on the site's grid, not the compass: the Neva slab lies wholly on
local −X and both roads run along local ±Y, which puts SOUTH up at yaw 0. 189° = a half
turn + 9° for the street grid. Checked two independent ways against the Yandex plan — the
shoreline bearing (~81°) and the Западный↔Восточный cross axis — which agreed to under a
degree. Dial: `MODEL_YAW_DEG`, dev override `?yaw=<deg>`.

Baked into the geometry alongside the node transform ON PURPOSE: every downstream bbox,
centroid and `BuildingPart.axisAngle` then arrives already in the final world frame, so no
consumer needs yaw bookkeeping. `MapCamera.focusOn` in particular reads `axisAngle` as a
world angle — a `root.rotation.y` instead would have silently mis-aimed every focus swing.

### Framing must be measured on the BUILDINGS alone

The plan spans ~3× the buildings' footprint (the river slab reaches local x −22178 against
the site's −4660). Measuring the whole root for `MODEL_SPAN` and `setModelExtents` shrinks
the volumes to a third of the size `MAX_SHEAR`/`FIT_MARGIN` were tuned against. The plan is
*meant* to bleed off every edge — a context map that bleeds reads as "the city continues",
one fully in frame reads as a floating island.

### Look: monochrome, tone only

Designer's call — the glass volumes stay the only colour on screen. Water `#d8e2ec`
(darkest, reads as a mass), neighbouring blocks `#e6ecf3`, roads `#ffffff` (lighter than
the field, so they read as ribbons cut through it rather than as more blocks).

Two non-obvious bits in `groundPlan.ts`:

- **`toneMapped: false` is load-bearing.** The renderer runs `NeutralToneMapping`, which
  rolls `#ffffff` down to a grey, while `MAP_BG` is written as the clear colour and is NOT
  tone mapped. Without it the plan and the field sit in two different tonal spaces and the
  ramp above is meaningless. (This also explains why `mapStudio`'s white ground plate reads
  as grey on screen — it *is* tone mapped. That is the established round-5–7 look; left
  alone deliberately.)
- **All three prims are coplanar**, so they z-fight without an explicit order.
  `polygonOffset` handles it; under the top-down ortho camera the slope term is ~0, so
  `polygonOffsetUnits` is what actually separates them.

Surface class comes from the GLTF material name (`Color_H08` water, `Color_M04` roads,
`Color_M02` blocks), not from geometry — nothing about a polygon's shape says whether it is
a river or a road. Flatness itself is geometric (`FLAT_RATIO`, height vs footprint), so a
renamed material degrades to a fallback tone instead of turning the river into a building.

### The GLB swap did NOT re-key the buildings

CLAUDE.md warns that replacing the GLB invalidates the `b00…` → `buildingsInfo.ts` mapping.
Checked rather than assumed, by running the real split pipeline over both files: 19
components each, identical triangle counts and identical footprint aspect ratios, in the
same order. **The keys are still valid.** The new export is the same building geometry with
the flat surfaces added.

### Open on this round

- Tones, and `FOCUS_FADE` (0.55), are a first pass — all in the `TONES` table.
- The neighbouring blocks are deliberately very quiet and may be too quiet.
- No edge lines on the plan (a white contour is invisible on the near-white roads and loud
  on the water). Trying them is a one-line change: pass the ground group to
  `buildEdgeLines`.
- The light rig is world-fixed, so the 189° yaw changed which façades the raking key
  strikes. The rig was tuned at the old orientation and may want a re-check.
- `map.glb` is now unused but still committed; deleting it is the user's call.

## Map round 9.1 (2026-07-31) — pier flicker, designer palette, captions, river drift

### The pier flicker was z-fighting with the river, and the fix must not move geometry

Reported as "the pier flickers right after I get back from the building view". Diagnosed,
not guessed: `b18` is a slab 0.0924 tall (buildings here are 1–2.5) with a 7 × 2.53
footprint, and its base sits EXACTLY on the flat plane.

The fight is not its top face — that clears the water by 0.09, about 750 depth-buffer steps.
It is the slab's BOTTOM face, which `side: DoubleSide` renders and which is precisely
coplanar with the river polygon. Two coplanar triangles from different meshes interpolate
depth from different vertices, so per-pixel float error decides the winner: some pixels take
the water, some the pier, and the overlap dissolves into moiré. Any sub-pixel camera change
reshuffles the pattern — which is why it reads as FLICKER while the return spring settles,
and as a static dither once it stops.

Every building's base is on that plane; only the pier overhangs a plan polygon, which is why
only the pier showed it.

Fixed with `polygonOffset` (`PLAN_PUSH = 16`) pushing the whole plan behind the volumes.
**This choice is load-bearing.** Nudging the plan down by an epsilon would also have worked
and would have quietly forfeited the round-9 guarantee — polygonOffset biases only the depth
VALUE written, never the vertex, so the plan stays pointwise on y = 0. Re-verified after the
fix: max pixel delta still **0** across centre → corner → opposite corner.

### Palette: sampled, not eyeballed

Values taken by modal-colour sampling of the designer's snapshot rather than by eye:

| surface | round 9 | round 9.1 |
|---|---|---|
| water `Color_H08` | `#d8e2ec` | `#d4eaf5` |
| blocks `Color_M02` | `#e6ecf3` | `#ccd7dd` |
| streets `Color_M04` | `#ffffff` | `#f5f5f5` |
| site ground (`mapStudio` plate) | `#ffffff` | `#dde6e9` |

The round-9 monochrome ramp was too quiet — the blocks vanished into the field and the water
read as haze. The river is now the one plan surface with real hue.

**`buildGround`'s plate needed `toneMapped: false` too.** It was authored `#ffffff` and read
as a mid grey on screen, because `NeutralToneMapping` rolls it down while `MAP_BG` — written
as the clear colour — is untouched. Same trap as the plan surfaces, one file over.

NOTE: the designer's snapshot is at the PRE-rotation orientation (cross-axis tilt 18.7°, and
the round structure upper-left of the west cross). It is a mockup over an older screenshot,
so its label POSITIONS are not a north-up reference; only its colours transfer.

### Captions are derived from geometry, never authored

`mapLabels.ts`. DOM nodes projected per frame, faded out with `MapCamera.focus` (a plan
caption in the isometric view reads as a mistake). Three lessons worth keeping:

- **Anchor on the nearest SURFACE point, not the nearest vertex.** These polygons are coarse
  — a whole street is 8–11 corners — so the nearest vertex is whichever corner happens to be
  closest and can sit at the far end of the street. The nearest surface point is the
  perpendicular foot, i.e. the middle of the stretch facing the site.
- **Nudge into view by the SHORTER of slide-along-axis and perpendicular-clamp.** Sliding
  alone looks principled and fails badly: `ул. Комсомола` runs ~5° off horizontal, so
  clearing a 10px top-inset violation by sliding cost ~113px along the street and walked the
  caption off the visible road. Taking whichever correction moves less keeps it deliberate.
- **Stagger parallel features.** River and embankment are parallel and adjacent, so
  "nearest point to centre" put both captions in one column. `RIVER_ALONG` shifts the river
  along the shore — what a cartographer does anyway.

The embankment is told from ул. Комсомола by which lies nearer the river, so nothing depends
on the yaw, the framing or a hand-tuned coordinate.

### River drift

Three travelling sines summed into a ±3.5% lightness modulation, flowing WEST (world −X),
`WATER_SPEED` 1.4 units/s against a 300-unit model — a drift, not a current. 2GIS register.

- **Injected via `onBeforeCompile` on MeshBasicMaterial, NOT a ShaderMaterial.** A raw
  ShaderMaterial drops three's `colorspace_fragment` chunk, so the linear colour would be
  written straight to an sRGB target and the river would come out visibly dark — and it would
  also lose the `setFocus` tint, which drives the stock `diffuse` uniform.
- World XZ, not uv: the polygon has no useful uvs, and world space also makes the drift
  independent of the shear (which is the identity there anyway).
- Gated on `prefers-reduced-motion`. That gate doubles as a test hook — emulating reduced
  motion freezes the river, which is how invariance is still provable over the water region.
- Cost is three `sin` per fragment on a surface already being drawn; the map renders on rAF
  regardless, so no extra frames and no extra pass.

Measured: water region changes (max 3) over 2.2s while the road region is byte-identical
(max 0) — the drift is confined to the river.

### Open on this round

- `RIVER_ALONG` (0.5) and `INSET` are framing-dependent; they hold at 1440×800 and were not
  checked at extreme aspect ratios.
- Caption type is 16px ALS Hauss Next, `#7e8f9b` streets / `#6f9ab8` river — a first pass.
- `WATER_AMP` 0.035 is near the floor of visibility; above ~0.05 it reads as banding.

## Map round 9.2 (2026-08-01) — captions to the Figma spec, water that reads

Source of truth: Figma `xtd3isfSuz1gnWxTClA2Vs` node `477:440`.

### The caption rotation was MIRRORED — a real bug, not a taste difference

`footprintAxis()` (buildingSplit.ts) returns `0.5·atan2(2·sxz, sxx − szz)`, whose dominant
eigenvector is `(cos θ, sin θ)` in **(x, z)**. Round 9.1's `axisVector()` built
`(sin(θ+π/2), 0, cos(θ+π/2))` — which expands to `(cos θ, 0, −sin θ)`. The flipped z
mirrored every caption's on-screen tilt.

It hid well because the mirrored angle is *plausible*: the cross blocks and the streets lean
~9° either side of horizontal, so the captions looked like they were following something.
Caught only by comparing against Figma (−8.6° / −11.7°) versus ours (+6.4° / +5.0°).

**`MapCamera.focusOn` reads the same `axisAngle` under a different (azimuth-from-+Z)
convention and was deliberately NOT changed.** It picks among four diagonals 90° apart by
nearest-to-current, so a mirrored axis still lands on a valid isometric pose, and round 8's
focus framing is signed off. Left as-is on purpose; do not "fix" it without a new verdict.

The same `axisVector` drives the along-feature offsets, so `RIVER_ALONG` / `STREET_ALONG`
were re-signed to negative to match Figma's left-of-centre placement.

### Type: ALS Chromius 22px, and the weight trap again

Figma spec, identical for all three: **ALS Chromius Regular, 22px / 1.4**, streets `#a8bac1`,
river `#5992ab`. Round 9.1 had guessed Hauss Next 16px in different greys.

`font-weight: 120`, not 400 — Chromius's `wght` axis is min 50 / default 120 / max 232, so
400 clamps to Black. Third time this trap has come up (round 8, round 9, here). No
`font-variation-settings`.

**«р. Нева» is horizontal, the streets are not.** Its Figma bounding box is exactly one line
box tall, so it is unrotated — which is also the cartographic convention: water bodies are
labelled level, thoroughfares along their length. Driven by a `rotates` flag per caption.

NOTE: the designer's earlier snapshot (round 9.1) was at the PRE-rotation orientation, so its
label positions were not usable. This Figma node is north-up and is.

### Water: the defect was FREQUENCY, not amplitude

Reported as "you need perfect sight to notice them". The arithmetic is worth keeping: the
overview frustum is ~529 world units across 1440 px, so one world unit ≈ 2.7 px — which
rendered round 9.1's 26/17/41-unit waves at **71 px / 46 px / 111 px**. Those are broad
gradients, not ripples, and a ±3.5% swing spread over 70 px is far below perception. Raising
the amplitude would never have fixed it.

Rebuilt as a baked tiling FBM (`rippleTexture.ts`) sampled twice, not summed sines.

- **Sines cannot make water.** They interfere into a regular plaid; raise the contrast enough
  to see them and you see the plaid. Value noise has no preferred direction and no beat.
- **A baked texture beats in-shader noise on cost**: two texture fetches per water fragment
  versus ~12 hash evaluations. 256 KB, built once, fixed-seed LCG so the bytes are identical
  every reload and a screenshot diff stays meaningful.
- **Tiling** comes from taking each octave's lattice indices modulo its grid size.
- **`BASE_GRID` is the dial that decides the look**, because an FBM's dominant feature is
  `tile / BASE_GRID` and the coarsest octave carries the most amplitude. 4 → ~31 px, read as
  soft curtains. 12 → ~21 px, read as camouflage. **32 → ~16 px with octaves at 8/4/2 px
  under it**, which reads as chop. `tile` 190 maps the 512-texel texture at ~1 texel per
  screen pixel, so its full detail is used without aliasing.
- **Crests come from a RIDGE transform, `1 − abs(2n − 1)`, not from thresholding the smooth
  field.** Thresholding an FBM high gives wide soft blobs, because the gradient is gentle
  wherever the field is high — that is exactly what made the first two attempts mottled.
  Folding about the midpoint puts a sharp crease along every `n = 0.5` contour, and contours
  are naturally thin and continuous. One extra `abs`.
- **Darken troughs, add a thin bright crest** — the designer asked for darkening rather than
  lightening, and it is also the reference photo's structure (dark body, fine bright lines).
- **Mipmaps are mandatory**, not polish: the finest octave lands near one screen pixel, so
  without mip filtering the ripple crawls, worst at focus mode's grazing angles. `size` must
  stay a power of two.
- Still `onBeforeCompile` on MeshBasicMaterial, still world-XZ sampling, still gated on
  `prefers-reduced-motion` — all three for the round 9.1 reasons.

Measured: water-crop contrast σ **0 → 8.2**, range 31; river moves max **26** over 2.2 s
(was 3) while the road stays byte-identical.

### Round-9 invariance re-proved

water / road / block regions all **max pixel delta 0** across centre → corner → opposite
corner (under `reducedMotion: reduce`, which freezes the river and makes the plan fully
static); control region over the west cross moves max 140–158. Reduced motion also holds the
river at delta 0 over 2 s, confirming the gate.

### Open on this round

- 22px Chromius is a big step up from 16px, and Figma's frame is 1440×1169 against our
  1440×800 map viewport, so the captions occupy proportionally more of our frame than the
  design's. Awaiting a verdict.
- Figma rotates the two streets by different amounts (−8.6° vs −11.7°), suggesting they were
  angled by eye; ours derive one angle per street from geometry, so they land close but not
  identical (−6.4° / −5.0°).
- `WATER_DARK` 0.15 / `WATER_CREST` 0.11 / `RIPPLE_ANISO` 2.2 are the designer's dials.

## Open issues

- **[OPEN] The `.hover-scene` backdrop is the limiting factor on the nav doubling** — the
  labels sit where the light surge is brightest, so a white-on-white echo has little
  contrast to work with, and 0.45 alpha is compensation for that rather than a considered
  value. If the hover scene is darkened (see the `.hover-scene` dials issue below), the
  echo alpha should come back down toward 0.3.
- **[OPEN] The handoff is the brightest moment of the cycle** — the scrim now reaches a
  full 0 at the midpoint, so the transition happens on a completely unscrimmed photo. This
  is the requested design (the overlay follows the text; no dark beat) and nothing ever
  goes darker than the resting 0.40, but it is worth a designer's eye. Dials: the `to`
  stop of `@keyframes scrim-open` and `OPEN_MS` / `CLOSE_MS`.
- **[OPEN] Round-9 timings tuned by eye against one screen** — `OUT_MS 600`, `OPEN_MS 600`,
  `FADE_DELAY 150`, `FADE_MS 800`, `CLOSE_MS 750`, `HOLD_MS 6000`, and the
  `cubic-bezier(0.45, 0, 0.55, 1)` fade curve. The pace (0.8 s / 6 s) is the designer's
  pick; the sub-beats within it are not.
- ~~**[OPEN] The round-8.1 stall fix is unconfirmed on the user's hardware**~~ — moot:
  round 9 removed every paint-thread effect from the transition. The whole handoff is now
  one `opacity` animation on one element.
- **[OPEN] `.hover-scene` reveal dials predate the new photos** — `img.visible` opacity 0.38
  over `#04070c` @ 0.93 was tuned in round 7 against the darker `main-*.png`. The new
  renders (especially `concept-plan`) are much lighter, so the «Концепция» hover reads
  brighter and flatter than Figma `340:594`. Not touched this round; needs a designer pass.
- **[OPEN] No favicon** — the browser's automatic `/favicon.ico` probe 404s on every load.
  Harmless, pre-existing, shows up in every console capture.
- ~~[OPEN] Reverse perspective is currently OFF (K=0)~~ **RESOLVED (Map round 3):**
  true polycentric icon splay baked at load, always on.
- ~~**[OPEN] Showreel/hover placeholder photos are gitignored** — a completely fresh clone
  will render those two features without images until real client photos are added
  (rays, nav, transition, map are unaffected).~~ **RESOLVED (round 6):** real client
  photos committed.
- ~~v2 default still slightly milky on the horizontal arms~~ — obsolete: round 3 made
  `lens` the default and reworked the beam interior (fibers).
- ~~[OPEN] Round-3 variant verdict pending~~ **RESOLVED (round 4):** «Призма» kept,
  «Объектив»/«Диско» killed, new «Прорезь» is the default hero.
- ~~[OPEN] «Прорезь» emblem legibility is a taste dial~~ **SUPERSEDED (round 5):** the
  designer wanted it far more dissolved → the `dissolve` param + «Сияние» variant own
  that axis now (0 literal … 1 pure light trails; intermediate values are valid presets).
- **[OPEN] «Сияние» burst envelope tuned by eye** (0.09/0.15 s time constants, ×4/×3/×2.5
  flash) — awaiting the designer's verdict on "fast and furious enough".
- **[OPEN] Gyroscope wind untested on a real device** — desktop Chrome has no
  deviceorientation; needs a phone check (incl. iOS permission prompt on first touch).
- ~~Hover-scene per-link images are placeholders; client photos expected.~~
  **RESOLVED (round 6):** real client photos committed.
- Transition flash timing tuned by eye at 720ms; not yet reviewed by user on a real pointer.
- ALS Chromius VF weight axis range assumed 100–900; not verified with a font inspector.
- ~~[OPEN] «Слайдер» dials tuned by eye (round-6.2 values)~~ **SUPERSEDED
  (round 7):** the star and its whole dissolve/occlusion machinery were killed;
  the slider is now one full-bleed photo + a word-by-word headline. Current
  dials awaiting a designer pass: overlay 0.2 (Figma had 0.41), idle 7 s,
  hold 7 s, projector breath ×1.4/×1.0/×0.7 @ τ 0.3 s, headline word stagger
  80 ms + 0.7 s rise, exit vapor −14 px.
- ~~[OPEN] Headline vs the blown light core~~ **RESOLVED (round 7):** the
  headline moved to the left column (Figma), clear of the centered light core.
- **[OPEN] Cross rotation speed tuned by eye** — `ROT_SPEED = 0.0105 rad/s`
  (~0.6°/s); may want faster/slower after a live designer pass. On the dev-only
  «Прорезь» tab the readable logo now rotates too (acceptable — that tab is not
  in the pitch build).
- ~~**[OPEN] Map round-5 glass is a deviation** — shipped `transmission: 0.7`
  instead of the chosen 1.0 because a top-down plan rendered nearly black.~~
  **RESOLVED (round 5.1):** the blackness was the `thickness × modelScale` bug,
  not Fresnel. With it fixed, the light-background presets run at the chosen
  `transmission: 1.0`. (`dark` still keeps 0.7 — it needs the diffuse to show
  anything at all, which is itself the argument against that background.)
- ~~**[OPEN] Background direction** — `sky` vs `daylight`~~ **RESOLVED (round 6):**
  near-white studio field (`#f2f6fa`), chosen with the user against the
  cut-crystal reference.
- ~~**[OPEN] Map round-6 variant verdict pending**~~ **RESOLVED (round 7):**
  «Грани» chosen; the other two and the switcher are deleted.
- **[OPEN] The two cross blocks each select as ONE unit** — each is welded to
  its courtyard and apse in the GLB, so connected-component splitting cannot
  separate them. If the designer wants the wings clickable on their own, that
  needs manual sub-assignment (split by spatial clustering within the
  component, or re-export the GLB with separate objects).
- **[OPEN] `buildingsInfo.ts` copy is placeholder** — plausible Russian
  programme, not client content. Names were assigned by matching each part's
  measured footprint and screen position; re-verify if the model changes.
- **[OPEN] Map round-8 dials tuned by eye** — iso elevation 35.26°, spring
  `TAU 0.26`, `FOCUS_PAD 0.78`, `MIN_HALF_H_FRAC 0.16`, `MAP_LOOK_DIMMED`
  (opacity 0.2, desaturated) and the dimmed edge opacity 0.12.
- **[OPEN] Map round-7 dials tuned by eye** — key 4.2 @ (−300, 170, −230),
  fill 0.4, rim 1.0, `NeutralToneMapping`, hover/selected material overrides
  in `mapLooks.ts`, `MIN_FOOTPRINT_FRAC 0.03`, drawer width 380 px.
- **[OPEN] Flat roofs cannot glint under this camera — by construction.** An
  orthographic top-down view gives every flat roof the same reflection vector,
  so they all sample one environment texel and stay evenly toned no matter how
  the probe is authored. Speculars only land on pitched roofs, creased detail
  and sheared walls. If the designer wants sparkle on the big flat roofs, the
  honest options are edge lines, bloom, or a light-perturbing normal/roughness
  map — NOT more environment tuning.
- **[OPEN] Map round-6 dials tuned by eye** — crease angle 35°, edge threshold
  30° / linewidth 1.3 / opacity 0.85, bloom 0.75/0.45/1.15, ground rim
  `#b3c9dc`, env source placement and gains, «Грани» fill `0x2f86c4` @ 0.42.
- **[OPEN] Map round-5 dials tuned by eye** — `FIT_MARGIN 1.06` (framing
  tightness), `RESPONSE_GAIN 3.5` + `SMOOTH_TAU 0.12` (how fast the lean bites),
  glass `roughness 0.25` / `thickness 20` / `attenuationDistance 80`, the sky
  gradient's zenith `#b6e6ff` (which *is* the roof colour — the single strongest
  dial for the map's tone), light rig intensities 2.6 / 1.6 / 1.8, ground glow
  `#1b3552`. All await a designer pass.
- **[OPEN] Map transmission perf unmeasured on a real device.** r170 gives no
  `transmissionResolutionScale`, so the extra pass is full-viewport with 4×MSAA
  + mipmaps every frame. Fine on desktop headless; the mobile lever is
  `mapPixelRatio` in `shared/performanceTier.ts`, not a material rework.
- ~~**Status: map v2 awaiting user verdict**~~ — superseded: round 5 rebuilt the
  map's geometry, framing, response curve and materials. Awaiting a fresh verdict.
