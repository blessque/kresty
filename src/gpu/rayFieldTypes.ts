/**
 * Numeric parameter set for the ray-field uber-shader.
 * All distances are in "reference pixels" — the 1440×800 design frame —
 * the shader divides screen coords by u_scale so these numbers are
 * resolution-independent.
 */
export interface RayFieldParams {
  primaryK: number; // angular sharpness of the 4 nav beams
  primaryIntensity: number;
  falloffL: number; // radial falloff length, ref px
  coreRadius: number;
  coreIntensity: number;
  crossSize: number; // cross-glyph arm length, ref px
  crossIntensity: number;
  secCount: number; // secondary (rotating) beams, 0..10
  secK: number;
  secIntensity: number;
  rotSpeed: number; // rad/s, positive = clockwise on screen
  dustAmount: number;
  dustScale: number;
  moteAmount: number;
  grain: number;
  ca: number; // chromatic aberration, radians of angular offset
  hazeBase: number;
  channelDark: number; // eclipse mode: how dark the carved channels are
  parallax: number;
  breathe: number;
  refraction: number; // fiber-bundle visibility inside beams, 0..1
  shimmer: number; // per-beam slow brightness life, 0..1
  fiberDrift: number; // angular migration speed of the fiber bundles, ~0..0.5
  angleWarp: number; // camera-tilt geometry: toward-cursor rods vs away fans, 0..2
  ghosting: number; // lens-flare ghost chain on the camera axis, 0..1
  shadow: number; // hovered links carve dark shadow paths out of the light, 0..1
  signSize: number; // «Прорезь»: emblem span in reference px (mask footprint)
  godrays: number; // «Прорезь»: radial light-scatter strength through the slits, 0..1+
  bloom: number; // «Прорезь»: emissive halo around the emblem, 0..1+
  dissolve: number; // «Сияние»: 0 crisp logo, 1 dissolved into zoom-blur light trails
  /**
   * Colour of the light itself — a per-channel multiplier, (1,1,1) = the white
   * the whole prototype shipped with. Three floats rather than a vec3 on
   * purpose: `NUMERIC_KEYS` below is what `lerpParams` crossfades and what the
   * WebGL2 renderer uploads, and a tuple would snap at t=0.5 instead of blending.
   *
   * Applied BEFORE the filmic shoulder, so a hot core still blooms toward white
   * while the falloff keeps the hue — a coloured light, not a gel laid over a
   * white one. Callers are expected to hand over a colour whose brightest
   * channel is 1; brightness belongs to the exposure/intensity dials.
   */
  lightR: number;
  lightG: number;
  lightB: number;
  hoverMode: number; // 0 brighten+turb | 1 widen | 2 flood | 3 arm-elongate | 4 mote-stream
  compositeMode: number; // 0 additive light | 1 eclipse (bright haze, dark channels)
}

export type ParamKey = keyof RayFieldParams;

export const NUMERIC_KEYS: ParamKey[] = [
  'primaryK',
  'primaryIntensity',
  'falloffL',
  'coreRadius',
  'coreIntensity',
  'crossSize',
  'crossIntensity',
  'secCount',
  'secK',
  'secIntensity',
  'rotSpeed',
  'dustAmount',
  'dustScale',
  'moteAmount',
  'grain',
  'ca',
  'hazeBase',
  'channelDark',
  'parallax',
  'breathe',
  'refraction',
  'shimmer',
  'fiberDrift',
  'angleWarp',
  'ghosting',
  'shadow',
  'signSize',
  'godrays',
  'bloom',
  'dissolve',
  'lightR',
  'lightG',
  'lightB',
];

export function lerpParams(a: RayFieldParams, b: RayFieldParams, t: number): RayFieldParams {
  const out = { ...(t < 0.5 ? a : b) };
  for (const k of NUMERIC_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export interface RayFieldState {
  timeSec: number;
  /** convergence point, internal canvas px, top-left origin */
  centerPx: [number, number];
  /** smoothed pointer, internal canvas px, top-left origin */
  pointerPx: [number, number];
  /** internal px per reference (1440-frame) px */
  scale: number;
  /** slow continuous rotation of the whole light pattern, radians */
  signRot: number;
  beamAngles: [number, number, number, number];
  /**
   * Measured link directions (index-aligned with beamHover) for the hover zone
   * light, and the link geometry the shadow wedge needs.
   *
   * THESE ARE STILL FOUR SLOTS, AND ROUND 11 DELIBERATELY LEFT THEM THAT WAY
   * even though the nav now has five links. They are read only by the
   * PROCEDURAL field — the hover `zone` blaze and the `u_shadow` wedge — and
   * the shipped variant discards that field wholesale: «Сияние»/«Слайдер» run
   * at `slitMix: 1`, and the composite is `col = mix(field, slit, u_slitMix)`,
   * so `field` never reaches the screen. «Призма» (`slitMix: 0`) is the only
   * consumer left, it is a dev-switcher comparison variant, and on it the
   * fifth link simply casts no shadow.
   *
   * The hero's hover DOES respond to all five — through `hoverDir`/`hoverAmt`
   * below, which is the same sum reduced on the CPU where the link count is
   * known. Widening these to five would have cost a uniform-layout change in
   * both backends to feed a code path that is already dead.
   */
  linkAngles: [number, number, number, number];
  /** link center distances from the convergence point, reference px */
  linkDist: [number, number, number, number];
  /** apparent angular half-width of each label seen from the convergence point, rad */
  linkHalfAng: [number, number, number, number];
  beamHover: [number, number, number, number];
  /**
   * Σ hover[j]·(cos aⱼ, sin aⱼ) and Σ hover[j] over EVERY nav link.
   *
   * The slit light leans toward whatever is hovered, and it only ever needed
   * these two reductions — the shader used to compute them itself in a
   * `for (j < 4)` loop over the vec4s above. Neither sum has a per-pixel term,
   * so doing it CPU-side is byte-identical output that scales to any link
   * count, and it moves work off a ~109-fetch-per-pixel shader.
   */
  hoverDir: [number, number];
  hoverAmt: number;
  /** 0 = over flat blue, 1 = over showreel photos (dims the field a bit) */
  bgMix: number;
  /** 0 = normal, 1 = hover "gallery dark" scene: light boosted + warmed */
  sceneDim: number;
  /** 0 = holographic white/rainbow (blue bg), 1 = dusty warm amber (dark scene) */
  modeMix: number;
  /** 0 = procedural field («Призма»), 1 = logo-slit light («Прорезь») */
  slitMix: number;
  layers: number;
  octaves: number;
  params: RayFieldParams;
}

export interface RayFieldRenderer {
  init(canvas: HTMLCanvasElement): Promise<void>;
  resize(widthPx: number, heightPx: number): void;
  /** upload the rasterized emblem mask sampled by the «Прорезь» slit path */
  setSignMask(source: TexImageSource): void;
  render(state: RayFieldState): void;
  destroy(): void;
  readonly backend: 'webgpu' | 'webgl2';
}
