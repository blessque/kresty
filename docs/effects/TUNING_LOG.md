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

## Map round 9.3 (2026-08-01) — four water modes to choose from

`?water=chop|lines|glints|gloss`, in `waterModes.ts`. Different LOOK **and** different
technique each, so the choice is a direction rather than a parameter. None displaces
geometry: the river polygon stays pointwise on y = 0.

| mode | technique | VRAM | look |
|---|---|---|---|
| `chop` | baked tiling FBM, 2 samples | 341 KB | tonal, granular (round 9.2) |
| `lines` | pure procedural, `fwidth` isolines | 0 | engraved survey drawing |
| `glints` | `THREE.Points` geometry | 0 | flat water, drifting specks |
| `gloss` | analytic wave normals + Blinn-Phong | 0 | wet, specular |

### Two mistakes worth not repeating

**A flat normal already scores 0.85 against this key light.** `gloss` first shipped with
wave slopes of `amp × k ≈ 0.067` (3.8°) and showed no specular at all. With
H ≈ (−0.43, 0.85, −0.33), a flat normal gives `dot(N,H) = 0.85` and `pow(0.85, 42) ≈ 0.001`
— the normal has to tilt ~32° toward the light before a highlight exists. Waves are now
parameterised by **slope**, not amplitude, peaking near 0.9. If a specular ever looks
"missing", check the flat-normal baseline before touching the exponent.

**Sines interfere into plaid — again.** Four summed waves gave `gloss` a mechanical
diagonal lattice, exactly the failure that killed the sine version of the chop. Fixed with a
two-sine DOMAIN WARP on the sample position, which keeps the mode texture-free.

Also: `glints` drifting 9 world units west carried specks clean across the shoreline onto the
embankment. Points ignore `polygonOffset`, so a stray speck wins the depth test over the road
and there is no cheap clip. Fixed by short travel (3.2) plus a centroid inset when scattering.

### Invariance: geometry still exact, procedural shading is ±1 LSB

Re-measured per mode, cursor-centre → corner, under reduced motion:

- road and block regions: **max delta 0** in every mode.
- `glints` (water not shaded): **max delta 0** everywhere.
- `chop` / `lines` / `gloss`: water region **max delta 1** — a single LSB.

The cause is not geometry moving. `vFlow` is `(modelMatrix * position).xz` and `modelMatrix`
is `shear × root`, so the x term evaluates as `sx·scale·y_local + sx·ty` — two separately
rounded products that cancel mathematically but not exactly in float. The lookup shifts by
~1e-7, which occasionally flips a quantised output by one level. Sub-perceptual, and the
schematic itself (roads, blocks) is still bit-exact. If it ever needs to be exactly 0, pass
the root matrix as a uniform and compute `vFlow` from it instead of from `modelMatrix`.

## Map round 9.4 (2026-08-01) — gloss reversed/finer/darker, lines turned 90°

Designer pass on two of the four modes.

- **`gloss` crests now travel WEST** (`+ uTime` in the phase, not `-`), matching every other
  mode. **Scale halved** (wavelengths 15/9/23/5.5 → 7.5/4.5/11.5/2.75, warp frequencies
  doubled and its amplitude halved to match).
- **`gloss` only ever DARKENS now.** Full base colour is the ceiling, reached on the crests;
  everything else falls toward a bluer shadow via a per-channel multiplier
  `[0.68, 0.80, 0.93]` on the base — derived from the base, never hardcoded, so `setFocus`'s
  fade toward the field still works. The previous version *added* light and pushed the river
  brighter than the flat `#d4eaf5` it is meant to be.
- **`lines` turned 90°.** The field now varies along `q.x`, so contours run ACROSS the river
  square to the bank, and a `-uTime * LINE_DRIFT` term marches them west. Warping moved to
  `q.y` so each line still undulates along its own length.

### Don't shade off `dot(N, L)` on a near-flat surface

`gloss` went flat when the darkening was first wired up, and the reason generalises. These
normals are dominated by their +Y component, so `dot(N, L)` sits in a narrow band around
0.6-0.8 — any `smoothstep` over it saturates at 1 across most of the surface. Measured: the
darkest pixel got only ~40% of the way to the dark end and the river looked untouched.

Shading is now driven by `dot(slope, L.xz)`, whose range is bounded and known (`|slope| ≲
0.9`), so the ramp genuinely spans 0..1. **When a shading term looks inert on a nearly flat
surface, check the RANGE of the quantity you are ramping before touching the ramp.**

### Verified

Travel direction measured by cross-correlating two frames 500 ms apart: `lines` −3 px,
`gloss` −2 px, `chop` −2 px — all **west**. Tonal range on a water-only crop: `gloss`
max **212,234,245** (exactly the base `#d4eaf5`) and min **178,212,237** — nothing brighter
than base, darkest a clear blue.

**A periodic pattern aliases in cross-correlation.** The first direction measurement reported
`lines` moving EAST at +15 px, which on a ~10 px line period is the same as −5. Constrain the
search window to under half the period, and crop to water only — a crop that catches the
static road swamps the correlation and reports "still".

Invariance unchanged: road and block **0** in all four modes, water **0** for `chop`/`glints`
and **1** (single LSB, see round 9.3) for `lines`/`gloss`; control 140.

## Map round 9.5 (2026-08-01) — «Гравюра» is the shipped water

`DEFAULT_WATER = 'lines'`. The designer's pick out of the four, and the one that argues for
itself: the map's whole language is already edge-forward — «Грани» IS fat white edge lines —
so water drawn as LINEWORK is the most native of the four rather than a texture laid on top
of a drawing. It is also the cheapest: zero VRAM, ~4 `sin` and one `fwidth` per fragment, no
texture bake at load.

`chop`, `glints` and `gloss` stay reachable by explicit `?water=` link. `chop`'s
`rippleTexture.ts` is now only built when that mode is asked for, so the default path does
no texture bake at all.

## Round 10 (2026-08-03) — corner furniture pinned to the viewport; captions solved, not nudged

Two layout complaints from the designer, with the same shape underneath: a position that
mixed units, so it could not hold at more than one window size.

### Main screen — the corners drifted toward the centre

`.logo`, `.news` and `.corner-mark` were children of `.stage`, a fixed 1440×800 box under
a contain-fit `scale(s)` (`layout.ts: stageScale = min(w/1440, h/800)`). A child at
`left: 32px` therefore lands at `(innerWidth − 1440·s)/2 + 32·s` from the window edge —
BOTH terms grow with the window. At 2560×1080 that is 308 + 43 = 351px instead of 32.

Fixed by moving the three into a new `.corners` layer (`position: absolute; inset: 0;
z-index: 5`) on the screen root, outside the scaled stage, at a flat **32 left/right,
40 top/bottom**. The layer is `pointer-events: none` with `.news` opting back in, so it
cannot eat nav hover — verified with `elementFromPoint`. Figma's odd decimals on
`.corner-mark` (32.49 / 33.7) were dropped in favour of the uniform rule; the three now
agree with each other at the edge.

Only geometry that must stay locked to the light centre (nav links, slider headline)
belongs in the stage. That is the rule to apply to anything added later.

### Map — captions were a model-space anchor plus two corrections

Round 9.2 placed each caption at its feature's perpendicular foot (correct), then sailed
it away again with hand-tuned fractions of the site span (`RIVER_OFFSET`, `RIVER_ALONG
−0.5`, `STREET_ALONG −0.22`) with **nothing re-testing that the result was still inside
the polygon**. The Neva bends across the frame, so sliding half a site-span along an axis
measured back at the anchor walked «р. Нева» onto the embankment. A second correction,
`nudgeIntoView`, then clamped captions against a fixed pixel `INSET` box.

**The diagnostic is the units.** `RIVER_ALONG` is a fraction of the site span (model
units — invariant); `INSET` is CSS pixels (viewport units — not). Any position summing
model-space and screen-space terms is framing-dependent by construction, and no amount of
tuning the constants fixes it. Get the screen-space term out of the position.

**The enabling property:** the plan-oblique shear is `x' = x + sx·y`, the IDENTITY at
y = 0, and the overview camera is orthographic — so for flat ground geometry the whole
model→screen chain is a single **affine** map, and affine maps preserve interiority. A
point chosen inside a polygon in model space projects inside that polygon's projection at
every shear, zoom and window size. Placement is therefore a **one-off search**, not a
per-frame correction.

`mapLabels.ts` rewritten around that: `solve()` grid-searches the feature's projected
polygon for an interior point (inside-any-triangle + ≥13px clearance from the **boundary**
edges — edges used by exactly one triangle, so tessellation diagonals don't report the
middle of a wide river as cramped), converts the winner back to a world point through the
inverted 2×2 affine part, and `update()` is reduced to a projection plus a transform
write. There is no pixel clamp anywhere in the per-frame path. Re-solved on viewport
change only; the shear cannot invalidate an anchor.

Chosen with the designer: river **bottom-left of the visible water**, streets **left of
centre** (`STREET_BIAS 0.3`, Figma 477:440), both constrained to stay on their feature.

Three traps, all found by measurement rather than reasoning:

- **A preference and a quality cannot share one linear score.** First pass scored the
  river as `−bias·100 + clearance`; the wide right-hand stretch of the Neva scores ~300px
  of clearance and simply outbid a bias capped at 200, sending the caption bottom-RIGHT.
  Scaling the preference past any reachable clearance (`·1e6`) makes the ordering
  lexicographic, which is what "prefer this corner, break ties by room" actually means.
- **Constrain the label's BOX, not its anchor.** A legal centre still hangs half the text
  off-screen. `halfExtents()` measures the live element (`white-space: nowrap` makes
  `offsetWidth` the true text width) and uses the ROTATED AABB for street captions.
- **Reserved bands wall off the corners you want.** A 96px full-width bottom band existed
  to dodge one *centred* hint, and it excluded the bottom-left water — the exact spot the
  river caption was asked to occupy — pushing it onto the pier instead. Replaced by
  measured rects for `.concept-home` / `.concept-title` / `.concept-hint` plus a uniform
  28px edge margin. An element obstructs the box it occupies, nothing more.

Verified: captions **byte-identical** across four cursor positions (28.11, 836.20 at all
four) while a control screenshot of the buildings differs — the lean was engaging, so the
invariance is real and not a vacuous test. Correct placement confirmed visually at
1600×900 and 2560×1080. `tsc` clean, build clean, smoke test clean.

## Round 10.1 (2026-08-03) — one typeface, and the map's read-out moved to a left rail

### ALS Hauss Next is gone

Four `@font-face` blocks, the global `body` fallback, three `'ALS Chromius', 'ALS Hauss
Next'` stacks and the four woff2 files — all removed. Chromius is the only typeface on the
site. Verified by walking every element with text on the main screen and collecting
`getComputedStyle().fontFamily`: two values, both Chromius.

**The trap this creates, and it is a live one.** Chromius's `wght` axis is 50–232, so the
CSS *initial* value `font-weight: normal` = 400 **clamps to 232 = Black**. While Chromius
was only ever set per-component, every one of those rules also set a weight, so the axis
bug (round 8) stayed fixed. Promoting Chromius to the GLOBAL family exposes every element
that never states a weight. `global.css` therefore pins `font-weight: 120` alongside the
family — that line is load-bearing, not decoration, and removing it renders the whole site
Black.

### «Концепция» title killed; the hint became a left rail

The top-right title is gone. The standing hint left the bottom centre — where it read as a
caption for the whole screen — and became `.map-info`, a column at `left: 32px` under the
logo, in the site's main text style (Chromius 22/1.35 at wght 120, `#123a5c`). It is the
same left column the main screen puts its news block in.

The rail is now **two things in one slot**: the standing instruction, and the hover
read-out (kind · name · brief · the branded residents' marks · «Нажмите, чтобы открыть
карточку»). It deliberately does NOT list residents — that is the drawer's job, and
duplicating it there would make opening the drawer pointless. The hover is a glance.

Two non-obvious consequences:

- **`.map-info` is a caption obstacle.** It replaced `.concept-title` / `.concept-hint` in
  `mapLabels.ts`'s `OBSTACLES`, and it sits exactly where «ул. Комсомола» wants to be —
  the caption now solves to the right of it.
- **It needs a `min-height`.** MapLabels re-solves only on resize, so an element whose
  height changed between hover states would reserve the wrong area and let the caption
  drift under the text. `min-height: 224px` reserves the taller state in both. It also
  stops the rail reflowing under the cursor as you sweep across buildings — worth having
  on its own.

### Drawer: main text style, resident marks, outbound links

Body copy moved to 22/1.35, the drawer widened 380 → **420px** (at 380 the longer resident
names wrapped to three lines). The focus camera reads `drawer.width` at runtime, so the
framing followed on its own — no constant to mirror. `.bld-kind` dropped its 13px
uppercase letterspacing, which was generic-web and fought everything around it, for
Chromius at 18 muted.

Branded residents (café, bar, shop, hotel) now carry a mark and an outbound link;
plain programme entries stay a name and a floor, which is what makes the branded rows
read as tenants rather than line items. `residentLogos.ts` holds eight **invented**
wordmarks — drawn as 24×24 `currentColor` strokes rather than sourced, because a pitch
that ships real trademarks for unsigned tenants is a liability and `currentColor` marks
restyle with the palette for free. All URLs are invented and do not resolve;
`target="_blank"` so a click cannot tear down the WebGL scene mid-pitch.

**Latent bug found and fixed:** `infoFor`'s fallback stub was missing the new `brief`
field and `tsc` did NOT catch it — `BUILDINGS_INFO[id]` types as a non-nullable
`BuildingInfo` without `noUncheckedIndexedAccess`, so `??` never checks the right-hand
literal against the interface. An unmapped part would have rendered the string
"undefined". Any future required field on `BuildingInfo` has the same hole.

## Round 10.2 (2026-08-03) — the real programme: two Cosmos hotels, zoning-based mapping

The designer supplied the client's own zoning drawing (НИиПИ «Спецреставрация», СХЕМА
ФУНКЦИОНАЛЬНОГО ЗОНИРОВАНИЯ, sheet 28/133) and asked for a realistic mapping.

### Orientation, settled empirically

The plan draws the Neva at the TOP; the render puts it at the BOTTOM — a ~180° rotation.
Rather than eyeball it, every part's on-screen footprint was recovered by sweeping a 28px
hover grid and grouping the read-out by name. Two independent landmarks then fix the
correspondence: **b01 reaches furthest toward the Neva AND carries the round volume b04 on
its far side**, exactly as Лит Е1 carries its rotunda on the plan. So **b01 = Лит Е1**,
**b02 = Лит Е3** — which is why round 10.1 found the two cross blocks wearing each other's
names. That open issue is closed by the remap.

### The programme is real, not invented

From the June 2026 announcement (ГК «КВС» × Cosmos Hotel Group, signed at SPIEF): two
hotels in the two cross blocks, **262 rooms total — 5★ with 126 rooms and a spa, 4★ with
136 rooms and a large conference hall** — plus a multimedia museum, a gastronomic cluster,
public space and a dedicated pier. 15 bn ₽, completion 2030. The original complex is
А. О. Томишко, 1884–1890; the church of St Alexander Nevsky was consecrated 1890.

`b01` → 5★ (spa + panoramic restaurant, the Neva-facing block with the rotunda);
`b02` → 4★ (MICE conference centre + the multimedia museum). The two pool-like rectangles
on the plan sit INSIDE the cross components in the GLB, so the spa and the museum are
residents of their hotels rather than separate parts.

**Confidence is graded explicitly in the file header.** Certain from geometry: the two
crosses, the domed church, the rotunda, the flat slab on the water (the pier) and the
large flat deck (the parking structure). Everything else is placed by its ZONE on the plan
— offices and cafés along the embankment, rental and catering along ул. Комсомола — not by
reading a lit letter off a drawing that is not legible at that resolution. The functions
are the client's; which part each lands on is a reading, and is labelled as one.

### Hover rail: three things removed, one added

The designer called the small `kind` line («Паркинг», «Крестообразный корпус»), the brand
marks and «Нажмите, чтобы открыть карточку» noise. All three are gone from the rail —
`kind` survives in the DRAWER, where there is room for it. In their place, a **summary of
what the building holds**: «126 номеров · 2 ресторана · спа-комплекс».

That needed a typed data model. `Resident` gained `type: ResidentType` and an optional
`count`, so one `{ type: 'room', count: 126 }` entry reads as 126 rooms instead of one
anonymous line. `summarizeResidents()` sums by type, orders by PITCH VALUE rather than by
count, and takes three clauses.

Three copy rules, each found by reading the generated output rather than by design:

- **`hotel` and `service` never appear.** The hotel *is* the building, and back-of-house is
  not a selling point. A building with only service entries (the boiler house) shows no
  summary line at all rather than an empty one.
- **A count of one drops the numeral** — «2 ресторана · бар», never «2 ресторана · 1 бар»,
  which reads like a stock count.
- **Order is by pitch value.** `spa` had to move ahead of `bar` because it is a headline
  feature of the 5★ and was being cut by the three-clause limit; `church` leads because on
  the one building that has it, it is the whole answer. An open-air summer stage is typed
  `service`, not `hall`, because «зал» reads as an indoor room.

Verified by sweeping the whole plan and enumerating every building's name and summary: all
19 reachable, all summaries well-formed, zero `.mi-kind` / `.mi-more` / `.mi-logo` nodes
left in the DOM.

## Round 10.3 (2026-08-04) — one base size, bound short words, the Figma drawer

### 21px base, inherited rather than repeated

`global.css` now sets `font-size: 21px` / `line-height: 1.35` on `body`, and every body-copy
rule DROPPED its own size: the news block (was 20, Figma 338:48), the map's hover rail and
the drawer (both 22), and the map captions (were 22, Figma 477:440). Display sizes — nav 32,
slider headline 56, drawer/rail titles 30 — stay absolute. One dial now moves the site's
reading size; that also closes round 10.1's open issue about the news block sitting one
pixel away from everything else.

### Short words are bound everywhere, not just on the main screen

`bindShortWords` existed since round 8 but was only wired into `NewsTicker` and
`PhotoSlider` — the ENTIRE concept screen rendered raw text, which is why the binding
looked broken there. Both `MapInfo` and `BuildingDrawer` now route every string through a
local `t()` = escape ∘ bind, and the duplicated private `esc()` in each moved to
`shared/escapeHtml.ts`.

The word list grew from 18 prepositions to prepositions **plus conjunctions** (но, да, ни,
то, или, ибо, как, что, чем, либо, если, чтоб, хотя, пока, зато, чтобы) — same rule and
same direction: a conjunction leads the clause after it, so an orphan at a line end reads
as a stumble. Note «и» and «со» were already covered (one-letter words by length, «со» by
the original list); what was missing was the concept screen calling the function at all.

Also added: **a numeral binds to what it counts** (Мильчин §6.2). «126 номеров» in a 320px
rail would otherwise break after the digits constantly. And `summarizeResidents` joins on
NBSP + «· » so a line can begin with «2 ресторана» but never with «· 2 ресторана».

Unplanned confirmation that this is right: the drawer brief now breaks
«Пятизвездочный отель / с номерами на месте бывших / камер.» — character-for-character the
designer's rag in the Figma export, produced by the binding rather than by tuning.

### The hover glow

A radial gradient on `.map-info::before`, hung off the left edge of the screen (`left:
-300px`, 760×580), white 0.85 at centre → 0 at the rim, `z-index: -1` so it lifts the MAP
and never the type. **Not `filter: blur()`** — a gradient is already smooth, needs no extra
raster pass, and cannot bleed the edge artifacts a blurred box does.

One trap: it washed out the «КРЕСТЫ» wordmark. `.concept-home` and `.map-info` were both
`z-index: 5` and the rail is the later sibling, so the glow painted over the logo.
`.concept-home` is now `z-index: 6`.

### Swap animation, and why it does not queue

0.2s out → swap → 0.2s in, `SWAP_MS` in `MapInfo.ts` mirrored by `--mi-swap` in the CSS.

The override rule is the interesting part. A new target while a fade-out is in flight only
updates `pending`; it does **not** restart the timer and does not enqueue a second cycle.
So a fast sweep collapses into ONE cycle showing the latest building, and that building
still appears at the original deadline instead of being pushed back 200ms per pointer move
— which is what restarting the timer would do, and is exactly the kind of accumulating
delay this project has already rejected twice as "lag".

Measured: 4 target changes issued inside 108ms settled in **222ms** (four sequential cycles
would be ~1600ms). A 6-target sweep settled on the last-hovered building at opacity 1.

### Drawer rebuilt to Figma 86:42392

The designer's export was measured, not eyeballed — panel **400**, hero **297**, inset
**32**, wordmark **123×48** at y **329**, name at y **396**, close circle **36px at
(424, 24)**. Ink `#010c11`, link `#36a0ff`, floor tint `#a7c2ca`, panel opaque white (the
round-10 frosted translucent panel is gone; it let the map show through behind the type).

Two structural consequences:

- **The close button sits OUTSIDE the panel, on the map.** So `.bld-drawer` may no longer
  scroll — it is the positioning box with visible overflow, and a new inner `.bld-scroll`
  takes the scrolling. `.bld-close` is at `left: calc(100% + 24px)`.
- **The resident list is bottom-anchored** (`margin-top: auto`), which is how the Figma
  leaves a large gap under the link. When a building's list is long there is no free space
  to absorb and it degrades to normal flow with the panel scrolling — the right behaviour.

Content changes to match: the two crosses take the client's own names **«Западный крест»**
/ **«Восточный крест»** with their exact brief copy; the operator wordmark replaces `kind`
(which now shows only for buildings with no logo); the building's own link «Сайт отеля ›»
is a new top-level `BuildingInfo.link`, distinct from a resident's `brand.url`; a `hotel`
row renders with no floor, because the hotel occupies every storey; row separators and the
«6 резидентов» count are gone. The two UI icons are INLINED with `currentColor` rather than
`<img src="/resources/*.svg">` — `<img>` cannot recolour, and the close must be white over
the hero but dark without one.

Assets: `hotel.png` 9.8MB → `hotel.webp` **302KB** (`cwebp -q 82 -resize 1600 0`), source
PNG deleted. `Cosmos-hotel-group-logo 1.svg` → `cosmos-logo.svg` — a space in a URL path is
a latent encoding bug, not a style preference.

### 10.3a — the crosses list exactly what the design lists, and the gutter is gone

Both crosses were carrying six residents against the design's **three**. Trimmed to three:
«Гостиница Cosmos Selection 5*» / «Ресторан Cosmos» / «SPA-Комплекс» verbatim from the
export, and the east cross matched at three (hotel · конференц-зал · музей) — two crosses
listing different amounts would read as an accident rather than a rule.

**`BuildingInfo.rooms` exists because of this trim.** «Номера · 126» was a resident, and
deleting it would have taken «126 номеров» out of the hover summary — the single most
useful thing the rail says about a cross. Room count is a building-level fact, not a tenant
you can walk into, so it moved to its own field and `summarizeResidents(residents)` became
`summarize(info)`, seeding the `room` total from it. The drawer lists three rows; the rail
still reads «126 номеров · ресторан · спа-комплекс».

Scrollbar suppressed on `.bld-scroll` (`scrollbar-width: none`, `-ms-overflow-style: none`,
`::-webkit-scrollbar { display: none }`). All three are needed — macOS only shows the bar
during a gesture, but on Windows, and on a Mac driven by a mouse wheel, it is a permanent
grey gutter down the panel edge that breaks the flush hero and the 32px inset. Verified on
a deliberately short viewport: content overflows, gutter measures **0px**, and `scrollTop`
still moves 0 → 250, so scrolling is intact and only the bar is hidden.

## Map round 11 (2026-08-04) — the water rebuilt as a surface, not a pattern

Verdict on rounds 9.2–9.5: **all four water modes rejected** — "repetitive stripes, obvious
scrolling, artificial movement, visible tiling… procedural rather than natural". `chop`,
`glints` and `gloss` are deleted along with the `?water=` switch; `waterModes.ts` →
**`water.ts`**, one look, ~380 → ~150 lines.

### Why «Гравюра» could never have been tuned into working

It was an **isoline extractor**, not a surface shader:

```glsl
float dist = abs(fract(f - 0.5) - 0.5);
float line = 1.0 - smoothstep(0.0, fwidth(f) * 1.15, dist);
```

`fract` is a sawtooth; `abs(saw − 0.5)` is distance to the nearest integer; the smoothstep
inks a curve there. The output is **exactly one line per unit of `f`, by construction** —
this is what a contour map uses. Whatever field you feed it, you get curves.

Measured at the overview camera's **2.48 px per world unit** (visible region
`x ∈ [−291, 291]`, `z ∈ [15, 161]` — only ~146 of the river polygon's 649 units are ever
on screen):

- contour period `3.8` world units = **9.4 px** ⇒ **≈153 identical hairlines** across frame;
- `|∂f/∂x| = 0.263` per world unit against `|∂f/∂y| ≤ 0.0738`, so the gradient tilts at most
  **15.7°** — every line within 16° of vertical, everywhere;
- `|∂f/∂x|` varies by **±1.6 %**, so the pitch is constant to within a rounding error;
- warp amplitude totals `0.42+0.20+0.10 = 0.72` contour-widths = **6.8 px against a 9.4 px
  period** ⇒ contours **cannot cross, fold or merge**. The field's geometry forbids
  turbulence. That is the whole "ruled, not turbulent" complaint, in one inequality.
- time enters only as `(q.x − uTime·1.6)`: a **rigid translation** west at 3.97 px/s, one
  period every 2.375 s.

Three rules worth keeping, in descending order of generality:

1. **`fract`, `abs(x−0.5)` and ridge transforms are FREQUENCY MULTIPLIERS.** They convert a
   smooth field into thin, high-contrast, regular features — the signature of a drawing.
   They do not belong in a calm surface. (This is what `lines` and `chop`'s `ridge` both did.)
2. **Motion reads as mechanical exactly when individual features are TRACKABLE.** Real water's
   features have a lifetime shorter than the time they take to cross their own width, so there
   is nothing to follow. Nothing in `lines` had a lifetime — the pattern was eternal and merely
   displaced.
3. **Periodicity dies from incommensurate scales, not from warping.** Warping bends lines while
   preserving their count and mean direction. Only combining scales whose ratio is far from
   rational pushes the composite period past the frame.

**Fourth strike for "summed sines interfere into plaid."** All four terms in `lines` were
`sin`. A sum of sinusoids is phase-coherent, so its autocorrelation never decays and structure
at one point predicts structure arbitrarily far away — which is precisely what the eye calls
artificial. Logged in 9.1, 9.4, 9.5 and now here. There should not be a fifth.

### What shipped

CesiumJS's globe-water method (`getWaterNoise.glsl`: one normal map, four samples, **prime**
divisors 103/107/897/991, a different drift velocity and phase per sample), reduced to two
samples. Five stages, **3 texture fetches + ~12 ALU**, and each stage kills one named artifact:

| stage | kills |
|---|---|
| base tint `#c5e0f0` (was `#d4eaf5`) | variation below the visibility threshold |
| 2 samples of one tiling FBM, tiles **113 / 157** world units (both prime) | **tiling** |
| drift 0.70 / 0.62 u/s, headings **130° apart** | **scrolling** |
| one domain-warp iteration — B sampled through A | **trackability** |
| narrow two-tone ramp on a hue path, derived from `diffuseColor` | the grey/mouldy read |

- **Anti-tiling is by construction, not by tuning.** Each tile repeats across the frame on its
  own (5.1× and 3.7×), but the composite repeats at `lcm(113, 157) = 17 741` world units —
  **30× the screen width**. Round numbers (120/160) would drop that to ~480 and walk the repeat
  straight back into view.
- **Evolution without translation.** Each layer moves under 2 px/s — below noticing — but with
  130° between them their interference refreshes a feature in ~21 s. 130° rather than 180°
  because exactly opposed layers make a standing wave with fixed nodes.
- **The ramp is derived from `diffuseColor`, never literals**, because `setFocus` lerps the base
  toward `MAP_BG`; fixed colours would stay saturated while everything faded. (`gloss` already
  learned this in 9.4.)

### Three traps, all found by measurement

- **A ratio in linear space is not the ratio you see.** The ramp multipliers act on
  `diffuseColor` in **linear** working space, but the register was agreed in what's visible,
  i.e. sRGB. Sized for ±4 % linear, they measured **±1.7 %** on screen — sRGB encoding
  compresses a linear ratio by roughly its 2.2 gamma. Re-sized for the output: measured
  **±3.91 %** of code value, endpoints 208.8 → 225.8 exactly as predicted.
- **`BASE_GRID = 32` was the wrong content, not the wrong mapping.** An FBM's coarsest feature
  is `tile/BASE_GRID`, so at 32 *everything* in the texture is finer than the dominant blob —
  at any tile size that sized the blobs correctly, a mass of finer detail came with it. That is
  much of why `chop` read as mould, and no tile size could have fixed it. Now **4 / 3 octaves /
  gain 0.5** ⇒ features at `tile/4, /8, /16` = **70 / 35 / 17 px**, and 256² is ample (the
  finest lattice is 16 cells; 512² was resolving it at 32 texels per cell — pure interpolation).
  64 KiB and ~4 ms instead of 256 KiB and ~18 ms.
- **A min/max contrast stretch does almost nothing to an FBM.** The extremes are single-texel
  outliers, so round 9.2's "stretch to full range" left the bulk still clustered near 0.5 —
  wasting byte range and banding the ramp. Replaced with a 1st/99th **percentile** stretch.

Also fixed: the round-9.2 `DataTexture` leak (parked on `mat.userData`, never freed —
`GroundPlan.dispose` only ever released materials and geometries), and `anisotropy` set to 4
(it was 1 everywhere, while focus mode views the plane at ~35°).

### Verified

- **Shear invariance holds.** On a pure-water patch, max channel delta across four cursor
  positions is **1** on 0.05 % of pixels — the documented ±1 LSB from computing `vFlow` through
  `modelMatrix` (see round 9.5), not a regression. A control band over the buildings moves
  137–149, so the test is not vacuous. Note this design is *more* tolerant of that LSB than
  `lines` was: in an isoline field a 1-LSB wobble can flip a hairline on or off near an integer
  crossing; in a smooth field it costs one code.
- **Alive, and provably not scrolling.** Mean |Δ| between frames 4 s apart: 0.73 / 0.82 / 0.97 /
  1.12. Best-matching integer shift over 16 s is **(0, 0)** — translation explains **0.0 %** of
  the change. That is the quantitative form of the complaint, and it passes.
- `prefers-reduced-motion` still freezes the surface; focus mode shows no moiré at the grazing
  angle; `tsc` clean, `npm run build` clean, `scripts/interact-test.mjs` clean; the only console
  error is the pre-existing favicon 404.

**The contrast dial is `DEEP`/`LIGHT` in `water.ts`.** If the verdict is "I can't see it",
scale those deltas from 1.0 — do NOT add stages and do NOT reach back for drawn features.

## Map round 11.1 (2026-08-04, same day) — wavefronts: the cloud was missing DIRECTION

Verdict on the above: **"the river looks like cloud sky now"**, with a photo of real ripples
attached. Correct, and the cause is structural for the third time in this file.

**An isotropic FBM is a cloud texture.** That is what it is for. Having no preferred direction
it can only make blobs — so removing «Гравюра»'s regular stripes had also removed every trace
of *direction*, and fog was what remained. Round 11 fixed the periodicity and threw out the
anisotropy with it.

**Water is anisotropic. It is made of WAVEFRONTS** — crests that run long one way and change
sharply across. The reference photo is *full of lines*; it is not the opposite of «Гравюра».
The difference is that real crests **bend, fork and cross**.

### The threshold that separates the two

A carrier `sin(2π·dot(q,d)/λ)` has phase gradient `1/λ`. A phase warp `W·noise(q)` contributes
`W·|∇noise| ≈ W/F` for noise feature size `F`. Wavefronts can only fold where the warp gradient
**cancels** the carrier's, i.e. where

    W ≳ F / λ

With `F ≈ 28` world units and `λ ≈ 5.5`, that needs **W ≈ 5 cycles**. «Гравюра» used **0.72** —
an order of magnitude below the regime in which water exists. It was not "lines instead of
noise"; it was lines with a warp too weak to do anything. This is the same inequality as round
11's "6.8 px of warp against a 9.4 px period", restated in the form that tells you what to do.

Note the surviving ban still holds and is not violated here: no `fract`, no `abs(x−0.5)`, no
ridge transform. A `sin` is *smooth* — a smooth alternating band IS a wave crest. The banned
operators are specifically the ones that MULTIPLY frequency.

### Shipped

Two directional carriers (λ **10.0 / 6.2** world units = 25 / 15 px, headings 27° apart) whose
phase is warped by **2.4 / 1.7 cycles** of the round-11 noise field, an activity envelope, and
the round-11 two-tone hue ramp widened for contrast. **2 texture fetches, 2 `sin`, ~20 ALU** —
cheaper than the cloud version it replaces.

### Three traps, each caught by measurement

- **Two comparable carriers make plaid wearing a warp.** First attempt: 0.55/0.45 at 68° apart
  → read as *woven mesh*, a diamond lattice. The reference has ONE family of long arcs with
  fine detail riding on it. Now **0.74/0.26 at 27° apart**, so the second reads as variation
  *within* one family rather than as a second family.
- **13.6 / 9.2 px wavelengths read as moiré, not as waves.** Lengthened to 25 / 15 px. Note
  «Гравюра» was 9.4 px — so its scale was wrong too, independently of its regularity.
- **Whatever moves the warp moves the crests — and this is a direct consequence of wanting
  folds.** Once `W` is large enough to fold wavefronts, the warp *dominates the phase
  gradient*, so crest positions are set mostly by the warp field; translating it translates
  them. Measured with a shift-matching test (best integer shift between frames 16 s apart, vs
  zero shift):

  | configuration | translation explains |
  |---|---|
  | carrier phase drift 0.09 cyc/s | **26.1 %** (shift 11,12) |
  | carrier drift cut, warp drift raised | **45.7 %** — worse; traded one rigid drift for another |
  | both noise fields superposed into both carriers | 33.5 % |
  | + the two warp fields drifting near-**opposite** (20° / 196°) | **19.0 %** — PASS |

  A single drifting field warping a carrier just slides it. A *superposition* of two fields
  travelling along near-opposite vectors has no coherent translation of its own, so the crests
  re-form in place. It costs zero extra fetches — both samples already existed. Carrier phase
  speeds are now near zero (~0.5 px/s) purely to suggest travel.

Contrast widened from ±3.9 % to **±6.1 %** of code value (203 → 229): crests need contrast to
read as crests, and the cloud version's flatness was part of why it read as haze. This is above
the ±4 % originally agreed — flagged deliberately, since ±4 % was chosen when the field had no
structure to carry the read.

**Verified:** shear invariance holds at **max channel delta 1** on 0.06–0.17 % of a pure-water
patch across four cursor positions (the documented ±1 LSB); alive at mean |Δ| 3.6–4.2 between
frames 4 s apart; `prefers-reduced-motion` freezes; `tsc` and build clean.

**The dials, in the order to try them:** `WAVES[].warp` (fold strength — the single most
important constant), `WAVES[].len` (scale), `DEEP`/`LIGHT` (contrast), `CALM` (how much of the
surface goes still). Do not add stages.

---

## Round 12 (2026-08-06) — «Контакты»: the light applied to arbitrary icons

**TEMPORARY page**, built to shoot presentation stills of the client's own icons wearing the
main screen's light. Black field, one icon per full viewport, scroll-snapped. Seven icons
(`public/resources/{Bed,Cup,Office,Park,Restaurant,SPA,Window}-640.svg`).

**The effect transferred with ZERO shader changes**, and that was not luck: `slitLight()` never
referenced the emblem. It reads a three-channel mask through `signMask`/`signMaskSoft`/
`signMaskRay`, and `setSignMask()` already accepted any `TexImageSource`. «Сияние» additionally
runs `primaryIntensity: 0`, `secCount: 0`, `moteAmount: 0` — the hero light IS the mask, so
nothing procedural had to be ported. `MainScreen.rasterizeSign()` moved to
`shared/rasterizeMask.ts` and gained two options; called bare it is unchanged.

**Verified byte-identical, not assumed.** The old function was extracted FROM GIT (ab86430) by a
test rather than retyped, run beside the new one in the same page: **0 differing pixels of
409 600, max channel delta 0**, with a non-blank assertion (36 265 ink px) so the comparison
could not pass trivially. The generalisation is a *placement rect* defaulting to
`(0,0,size,size)`; the smear's new `c + (dx−c)·s` reduces algebraically to the old
`(size−size·s)/2`, so "identical by default" is provable, not hoped for.

**Three findings, each measured:**

1. **Brightness is a property of the ARTWORK, not the preset.** `sign.svg` averages **0.081**
   ink coverage (a starburst of thin slivers); the icons are solid silhouettes at **0.172–0.292**
   — 2.1–3.6× more. The god-ray march accumulates the mask along each ray and divides by the step
   count, so its output is very nearly **linear in coverage**, and the identical uniforms
   white-out. Fixed by dividing `godrays`/`bloom` by each icon's own coverage ratio
   (`maskCoverage()`), which puts an arbitrary shape back at the hero's exposure.
2. **"Zoom the hero" is not the same as "the hero".** Scaling everything so a 640px icon fits
   (`scale = 1.81`) also stretches `falloffL` 780 → **1414 CSS px**, past the corner of a
   1440×900 frame — so the rays never decay and the page reads as **grey fog**. Reference px are
   now CSS px (`scale = renderScale`) and only the APERTURE grows (`signSize = ICON_PX /
   CONTENT_FRAC`), so the falloff keeps its hero magnitude and the corners measure 4–37/255.
3. **«Сияние»'s signature is authored into the emblem, not into the shader.** The emblem is thin
   needles CONVERGING ON THE TEXTURE CENTRE, and the march runs toward that centre — which is
   what drags them into long trails. A solid silhouette has no converging needles, and
   `dissolve: 1` deletes the crisp core, so it can only ever be a soft blob. At `dissolve: 0`
   the same icons read perfectly. **Do not re-tune uniforms trying to get trails out of a solid
   shape; the geometry cannot produce them.**

**Normalisation is not optional polish.** `sign.svg` carries ~14.7 % margin inside its viewBox;
the icons range 4.4 % (Park) to 12.5 % (Window). `signMask()` hard-zeros outside `[0,1]`, so a
tight shape would have its bloom cut along a straight line, and 4.4 % vs 12.5 % renders at
visibly different optical sizes. `contentFrac: 0.706` fits each icon's MEASURED ink box and
centres on the ink, not the viewBox (the shader maps texture centre → convergence point).

**A false alarm worth recording:** the first renders showed what looked like a hard horizontal
seam. Probing per-row and per-column luminance found **no discontinuity** — the largest
row-to-row deltas away from the logo were ~20–28, i.e. the film grain, over a gradient spanning
30–50 rows. High contrast between a lit upper half and a dark lower half reads as an edge. Probe
before fixing.

**Deltas from the hero, all requested:** `signRot` 0 (a tilting bed reads as a bug); `modeMix` 0
— "not going warm on delay" is the idle showreel driving the amber register, and this page has
no showreel; no appearance burst, so stills are reproducible.

**Dev overrides:** `?icon=N` (jump straight to one section — the hook for headless capture),
`?dissolve=`, `?px=`, `?exp=`, plus the existing `?backend=`. Verified on **both** backends.

## Round 12.1 (2026-08-06) — «Контакты»: un-mirrored, an admin panel, perf answered

**1. Every mask has always been rendered VERTICALLY MIRRORED.** Both renderers upload with a
Y-flip (`WebGL2RayFieldRenderer.ts:112` `UNPACK_FLIP_Y_WEBGL = true`; `WebGPURayFieldRenderer.ts:84`
`flipY: true`), both commented "top row -> v=0" — but a Y-flip puts the **bottom** row at v=0,
and the shader samples `uv0 = 0.5 + p/S` with `p.y` running **downward**. Screen-top therefore
reads texture-bottom. `sign.svg` is included in this; it survived unnoticed because a mirrored
starburst still looks like a starburst.

It is a **mirror, not a 180° rotation** — proven by the sparkle stars in `Bed`, which sit
top-left in the mask and rendered bottom-**left**; a rotation would have put them bottom-right.
The distinction is load-bearing: rotating would move Cup's handle to the wrong side.

Fixed **contained to this page** via `rasterizeMask({ flipY: true })`, which pre-mirrors the
source so the two flips cancel. The default stays `false`, so the hero remains byte-identical
(re-verified: **0 differing pixels of 409 600**). Correcting the renderers is the proper fix but
re-orients the emblem and «Прорезь» on a branch awaiting the client's verdict — see open issues.

**2. Admin panel** (`ControlPanel.ts`, schema-driven; `H` hides it; values persist to
localStorage; "Copy URL" emits a reproducible link). The editorial work was deciding what NOT to
expose: at `slitMix: 1` the shader builds the procedural field and **discards** it
(`col = mix(field, slit, 1)`), so `dustAmount`, `dustScale`, `moteAmount`, `hazeBase`,
`primaryIntensity`, `primaryK`, `sec*`, `channelDark`, `refraction`, `fiberDrift`, `angleWarp`,
`ghosting`, `shadow`, `rotSpeed`, `coreRadius`, `crossSize` and `crossIntensity` are **inert
here** and would have been seventeen dead sliders.

Each surviving handle was then **swept min→max and measured**. That caught one more dead
control, which had been in the plan: **the global `#grain` film overlay does nothing on a black
page.** It blends with `mix-blend-mode: overlay`, and overlay against black is arithmetically a
no-op (`b < 0.5 ⇒ 2·b·s`, which is 0 at `b = 0`). Measured Δmean **0.02** across its full range;
removed. The real second noise source is the **per-pixel march dither** (`hash21(fragPx)`, the
round-5 anti-ladder jitter), governed by `steps` — Δmean 16.7, the largest of any noise handle.

**Sweeping by luminance is the wrong test for a perf dial**, and nearly caused a false removal:
`rs` (render scale) measured Δmean 0.05 because *not changing the look is its entire purpose*.
Verified instead by backing-store size and frame time.

**3. Performance — measured, and the answer is not what the question assumed.**

| config | canvas | MPx | median | fps |
|---|---|---|---|---|
| render scale 2.0 | 2880×1800 | 5.18 | 33.1 ms | **30.2** |
| render scale 1.0 | 1440×900 | 1.30 | 16.7 ms | **59.9** |
| render scale 0.5 | 720×450 | 0.32 | 16.7 ms | **59.9** |
| **rs 2.0 + steps 20** | 2880×1800 | 5.18 | **16.7 ms** | **59.9** |
| rs 2.0 + freeze | 2880×1800 | 5.18 | 16.7 ms | 59.9 |

**Seven icons cost exactly what one costs** — one canvas, one renderer, one live mask; icon
count never enters the per-frame cost. The expense is pure fill rate (~109 texture fetches per
pixel: 32 march steps × 3 chromatic taps + 12 bloom taps + crisp), confirmed by dpr 1→2 scaling
the frame time exactly 2.0×. **The main screen already runs at 30 fps on a retina display** —
this is a pre-existing property of «Сияние», not something the showcase introduced.

The useful result: **full retina resolution AND 60 fps is available by dropping march steps 32 →
20**, trading a little ray smoothness rather than resolution.

## Round 12.2 (2026-08-06) — the designer's settings become the defaults; page colour

**Defaults are now the designer's own dial-in**, handed over verbatim as a «Copy URL» link from
the live panel rather than re-derived: `dissolve 0.36`, `core 0.45`, `godrays 1.75`, `bloom
1.05`, `reach 1010`, `exposure 1.3`, `rainbow 0.028`, `grain 0`, `px 220`, `parallax 2`,
`svg 0`, `breathe 1`, `shimmer 0.6`, `freeze 1`. Note `px 220` — a *small* icon with long rays,
much closer to «Сияние»'s starburst register than round 12's 640px. That the panel could hand
back an exact reproducible link is the reason this took one round-trip instead of several.

Two consequences worth knowing: `freeze 1` stops the clock, so `breathe`/`shimmer` sit inert
until freeze is turned off; and **localStorage outranks defaults**, so a browser that has already
touched the panel keeps its own values — press Reset to see these.

**Page colour (`bg`) needed a compositing change to be a live handle at all.** The shader writes
`fragColor = vec4(col, 1.0)` — fully OPAQUE — so the canvas covered the page background and a
colour control would have done nothing. Fixed by giving `.fx-canvas` the project's standard
`mix-blend-mode: screen`, the same model the main screen uses over `#56b7e6`. Screen is
`1 − (1−a)(1−b)`, which against black reduces to exactly `a`, so **turning it on preserved the
existing look bit-for-bit** while making every other colour composite correctly. Verified live:
mean luminance 32.9 (#000000) → 77.9 (#123a5c) → 255 (#ffffff).

That last number is the limit of the model, not a bug: **screen against white is always white**,
so the lighter the page colour the less light can show, and at `#ffffff` nothing shows at all.
Light-on-dark is additive by construction. A light background would need the eclipse composite
mode (`compositeMode: 1`), not a blending tweak.

`ControlValues` widened from `Record<string, number>` to `number | string` for the hex, with a
`normalizeHex()` that accepts `#101820`, `101820` and `#123`. Bare hex matters: a literal `#`
typed into a query string starts the fragment and swallows the rest of the URL.

## Map round 12 (2026-08-06) — the plan squared to the screen; the neighbours removed

Two designer asks, plus one latent bug the first of them exposed.

### The rotation was a SUBTRACTION, and that is why the number is exact

Round 9 set `MODEL_YAW_DEG = 189` — *a half turn (to put the water south) + 9° for the street
grid's real bearing* — so geographic north pointed up the screen. That is correct and was
checked two ways. It is also the reason the embankment arrived on screen slightly tilted: the
**site grid runs 9° off north**, so north-up necessarily delivers the shoreline off-level.

The designer measured the correction in Figma as **−9.05°**. Removing the 9° returns the model
to the grid it was drawn on, which is axis-aligned **by construction** — so the answer is not
"189 − 9.05 = 179.95", it is exactly **180.00°**, and the 0.05 is measurement noise. Measured
on the GLB, baked through the node quaternion and the yaw, in the frame the top-down camera
sees:

| yaw | Арсенальная наб. | shoreline |
|-----|------------------|-----------|
| 189 | −9.00° | −9.00° |
| **180** | **−0.00°** | **0.00°** |

**Measure BOUNDARY edges, not all edges.** An edge belongs to the outline only if exactly one
triangle uses it. A triangulated polygon is full of interior diagonals at arbitrary angles, and
including them buries the signal — the first pass "found" long edges at 3.77°, 144.97° and
−120.52° on a river whose actual banks run at −9°.

Geographic north is now **deliberately abandoned**. `?yaw=189` restores it.

### The rotation's one real hazard, and how it was cleared

Building ids `b00…b18` are assigned by sorting components on **triangle count desc, then
`bbox.min.x`, then `bbox.min.z`** (`buildingSplit.ts`). Rotation cannot change a triangle
count — but it *does* change `min.x`/`min.z`, so **any two parts with an equal triangle count
could swap ids and silently mis-key every entry in `buildingsInfo.ts`**. There is exactly one
such pair on this model: **b13 and b14, both 110 triangles.** They did not swap.

Proved by fingerprinting all 19 parts at `?yaw=189` and at `?yaw=180` and diffing. **Two traps
in the fingerprint itself:** an AABB's *dimensions* and an AABB *centre's* distance from the
origin are **not rotation-invariant** — an axis-aligned box around a rotated object is a
different box. Including them produced a 19-row "mismatch" that was entirely an artefact of the
probe. Only `triCount`, `centroid.y` and the vertical extent survive a yaw; those are what
constitutes proof, and they matched row for row.

### What the rotation moved by itself

- **Street captions** derive their angle by projecting a second point along the feature axis,
  so «Арсенальная наб.» became horizontal with no code change.
- **Focus azimuth** reads `part.axisAngle`, baked in the same matrix — unchanged in behaviour.
- **Framing** is fitted, never hardcoded. Buildings' bbox 21.40 × 21.17 → **22.10 × 19.74**, fit
  scale 14.02 → 13.57, and `overviewHalfH` 161.4 → **147.1 world units (−8.9 %)**. The buildings
  themselves are framed identically (735 → 729 px tall); it is the *plan around them* that is
  cropped tighter, because the frame is fit to the buildings and the plan's relationship to them
  turned.

### The neighbouring blocks were their own primitive — nothing had to be cut

`map-w-river.glb` is one mesh with five primitives, and the three flat classes are cleanly
separated by material:

| prim | material | tris | what |
|------|----------|------|------|
| 2 | `Color_M02` | 57 | **the neighbouring blocks** — the only grey class |
| 3 | `Color_M04` | 15 | Арсенальная наб. + ул. Комсомола |
| 4 | `Color_H08` | 10 | the Neva |

So suppressing `Color_M02` **cannot cut a hole in anything** — that is a property of the export,
not a hope. What shows through is `mapStudio`'s `#dde6e9` ground plate, which already *is* the
site's ground (the GLB carries no surface for the site itself), so the area falls back to the
tone Кресты stands on.

The switch is a `hidden?: true` on the `TONES` entry in `groundPlan.ts`; `GroundPlan` skips
those surfaces. The entry is **marked, not deleted** — round 9.1 added the blocks deliberately
to frame the site, and this is a composition call. Nothing is disposed there: a geometry no mesh
ever referenced was never uploaded, and `MapLabels` is handed the same `flats` array afterwards
and must still see every surface.

### A caption with nowhere to go used to park itself on the logo

Squaring the plan pushed **ул. Комсомола off the top of the frame** — only a ~33 px sliver
survives, and a 21px caption needs its centre at y ≥ 43 (`SOLVE_MARGIN` 28 + half a line box)
plus `MIN_CLEARANCE` 13 of clear road, i.e. the street must reach y ≈ 56. It cannot.

`solve` correctly gave up. But an unanchored label had **no transform written at all**, so it
rendered at the layer origin — the top-left corner, on top of «КРЕСТЫ». This was always true;
it went unseen only because round 10's solver had always found a spot. Fixed with an
`.unplaced` class.

**`visibility: hidden`, never `display: none`** — the solver sizes each label's own box from
`el.offsetWidth`, and a `display:none` element measures 0, so it could never earn its place back
on the next resize.

**Why this is structural, not bad luck:** a street *parallel* to a screen edge is either fully
in frame or fully out. A *diagonal* one always cuts a visible wedge across the corner, which is
what gave the caption room at 189°. Squaring the grid removes that wedge by definition.
Restoring the caption costs about **6 % of zoom-out** (`FIT_MARGIN` 0.95 → ~1.01) — a designer
call, not made here.

### Verified

- Building ids **stable** across the rotation, including the b13/b14 110-triangle tie.
- **Shear invariance holds**: max channel delta **1** on 0.014–0.027 % of a pure-water patch
  across four cursor positions (the documented ±1 LSB), while a control patch over the west
  cross moves on ~80 % of pixels at delta up to 148. *A SHA of the region is the wrong test* —
  round 9's "byte-identical" predates round 11's procedural water, so exact equality can now
  only ever fail.
- 19 buildings / 3 flat surfaces still recovered; focus mode swings and frames correctly on both
  a cross and a small volume; `tsc`, `vite build` and `scripts/interact-test.mjs` clean.

---

## Map round 12.1 (R&D, 2026-08-06) — captions that ride the roofs

Exploratory only; **no code shipped this round.** The question: can captions naming individual
buildings travel with the buildings as the plan leans, and should they be geometry in the GLB or
text layers?

### The result that settles it

Restricted to a horizontal plane at height `h`, the plan-oblique shear
`x' = x + sx·y, z' = z + sz·y` becomes `(x, z) → (x + sx·h, z + sz·h)` — it has **no linear
part left. It is a pure translation.** Three consequences:

- anything sitting on a roof **moves with that roof and never skews**;
- therefore **text baked as flat geometry on a roof would also stay undistorted.** The intuition
  that 3D text would be sheared into a parallelogram is *wrong*, and it matters to say so —
  the GLB option has to be rejected on other grounds, not on this one;
- round 10's interiority argument extends unchanged: an anchor solved inside a roof polygon
  stays inside it at every lean, so the existing **solve-once / project-per-frame** structure
  carries over with no new machinery.

### Measured travel

Tallest roof = 37.9 of `MODEL_SPAN` 300. At `MAX_SHEAR` 0.55 it travels **20.8 world units ≈
6.9 % of the plan width ≈ 70 px** at the default framing. Enough to read clearly as attached
motion; nowhere near enough to throw a caption off screen.

### The three mechanisms

- **DOM, projected — recommended.** Reuses `MapLabels` as it stands. The *only* structural
  change is that `update()` takes the shear matrix and pre-multiplies the anchor before
  `project()` — and for the three existing plan captions that is **provably a no-op**, since
  they live at y = 0 where the shear is the identity. One code path serves both kinds. Crisp at
  any DPR, real ALS Chromius, inherits the site's type, styleable per state, no new deps.
- **Baked into the GLB — disqualified.** Added geometry changes the connected-component set and
  the triangle counts the ids are ordered by, so it **re-keys `buildingsInfo.ts` wholesale**.
  Also: size baked at export, aliased under an orthographic camera, no webfont, no hover or
  focus states, and a re-export for every copy edit.
- **Canvas texture on a plane.** No re-export, but resolution fixed at bake time, the font must
  be loaded and measured in canvas, one texture per caption, and it still cannot inherit the
  site's type styles.

### The shape of the implementation, so it need not be re-derived

A `label?: true` flag on **a curated few** entries in `buildingsInfo.ts` — the designer's pick,
5–7 captions, which is also why no collision solver is needed; anchor = footprint centroid at
`bbox.max.y`, taken through `root.matrix`; a `.map-label--building` class beside `--river` /
`--street`; fade with `MapCamera.focus` like the others.

### Open, and deliberately not solved here

- The solver's obstacle rects (`.concept-home`, `.map-info`) are measured at shear 0. A labelled
  roof can slide **70 px**, so it can travel *under* the left rail or the drawer. Needs a rule —
  and note round 12 just showed what happens when a label has nowhere to go.
- **b00/b01 are welded to their courtyards and apses**, so a cross block's bbox centre can land
  in a courtyard rather than on a roof. The two most important captions are exactly the two that
  need a better anchor than "centroid".
- Whether a caption should follow its building's hover state or stay inert.

---

## Map round 13 (2026-08-06) — the framing tightened, and captions that ride the roofs

Built against the client's own map export (2000×1990 PNG), which is now the reference for
this screen.

### The framing was being set by a slab in the river

The buildings filled 91 % of the frame height already — the cluster only *read* small because
`b18`, the pier, is a 0.09-tall slab standing out past the embankment and was stretching the
fitted box by 20 % of its height for no drawing at all. Framing is now measured on the parts
with **mass** (`massedBox`, `FIT_HEIGHT_FRAC = 0.05`): the cluster went from 57 % to **70 % of
the width and 91 % of the height**, and nothing clips at full lean because the shear reach is
still in the fit.

**The test is a height ratio, not a distance from the cluster.** An outlier is not what is
wrong with the pier — being a ground slab rather than a volume is. On this model the split is
unambiguous (pier 3.3 % of the tallest part, next-shortest `b17` 7.4 %) and it is scale-free,
so it survives a re-export in any units.

**The client's export cannot be matched exactly, and the reason is aspect.** It is square; the
site is 1440×800. In it the cluster fills 90.6 % × 64.3 %; on a 1.8:1 viewport a 1.40-aspect
cluster is height-bound, so 70 % × 91 % is the tightest crop that still shows every building.
Reaching the reference's 90 % width fill would cost ~180 px of buildings off the top and bottom.

### Captions: DOM, anchored on the roof, sheared

Round 12.1's R&D shipped as predicted, and the prediction held exactly.

The mechanism is one line: `update()` now runs every anchor through the live shear matrix
before projecting. **For the three plan captions that is provably a no-op** — they sit on
y = 0, the shear's fixed point — so one code path serves both kinds rather than a per-label
flag guarding a branch that can only ever be false. Measured at full lean:

| caption | kind | travel |
|---------|------|--------|
| Западный / Восточный крест | building | **62.8 px** |
| Ротонда | building | 27.9 px |
| Паркинг | building | 10.7 px |
| р. Нева · Арсенальная наб. · ул. Комсомола | plan | **0.0 px** |

The building figures are the point: **travel is proportional to roof height**, because on a
horizontal plane at height h the shear is a pure translation by `(sx·h, sz·h)`. Nobody had to
implement that; it falls out of anchoring at `bbox.max.y`.

### Building captions are AUTHORED, not solved

The plan captions get a search because a river is a polygon to sit inside. A building caption
belongs to one volume and the client placed each by hand — the two crosses take *mirrored*
quadrants (lower-right and lower-left) precisely so they clear each other's arms and the SPA
block. So `BUILDING_CAPTIONS` carries an explicit offset and `bias: 'fixed'` skips the solver.

Offsets are **fractions of the site span**, never pixels or world units: a fixed distance stops
meaning the same thing the moment the fit changes — which is exactly the mistake round 10
removed from the solver, and this round changed the fit.

The first line is always the building's own `name`, never duplicated in the caption table, so a
rename cannot leave the map disagreeing with the drawer.

### The cross names were swapped, and the client's map is what proved it

The client's export names the screen-LEFT cross «Западный» / Cosmos 4\* and the screen-RIGHT
one «Восточный» / Cosmos 5\*. The code had the two names the other way round. The compass
agrees with the client — under round 9's north-up yaw of 189°, screen-right *is* east — so
round 10.2's empirical assignment was simply wrong on this one point, and round 12 had already
logged the discrepancy as an open issue without being able to settle it.

**Only the names were wrong.** Star ratings, residents and the SPA all sat on the buildings the
client's map puts them on, which is the independent check that this is a two-field fix and not
a wholesale re-keying.

### Ink

`#5d90ac`, the darkest pixel measured in the client's export. The visible bulk of the glyphs
samples lighter (≈`#6897b2`) only because it is antialiased over the near-white field — sampling
the modal tone rather than the extreme would have shipped a caption a shade too pale.

### Verified

`tsc`, `vite build` and `scripts/interact-test.mjs` clean; focus mode swings, the drawer reads
«Западный крест» on the left cross, and all captions fade out with `MapCamera.focus`.

## Map round 14 (2026-08-06) — scroll down to the Neva, and the water becomes tunable

Round 13's tighter framing pushed the river off the bottom of the frame; all that was left at
rest was a blue triangle in the corner. The water could not be judged because it could not be
seen. So: 50 vh of scroll to reveal it, and a `?admin=1` panel to tune it with.

### +50 vh was measured, not chosen

Screenshots at `?fit=2.3` (2.4× zoomed out) converted back to shipped-frame pixels:

| | px from frame centre |
|---|---|
| bottom of the frame | +400 |
| shoreline under the site | **+411** |
| Neva still unbroken at | +968 and beyond |

A 400 px reveal therefore lands on **open water edge to edge**, with the shoreline just at the
top of the revealed band for context. `STAGE_VH = 1.5`, `?vh=<k>` overrides.

### The document does not scroll — `#screen-concept` does

`global.css` sets `html, body { overflow: hidden }` and `.screen { position: fixed; inset: 0 }`,
and the main screen's viewport-pinned layout depends on both. So the scroll is internal: a new
`.map-scroll` inside the screen, holding a 150 %-tall `.map-stage` that owns the canvas and the
caption layer. The chrome (logo, rail, drawer, panel) stays a **sibling** of the scroller — a
scroll container's absolutely-positioned children scroll with its content, so leaving the logo
inside would scroll it off the top. `#grain` and `#white-flash` are fixed on the document and
never see any of it. `mapScroll.ts` owns this, and is the seam the eventual full-page scroll
will hang off.

**Scrolling costs nothing to render.** The camera does not move; the already-drawn canvas
simply slides under the viewport.

### The one thing that would have broken it: the fit is not the canvas

`MapCamera.overviewHalfH()` returns `max(needH, needW / aspect)`, and the current framing is
**height-bound**. Handing it the taller canvas's aspect (1.80 → 1.20) flips it **width-bound**
and renders the buildings **~35 % larger** than round 13's signed-off framing — the exact
opposite of what a scroll added to inspect the water at its shipped scale is for.

So the fit keeps measuring the **window**, and `setOverscan(canvasH / viewportH)` bolts the
extra height on afterwards, in `applyToCamera` only:

```ts
this.camera.top = halfH;
this.camera.bottom = halfH - 2 * halfH * this.overscan;
```

Two properties fall out, and both are load-bearing: world units per pixel are **bit-for-bit
unchanged**, because the frustum grows by exactly the factor the canvas does; and the camera
target stays centred in the top viewport band, so at `scrollTop 0` the composition is the
pre-scroll one — in the overview *and* in focus mode, where the focused building must still
land in the middle of the screen. An asymmetric ortho frustum is already how the drawer inset
works horizontally; same mechanism, other axis.

**Verified**: full-frame diff at `scrollTop 0`, before vs after, max Δ 30 on **0.025 %** of
pixels — all of it subpixel antialiasing on the fat edge lines, with mean luminance moving
212.0222 → 212.0213 (0.0004 %) and the dark-pixel count by 6 in 333,871. Nothing moved or
resized; every caption landed on its old coordinates to 0.1 px.

### Five places measured themselves against the window

`renderer.setSize`, `picker.setResolution`, `picker.setPointer`, `labels.update(w, h)` and the
caption solver's obstacle rects. `mapCam.setViewport` is the one that must **stay** on the
window.

The picker was the silent one: it divided by `innerHeight` internally, so without both halves
of the fix hover drifts by exactly `scrollTop` — the map still highlights buildings, just the
wrong ones. It now stores the resolution `setResolution` was given, and the caller adds the
scroll offset. **Verified** on a 16-point grid: `id(x, y)` at scroll 0 must equal
`id(x, y − 300)` at scroll 300 — 16/16 with `?ob=0`. (With the lean on, 3 probes differ, and
correctly: the lean is driven by the cursor's position in the **window**, deliberately
unchanged, so it is genuinely a different lean at a different window height.)

The picker also now reads the cursor **per frame** rather than per `pointermove`, because the
stage scrolls under a stationary cursor — the same reason the shear already forced per-frame
picking.

### The caption band: one flag, and it was not optional

The solve domain is the whole stage for the river and the **resting viewport** for everything
else (`Label.band`). Both are needed, and each was learned by shipping the other:

- **Full stage only:** both streets sweep south past the resting frame, so «Арсенальная наб.»
  moved from (149, 753) to (474, 828) — lettering on a stretch of road nobody sees at rest.
- **Resting viewport only:** «р. Нева» was `unplaced` *before this round* for want of visible
  water, and the band round 14 reveals is the only place its caption can go.

The rule is "a caption goes where its feature reads", and after this round the two kinds of
feature read in different bands. `obstacleRects` also gained the scroll offset — the obstacles
are pinned to the window and answer in window coordinates, but the caption layer now lives in
the scrolled stage. `MapLabels` takes the stage and the chrome root separately; before this it
found the obstacles through `layer.parentElement`, which would now resolve to the stage and
silently report **no obstacles at all**.

Focus mode pins the scroller to 0 and locks it: the isometric framing assumes the window, and
a scroll fighting the swing has no defined meaning.

### The water's dials are uniforms now

Every tunable used to be interpolated into the GLSL source string and folded into the compiled
program, so changing one meant a recompile — on a slider drag, a recompile per frame plus a
fresh entry in three's program cache each time. The values moved to `waterParams.ts` and
arrive as uniforms; the GLSL is fixed text. Per-fragment cost is unchanged (2 texture fetches,
2 `sin`); headings stay trigonometry on the CPU, so the shader never sees a degree. The carrier
count stays **2** — a carrier is structural, and `amp: 0` silences one.

`inject()` used to generate `uniform sampler2D <name>;` for every uniform, which was only
correct while the single uniform *was* a sampler; the declarations are passed in now.

**Verified**: frozen water, before vs after, over the full river band — **max Δ 1 LSB** on
5.5 % of pixels. That is the ulp tolerance of rewriting `dot(q,d) / len` as `dot(q,d) * invLen`
and `nA·mixA + nB·(1−mixA)` as `mix(nB, nA, mixA)`; exact equality was never available.

### The panel

`?admin=1`, **dynamically imported** so Vite splits it (8.2 kB JS + 2.1 kB CSS) into a chunk a
normal load never fetches — "not visible" and "not shipped" are different claims. 36 rows in 6
sections: warp field, two carriers, surface, noise texture (rebake), view & cost. Labels are
the code's identifiers in English, deliberately breaking the Russian-UI rule: a dial named
`mixA` has to be findable in the file you are about to paste into. Auto-persists to
`localStorage`; a stored set is **merged onto the defaults**, never used raw, or a key added
later arrives as `undefined` and reaches the shader as NaN.

Only the noise section rebakes; water.ts decides that itself by comparing the bake options, so
117 slider writes ran in 805 ms with no recompile and no reallocation.

The river now has its own clock (`waterT`, an accumulator) rather than `performance.now`, so
the time scale can slow or freeze it without the surface jumping phase. Freeze is also how the
pixel-diff proofs above are taken.

**The panel's proof that it reaches the shader**: dropping both carriers' `warp` to 0.3
collapses the surface into the evenly-spaced parallel comb «Гравюра» was — the file's own
documented failure mode, reproduced live, confirming the `W ≳ F/λ` threshold empirically.

### Verified

`tsc`, `vite build` and `scripts/interact-test.mjs` clean (the last byte-identical to its
pre-change output). Shear invariance re-proved: over a 640×230 water region, max Δ **1 LSB**
between two cursor positions while a control patch over a cross moves on 80 % of its pixels at
Δ ≤ 138. Resize resets the scroll and re-fits; `?vh=2.2` gives a 1760 px canvas and 960 px of
scroll. Without the flag there is no `.water-panel` in the DOM and no request for its chunk;
the main screen still has `overflow: hidden`, `scrollY 0` and no `.map-scroll`.

## Map round 14.1 (2026-08-07) — the designer's water, and it inverts two of round 11's rules

The first tuning done with the panel, and the first done against a river you can actually
see. Shipped as `WATER_DEFAULTS`, so it loads for everyone with or without `?admin=1`.

### The river flows now

Round 11 built a surface that **re-forms in place**: warp layers drifting near-opposite (176°
apart) so their superposition had no coherent translation, and carrier phase speed held near
zero because a phase advance is a rigid translation of the crest field. It called that
translation the "obvious scrolling" defect and suppressed it.

Round 14.1 wants it. Headings are now **14° apart** (235° / 249°) and the carriers run at
**0.275 / 0.39 cycles/s with a shared sign**, so the whole field travels one way. A river
visibly flows; a lake does not. Both arguments now sit side by side on the dials — the old
one is still true as physics, it just described a register we no longer want.

### What else moved

| | round 11 | round 14.1 |
|---|---|---|
| tiles | 113 / 157 (both prime) | 351 / 151 |
| drift | 1.1 / 1.05, 176° apart | 3.9 / 2.85, **14° apart** |
| carriers λ | 10.0 / 6.2 (25 / 15 px) | **3.5 / 24.1** (9 / 60 px) |
| carrier speed | 0.02 / −0.025 | **0.275 / 0.39** |
| amplitudes | 0.74 / 0.26 | 0.88 / 0.57 |
| warp | 2.4 / 1.7 cycles | **1.1 / 1.2** |
| base tone | `#c5e0f0` | `#99daff` |
| noise | 256², grid 4, 3 oct, gain 0.5 | **1024², grid 27, 2 oct, gain 0.36** |

**The carrier roles swapped.** The second is now the LONG one — a 60 px swell with 9 px chop
riding it, instead of two near-neighbours. They still read as one family, and it is the
HEADING that does that (20° apart), not the wavelength.

**`tileA` 351 is not prime** (3³·13), so round 11's "both prime" shorthand no longer holds.
The actual requirement never was primality: it is that `lcm(tileA, tileB)` stays far larger
than the ~581 world units visible across the frame. lcm(351, 151) = **53001, ~90×** — a wider
margin than round 11's 17741. Check the lcm, not the primality.

**Warp dropped to just past the folding threshold** (1.1 / 1.2 against `W ≳ F/λ`'s ~1). That
is affordable only because the carriers travel: variety comes from motion and interference
rather than static folding. The two are coupled — lower the speeds without raising the warp
and «Гравюра»'s comb comes straight back.

### Measured on screen, not asserted

600×130 patch of open water, sRGB, against round 11's:

| | R | G | B |
|---|---|---|---|
| round 11 | 170 → 218 | 207 → 239 | 238 → 248 |
| round 14.1 | **118 → 173** | 202 → 234 | **pinned at 255** |

**The blue channel is at the ceiling on 87.5 % of the water.** `#99daff` already has blue 255
and `light[2] = 1.03` pushes past it. This is recorded rather than corrected — the tuning was
done on screen and this is what was approved — but two things follow and are worth knowing
before anyone reaches for these dials: `light[2]` is **inert** as shipped, and all the
surface's variation is carried by R and G, which is why crests read cyan-white rather than as
brighter blue. Lowering `color`'s blue is what puts the channel back in play.

The ramp is also **asymmetric** now: `light` is barely above unity (1.01/1.03/1.03) while
`deep` pulls hard (0.57/0.845/0.985), so the base tone sits at the crest end and all the
modulation happens downward into the troughs.

### The bake got 16× more expensive, and it is fine

`1024²` at 2 octaves measures **31.5 ms / 1 MiB**, against 7.8 ms / 256 KiB at 512 and
1.9 ms / 64 KiB at 256. It earns it: `baseGrid` 27 × 2 octaves puts the finest lattice at 54
cells across the tile, which 256 texels would resolve at under 5 texels per cell. It runs
once, synchronously, inside `new GroundPlan(...)` — after the GLB has loaded and before the
map's first frame — so it costs about one dropped frame at load, not added latency.

### Verified

`tsc`, `vite build` and `interact-test.mjs` clean. A plain load with no flag and no stored
set renders the new water; the frame at `scrollTop 0` is unchanged outside the water itself.

## «Контакты» round 13 (2026-08-07) — the light gets a colour

The light had been pure white since the first shader. The «Контакты» panel now carries a
`light colour` swatch (`?light=56b7e6`), and the tint is a real shader parameter rather than
a CSS gel, so it works on both backends and on any screen.

### It multiplies BEFORE the filmic shoulder, and that is the whole decision

`col *= vec3(u_lightR, u_lightG, u_lightB)` sits as the last line before
`col = 1.0 - exp(-col * 1.6)`.

Before the shoulder = a **coloured light source**: each channel tone-maps on its own, so the
hot core still saturates to white while the falloff and the god-rays carry the hue. Measured
on the red tint, peak luminance stays **765** (= 255+255+255) — there is still a pure-white
pixel in the core. After the shoulder it would cap at 255+0+0 and the whole light would
flatten into **a gel laid over a white lamp**: uniform, plastic, the Photoshop-layer look.
This is the same reason the existing `dusty`/`tint` register drifts live above that line.

It is also placed last among the tints so the dial *wins* over the warm/cool register drift
rather than fighting it. On «Контакты» that is moot — `modeMix` and `sceneDim` are both 0
there — but on the hero it is the behaviour you want from something labelled "the colour".

### Three floats, not a vec3

`RayFieldParams` is deliberately all-`number`: `lerpParams` crossfades variants by walking
`NUMERIC_KEYS`, and a `[r,g,b]` tuple would snap at t = 0.5 instead of blending. `lightR/G/B`
inherit that machinery, and the WebGL2 renderer uploads them with **zero** new code because
it already loops `uniform1f` over its param list. WebGPU needed `p10` — which cost nothing,
because `FLOATS` was already 72 and only 68 were used, so the spare vec4 was sitting there.

### The swatch is normalised to peak 1

`lightTint()` divides by the brightest channel. The wheel is a **hue** dial; `exposure` stays
the only brightness dial. Un-normalised, picking a deep blue also dims the page ~60% and the
designer reaches for the wrong slider. Saturation still costs light in the *other* channels —
that is what makes a colour a colour, and it is why a strong tint reads dimmer overall.
`#000000` falls back to white rather than extinguishing the page.

### Icon placement is a switcher: Center (default) or Corner

`ICON_POS` holds the two compositions as fractions of the slide and the panel picks between
them (`?pos=corner`). **Center — `(1/2, 1/2)` — stays the default**; the shipped look is
unchanged.

`corner` is `(1/4, 1/3)`: the client's layout divides a slide into **4 columns × 3 rows** and
puts the icon's centre on the first gridline of each axis — the col-1/col-2 seam and the
row-1/row-2 seam, i.e. the upper-left third. Fractions, never px: a slide is one viewport and
every viewport differs.

This is a comparison tool, not a menu of looks. The round-8.2 verdict against pickers is
about PRODUCT UI; this is debug furniture that never reaches a client demo.

The offset is applied INSIDE the section (`idx * sectionH + sectionH * fy`), so the
round-12 "the light rides with its section" behaviour is untouched — scrolling still
translates the light rather than cutting between two stationary ones. One pair of numbers
feeds both `centerPx` and the DOM overlay, so the crisp icon and its light cannot drift apart.

`cx` joined the `freeze` cache key. It only changes on resize, which moves nothing else the
key was watching, so a frozen page used to keep a stale frame after a window resize. That was
true before this round too; it is simply easier to hit now that `cx` is not a fixed half-width.

**Do not measure this placement from pixels.** The obvious check — luminance bbox of the
lit region — is wrong by ~80px and the error *scales with viewport width*, which reads
convincingly like a real bug. The god-rays reach the left edge, so `minX` is pinned at 0
while `maxX` tracks the icon, and the bbox centre therefore grows at half the true rate.
Measure `.fx-overlay`'s `getBoundingClientRect()` instead: exact at every size.

### Verified

`tsc` clean. Overlay centre measured from the DOM, exact at every size: `corner` lands on
**(300, 253.3)** at 1200×760 and **(400, 300)** at 1600×900 — both (vw/4, vh/3); `center`
lands on (600, 380) and (800, 450). Switcher exercised end to end: click both ways, `?pos=`
override, reload-from-localStorage, Reset, a junk `?pos=banana` (rejected, falls back to
Center), and Copy URL emitting `?pos=corner#contacts`.

**`<label>` cannot wrap a segmented control.** `button` is a labelable element, so a row built
as a `<label>` labels its FIRST segment — clicking the row's own text ("position") silently
activates it. Playwright's accessible-name resolution is what caught it, reporting the Center
button as named "position Corner". Choice rows are `<div role="group">` for that reason; the
slider and colour rows stay `<label>`, which is correct for a row owning one control.

Mean lit-pixel RGB sampled from real
screenshots, **both backends, agreeing to within 0.1/255** — which is the mirrored-twin check, not a formality:

| `?light=` | r | g | b |
|---|---|---|---|
| `ffffff` (default) | 41.0 | 45.4 | 51.1 |
| `ff0000` | 43.6 | 7.2 | 9.0 |
| `56b7e6` | 22.6 | 40.0 | 51.7 |
| `ffaa33` | 41.9 | 36.2 | 20.4 |
| `000000` | 40.4 | 44.8 | 50.6 (= white, guard holds) |

The default row is not neutral grey because the shader's own cool far-field drift is still
there — correct, and the proof the tint composes with it instead of replacing it. The main
screen is unchanged: ×(1,1,1) is exact identity, and every variant in `base` ships white.

---
## Map round 15 — the straight-roads GLB (2026-08-07)

The designer re-exported the site model: both roads **straightened** (they were kinked
ribbons wandering several degrees across the frame, and the shoreline followed the
embankment's far edge, so it was kinked too), and the neighbouring city blocks **deleted at
source** rather than hidden. `map-w-river.glb` → `map-fixed-roads.glb`.

### The swap itself is a no-op. That was measured, not assumed.

`buildingSplit.ts` carried the warning *"replacing the GLB invalidates the mapping"*, so the
first job was to find out whether it applied. It does not:

| | result |
|---|---|
| **Building ids** | **19 parts, `b00`…`b18` — identical order, triangle counts, bboxes and centroids to 3 dp** |
| b13/b14 (tied at 110 tris) | b13 is still the `min.x = −10.68` one |
| Connected components | 27 (19 + 8) in both, before and after absorption |
| `overviewHalfH` | 119.54242695 → 119.54243826 (1.1e-8 relative) |
| Silhouettes at rest | **pointwise identical** — 5 scanned rows, every edge transition on the same pixel |
| Picking | 5 probes → same building, same drawer copy |
| Water | untouched: the shader reads world XZ (`vFlow`), not UV, so a bigger river polygon does not rescale the waves |

The warning is about the **sort key**, not the file. What moves an id is re-modelling a
building (its triangle count moves it in the sort) or re-orienting the model (`min.x`/`min.z`
are not rotation-invariant). A roads-only edit touches neither. The header now says that
instead, plus: re-run the split and diff, do not assume either way.

**How this was measured without editing anything.** Both GLBs were loaded through the real
pipeline by importing `buildingSplit.ts` from the Vite dev server inside a Playwright page —
Vite transpiles the project's TypeScript on demand, so the comparison runs the shipping code,
not a reimplementation of it. And the new model was driven through the **live app** with
`page.route('**/map-w-river.glb', …)` serving the new bytes, so the whole screen could be
exercised before a single file changed on disk. Worth reaching for again: it turns "will this
break?" into a measurement.

### What actually broke: `triCount >= 4`

`mapLabels.ts` filtered street components on triangle count. The old kinked ribbons were 9
and 6 triangles; **the straightened ones are 3 and 2**, so both were filtered out. And the
guard below read `if (!water || streets.length === 0) return;` — one early return shared by
all three plan captions — so the river caption went with them.

**Result: «р. Нева», «Арсенальная наб.» and «ул. Комсомола» all vanished because the roads
got SIMPLER.** Nothing logged, nothing threw; the map just quietly lost its place names.

Two separate lessons, both already learned once in this codebase:

- **Triangle count measures modelling detail, not size.** `buildingSplit.ts` says so in its
  own header, and its `MIN_FOOTPRINT_FRAC` exists because a church column has 44 triangles.
  The street filter is now `horizontalRun(c) >= siteSpan * 0.25` — a road crosses the site by
  definition, and the two real ones measure 2.4× and 4.8× the span, so the threshold is a
  wide moat rather than a tuned number. The `.slice(0, 2)` sorts by run for the same reason.
- **Do not share an early return between independent features.** The river's caption has no
  business depending on whether the streets parsed. Each has its own guard now.

### «Арсенальная наб.» follows its road below the fold

Straightening the embankment dropped it from a diagonal crossing the resting frame to a level
band **~48 px below it**. Round 14 had given the streets `band: 'rest'` precisely because
`full` let this caption settle 28 px below the fold — lettering road nobody saw at rest. That
premise is now gone: at rest there is no road to letter at all, so a `rest` solve returns
`unplaced`.

Same rule, opposite answer — *a caption goes where its feature reads*. Both streets get
`'full'`; it places at (388, 809), horizontal, on the white band. For «ул. Комсомола» the flag
is inert either way: that one sits **above** the frame, and the stage only extends downward.

A composition consequence worth noting: **at rest the map is now pure land.** The old kinked
shoreline poked a blue triangle into the bottom-left corner — the very artefact that prompted
round 14's scroll — and the straight one clears the frame entirely.

### `Color_M02` is gone from the export, and the entry stays anyway

The blocks were hidden in round 12 and are now deleted upstream, so `TONES.Color_M02` matches
nothing. It is kept regardless: without it, a re-export that brings the material back would
fall through to `FALLBACK`, which is `0xccd7dd` at depth 1 — **exactly** the tone they were
drawn in before round 12. They would reappear, correctly styled, looking like they had never
been removed. Three lines of guard against un-deciding a composition call by accident.

### The Ротонда went flat, and the model was not to blame

Deleting a few roof triangles on b04 in Blender cost the drum its two white ribs in plan
view — it dissolved into the roof of the block it stands on. The obvious reading is "the
geometry is gone". It is not:

| | base rib | mid rib | top rib |
|---|---|---|---|
| before | 55 segments | 50 | 50 |
| after | 55 segments | 50 | 48 |

Same ribs, same heights, and the drum renders perfectly in focus view. What changed is who
won a **coplanar depth tie**. An edge line is exactly coplanar with the two faces that
generate it, so whether it survives `depthTest` is decided by float error in the rasteriser's
depth interpolation — which depends on how the face was triangulated. Re-tessellating the cap
changed the interpolation and the ribs started losing a toss they had been winning by luck.
Measured on row y=655: 119/106/121 → 89/91/91 against an 89,176,230 fill.

**Fix: `polygonOffset` on the edge material** (`-1` factor, `-4` units) — the same tool
`groundPlan.ts` uses for the pier-vs-river flicker, biasing the depth VALUE and never the
vertex, so nothing moves on screen. It reproduces the pre-round-15 render **exactly** at all
three rib pixels, and cuts the whole-frame difference from the old model over building area
from 8,103 px to 3,123 px — a lot of interior lines model-wide had been losing the same tie
unnoticed. The drawing is crisper than it was.

**Disabling `depthTest` is the wrong fix and the measurement says so**: it over-reveals
(137/115/138 — *brighter* than the old model), because it also draws edges that a building in
front should legitimately hide. The bias must win coplanar ties and nothing else.

The general lesson is worth keeping: **an exporter's triangulation is not a cosmetic detail
once anything in the pipeline depends on coplanar depth ordering.** Nothing about "delete 4
triangles" predicts "a building loses its drawing", and no amount of reading the diff would
have found it — the answer came from toggling `depthTest` and watching the pixels.

### Naming ул. Комсомола cost 8 % of zoom, and round 12 had already priced it

Straightening the roads narrowed the upper street from a tilted wedge dipping 58 px into the
frame to a level band showing 36 px. Its caption had been `unplaced` since round 12 either
way, and instrumenting the solver says exactly why: the box needs its centre at
`SOLVE_MARGIN (28) + half.y (14.9) = 42.9` from the top **and** `MIN_CLEARANCE (13)` clear of
the road's near edge at 36.1 — a contradiction by ~20 px. It needs the road's near edge at
≥ 55.9 px.

`FIT_MARGIN` 0.95 → **1.03** buys exactly that, and the value is measured: 1.00 still leaves
it unplaced, 1.03 is the first that places it (at 563, 28). Round 12's open issue had priced
this at "~33 px vs ~56 px, roughly 6 % of zoom-out" — an independent re-measurement three
rounds later landed on 36 vs 55.9 and 8 %. Good sign for the method.

Also gained: Арсенальная наб. rises back inside the resting frame, so both roads read as
ribbons top and bottom with both streets named, and **all seven captions place — a first for
this screen.**

### A `full`-band caption may not straddle the fold

That widening immediately produced a new defect: with the embankment's road back in the
resting frame, the solver placed its caption at y 778.9 with a box reaching 808.7 — 9 px
amputated by the 800 px viewport until you scrolled.

Demoting it to `band: 'rest'` does not work, and the reason is worth stating: that road's near
edge is now *below* the rest band's ceiling, so the constraint makes the caption unplaceable
again. The legal domain is genuinely **two regions**, above the fold and below it, not one
shifted region — so the seam itself is rejected (`straddles()`, applied in both the general
search and `solveStreet`) and the search takes whichever side has room. It moved 10 px up and
sits whole.

### Smaller things the new export changed

- The node **translation is gone** (`[0, 1.0923, 0]`), with the geometry shifted to
  compensate. Invisible downstream only because `mesh.matrixWorld` is baked wholesale and the
  model is re-seated on `massedBox` + `groundY`. That is the reason not to reach into the node
  for its quaternion.
- The flat primitives are **no longer exactly coplanar** — 3.4e-3 local units of scatter,
  ≈1e-4 after normalizing to the 300-unit span. Three orders below what `PLAN_PUSH` resolves,
  and ~1e-4 px of shear travel at full lean. The plan's invariance is numerically intact but
  no longer algebraically exact; `groundPlan.ts` says so, so nobody re-derives it from an
  equality that has stopped holding.

## Map round 16 (2026-08-07) — the map becomes a page: resident sections under it

The brief: put the «Контакты» icons on «Концепция» after the map with a white gap, one
section per group of residents, each on its own bright background colour, the colour
changing smoothly between sections, and kill the sticky scroll so it reads as a normal page.

Round 14 had already written down what this would take, in `mapScroll.ts`'s own header —
"when content lands before and after the map, the stage becomes a section in a document
rather than a pane in a fixed screen, and nothing else moves". That held: the scroller
gained siblings and nothing about the map's framing moved. **Proven, not assumed** — see
Verified below.

### The one thing in the brief that could not be built

**Bright backgrounds and the hero light are mutually exclusive, by construction.** The
canvas composites with `mix-blend-mode: screen` = `1 − (1−a)(1−b)`, which can only lighten;
this log already carried it as a standing limitation ("`bg` is useless above roughly 70%
lightness"). Offered the choice, the user kept the light, so the palette went deep instead
— seven jewel tones at roughly 15–22% lightness. Making the light survive a bright field is
not a palette change, it is the eclipse composite mode.

### Nothing about the sections is authored

Every resident in `buildingsInfo.ts` already carries a `ResidentType`, so a group is a set
of those types and membership falls out of the map's own data — the section list and the
building drawer cannot drift apart because there is one table and it is the drawer's. The
user's own example of a name to invent, «Cosmos Selection», turned out to have been written
into this repo three rounds earlier.

Two things the sweep had to do that a naive filter would not:

- **Merge by label, summing `count`.** «Офисы резидентов» is listed on four separate
  buildings (8 + 12 + 9 + 6) and «Кафе» on two. Unmerged, the offices section prints the
  same row four times and claims nothing; merged it reads 35, which is the actual fact.
- **`rooms` is a building-level fact, not a resident**, exactly as `summarize()` already
  treats it — so the hotels section folds in 262 the same way rather than missing it.

`hall` is the one type that genuinely spans two groups («Концертный зал» is culture,
«Переговорные» is what you book from your desk). Rather than split the type and re-key the
drawer's summaries, one `LABEL_GROUP` table re-points the mis-fits — the only place
membership is decided by name rather than by data. `service` and `parking` reach no section
on purpose; `buildingsInfo.ts` already records that back-of-house is not a selling point.

### The gap is 0.8 vh because three things have to happen in order

Not a taste number. The map's canvas is **opaque** and covers its whole stage, so any
crossfade that starts while the map is still on screen happens *behind it* and is simply
lost — the reader then meets an already-coloured page the instant the map clears. The first
build used 0.24 vh and did exactly that: measured, the light was still gated off at the
first seam and the white was never seen.

With the blend band centred on the first section's top, the fade begins at
`top0 − viewH·(0.5 + BAND_VH/2)`. Requiring that to land after `scrollTop = stageH` gives
**gap > 0.8 viewports**. The same figure independently clears the light: section 0's icon
enters the frame at `top0 − viewH·(1 − ICON_FY)`, which at 0.8 also lands after the map. One
number satisfies both, and it is the smallest one that does.

The gap element deliberately has **no background of its own**. `.res-bg` is the single
source of the page colour; a hard-coded white there sits as an unfading band across the
crossfade the plate is running underneath it.

### Pure colour, blended only at the seam

The user was explicit that the background is a pure colour that changes smoothly, not a
gradient. So each section holds its exact hex across almost all of its height and the blend
runs over a band of 0.6 vh centred on the boundary. **The sample point is the viewport
centre**, which is what makes the band the right size — when a boundary sits at the centre
the screen is exactly half each section and the mix is exactly 50/50.

Interpolation is `color-mix(in oklab, …)`, feature-detected once. Two deep saturated colours
lerped in sRGB pass through a muddy neutral, and this log already records being caught
assuming a linear ratio is the ratio you see (water round 11).

### The swap has to dip, because free scrolling removed what hid it

ONE canvas means one mask, so at some scroll position the mask is swapped. «Контакты» could
hide this behind its scroll-snap; a page you read cannot. The icons sit exactly one viewport
apart, so the outgoing and incoming icons meet at the frame edge with neither overlap nor
gap — but the light's ~1010 px falloff reaches far past the icon, so swapping at full
brightness pops a halo across the whole frame.

So the canvas opacity follows an envelope on the active icon's own screen position, flat
across the middle and rolling off in the outer fifth, reaching **exactly 0 at the swap**.
Measured across a handoff: `1.000 → 0.910 → 0.364 → 0.000 → 0.358 → 0.906 → 1.000`, and all
six handoffs measure a minimum of exactly 0.0000.

**And that survives sections of unequal height, which is not luck.** Two groups outgrow the
viewport (`min-height`, so they may), which breaks the tidy "icons are exactly one viewport
apart" argument. The spacing between consecutive icons is

```
s = (2/3)·h[i] + (1/3)·h[i+1]
```

so `s ≥ viewH` for *any* set of heights where every `h ≥ viewH` — which `min-height: 100%`
guarantees. Spacing can only ever be too large, and too large just means a beat with no
light at all, never a swap at brightness. The dip is structural.

This is the shipped «Слайдер» rule reused, not a new invention — *the light dips, it never
flashes*.

One trap worth recording, because it cost a false failure: the handoff is at
`(iconA + iconB)/2 − viewH/2`, not at `(iconA + iconB)/2`. The active icon is chosen by
distance to the viewport **centre**, so a probe that forgets the half-viewport samples the
plateau and reports a 0.96 minimum on a mechanism that is in fact reaching zero.

### Two triggers for the chrome, not one

The logo is authored `#123a5c` for the near-white map and vanishes on a deep section; white
would in turn vanish against the white gap. So its flip is driven by the **background's own
luminance**, computed from a numeric sRGB mix even though the emitted colour is an
unparseable `color-mix()` string.

The hover rail leaves on a **different** trigger — whether the map is still on screen. It
reads «Наведите на здание, чтобы узнать о резидентах», and tying it to darkness left that
instruction standing over the white gap, addressed to a map that had already scrolled away.
Caught by looking at the frame, not by a test.

### Three consumers of `scrollTop` that were bugs waiting to happen

Before this round `scrollTop` *was* the map's scroll, because the map was all there was.

| consumer | what would have happened |
|---|---|
| `toBottom()` — the river hint | targeted `scrollHeight`; would now fly past seven sections to the foot of the page |
| `picker.setPointer(x, y + scrollTop)` | pick point dragged out past the stage |
| `labels.update({ scrollTop })` | caption solve domain dragged with it |

All three now read one clamped accessor, `MapScroll.mapScrollTop`, so the clamp exists once.

### Never two renderers in one frame

Three.js and the ray field are gated on whether the map stage still intersects the viewport
— the map is above, the sections below, and neither is ever wanted while the other is. This
was **measured directly** rather than argued: WebGL draw calls counted per canvas, patched
onto the context prototypes before any page script runs.

The lazy warm-up caught a self-inflicted bug worth recording: the first form was
`scrollTop > stageH − 2·viewH`, and at the shipped 1.5 stage that is **negative** — so it
fired on frame one and quietly gave a second GPU context to every visitor, including one who
never scrolled. Measured against the first section's own top instead, at 1.5 viewports:
warms at 640, which is past the river hint's 400, so «посмотреть Неву» stays a purely map
interaction and there is still ~670 px of runway before the first envelope lifts off zero.

### One module rule now reads wrong

`.claude/rules/architecture.md` says `screens/concept/ → imports from: shared/, three`, and
this round has it import `gpu/rayFieldTypes` plus the two renderers. That is consistent with
the rule's own stated rationale — the constraint is that **`gpu/` must never import from
`screens/`**, so the GPU layer stays portable, and `screens/main` and `screens/contacts`
already import `gpu/` the same way. Only the line is stale. It needs:

```
screens/concept/ → imports from: gpu/ (via rayFieldTypes interface), shared/, three.
                   The ONLY place three.js may appear.
```

That file and `CLAUDE.md` are both untracked and local, so neither is edited from a
worktree; the amendment is noted here so the reason survives.

### Verified

- **The round-14 framing invariant holds exactly.** `overscan` still 1.5, canvas still
  1440×1200, and the map at `scrollTop 0` is **0 differing pixels out of 1,147,753**
  compared before vs after. The water animates, so the moving pixels were identified
  self-calibratingly (two baseline shots 1200 ms apart, dilated 2 px) and excluded — 4247 of
  them. This mattered because round 14 recorded that a taller canvas flips the height-bound
  fit to width-bound and renders buildings ~35% larger; the claim that *siblings* cannot do
  that (percentage height resolves against the content box, not `scrollHeight`) is now a
  measurement.
- **Captions identical**, all 7, same text and same placed positions.
- **Picking invariant**, round 14's own proof re-run with the clamp in place:
  `id(x, y)@0 === id(x, y−300)@300` at `?ob=0`, **20/20**.
- **Colour purity exact** at every section midpoint — `rgb(19,42,82)`, `rgb(78,18,31)`,
  `rgb(69,38,18)`, `rgb(13,57,55)`, `rgb(56,19,63)`, `rgb(42,36,80)`, `rgb(20,53,29)` — and
  monotonic across the band with no reversal.
- **Both backends**: forced `?backend=webgl2` renders the sections with no page errors, and
  WebGPU is what the default picks.
- Focus mode still opens, still locks the scroll; the river hint lands on the map bottom
  (400) and not the page bottom (6640); `touch-action` is `pan-y` on the scroller and no
  longer `none` on the screen.
- `tsc`, `vite build` and `scripts/interact-test.mjs` clean. The single 404 the smoke test
  logs is **pre-existing** — it is in the pre-change baseline log too.

One honest note on the probes: the 8-point pick fingerprint is mildly nondeterministic
because the lean is still settling at 120 ms, and one run in four disagreed with itself. The
`?ob=0` proof above is the deterministic one and is what the claim rests on.

## Open issues

- **[OPEN] Round 16's `.res-bg` plate re-antialiases the two ROTATED street captions.**
  Found when rounds 15 and 16 were merged: the map at `scrollTop 0` differs from round 15
  alone by **3,704 px of 1,152,000**, and removing `.res-bg` at runtime makes the two trees
  **pixel-identical (0 differing)** — so the plate is the whole cause. It is confined to
  «ул. Комсомола» and «Арсенальная наб.»: both carry a ~0.31° rotation
  (`matrix(0.999985, −0.0054, …)`), while the unrotated building captions are bit-identical.
  Computed transform, colour, opacity and bounding rect are the SAME to 0.1 px in both trees,
  and the background colour under them is unchanged (245,245,245) — only the glyph AA moves,
  neighbouring pixels trading darkness. Invisible at 1:1 and not a framing or solver change
  (all seven captions sit on identical coordinates). Logged because the cause is known and
  cheap to re-find, not because it needs fixing.
  **Method note worth keeping: the noise floor here is 0.** Two shots of one page AND two
  independent page loads of the same tree both diff to 0 px, so any non-zero result on this
  screen is real and must be explained — do not wave it off as animation. (The water did not
  move in any of these captures.)
- **[OPEN] `bg` is useless above roughly 70% lightness** — screen blending cannot darken, so
  pale page colours wash the light out and `#ffffff` renders a blank white page. If the designer
  wants light backgrounds, that is the eclipse composite mode, not a CSS change.
- **[OPEN] The renderers upload every mask Y-flipped, so `sign.svg` renders mirrored on the
  hero and on «Прорезь».** Round 12.1 cancelled it for «Контакты» only. The real fix is
  `flipY: false` in both renderers plus dropping `flipY` from the contacts call — three lines,
  but it re-orients the shipped emblem, so it wants the designer's nod first.
- ~~**[OPEN] The showcase ships at `dissolve: 1`, where solid icons are not legible.**~~
  **RESOLVED (round 12.1):** the verdict on the round-12 stills was "the icon is barely seen,
  too much noise around it", so the defaults moved to the user's «clearer» pick — `dissolve`
  0.35, `grain` 0.02, SVG overlay 0.4. Both registers remain reachable from the panel.
- **[OPEN] Panel defaults are a starting point, not a designer's pass.** `dissolve 0.35` /
  `core 1` / `svg 0.4` were chosen to answer the legibility complaint, not tuned against the
  deck. The panel exists precisely so this is settled by sliding; "Copy URL" captures whatever
  wins.
- **[OPEN] `exposure` is 1 and untested against a designer's eye.** Coverage normalisation
  corrects ink, not aperture area (500 → 906 ref px), so a residual trim may be wanted. Measured
  frames sit at mean 65–80/255 with corners 4–37; it is now a panel handle.
- **[OPEN] «Контакты» is a temporary page on a real nav link.** `layout.ts` now routes
  `kontakty` to it. It is not designed UI and must be reverted or replaced before the client
  sees the nav as finished.

- **[OPEN] `localStorage` shadows the shipped defaults in admin mode.** `?admin=1` restores
  the last panel session, merged onto the defaults — so after editing `WATER_DEFAULTS` you
  will still see the old tuning until you press **Reset**. A plain load is never affected.
- ~~**[OPEN] There is no touch scrolling on the map.**~~ **RESOLVED (round 16):** the
  surrounding content landed, which settles it. `touch-action` is `pan-y` on the scroller,
  vertical drag scrolls, and the lean is horizontal-drag-only on touch. That is exactly the
  demotion round 14 declined to make — but with seven sections below the map the alternative
  was a page whose lower two thirds no phone could reach, and an interaction nobody can get
  past is worse than a halved one. Unchanged with a mouse.
- **[OPEN] The seven section titles, leads and colours are a starting point, not a
  designer's pass** (round 16). «Магазины и мастерские» in particular is a title covering two
  types that had no icon of their own, and the seven hexes were picked to be deep enough for
  the light and distinct from each other — not against the deck. All of it is authored in one
  table in `residentGroups.ts` precisely so the pass is a text edit.
- **[OPEN] The SPA section is four fifths invented** (round 16). The map carries exactly one
  spa resident, and a section of one line is not a section, so «Хаммам и сауны» / «Бассейн
  25 метров» / «Фитнес-зал» / «Салон красоты» stand in. They are flagged `invented` in the
  data and rendered dimmer, but they are still placeholder copy in a client-facing page.
- **[OPEN] Section icons carry no crisp overlay.** The designer's «Контакты» settings ship
  `svg: 0`, so the icon IS the light at `dissolve 0.36`. That reads well for the bed and the
  cup; the busier silhouettes are worth a second look at section size, and the dial is one
  number.
- **[OPEN] The light washes out mid-crossfade.** Between the white gap and the first deep
  section the background passes through a mid tone, and `screen` over a mid tone is a weak
  light — the icon reads pale for roughly half a viewport of scrolling. It resolves as the
  colour deepens and no one holds still there, but it is the bright-background limitation
  showing through in miniature.
- **[OPEN] Nothing signals that the map scrolls.** The scrollbar is suppressed (as `.bld-scroll`
  suppresses its own, and for the same reason: a permanent grey gutter down a full-bleed map is
  not the drawing). If the reveal ships as a page behaviour rather than a tuning affordance it
  probably wants an affordance of its own.
- **[OPEN] The client's map carries three annotations this round does not build.**
  «SPA-Комплекс» (set vertically) and the white «Отель Cosmos 5\*» are *residents*, not
  buildings — and SPA sits on the courtyard block that is welded into `b01`, so it cannot be a
  building caption at all. «Вход 1 / Вход 2» are arrow annotations, a different object. Also
  the client writes «Бар "Ротонда"» where `buildingsInfo` has «Ротонда»; the caption follows
  the drawer name by design, so changing it means changing the name.
- **[OPEN] Caption placement offsets are eyeballed off the client's export** — `at` in
  `BUILDING_CAPTIONS`, read from a square PNG and re-fitted to a 1.8:1 viewport. They match the
  reference's composition but are not measured to the pixel, and the two cross offsets are the
  only ones the client actually specified.
- ~~**[OPEN] The cross names run opposite to the compass**~~ **RESOLVED (round 13):** the
  client's map settles it — screen-left is «Западный», screen-right «Восточный». Names swapped.
- ~~**[OPEN] Which cross is 5★ and which is 4★ is inferred.**~~ **RESOLVED (round 13):** the
  client's map labels the west cross Cosmos 4\* and the east 5\*, which is what the code
  already had on those two buildings.
- ~~**[OPEN] «ул. Комсомола» is no longer labelled.**~~ **RESOLVED in map round 15** — the
  designer took the zoom-out. Round 12's diagnosis was exact and held for three rounds:
  ~33 px of street against the ~56 px a caption needs, ~6 % of zoom-out to fix. Re-measured
  independently on the new model at 36 px vs 55.9 px, and the first `FIT_MARGIN` that places
  it is **1.03** (1.00 is still short), for ~8 % of size. All seven captions now place.
- **[OPEN] The secondary buildings' identities are a reading of the zoning plan, not a
  lit-letter match.** b00/b01/b02/b04/b15/b18 are certain from geometry; the other twelve
  carry plausible functions from the plan's legend, assigned by which side of the site they
  sit on. If the client can supply the lit schedule (Лит. А/Б/В/Д/К/Л/М/О/П/У/Е4/Е5) with
  positions, the remaining twelve can be pinned exactly.
- ~~**[OPEN] The news block is 20px, not the 22px main text style.**~~ **RESOLVED (round
  10.3):** the site has one base size, 21px, set on `body` and inherited by all body copy.
- **[OPEN] Only the two hotels have a drawer hero photo.** `hotel.webp` is the single
  photograph supplied, and it is used for BOTH crosses — the same image opens for
  «Западный крест» and «Восточный крест». The other 17 buildings open straight into the
  reading column, which is a designed state, not a hole. Needs one photo per building (or
  at least a second for the 4★) before this goes in front of the client.
- **[OPEN] The hover glow is tuned by eye** — `.map-info::before`, 760×580 at `left:
  -300px`, white 0.85 → 0. Deliberately restrained per the brief ("not too much"); it is
  the single dial if the designer wants it stronger or tighter.
- **[OPEN] Resident marks and links are invented** (`residentLogos.ts`, the `brand` fields
  in `buildingsInfo.ts`). Drawn wordmarks and non-resolving URLs, placed so the drawer can
  be judged with real furniture. `cosmosgroup.ru` is the one real destination — and the
  Cosmos mark is a PLACEHOLDER, not the operator's actual identity, which matters now that
  a real company is named on the page. Replace wholesale when tenants exist.
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
