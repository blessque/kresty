import type { WaterParams } from "./waterParams";
import type { WaterPanelHost } from "./WaterPanel";

/**
 * What the water panel puts on screen — data, not DOM. Split from WaterPanel.ts
 * so the renderer stays a renderer: adding a dial is one entry here.
 *
 * Every getter/setter closes over the panel's live working set, so a row needs
 * no knowledge of where the value is stored.
 *
 * The NOTES are not decoration. Each one is a threshold that was found by
 * shipping the wrong side of it — see waterParams.ts and TUNING_LOG map rounds
 * 11, 11.1 and 14.
 */

export type Row =
  | {
      kind: "range";
      label: string;
      min: number;
      max: number;
      step: number;
      get(): number;
      set(v: number): void;
      /** shown after the value, e.g. the screen-px equivalent of a wavelength */
      aside?(v: number): string;
      note?: string;
    }
  | { kind: "color"; label: string; get(): number; set(v: number): void }
  | {
      kind: "select";
      label: string;
      options: number[];
      get(): number;
      set(v: number): void;
    }
  | { kind: "action"; label: string; run(): void };

export interface Section {
  title: string;
  note?: string;
  rows: Row[];
}

/** panel-owned state that is not part of the water look */
export interface ViewState {
  timeScale: number;
  pixelRatio: number;
}

/** px per world unit at the overview camera — only annotates wavelengths, so a
 *  constant rather than a live camera read */
const PX_PER_UNIT = 2.48;

export function waterSections(
  p: WaterParams,
  host: WaterPanelHost,
  view: ViewState,
  push: () => void
): Section[] {
  const wave = (i: 0 | 1): Section => ({
    title: `Carrier ${i + 1}`,
    rows: [
      {
        kind: 'range',
        label: 'len',
        min: 1,
        max: 40,
        step: 0.1,
        get: () => p.waves[i].len,
        set: (v) => (p.waves[i].len = v),
        aside: (v) => `${(v * PX_PER_UNIT).toFixed(0)} px`,
      },
      { kind: 'range', label: 'head°', min: 0, max: 360, step: 1,
        get: () => p.waves[i].head, set: (v) => (p.waves[i].head = v) },
      { kind: 'range', label: 'speed', min: -0.5, max: 0.5, step: 0.005,
        get: () => p.waves[i].speed, set: (v) => (p.waves[i].speed = v),
        note: i === 0 ? 'phase advance is a RIGID translation — keep near 0' : undefined },
      { kind: 'range', label: 'amp', min: 0, max: 1, step: 0.01,
        get: () => p.waves[i].amp, set: (v) => (p.waves[i].amp = v) },
      { kind: 'range', label: 'warp', min: 0, max: 6, step: 0.05,
        get: () => p.waves[i].warp, set: (v) => (p.waves[i].warp = v),
        note: 'cycles. Below ~1 the crests cannot fold and the river becomes «Гравюра» hatching' },
      { kind: 'range', label: 'mixA', min: 0, max: 1, step: 0.01,
        get: () => p.waves[i].mixA, set: (v) => (p.waves[i].mixA = v) },
    ],
  });

  const ramp = (key: 'deep' | 'light'): Row[] =>
    (['r', 'g', 'b'] as const).map((ch, k) => ({
      kind: 'range' as const,
      label: `${key}.${ch}`,
      min: 0.4,
      max: 1.6,
      step: 0.005,
      get: () => p[key][k],
      set: (v) => (p[key][k] = v),
    }));

  return [
    {
      title: 'Warp field',
      note: 'tiles are PRIME so the composite period stays ~30x the frame',
      rows: [
        { kind: 'range', label: 'tileA', min: 20, max: 400, step: 1,
          get: () => p.tileA, set: (v) => (p.tileA = v) },
        { kind: 'range', label: 'tileB', min: 20, max: 400, step: 1,
          get: () => p.tileB, set: (v) => (p.tileB = v) },
        { kind: 'range', label: 'driftA', min: 0, max: 6, step: 0.05,
          get: () => p.driftA, set: (v) => (p.driftA = v),
          note: 'the main speed dial — the carriers barely move' },
        { kind: 'range', label: 'driftB', min: 0, max: 6, step: 0.05,
          get: () => p.driftB, set: (v) => (p.driftB = v) },
        { kind: 'range', label: 'headA°', min: 0, max: 360, step: 1,
          get: () => p.headingA, set: (v) => (p.headingA = v) },
        { kind: 'range', label: 'headB°', min: 0, max: 360, step: 1,
          get: () => p.headingB, set: (v) => (p.headingB = v),
          note: 'keep ~180° from headA or the surface visibly scrolls' },
      ],
    },
    wave(0),
    wave(1),
    {
      title: 'Surface',
      note: 'deep/light multiply in LINEAR space but read in sRGB — a ±4% change measures ≈±1.7% on screen',
      rows: [
        { kind: 'range', label: 'calm', min: 0, max: 1, step: 0.01,
          get: () => p.calm, set: (v) => (p.calm = v) },
        { kind: 'range', label: 'crest', min: 0, max: 0.2, step: 0.002,
          get: () => p.crest, set: (v) => (p.crest = v) },
        ...ramp('deep'),
        ...ramp('light'),
        { kind: 'color', label: 'base', get: () => p.color, set: (v) => (p.color = v) },
      ],
    },
    {
      title: 'Noise texture',
      note: 'these rebake the tile (~4 ms) instead of writing a uniform',
      rows: [
        { kind: 'select', label: 'size', options: [128, 256, 512, 1024],
          get: () => p.texture.size, set: (v) => (p.texture.size = v) },
        { kind: 'range', label: 'baseGrid', min: 1, max: 32, step: 1,
          get: () => p.texture.baseGrid, set: (v) => (p.texture.baseGrid = v),
          note: 'dominant feature = tile / baseGrid' },
        { kind: 'range', label: 'octaves', min: 1, max: 6, step: 1,
          get: () => p.texture.octaves, set: (v) => (p.texture.octaves = v) },
        { kind: 'range', label: 'gain', min: 0.1, max: 0.9, step: 0.01,
          get: () => p.texture.gain, set: (v) => (p.texture.gain = v) },
        { kind: 'select', label: 'aniso', options: [1, 2, 4, 8, 16],
          get: () => p.texture.anisotropy, set: (v) => (p.texture.anisotropy = v) },
        { kind: 'action', label: 'Reroll seed', run: () => {
            p.texture.seed = (Math.random() * 0xffffff) >>> 0;
            push();
          } },
      ],
    },
    {
      title: 'View & cost',
      rows: [
        { kind: 'range', label: 'time', min: 0, max: 3, step: 0.05,
          get: () => view.timeScale, set: (v) => { view.timeScale = v; host.setTimeScale(v); },
          note: '0 freezes the surface — how the pixel-diff proofs are taken' },
        { kind: 'range', label: 'pixelRatio', min: 0.5, max: 2, step: 0.25,
          get: () => view.pixelRatio, set: (v) => { view.pixelRatio = v; host.setPixelRatio(v); } },
        { kind: 'action', label: 'Scroll to the river', run: () => host.scrollToRiver() },
      ],
    },
  ];
}
