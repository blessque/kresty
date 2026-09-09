# «Концепция» map — critical rules

Interactive bird's-eye map in **plan-oblique (military) projection**: an orthographic camera
pinned straight top-down while cursor/touch shears the model, so roof plans never distort and
walls extrude on the far side. Three.js is allowed **only** under `src/screens/concept/`.

Read TUNING_LOG's map rounds before touching material, lighting, background, the environment
probe or the water — several non-obvious traps there are load-bearing.

---

## Geometry and building ids

Source is the user's GLB (`public/resources/map-fixed-roads.glb`) — **never regenerate
footprints procedurally**; `buildingsData.ts` is legacy/unused. Round 15 replaced
`map-w-river.glb` with it: straight roads, straight shoreline, no neighbouring blocks.

**Buildings are derived, not authored.** The GLB is one mesh with no per-building nodes, so
`buildingSplit.ts` recovers 19 buildings by connected components. Slivers are absorbed by
FOOTPRINT, not triangle count. IDs (`b00`…) are ordered by **triangle count — i.e. by
modelling detail, not size** — and `buildingsInfo.ts` is keyed by them, so **replacing the
GLB invalidates that mapping.**

**Replacing the GLB is a measurement, not a leap of faith.** Round 15 swapped the whole model
and all 19 ids survived unmoved, because ids sort on triangle count then `bbox.min.x`/`min.z`
and a roads-only edit touches neither. Always re-run the split and diff the ids against the
old file: load both through the shipping `buildingSplit.ts` by importing it from the Vite dev
server inside Playwright, and drive the new model through the live app with
`page.route('**/<old>.glb', …)` before changing anything on disk.

**The model is squared to the SCREEN, not to the compass** (round 12). `MODEL_YAW_DEG` is
**180** — a plain half turn onto the model's own authored site grid, so the Neva's shoreline
and Арсенальная наб. run exactly horizontal. Geographic north was round 9's 189° and is
**deliberately abandoned**; `?yaw=189` restores it. Do NOT "fix" this back to north.
Any change to this constant must re-verify **building id stability**: **b13/b14 both have 110
triangles**, so a rotation can swap them and silently mis-key `buildingsInfo.ts`. AABB
dimensions and AABB-centre radius are NOT rotation-invariant and cannot be the fingerprint.

Neighbouring city blocks (`Color_M02`) were hidden in round 12 and deleted from the export in
round 15, so the `TONES` entry matches nothing. **Keep it anyway**: without it a re-export
carrying `Color_M02` falls through to `FALLBACK`, which is the exact tone they had before
round 12 — they would silently come back looking intentional. The `#dde6e9` ground plate is
what shows through.

**The client's own map export is the reference for this screen** (round 13). It settled the
cross names: screen-LEFT = «Западный крест» / Cosmos 4★ (`b02`), screen-RIGHT = «Восточный
крест» / Cosmos 5★ (`b01`). Do not "correct" these back.

The GLB's normals are smoothed across hard edges by the exporter and are re-creased at load
with `toCreasedNormals`. Do not remove this; it is what makes the geometry read.

---

## Camera, shear and framing

The camera is an ORTHOGRAPHIC camera pinned **permanently straight top-down — it never
rotates**. Cursor/touch drives a plan-oblique shear on a wrapper group
(`x' = x + sx·y, z' = z + sz·y`), so every roof keeps its exact undistorted 2D plan while
walls extrude on the far side. **Do NOT reintroduce camera tilt or any "reverse perspective"
splay** — both were built, rejected and deleted (TUNING_LOG map rounds 3–4).

- Default state is EXACTLY top-down; the lean engages only outside the cursor deadzone and
  leans toward the cursor, through a saturating response curve with a hard cap.
- The frustum is FITTED to the model's measured bounds plus worst-case shear reach on both
  axes — **never hardcode a zoom factor.**
- Framing is measured on the parts with MASS (`massedBox` / `FIT_HEIGHT_FRAC`) — the pier
  `b18` is a ground slab in the river and was stretching the fit by 20 % of its height.
- `FIT_MARGIN` is 1.03, and **higher means the model reads SMALLER**.
- The two cross-shaped cell blocks must stay legibly cross-shaped at any lean angle.
- Dials atop `ConceptScreen.ts`: `MAX_SHEAR`, `DEADZONE`, `RESPONSE_GAIN`, `SMOOTH_TAU`,
  `FIT_MARGIN` (`?ob=<k>` / `?fit=<k>`).

**Selecting a building swings the camera to an isometric focus view** (`mapCamera.ts`),
zooming into the space right of the drawer and dimming the rest. This **suspends the "camera
never rotates" rule in focus mode ONLY** — the overview still must not rotate. The shear
unwinds to 0 as it swings, so the lean is inert while focused. Orientation is slerped between
explicit quaternions (an orbit parameterisation is degenerate at the overview's 90°
elevation), and camera poses must be derived from a `THREE.Camera`, **never a plain
`Object3D`** — their `lookAt` conventions are opposite.

---

## Look

**«Грани»** (the designer's pick): alpha-blended body + fat white edge lines on a near-white
`#f2f6fa` studio field. Material in `mapLooks.ts`, studio (lights, HDR env probe, ground) in
`mapStudio.ts`, edges in `edgeLines.ts`.

Traps: `thickness` is multiplied by model scale; the env probe **must** be HDR float; the
renderer needs a tone-mapping shoulder or lit faces clip flat and the model reads flat no
matter where the lights go.

**Edge lines carry a small `polygonOffset` toward the camera, and it is load-bearing.** An
edge line is exactly coplanar with the faces that make it, so whether it survives `depthTest`
is decided by float error in depth interpolation — i.e. by how the EXPORTER triangulated that
face. Round 15's model re-tessellated the Ротонда's roof and its ribs silently lost the tie;
the drum went flat. **Do not "fix" a missing edge by turning `depthTest` off** — measured,
that over-reveals, drawing edges a nearer building should hide.

---

## Captions

`mapLabels.ts`. All seven place, so **any `unplaced` caption is a regression, not the status
quo.**

**Building captions ride the roofs.** `BUILDING_CAPTIONS` anchor at `bbox.max.y` so the shear
(a pure TRANSLATION on any horizontal plane) carries them exactly as far as their roof —
travel is proportional to building height, and that is not implemented, it falls out of the
anchor height. `update()` shears EVERY anchor; for the y=0 plan captions that is provably a
no-op, so there is one code path — **do not add a flag.** Placement offsets are **fractions
of the site span, never pixels**: the fit changes. Building captions are authored
(`bias: 'fixed'`), NOT run through the solver.

**Captions solve into the band where their feature READS** (`Label.band`). Round 14 set the
river to `full` and the streets to `rest`; round 15 straightened the embankment road ~48 px
BELOW the frame, so the same rule flipped the answer and everything is `full` now. **Do not
"restore" `rest` — re-derive it from where the feature is.** A `full` caption may sit above
the fold or below it but **never across it** (`straddles()`).

**Street components are identified by their RUN, not by triangle count**
(`MIN_STREET_RUN_FRAC`). The old filter was `triCount >= 4`, and round 15's straight roads
are **3 and 2 triangles** — both were dropped, and a guard shared with the river took
«р. Нева» with them, so all three plan captions vanished *because the roads got simpler*.
Same lesson `buildingSplit.ts` records. Never re-couple the per-feature guards either.

`.concept-home` is a caption-solver obstacle (`OBSTACLES`), so changing the wordmark box
means re-verifying that all 7 captions still place.

---

## The Neva — `water.ts`, ONE look, no modes

Round 11 deleted `chop`/`glints`/`gloss` and the `?water=` switch after all four were
rejected.

**Water is made of WAVEFRONTS, and it is anisotropic** — two directional `sin` carriers close
in heading (so they read as ONE wave family) whose phase is warped by >1 **cycle** of a tiling
FBM sampled at two scales. 2 texture fetches + 2 `sin`. Do not add stages.

**All the numbers live in `waterParams.ts`, never in the shader.** A re-inlined literal means
a shader recompile per admin-panel drag plus a program-cache entry each time. Do not quote
values in comments elsewhere; they have already been retuned once.

Two rules survive intact, each learned by shipping the opposite:

- **`W ≳ F/λ` or the wavefronts cannot fold.** «Гравюра» warped by 0.72 cycles and drew a
  ruled comb by construction. Below ~1 cycle you get hatching, every time.
- **An isotropic FBM is a cloud texture.** Round 11's first pass removed the stripes and all
  direction with them: "the river looks like cloud sky".

**Round 14's shipped tuning INVERTED two of round 11's own rules, deliberately** — the warp
layers drift near-**parallel** (14° apart, not 176°) and the carriers travel fast
(0.275/0.39 cycles/s), so the river **flows** instead of shimmering in place. Both arguments
sit side by side on the dials. Do not "restore" the old rule.

Two consequences worth knowing: `tileA` 351 is **not prime** (the real test is
`lcm(tileA,tileB)` ≫ frame — it is 53001, ~90×), and the base tone `#99daff` has blue 255, so
**blue is pinned on 87.5 % of the water** and `light[2]` is inert.

**Never reintroduce `fract`, `abs(x−0.5)` or ridge transforms here** — they multiply frequency
and are what made every hatching failure. A `sin` is fine; it is smooth.

`?admin=1` opens the water tuning panel (`WaterPanel.ts`, **dynamically imported** so it is
never in a client demo's bundle). Freeze (time scale 0) is how pixel-diff proofs are taken.
Verdicts get pasted back into `WATER_DEFAULTS` via its Copy button. Read TUNING_LOG map
rounds 11, 11.1, 14 and 14.1 first.

---

## Scrolling

**The map screen SCROLLS — but the document does not.** `.concept-scroll` inside
`#screen-concept` holds a 150 %-tall `.map-stage` owning the canvas and the caption layer; the
chrome (logo, rail, drawer, panel) stays a **sibling** of the scroller or it scrolls away.
`html/body/.screen` keep `overflow: hidden`; the main screen is untouched. `mapScroll.ts`,
`STAGE_VH = 1.5`, `?vh=<k>`. No touch scrolling yet.

**`mapScrollTop` does NOT exist** (round 18.1 split it): use `stageOffset` for any
window→stage transform (deliberately unclamped, goes negative above the map), `scrollTop` for
page position, `mapVisible` / `pastIntro` for gating.

**The camera fit must keep measuring the WINDOW, never the canvas.** `overviewHalfH` is
`max(needH, needW/aspect)` and this framing is height-bound — the taller canvas's aspect flips
it width-bound and the buildings render ~35 % larger. `MapCamera.setOverscan` adds the extra
height in `applyToCamera` only, so world-units-per-pixel is bit-for-bit unchanged.
**Anything reading `innerWidth/innerHeight` for the CANVAS is a bug**: `setSize`,
`picker.setResolution/setPointer` (add `scrollTop`) and `labels.update` take stage size. The
lean stays window-relative on purpose.

Hover/click live in `buildingPicker.ts`; the left resident drawer in `BuildingDrawer.ts`.
Picking runs **per frame** (the shear moves geometry under a stationary cursor) and the drawer
freezes the lean while hovered.

---

## Status

Everything through map round 16 is merged to `main` and deployed. `buildingsInfo.ts` copy and
the resident logos are placeholder/invented.
