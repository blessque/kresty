/**
 * TEMPORARY admin panel for the «Контакты» icon showcase.
 *
 * Schema-driven: adding a handle is one entry in the spec array. It is a dev
 * tool, not product UI — labels are English and terse on purpose.
 *
 * The important editorial decision lives in ContactsScreen's spec list, not
 * here: at `slitMix: 1` the shader builds the procedural field and then
 * DISCARDS it (`col = mix(field, slit, 1)`), so most preset uniforms —
 * dustAmount, hazeBase, primaryIntensity, sec*, coreRadius, rotSpeed and
 * others — are inert on this page. Only handles that visibly move something
 * are listed; dead sliders would be worse than no panel.
 *
 * Value precedence: defaults < localStorage < URL query. The URL wins so a
 * copied link reproduces a look exactly, which is what makes a headless
 * screenshot pass repeatable.
 */

export interface ControlSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
  /** shown under the label — say what it DOES, not what it is */
  hint?: string;
}

export type ControlValues = Record<string, number>;

const STORE_KEY = 'kresty.contacts.panel';

export class ControlPanel {
  values: ControlValues;
  onChange: (v: ControlValues) => void = () => {};

  private el: HTMLElement;
  private defaults: ControlValues;
  private specs: ControlSpec[];
  private inputs = new Map<string, { range: HTMLInputElement; out: HTMLElement }>();

  constructor(parent: HTMLElement, specs: ControlSpec[], defaults: ControlValues) {
    this.specs = specs;
    this.defaults = { ...defaults };
    this.values = { ...defaults, ...this.readStore(), ...this.readUrl() };

    this.el = document.createElement('div');
    this.el.className = 'fx-panel';
    parent.appendChild(this.el);
    this.build();
    addEventListener('keydown', this.onKey);
  }

  private readStore(): ControlValues {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as ControlValues;
      // drop anything no longer in the schema, so a renamed handle cannot
      // resurrect a stale value forever
      const out: ControlValues = {};
      for (const s of this.specs) {
        if (typeof parsed[s.key] === 'number') out[s.key] = parsed[s.key];
      }
      return out;
    } catch {
      return {};
    }
  }

  private readUrl(): ControlValues {
    const q = new URLSearchParams(location.search);
    const out: ControlValues = {};
    for (const s of this.specs) {
      const raw = q.get(s.key);
      if (raw === null) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) out[s.key] = n;
    }
    return out;
  }

  private save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.values));
    } catch {
      /* private mode — the panel still works, it just won't persist */
    }
  }

  private build() {
    const head = document.createElement('div');
    head.className = 'fx-panel-head';
    head.innerHTML = `<b>Effect controls</b><span>H — hide</span>`;
    this.el.appendChild(head);

    const body = document.createElement('div');
    body.className = 'fx-panel-body';
    this.el.appendChild(body);

    let lastGroup = '';
    for (const s of this.specs) {
      if (s.group !== lastGroup) {
        lastGroup = s.group;
        const g = document.createElement('div');
        g.className = 'fx-group';
        g.textContent = s.group;
        body.appendChild(g);
      }
      const row = document.createElement('label');
      row.className = 'fx-row';

      const name = document.createElement('span');
      name.className = 'fx-name';
      name.textContent = s.label;
      if (s.hint) name.title = s.hint;

      const out = document.createElement('span');
      out.className = 'fx-val';

      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(s.min);
      range.max = String(s.max);
      range.step = String(s.step);
      range.value = String(this.values[s.key] ?? this.defaults[s.key]);
      range.addEventListener('input', () => {
        this.values[s.key] = Number(range.value);
        out.textContent = this.fmt(Number(range.value));
        this.save();
        this.onChange(this.values);
      });

      out.textContent = this.fmt(Number(range.value));
      row.append(name, range, out);
      body.appendChild(row);
      this.inputs.set(s.key, { range, out });
    }

    const foot = document.createElement('div');
    foot.className = 'fx-panel-foot';

    const reset = document.createElement('button');
    reset.textContent = 'Reset';
    reset.addEventListener('click', () => this.set(this.defaults));

    const copy = document.createElement('button');
    copy.textContent = 'Copy URL';
    copy.addEventListener('click', () => {
      const q = new URLSearchParams();
      // only non-default values, so the link stays readable
      for (const s of this.specs) {
        const v = this.values[s.key];
        if (v !== undefined && v !== this.defaults[s.key]) q.set(s.key, String(v));
      }
      const url = `${location.origin}${location.pathname}?${q}${location.hash || '#contacts'}`;
      void navigator.clipboard?.writeText(url).catch(() => {});
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy URL'), 1200);
    });

    foot.append(reset, copy);
    this.el.appendChild(foot);
  }

  private fmt(v: number): string {
    return Math.abs(v) >= 100 || Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '');
  }

  /** applies a whole value set to both the state and the widgets */
  set(v: ControlValues) {
    this.values = { ...this.values, ...v };
    for (const [key, { range, out }] of this.inputs) {
      const val = this.values[key];
      if (val === undefined) continue;
      range.value = String(val);
      out.textContent = this.fmt(val);
    }
    this.save();
    this.onChange(this.values);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // physical key code, so it also works on the Russian layout — same
    // convention as the main screen's V switcher
    if (e.code === 'KeyH') this.el.classList.toggle('hidden');
  };

  destroy() {
    removeEventListener('keydown', this.onKey);
    this.el.remove();
  }
}
