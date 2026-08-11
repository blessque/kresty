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
  group: string;
  /**
   * 'range' (default) = slider; 'color' = swatch + hex field;
   * 'choice' = segmented control over `options`.
   *
   * A two-state choice COULD be a 0/1 slider — `freeze` is exactly that — but
   * that idiom only reads when the label alone says which end is which. Two
   * NAMED positions rendered as "0" and "1" would need decoding every time, and
   * the point of a switcher is flipping back and forth without thinking.
   */
  kind?: 'range' | 'color' | 'choice';
  /** 'choice' only: the segments, in order. First one is the fallback. */
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  /** shown on hover — say what it DOES, not what it is */
  hint?: string;
}

/** numbers for sliders, `#rrggbb` strings for colours */
export type ControlValues = Record<string, number | string>;

/** accepts `#101820`, `101820`, or a short `#123`; returns `#rrggbb` or null */
export function normalizeHex(raw: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`;
}

/**
 * Bumped in round 18, when the page colour default moved from #000000 to
 * #070618. Stored values outrank defaults, so anyone who had opened the panel
 * before would have kept seeing black and reported the change as not landing.
 * Bump this whenever a DEFAULT changes, not whenever the schema does.
 */
const STORE_KEY = 'kresty.contacts.panel.v2';

type Widget =
  | { range: HTMLInputElement; out: HTMLElement }
  | { swatch: HTMLInputElement; hex: HTMLInputElement }
  | { seg: Map<string, HTMLButtonElement> };

export class ControlPanel {
  values: ControlValues;
  onChange: (v: ControlValues) => void = () => {};

  private el: HTMLElement;
  private defaults: ControlValues;
  private specs: ControlSpec[];
  private inputs = new Map<string, Widget>();

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
        const v = parsed[s.key];
        if (s.kind === 'color') {
          if (typeof v === 'string' && normalizeHex(v)) out[s.key] = normalizeHex(v)!;
        } else if (s.kind === 'choice') {
          // a renamed segment must not resurrect a value that no longer exists
          if (typeof v === 'string' && s.options?.some((o) => o.value === v)) out[s.key] = v;
        } else if (typeof v === 'number') {
          out[s.key] = v;
        }
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
      if (s.kind === 'color') {
        // URLSearchParams encodes '#' as %23 and decodes it back, but accept a
        // bare `bg=101820` too — a literal '#' typed by hand would otherwise
        // start the fragment and swallow the rest of the query
        const hex = normalizeHex(raw);
        if (hex) out[s.key] = hex;
        continue;
      }
      if (s.kind === 'choice') {
        if (s.options?.some((o) => o.value === raw)) out[s.key] = raw;
        continue;
      }
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
      // A <label> is right for a row owning ONE control, but `button` is a
      // labelable element too — so a <label> wrapping a segmented control
      // labels its first segment, and clicking the row's own text silently
      // activates that segment. Choice rows are plain divs for that reason.
      const row = document.createElement(s.kind === 'choice' ? 'div' : 'label');
      row.className = 'fx-row';

      const name = document.createElement('span');
      name.className = 'fx-name';
      name.textContent = s.label;
      if (s.hint) name.title = s.hint;

      if (s.kind === 'choice') {
        row.classList.add('fx-row-choice'); // the segments span the two right columns
        const opts = s.options ?? [];
        const cur = String(this.values[s.key] ?? this.defaults[s.key] ?? opts[0]?.value ?? '');

        const seg = document.createElement('div');
        seg.className = 'fx-seg';
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', s.label);
        const buttons = new Map<string, HTMLButtonElement>();
        for (const o of opts) {
          const btn = document.createElement('button');
          btn.type = 'button'; // the row is a <label>; a submit button would be a trap
          btn.className = 'fx-seg-btn';
          btn.textContent = o.label;
          btn.classList.toggle('on', o.value === cur);
          btn.setAttribute('aria-pressed', String(o.value === cur));
          btn.addEventListener('click', () => {
            if (this.values[s.key] === o.value) return;
            this.values[s.key] = o.value;
            for (const [v, el] of buttons) {
              el.classList.toggle('on', v === o.value);
              el.setAttribute('aria-pressed', String(v === o.value));
            }
            this.save();
            this.onChange(this.values);
          });
          seg.appendChild(btn);
          buttons.set(o.value, btn);
        }

        row.append(name, seg);
        body.appendChild(row);
        this.inputs.set(s.key, { seg: buttons });
        continue;
      }

      if (s.kind === 'color') {
        row.classList.add('fx-row-color'); // wider last column for the hex text
        const cur = String(this.values[s.key] ?? this.defaults[s.key] ?? '#000000');
        const swatch = document.createElement('input');
        swatch.type = 'color';
        swatch.className = 'fx-swatch';
        swatch.value = cur;
        const hex = document.createElement('input');
        hex.type = 'text';
        hex.className = 'fx-hex';
        hex.spellcheck = false;
        hex.value = cur;

        const commit = (raw: string, echo: boolean) => {
          const norm = normalizeHex(raw);
          if (!norm) return; // half-typed hex: leave the field alone
          this.values[s.key] = norm;
          swatch.value = norm;
          if (echo) hex.value = norm;
          this.save();
          this.onChange(this.values);
        };
        swatch.addEventListener('input', () => commit(swatch.value, true));
        hex.addEventListener('input', () => commit(hex.value, false));
        // tidy the field once the user is done, so `abc` becomes `#aabbcc`
        hex.addEventListener('blur', () => commit(hex.value, true));

        row.append(name, swatch, hex);
        body.appendChild(row);
        this.inputs.set(s.key, { swatch, hex });
        continue;
      }

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
    for (const [key, w] of this.inputs) {
      const val = this.values[key];
      if (val === undefined) continue;
      if ('seg' in w) {
        for (const [v, el] of w.seg) {
          el.classList.toggle('on', v === val);
          el.setAttribute('aria-pressed', String(v === val));
        }
      } else if ('swatch' in w) {
        w.swatch.value = String(val);
        w.hex.value = String(val);
      } else {
        w.range.value = String(val);
        w.out.textContent = this.fmt(Number(val));
      }
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
