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
  `?ob=<k>` URL override.
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

## Open issues

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
- **[OPEN] «Слайдер» dials tuned by eye** (round-6.2 values) — overlay 0.2 (Figma
  had 0.41), hold 7 s, flash breath ×1.4/×1.0/×0.7 @ τ 0.3 s, bloom 1.6 s from
  scale 0.55, dissolve 1/1.2 s + blur 14 px, overlap 0.6 s, headline drift
  16/−14 px; awaiting designer pass.
- ~~[OPEN] Headline vs the blown light core~~ **RESOLVED (round 6.3):** the
  star covers the light's core (plain stacking), so the headline sits over
  the photo, not over the hotspot.
