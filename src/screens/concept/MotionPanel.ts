import './motionPanel.css';
import {
  MOTION,
  MOTION_DEFAULTS,
  CURVE_NAMES,
  applyMotionCss,
  gapFloor,
  cloneMotionParams,
  type MotionParams,
} from './motionParams';

/**
 * «О Крестах» motion tuning panel — `?admin=1` (round 23).
 *
 * Built on `WaterPanel`'s shape rather than `ControlPanel`'s: it lives in this
 * screen already, it is DYNAMICALLY IMPORTED WITH ITS OWN CSS CHUNK so it never
 * reaches a client demo's bundle, and it already had the two row kinds a tuning
 * tool needs that the other panel lacks — an action button and a per-row note.
 * Two things are taken from `ControlPanel` instead: the segmented `choice` row
 * (the envelope curve is a name, not a number) and the VERSIONED store key.
 *
 * ── the two couplings this panel must not hide ──────────────────────────────
 * Dials here can break invariants that used to be safe because they were
 * constants. A `console.warn` is not a guard rail when the thing that trips it
 * is a slider, so both are readouts at the top of the panel:
 *
 *  1. `pin + columnHeight + padBottom <= viewH` — the station invariant. `pin`,
 *     `padBottom` and `iconSize` all feed it. Break it and the light pops at a
 *     swap, which is the exact symptom this panel exists to remove.
 *  2. `gapVh > 0.5 + bandVh/2` — widening the colour band pushes the crossfade
 *     up into the map. The floor is shown next to the slider.
 */

type Row =
  | { kind: 'range'; key: NumKey; label: string; min: number; max: number; step: number; note?: string }
  | { kind: 'choice'; key: NumKey; label: string; options: readonly string[]; note?: string }
  | { kind: 'action'; label: string; run: () => void };

type NumKey = keyof MotionParams;

interface Section {
  title: string;
  note?: string;
  rows: Row[];
}

export interface MotionPanelHost {
  /** re-measure section geometry after a layout dial moves */
  remeasure(): void;
  /** scroll the page so section `i` owns the light */
  scrollToSection(i: number): void;
  /** frames rendered by the light since load — the per-frame-cost assertion */
  renderCount(): number;
}

/**
 * Bumped whenever a DEFAULT changes, not whenever the schema does — stored
 * values outrank defaults, so anyone who has opened the panel would otherwise
 * keep seeing the old tuning and report the change as not landing. That is a
 * real bug this project has shipped once (contacts panel, round 18).
 */
const STORE_KEY = 'kresty.concept.motion.v1';

export class MotionPanel {
  private el = document.createElement('aside');
  private p: MotionParams;
  private syncs: (() => void)[] = [];
  private readout = document.createElement('div');
  private lastTick = 0;

  constructor(container: HTMLElement, private host: MotionPanelHost) {
    this.p = load();
    // IN PLACE — every row closes over MOTION, so reassigning it would leave
    // all of them bound to a detached object (WaterPanel records this trap).
    Object.assign(MOTION, this.p);
    this.p = MOTION;
    applyMotionCss();

    this.el.className = 'motion-panel';
    const head = document.createElement('div');
    head.className = 'mp-head';
    head.innerHTML = '<b>Page motion</b>';
    const x = document.createElement('button');
    x.className = 'mp-x';
    x.textContent = '×';
    x.addEventListener('click', () => this.el.classList.toggle('hidden'));
    head.appendChild(x);

    this.readout.className = 'mp-readout';

    const body = document.createElement('div');
    body.className = 'mp-body';
    for (const s of this.sections()) body.appendChild(this.renderSection(s));

    const foot = document.createElement('div');
    foot.className = 'mp-foot';
    foot.append(
      this.button('Reset', () => {
        Object.assign(MOTION, cloneMotionParams(MOTION_DEFAULTS));
        localStorage.removeItem(STORE_KEY);
        this.push();
        for (const s of this.syncs) s();
      }),
      this.button('Copy', (b) => {
        void navigator.clipboard?.writeText(emit(this.p)).catch(() => {});
        b.textContent = 'Copied';
        setTimeout(() => (b.textContent = 'Copy'), 1200);
      }),
    );

    this.el.append(head, this.readout, body, foot);
    container.appendChild(this.el);
    this.refreshReadout();
  }

  destroy() {
    this.el.remove();
  }

  /**
   * Called from the frame loop so the invariant readout stays honest.
   * THROTTLED to 4 Hz: `refreshReadout` walks five sections through
   * `getComputedStyle` and `offsetHeight`, which is a forced layout — running
   * that every frame would make the dev tool the thing that costs frames while
   * you are measuring what costs frames.
   */
  tick() {
    const now = performance.now();
    if (now - this.lastTick < 250) return;
    this.lastTick = now;
    this.refreshReadout();
  }

  private sections(): Section[] {
    const p = this.p;
    return [
      {
        title: 'Swap — start here',
        note:
          'MEASURED: the envelope never reaches 0 between sections — the pin holds every ' +
          'icon inside its flat top, so the mask is replaced at FULL brightness. That is ' +
          'the rude swap. This dips the light and changes the icon at the bottom.',
        rows: [
          { kind: 'range', key: 'swapDip', label: 'dip', min: 0, max: 1, step: 0.05,
            note: '0 = off = what ships today. Try 0.7.' },
          { kind: 'range', key: 'swapMs', label: 'dip ms', min: 120, max: 1200, step: 20 },
        ],
      },
      {
        title: 'Envelope — the entrance and the exit',
        note:
          'Only bites on the FIRST arrival and the LAST departure, for the reason above. ' +
          'Defaults reproduce the shipped 0.2 + smoothstep exactly.',
        rows: [
          { kind: 'range', key: 'edge', label: 'edge', min: 0.05, max: 0.5, step: 0.01,
            note: 'ramp width per edge, fraction of the viewport' },
          { kind: 'choice', key: 'curve', label: 'curve', options: CURVE_NAMES },
          { kind: 'range', key: 'gamma', label: 'gamma', min: 0.3, max: 4, step: 0.1,
            note: 'the pow curve only' },
          { kind: 'range', key: 'asymmetry', label: 'asym', min: -0.9, max: 0.9, step: 0.05,
            note: '−1 all ramp on the way in, +1 on the way out' },
        ],
      },
      {
        title: 'Motion — the corners, not the fade',
        note:
          'iconY is min(max(flowing, pinned), pushed): its slope jumps −1 → 0 → −1, so the ' +
          'light glides, freezes, then lurches. That is the rudeness. follow rounds it off.',
        rows: [
          { kind: 'range', key: 'follow', label: 'follow', min: 0, max: 0.3, step: 0.005,
            note: 'seconds of lag. 0 = off = shipped. Above 0 costs a transform every frame.' },
          { kind: 'range', key: 'hysteresis', label: 'hyst', min: 0, max: 0.25, step: 0.01,
            note: 'deadband on the owner test, fraction of the viewport' },
          { kind: 'range', key: 'parallax', label: 'parallax', min: 0, max: 4, step: 0.1 },
        ],
      },
      {
        title: 'Layout — where the gaps are',
        rows: [
          { kind: 'range', key: 'pin', label: 'pin', min: 0, max: 30, step: 1,
            note: 'sticky offset in vh — the hold phase position' },
          { kind: 'range', key: 'padTop', label: 'gap', min: 0, max: 90, step: 1,
            note: 'THE gap between sections, vh. padBottom is invariant-bound; this is not.' },
          { kind: 'range', key: 'padBottom', label: 'pad btm', min: 0, max: 200, step: 4,
            note: 'a term of the station invariant — watch the readout above' },
          { kind: 'range', key: 'iconSize', label: 'icon', min: 100, max: 320, step: 4 },
          { kind: 'choice', key: 'iconAlign', label: 'icon x', options: ['left', 'center'] },
          { kind: 'range', key: 'gapVh', label: 'gap', min: 0.3, max: 2, step: 0.05,
            note: 'map → first section, viewports' },
          { kind: 'range', key: 'bandVh', label: 'band', min: 0.2, max: 1.2, step: 0.05,
            note: 'colour crossfade width — raises the gap floor' },
        ],
      },
      {
        title: 'Light',
        note: "The designer's «Контакты» settings. falloff is why a swap pops across the whole frame.",
        rows: [
          { kind: 'range', key: 'falloff', label: 'falloff', min: 200, max: 2000, step: 10 },
          { kind: 'range', key: 'dissolve', label: 'dissolve', min: 0, max: 1, step: 0.01 },
          { kind: 'range', key: 'core', label: 'core', min: 0, max: 2, step: 0.01 },
          { kind: 'range', key: 'godrays', label: 'godrays', min: 0, max: 4, step: 0.05 },
          { kind: 'range', key: 'bloom', label: 'bloom', min: 0, max: 3, step: 0.05 },
          { kind: 'range', key: 'exposure', label: 'exposure', min: 0.2, max: 3, step: 0.05 },
          { kind: 'range', key: 'ca', label: 'ca', min: 0, max: 0.1, step: 0.002 },
        ],
      },
      {
        title: 'Go to',
        rows: [0, 1, 2, 3, 4].map((i) => ({
          kind: 'action' as const,
          label: `§${i + 1}`,
          run: () => this.host.scrollToSection(i),
        })),
      },
    ];
  }

  private renderSection(s: Section): HTMLElement {
    const box = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = s.title;
    box.appendChild(h);
    if (s.note) box.appendChild(note(s.note));
    // action rows share one line — five section jumps stacked would be absurd
    const acts = s.rows.filter((r) => r.kind === 'action');
    for (const r of s.rows) if (r.kind !== 'action') box.appendChild(this.renderRow(r));
    if (acts.length) {
      const strip = document.createElement('div');
      strip.className = 'mp-actions';
      for (const a of acts) if (a.kind === 'action') strip.appendChild(this.button(a.label, a.run));
      box.appendChild(strip);
    }
    return box;
  }

  private renderRow(r: Exclude<Row, { kind: 'action' }>): HTMLElement {
    const row = document.createElement('div');
    row.className = 'mp-row';
    const lab = document.createElement('label');
    lab.textContent = r.label;
    const val = document.createElement('span');
    val.className = 'mp-val';
    row.append(lab, val);

    if (r.kind === 'choice') {
      const seg = document.createElement('div');
      seg.className = 'mp-seg';
      const btns: HTMLButtonElement[] = [];
      r.options.forEach((o, i) => {
        const b = document.createElement('button');
        // the row is not a <label>, but keep type=button anyway: a bare button
        // inside a form-ish container defaults to submit
        b.type = 'button';
        b.className = 'mp-seg-btn';
        b.textContent = o;
        b.addEventListener('click', () => {
          (this.p[r.key] as number) = i;
          btns.forEach((x, j) => x.classList.toggle('on', j === i));
          val.textContent = '';
          this.push();
        });
        seg.appendChild(b);
        btns.push(b);
      });
      const sync = () => {
        const cur = Math.round(this.p[r.key] as number);
        btns.forEach((x, j) => x.classList.toggle('on', j === cur));
        val.textContent = '';
      };
      this.syncs.push(sync);
      sync();
      row.appendChild(seg);
      if (r.note) row.appendChild(note(r.note));
      return row;
    }

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(r.min);
    input.max = String(r.max);
    input.step = String(r.step);
    const sync = () => {
      const v = this.p[r.key] as number;
      input.value = String(v);
      // the gap slider carries its own derived floor, since it is not free
      val.textContent =
        r.key === 'gapVh'
          ? `${fmt(v, r.step)} · min ${gapFloor(this.p.bandVh).toFixed(2)}`
          : r.key === 'padTop'
            ? // the number that matters is what a reader SEES between two
              // sections, which is this plus padBottom — show it, do not make
              // anyone add two sliders together in their head
              `${fmt(v, r.step)}vh · ${Math.round(v + (this.p.padBottom / innerHeight) * 100)}vh total`
            : fmt(v, r.step);
      val.classList.toggle('bad', r.key === 'gapVh' && v < gapFloor(this.p.bandVh));
    };
    input.addEventListener('input', () => {
      // rounded to the step: a range fires raw floats and the Copy output has to
      // be something you would paste into the file
      (this.p[r.key] as number) = round(Number(input.value), r.step);
      sync();
      this.push();
    });
    this.syncs.push(sync);
    sync();
    row.appendChild(input);
    if (r.note) row.appendChild(note(r.note));
    return row;
  }

  private button(label: string, run: (b: HTMLButtonElement) => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'mp-btn';
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => run(b));
    return b;
  }

  private push() {
    applyMotionCss();
    this.host.remeasure();
    for (const s of this.syncs) s();
    this.refreshReadout();
    save(this.p);
  }

  /** the two invariants, live. See the class comment for why they are here. */
  private refreshReadout() {
    const viewH = innerHeight;
    let worst = 0;
    let id = '';
    document.querySelectorAll<HTMLElement>('.sec').forEach((sec) => {
      const col = sec.querySelector<HTMLElement>('.sec-col');
      if (!col || getComputedStyle(col).position !== 'sticky') return;
      const need =
        (parseFloat(getComputedStyle(col).top) || 0) +
        col.offsetHeight +
        (parseFloat(getComputedStyle(sec).paddingBottom) || 0);
      if (need > worst) {
        worst = need;
        id = sec.dataset.section ?? '';
      }
    });
    const head = Math.round(viewH - worst);
    // `>=`, not `>`: the SHIPPED default sits exactly ON the floor (gap 0.8,
    // band 0.6 → floor 0.8), so a strict test flags the state that ships. Worth
    // knowing while tuning — there is no headroom, and widening the band by any
    // amount pushes the colour crossfade up into the map unless the gap follows.
    const gapOk = this.p.gapVh >= gapFloor(this.p.bandVh);
    this.readout.innerHTML =
      `<span class="${head >= 0 ? 'ok' : 'bad'}">station ${head >= 0 ? 'ok' : 'BROKEN'}` +
      ` · ${id} needs ${Math.round(worst)}/${viewH} (${head >= 0 ? '+' : ''}${head})</span>` +
      `<span class="${gapOk ? 'ok' : 'bad'}">gap ${gapOk ? 'ok' : 'TOO SMALL'}</span>` +
      `<span>renders ${this.host.renderCount()}</span>`;
  }
}

function note(text: string): HTMLElement {
  const n = document.createElement('p');
  n.className = 'mp-note';
  n.textContent = text;
  return n;
}

function round(v: number, step: number): number {
  const d = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number(v.toFixed(d));
}

function fmt(v: number, step: number): string {
  return String(round(v, step));
}

function load(): MotionParams {
  const base = cloneMotionParams(MOTION_DEFAULTS);
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return base;
    const s = JSON.parse(raw) as Partial<MotionParams>;
    // key by key off the DEFAULTS, never off the blob: a renamed or deleted dial
    // cannot resurrect a stale value, and a hand-edited blob cannot inject one
    const out = { ...base };
    for (const k of Object.keys(base) as (keyof MotionParams)[]) {
      const v = s[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return base;
  }
}

function save(p: MotionParams) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    /* private mode / quota — the panel still works, it just will not persist */
  }
}

/** the Copy payload — laid out to paste over MOTION_DEFAULTS' body */
function emit(p: MotionParams): string {
  const n = (k: keyof MotionParams) => `  ${k}: ${p[k]},`;
  return [
    '  // envelope',
    n('edge'),
    `  curve: ${p.curve}, // ${CURVE_NAMES[Math.round(p.curve)] ?? '?'}`,
    n('gamma'),
    n('asymmetry'),
    '',
    '  // motion',
    n('follow'),
    n('hysteresis'),
    n('parallax'),
    '',
    '  // layout',
    n('pin'),
    n('padTop'),
    n('padBottom'),
    n('iconSize'),
    `  iconAlign: ${p.iconAlign}, // ${p.iconAlign >= 0.5 ? 'center' : 'left'}`,
    n('gapVh'),
    n('bandVh'),
    '',
    '  // light',
    n('dissolve'),
    n('core'),
    n('godrays'),
    n('bloom'),
    n('falloff'),
    n('exposure'),
    n('ca'),
  ].join('\n');
}
