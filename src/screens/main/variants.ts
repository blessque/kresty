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
  hoverMode: 0,
  compositeMode: 0,
};

export const VARIANTS: EffectVariant[] = [
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

/**
 * The prototype now runs «Cross Flare» only (user decision 2026-07-15, switcher
 * removed). Other presets are kept as data; `?fx=` still works for dev checks.
 */
export function variantIndexFromUrl(): number {
  const fx = new URLSearchParams(location.search).get('fx');
  if (!fx) return 3;
  const i = VARIANTS.findIndex((v) => v.id === fx);
  return i >= 0 ? i : 3;
}
