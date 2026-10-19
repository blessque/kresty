import { ControlPanel, type ControlSpec, type ControlValues } from '../../shared/controlPanel';
import { LOOK, LOOK_DEFAULTS } from '../../shared/lightLook';
import * as governor from '../../shared/frameGovernor';
import { GRAIN_DEFAULTS, setGrain } from '../../shared/filmGrain';
import './lightLab.css';

/**
 * THE LIGHT LAB (round 33) — `?lab` on any page with a light: the designer's
 * handles on the exact light, live, with Copy URL to hand a look back. A dev
 * tool, not product UI: labels are English and say what a handle DOES.
 *
 * Every default is the shipped look, so opening the lab changes nothing until a
 * slider moves. URL keys are prefixed `lab.` — `?exp=` is already «Музей»'s gain
 * and `?rs=` the governor's.
 */
const SPECS: ControlSpec[] = [
  { key: 'exposure', label: 'exposure', group: 'Light', min: 0, max: 3, step: 0.01,
    hint: 'brightness of everything the light emits' },
  { key: 'trail', label: 'trail', group: 'Light', min: 0.3, max: 3, step: 0.01,
    hint: 'how far the rays reach — lower is longer' },
  { key: 'edge', label: 'ray edge', group: 'Light', min: 0, max: 1, step: 0.01,
    hint: '0 soft (shipped) → 1 razor (round 5’s noisy version, now clean)' },
  { key: 'bloom', label: 'bloom', group: 'Light', min: 0, max: 3, step: 0.01, hint: 'the glow around the emblem' },
  { key: 'core', label: 'core', group: 'Light', min: 0, max: 3, step: 0.01,
    hint: 'the crisp emblem (only where dissolve < 1: the icons)' },
  { key: 'rainbow', label: 'rainbow', group: 'Light', min: 0, max: 0.04, step: 0.001,
    hint: 'prismatic fringe on the rays; 0.02 shipped, 0.028–0.03 was the old look' },
  { key: 'penumbra', label: 'penumbra', group: 'Physics', min: 0, max: 1, step: 0.01,
    hint: 'size of the light source: rays feather the further they travel' },
  { key: 'haze', label: 'haze', group: 'Physics', min: 0, max: 1, step: 0.01,
    hint: 'drifting air density the beams pass through' },
  { key: 'hazeScale', label: 'haze scale', group: 'Physics', min: 100, max: 1500, step: 10,
    hint: 'size of the haze billows, reference px' },
  { key: 'hazeDrift', label: 'haze drift', group: 'Physics', min: 0, max: 4, step: 0.05, hint: 'how fast the air moves' },
  { key: 'hazeWind', label: 'haze wind', group: 'Physics', min: 0, max: 4, step: 0.05,
    hint: 'how hard the cursor stirs the haze' },
  { key: 'grain', label: 'film grain', group: 'Film grain', min: 0, max: 0.3, step: 0.005,
    hint: '0 = off · 0.015 shipped · shows on main and «Музей» only (hidden over the map and white pages)' },
  { key: 'grainSize', label: 'speck size', group: 'Film grain', min: 0.5, max: 4, step: 0.1,
    hint: 'CSS px — the same apparent size on a phone, a laptop and a TV' },
  { key: 'grainMode', label: 'motion', group: 'Film grain', kind: 'choice',
    options: [{ value: 'static', label: 'still' }, { value: 'film', label: 'film' }] },
  { key: 'rays', label: 'estimator', group: 'Quality', kind: 'choice',
    hint: 'exact = the new light · pure = without the old glow floor · march = the old noisy light, for A/B',
    options: [
      { value: 'auto', label: 'auto' },
      { value: 'exact', label: 'exact' },
      { value: 'pure', label: 'pure' },
      { value: 'march', label: 'old' },
    ] },
  { key: 'rs', label: 'resolution', group: 'Quality', kind: 'choice',
    hint: 'canvas px per CSS px — auto follows the light’s own detail',
    options: [
      { value: 'auto', label: 'auto' },
      { value: 'native', label: 'native' },
      { value: '1', label: '1' },
      { value: '0.75', label: '¾' },
      { value: '0.5', label: '½' },
    ] },
  { key: 'polar', label: 'polar θ', group: 'Quality', kind: 'choice',
    hint: 'angular resolution of the exact light’s polar texture',
    options: [
      { value: 'auto', label: 'auto' },
      { value: '1024', label: '1024' },
      { value: '2048', label: '2048' },
      { value: '4096', label: '4096' },
    ] },
];

const DEFAULTS: ControlValues = {
  ...LOOK_DEFAULTS,
  grain: GRAIN_DEFAULTS.amount,
  grainSize: GRAIN_DEFAULTS.size,
  grainMode: GRAIN_DEFAULTS.film ? 'film' : 'static',
  rays: 'auto',
  rs: 'auto',
  polar: 'auto',
};

let mounted = false;

export function mountLightLab(): void {
  if (mounted) return;
  mounted = true;
  const panel = new ControlPanel(document.body, SPECS, DEFAULTS, {
    // bump whenever a DEFAULT changes — stored values outrank defaults
    // (v2, round 33.1: the shipped look became the user's pick)
    storeKey: 'kresty.light.lab.v2',
    prefix: 'lab.',
    flag: 'lab',
    title: 'Light lab',
    className: 'fx-panel--lab',
  });
  let lastQuality = '';
  const apply = (v: ControlValues) => {
    const n = (k: string) => Number(v[k] ?? DEFAULTS[k]);
    for (const k of Object.keys(LOOK_DEFAULTS) as (keyof typeof LOOK_DEFAULTS)[]) LOOK[k] = n(k);
    setGrain({ amount: n('grain'), size: n('grainSize'), film: v.grainMode === 'film' });
    // only a change that moves the canvas re-lays it out: the estimator, the
    // resolution, the polar size — and edge / penumbra, which set the detail cap
    const quality = [v.rays, v.rs, v.polar, n('edge'), n('penumbra')].join('|');
    if (quality === lastQuality) return;
    lastQuality = quality;
    const rays = v.rays === 'exact' || v.rays === 'pure' || v.rays === 'march' ? v.rays : null;
    governor.setOverrides({
      rays,
      rs: v.rs === 'auto' ? null : v.rs === 'native' ? devicePixelRatio : Number(v.rs),
      polar: v.polar === 'auto' ? null : Number(v.polar),
    });
  };
  panel.onChange = apply;
  apply(panel.values);
}
