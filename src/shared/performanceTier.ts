export interface PerfTier {
  /** internal canvas pixels per CSS pixel */
  renderScale: number;
  /** parallax dust layers in the ray shader */
  layers: number;
  /** fbm octaves in the ray shader */
  octaves: number;
  /** internal resolution cap for the three.js map */
  mapPixelRatio: number;
}

export function getPerfTier(): PerfTier {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  const low = coarse || innerWidth < 820 || mem <= 4;
  if (low) {
    return {
      renderScale: Math.min(devicePixelRatio, 1.25),
      layers: 1,
      octaves: 2,
      mapPixelRatio: Math.min(devicePixelRatio, 1.5),
    };
  }
  return {
    renderScale: Math.min(devicePixelRatio, 2),
    layers: 3,
    octaves: 4,
    mapPixelRatio: Math.min(devicePixelRatio, 2),
  };
}
