import './waterPanel.css';
import {
  WATER_DEFAULTS,
  cloneWaterParams,
  type WaterParams,
} from './waterParams';
import {
  waterSections,
  type Row,
  type Section,
  type ViewState,
} from './waterPanelRows';

/**
 * Live tuning for the Neva, behind `?admin=1` — round 14.
 *
 * WHY IT EXISTS: the water had been tuned by edit-reload-guess across four
 * rejected modes and two rejected rewrites, and the shipped values encode
 * roughly a dozen non-obvious thresholds (see waterParams.ts). Every one of
 * them is easier to find by dragging than by arguing.
 *
 * WHY IT IS DYNAMICALLY IMPORTED: ConceptScreen pulls this module in only when
 * the flag is set, so Vite splits it — plus its stylesheet — into a chunk a
 * normal load never fetches. "Not visible" and "not shipped" are different
 * claims, and this makes the second one true.
 *
 * LABELS ARE THE CODE'S IDENTIFIERS, in English, deliberately breaking the
 * project's Russian-UI rule: this is not product copy, and a dial named `mixA`
 * has to be findable in the file you are about to paste into.
 *
 * Nothing here recompiles a shader. `host.apply` writes uniforms; only the
 * NOISE section's dials rebake the texture, and water.ts decides that for
 * itself by comparing the bake options.
 */

const STORE_KEY = 'kresty:water';

export interface WaterPanelHost {
  /** push the whole working set: uniforms, base tone, and a rebake if needed */
  apply(p: WaterParams): void;
  setPixelRatio(r: number): void;
  /** 0 freezes the surface — also how the pixel-diff proofs are taken */
  setTimeScale(k: number): void;
  scrollToRiver(): void;
}

export class WaterPanel {
  private readonly el = document.createElement('aside');
  private readonly tab = document.createElement('button');
  private readonly stat = document.createElement('div');
  private p: WaterParams;
  private syncs: (() => void)[] = [];
  /** panel state that is not part of the water look */
  private view: ViewState = { timeScale: 1, pixelRatio: devicePixelRatio };

  constructor(container: HTMLElement, private readonly host: WaterPanelHost) {
    this.p = load();
    this.el.className = 'water-panel';
    this.tab.className = 'wp-tab';
    this.tab.textContent = '≋';
    this.tab.title = 'Water panel';
    this.tab.addEventListener('click', () => this.show(true));
    container.append(this.el, this.tab);
    this.build();
    this.push();
  }

  /** called from the render loop; cheap enough to write every second */
  setStats(fps: number, ms: number) {
    this.stat.textContent = `${fps.toFixed(0)} fps · ${ms.toFixed(1)} ms`;
  }

  get params(): WaterParams {
    return this.p;
  }

  // ------------------------------------------------------------------ build

  private build() {
    const head = document.createElement('header');
    head.className = 'wp-head';
    const title = document.createElement('span');
    title.textContent = 'Neva';
    this.stat.className = 'wp-stat';
    const hide = document.createElement('button');
    hide.className = 'wp-x';
    hide.textContent = '×';
    hide.title = 'Hide';
    hide.addEventListener('click', () => this.show(false));
    head.append(title, this.stat, hide);

    const body = document.createElement('div');
    body.className = 'wp-body';
    const sections = waterSections(this.p, this.host, this.view, () => this.push());
    for (const s of sections) body.appendChild(this.renderSection(s));

    const foot = document.createElement('footer');
    foot.className = 'wp-foot';
    foot.append(
      this.button('Reset', () => {
        // IN PLACE. Every row's get/set closes over this object, so reassigning
        // `this.p` would leave all 36 of them bound to a detached copy and make
        // Reset appear to do nothing at all.
        Object.assign(this.p, cloneWaterParams(WATER_DEFAULTS));
        localStorage.removeItem(STORE_KEY);
        this.sync();
        this.push();
      }),
      this.button('Copy', (b) => {
        void navigator.clipboard.writeText(emit(this.p)).then(() => {
          b.textContent = 'Copied';
          setTimeout(() => (b.textContent = 'Copy'), 1200);
        });
      })
    );

    this.el.append(head, body, foot);
  }

  private renderSection(s: Section): HTMLElement {
    const box = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = s.title;
    box.appendChild(h);
    if (s.note) box.appendChild(note(s.note));
    for (const r of s.rows) box.appendChild(this.renderRow(r));
    return box;
  }

  private renderRow(r: Row): HTMLElement {
    const row = document.createElement('div');
    row.className = 'wp-row';

    if (r.kind === 'action') {
      row.appendChild(this.button(r.label, () => r.run()));
      return row;
    }

    const lab = document.createElement('label');
    lab.textContent = r.label;
    const val = document.createElement('span');
    val.className = 'wp-val';
    row.append(lab, val);

    if (r.kind === 'color') {
      const input = document.createElement('input');
      input.type = 'color';
      const sync = () => {
        input.value = '#' + r.get().toString(16).padStart(6, '0');
        val.textContent = input.value;
      };
      input.addEventListener('input', () => {
        r.set(parseInt(input.value.slice(1), 16));
        val.textContent = input.value;
        this.push();
      });
      this.syncs.push(sync);
      sync();
      row.appendChild(input);
      return row;
    }

    if (r.kind === 'select') {
      const sel = document.createElement('select');
      for (const o of r.options) {
        const opt = document.createElement('option');
        opt.value = String(o);
        opt.textContent = String(o);
        sel.appendChild(opt);
      }
      const sync = () => {
        sel.value = String(r.get());
        val.textContent = '';
      };
      sel.addEventListener('change', () => {
        r.set(Number(sel.value));
        this.push();
      });
      this.syncs.push(sync);
      sync();
      row.appendChild(sel);
      return row;
    }

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(r.min);
    input.max = String(r.max);
    input.step = String(r.step);
    const sync = () => {
      const v = r.get();
      input.value = String(v);
      val.textContent = fmt(v, r.step) + (r.aside ? ` · ${r.aside(v)}` : '');
    };
    input.addEventListener('input', () => {
      // rounded to the step: a range fires raw floats and the Copy output has
      // to be something you would be willing to paste into the file
      r.set(round(Number(input.value), r.step));
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
    b.className = 'wp-btn';
    b.textContent = label;
    b.addEventListener('click', () => run(b));
    return b;
  }

  // ------------------------------------------------------------------ state

  private show(on: boolean) {
    this.el.classList.toggle('hidden', !on);
    this.tab.classList.toggle('on', !on);
  }

  private sync() {
    for (const s of this.syncs) s();
  }

  /** apply + persist, so a reload does not evaporate a tuning session */
  private push() {
    this.host.apply(this.p);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.p));
    } catch {
      /* private mode / quota — tuning still works, it just will not survive */
    }
  }
}

// ---------------------------------------------------------------- internals

function note(text: string): HTMLElement {
  const n = document.createElement('p');
  n.className = 'wp-note';
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

/**
 * A saved set is MERGED onto the defaults, never used raw: a stored blob
 * predates any dial added since, and a missing key would arrive as `undefined`
 * and reach the shader as NaN.
 */
function load(): WaterParams {
  const base = cloneWaterParams(WATER_DEFAULTS);
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return base;
    const s = JSON.parse(raw) as Partial<WaterParams>;
    const out: WaterParams = {
      ...base,
      ...s,
      waves: [
        { ...base.waves[0], ...s.waves?.[0] },
        { ...base.waves[1], ...s.waves?.[1] },
      ],
      deep: (s.deep ?? base.deep).slice(0, 3) as [number, number, number],
      light: (s.light ?? base.light).slice(0, 3) as [number, number, number],
      texture: { ...base.texture, ...s.texture },
    };
    return out;
  } catch {
    return base;
  }
}

/** the Copy button's payload — laid out to paste over WATER_DEFAULTS' body */
function emit(p: WaterParams): string {
  const w = (i: 0 | 1) => {
    const x = p.waves[i];
    return `    { len: ${x.len}, head: ${x.head}, speed: ${x.speed}, amp: ${x.amp}, warp: ${x.warp}, mixA: ${x.mixA} },`;
  };
  const t = p.texture;
  return [
    `  tileA: ${p.tileA},`,
    `  tileB: ${p.tileB},`,
    `  driftA: ${p.driftA},`,
    `  driftB: ${p.driftB},`,
    `  headingA: ${p.headingA},`,
    `  headingB: ${p.headingB},`,
    `  waves: [`,
    w(0),
    w(1),
    `  ],`,
    `  calm: ${p.calm},`,
    `  crest: ${p.crest},`,
    `  deep: [${p.deep.join(', ')}],`,
    `  light: [${p.light.join(', ')}],`,
    `  color: 0x${p.color.toString(16).padStart(6, '0')},`,
    `  texture: { size: ${t.size}, baseGrid: ${t.baseGrid}, octaves: ${t.octaves},` +
      ` gain: ${t.gain}, seed: 0x${t.seed.toString(16)}, anisotropy: ${t.anisotropy} },`,
  ].join('\n');
}
