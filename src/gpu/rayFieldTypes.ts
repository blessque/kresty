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
  beamAngles: [number, number, number, number];
  /** measured link directions (index-aligned with beamHover) for hover zone light */
  linkAngles: [number, number, number, number];
  /** link center distances from the convergence point, reference px */
  linkDist: [number, number, number, number];
  /** apparent angular half-width of each label seen from the convergence point, rad */
  linkHalfAng: [number, number, number, number];
  beamHover: [number, number, number, number];
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
