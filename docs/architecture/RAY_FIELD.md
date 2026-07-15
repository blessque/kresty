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
| `u_beamAngles` vec4 | measured link angles (radians, y-down screen space) |
| `u_beamHover` vec4 | eased 0..1 hover per beam |
| `u_bgMix` | 0 flat blue → 1 showreel photos (dims field ×0.72) |
| `u_layers`, `u_octaves` | perf tier: dust parallax layers (≤3), fbm octaves (≤4) |

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
| `parallax` | pointer influence on dust layers + swirl |
| `breathe` | slow per-beam width oscillation |
| `hoverMode` int | 0 brighten+turb · 1 widen · 2 flood · 3 arm-elongate · 4 mote-stream |
| `compositeMode` int | 0 additive light · 1 eclipse (bright haze, dark channels) |

## Section order inside the fragment shader

1. polar coords + pointer offset
2. dust (layered fbm in rotating polar domain, radial-lattice jitter vs rings)
3. motes (Cartesian cells, radially-oriented gaussians, drift + edge fade)
4. primary beams (per-channel CA lobes, hover boosts, beamMaskW, floods)
5. secondary rotating beams
6. core glow + cross glyph (8 arms: 4 bright axis-aligned + 4 faint diagonal)
7. haze
8. composite branch (`compositeMode`)
9. tint (cool far field / warm core), bgMix dim, filmic shoulder, grain+dither

## WebGPU uniform packing

Single 176-byte buffer = 11 vec4s, packed in `WebGPURayFieldRenderer.render()`.
Field order there and in the WGSL `struct U` must match exactly — update both together
(p0..p6 comments name the slots).
