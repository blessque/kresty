import type { RayFieldParams } from '../../gpu/rayFieldTypes';

export interface EffectVariant {
  id: string;
  label: string;
  params: RayFieldParams;
}

const base: RayFieldParams = {
  primaryK: 60,
  primaryIntensity: 1.15,
  falloffL: 780,
  coreRadius: 90,
  coreIntensity: 1.2,
  crossSize: 170,
  crossIntensity: 0.6,
  secCount: 8,
  secK: 7,
  secIntensity: 0.3,
  rotSpeed: 0.03,
  dustAmount: 1.2,
  dustScale: 1,
  moteAmount: 1.0,
  grain: 0.06,
  ca: 0.008,
  hazeBase: 0.14,
  channelDark: 0,
  parallax: 0.8,
  breathe: 0.5,
  refraction: 0.15,
  shimmer: 0.5,
  fiberDrift: 0.08,
  angleWarp: 0,
  ghosting: 0,
  shadow: 0,
  signSize: 380,
  godrays: 0,
  bloom: 0,
  dissolve: 0,
  hoverMode: 0,
  compositeMode: 0,
};

/** «Сияние» params — shared verbatim by the «Слайдер» tab (same light,
 *  different idle behavior: the star slider instead of the old showreel). */
const siyanieParams: RayFieldParams = {
  ...base,
  dissolve: 1,
  signSize: 500,
  godrays: 1.2,
  bloom: 1.1,
  coreIntensity: 0.5,
  coreRadius: 70,
  crossSize: 460, // fallback cross glyph if the mask fails to load
  crossIntensity: 1.2,
  primaryIntensity: 0,
  secCount: 0,
  secIntensity: 0,
  dustAmount: 0.25,
  moteAmount: 0,
  grain: 0.06,
  ca: 0.03,
  hazeBase: 0.05,
  rotSpeed: 0.008,
  parallax: 1.0,
  breathe: 0.25,
  refraction: 0,
  shimmer: 0.3,
  fiberDrift: 0,
  angleWarp: 0,
  ghosting: 0,
  shadow: 0,
  hoverMode: 0,
};

/**
 * ACTIVE variants (feedback round 5). «Сияние» is the hero — the emblem
 * dissolved into zoom-blur light trails (no sharp SVG paths, blown bright
 * core); «Прорезь» (crisp logo-as-light) and «Призма» (procedural prism
 * optics) are kept in the switcher for comparison. «Объектив»/«Диско» were
 * killed in round 4 (kept below as ?fx= data only).
 */
export const VARIANTS: EffectVariant[] = [
  {
    id: 'siyanie',
    label: 'Сияние',
    // the wish-image register: the logo's strokes elongated into soft wide
    // zoom-blur beams from the background, centre blown to a bright hotspot,
    // zero crisp SVG paths (dissolve 1 kills the crisp core + opens rayGate).
    // Glow ("good btw") kept: wide bloom + long-decay god-rays carry it all.
    params: { ...siyanieParams },
  },
  {
    id: 'prorez',
    label: 'Прорезь',
    // the logo as light: crisp emblem core + bloom halo + radial god-rays
    // bursting through the slits toward the viewer, cursor drives parallax,
    // Призма rainbow fringing kept. Procedural field faded out (slitMix→1).
    params: {
      ...base,
      signSize: 440,
      godrays: 0.95,
      bloom: 0.6,
      coreIntensity: 1.3,
      coreRadius: 70,
      crossSize: 460, // fallback cross glyph if the mask fails to load
      crossIntensity: 1.2,
      primaryIntensity: 0,
      secCount: 0,
      secIntensity: 0,
      dustAmount: 0.25,
      moteAmount: 0,
      grain: 0.06,
      ca: 0.03,
      hazeBase: 0.05,
      rotSpeed: 0.008,
      parallax: 1.0,
      breathe: 0.25,
      refraction: 0,
      shimmer: 0.3,
      fiberDrift: 0,
      angleWarp: 0,
      ghosting: 0,
      shadow: 0,
      hoverMode: 0,
    },
  },
  {
    id: 'prism',
    label: 'Призма',
    // crystal/holographic reading of light-angles.png: thin uneven rods,
    // strong rainbow dispersion, lens ghosts — rainbow-needle optics.
    // Round-4 cleanup: laser motes OFF, calmer flicker, cleaner link shadow.
    params: {
      ...base,
      primaryK: 170,
      primaryIntensity: 1.25,
      falloffL: 880,
      coreRadius: 80,
      coreIntensity: 1.6,
      crossSize: 520,
      crossIntensity: 1.3,
      secCount: 0,
      secIntensity: 0,
      dustAmount: 0.3,
      moteAmount: 0, // was the "bullet" laser motes — killed (user dislike)
      grain: 0.07,
      ca: 0.03,
      hazeBase: 0.06,
      rotSpeed: 0.01,
      parallax: 1.1,
      breathe: 0.2,
      refraction: 0.85,
      shimmer: 0.28, // calmer — less rave flicker
      fiberDrift: 0.06,
      angleWarp: 1.5,
      ghosting: 0.7,
      shadow: 0.7,
      hoverMode: 3,
    },
  },
  {
    id: 'slider',
    label: 'Слайдер',
    // «Проектор»: the «Сияние» light + the star photo slider as the idle
    // show — the light throws each slide out of its own centre, then
    // retreats to an ember (modulated CPU-side in MainScreen).
    params: { ...siyanieParams },
  },
  // ---- killed variants (round 4), reachable via ?fx=lens / ?fx=disco ----
  {
    id: 'lens',
    label: 'Объектив',
    // photographic reading of scheme.jpg: the toward/away asymmetry IS the
    // show — one hard rod vs wide breathing fans; filmic grain, deep dusty cone
    params: {
      ...base,
      primaryK: 70,
      primaryIntensity: 1.35,
      falloffL: 900,
      coreRadius: 110,
      coreIntensity: 1.4,
      crossSize: 280,
      crossIntensity: 0.55,
      secCount: 0,
      secIntensity: 0,
      dustAmount: 0.9,
      dustScale: 1.1,
      moteAmount: 1.2,
      grain: 0.12,
      ca: 0.012,
      hazeBase: 0.12,
      rotSpeed: 0.012,
      parallax: 1.2,
      breathe: 0.6,
      refraction: 0.4,
      shimmer: 0.5,
      fiberDrift: 0.06,
      angleWarp: 2.0,
      ghosting: 0.35,
      shadow: 0.9,
      hoverMode: 0,
    },
  },
  {
    id: 'disco',
    label: 'Диско',
    // living-bundles reading: the beam IS a crowd of migrating sub-rays being
    // born and dying — the light never repeats itself; densest streaming motes
    params: {
      ...base,
      primaryK: 110,
      primaryIntensity: 1.15,
      falloffL: 840,
      coreRadius: 90,
      coreIntensity: 1.3,
      crossSize: 420,
      crossIntensity: 1.0,
      secCount: 0,
      secIntensity: 0,
      dustAmount: 0.5,
      moteAmount: 2.0,
      grain: 0.09,
      ca: 0.018,
      hazeBase: 0.08,
      rotSpeed: 0.01,
      parallax: 1.2,
      breathe: 0.35,
      refraction: 1.0,
      shimmer: 0.8,
      fiberDrift: 0.35,
      angleWarp: 1.0,
      ghosting: 0.4,
      shadow: 0.8,
      hoverMode: 4,
    },
  },
  // ---- legacy presets (rounds 1-2), reachable via ?fx= only ----
  {
    id: 'signal',
    label: 'вер. 1',
    params: { ...base },
  },
  {
    id: 'solid-light',
    label: 'вер. 2',
    // McCall hero: wide luminous wedges, heavy grain, prismatic edges
    params: {
      ...base,
      primaryK: 90,
      primaryIntensity: 1.5,
      falloffL: 900,
      coreRadius: 60,
      coreIntensity: 1.0,
      crossSize: 140,
      crossIntensity: 0.5,
      secCount: 4,
      secK: 18,
      secIntensity: 0.25,
      rotSpeed: 0.012,
      dustAmount: 0.7,
      moteAmount: 0.5,
      grain: 0.13,
      ca: 0.006,
      hazeBase: 0.07,
      parallax: 0.4,
      breathe: 0.25,
      refraction: 0.22,
      shimmer: 0.35,
      hoverMode: 1,
    },
  },
  {
    id: 'eclipse',
    label: 'вер. 3',
    params: {
      ...base,
      compositeMode: 1,
      hoverMode: 2,
      hazeBase: 0.9,
      channelDark: 0.8,
      primaryK: 30,
      falloffL: 700,
      coreRadius: 90,
      coreIntensity: 0.5,
      crossIntensity: 0.2,
      secCount: 0,
      dustAmount: 0.5,
      moteAmount: 0,
      grain: 0.08,
      rotSpeed: 0.015,
      parallax: 0.4,
      refraction: 0,
      shimmer: 0.2,
    },
  },
  {
    id: 'cross-flare',
    label: 'вер. 4',
    // THE variant (light-ref-new.jpg): harsh prismatic cross on sparse air,
    // no soft vortex — particles carry the life, cursor is the wind
    params: {
      ...base,
      crossSize: 700,
      crossIntensity: 2.0,
      primaryK: 130,
      primaryIntensity: 0.9,
      falloffL: 820,
      coreRadius: 100,
      coreIntensity: 1.8,
      ca: 0.02,
      secCount: 0,
      secIntensity: 0,
      dustAmount: 0.35,
      moteAmount: 1.6,
      grain: 0.08,
      rotSpeed: 0.01,
      hazeBase: 0.07,
      parallax: 1.3,
      breathe: 0.25,
      refraction: 0.4,
      shimmer: 0.5,
      hoverMode: 3,
    },
  },
  {
    id: 'dust-chamber',
    label: 'вер. 5',
    params: {
      ...base,
      dustAmount: 2.0,
      dustScale: 1.4,
      moteAmount: 2.2,
      primaryIntensity: 0.6,
      primaryK: 50,
      falloffL: 820,
      coreRadius: 90,
      coreIntensity: 0.8,
      crossSize: 120,
      crossIntensity: 0.3,
      secCount: 5,
      secK: 6,
      secIntensity: 0.15,
      grain: 0.07,
      ca: 0.004,
      parallax: 1.4,
      hazeBase: 0.16,
      refraction: 0.1,
      shimmer: 0.4,
      hoverMode: 4,
    },
  },
];

/** How many of VARIANTS (from the top) appear in the segmented control. */
export const SWITCHER_COUNT = 4;

/** Default: «Сияние» — the dissolved logo-light hero. */
const DEFAULT_INDEX = 0;

/** `?fx=` still overrides, including the legacy preset ids. */
export function variantIndexFromUrl(): number {
  const fx = new URLSearchParams(location.search).get('fx');
  if (!fx) return DEFAULT_INDEX;
  const i = VARIANTS.findIndex((v) => v.id === fx);
  return i >= 0 ? i : DEFAULT_INDEX;
}
