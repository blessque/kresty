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

## Open issues

- ~~[OPEN] Reverse perspective is currently OFF (K=0)~~ **RESOLVED (Map round 3):**
  true polycentric icon splay baked at load, always on.
- **[OPEN] Showreel/hover placeholder photos are gitignored** — a completely fresh clone
  will render those two features without images until real client photos are added
  (rays, nav, transition, map are unaffected).
- v2 default still slightly milky on the horizontal arms — taste dial: `halo` multiplier
  (shader), `hazeBase`, `primaryIntensity`.
- Hover-scene per-link images are placeholders; client photos expected.
- Transition flash timing tuned by eye at 720ms; not yet reviewed by user on a real pointer.
- ALS Chromius VF weight axis range assumed 100–900; not verified with a font inspector.
