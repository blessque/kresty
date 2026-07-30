import { infoFor } from './buildingsInfo';

/**
 * Left-side drawer listing a building's residents.
 *
 * Owns its own DOM and nothing else — ConceptScreen calls open()/close() and
 * reads `isOpen` / `hovered` so it can freeze the plan's lean while the pointer
 * is over the panel (the lean maps raw cursor position to shear across the
 * whole screen, and DEADZONE is 0, so without this the plan would keep tilting
 * while you read).
 */
export class BuildingDrawer {
  /** currently open building id, or null */
  id: string | null = null;
  /** pointer is over the panel — the caller should not lean the plan */
  hovered = false;
  onClose: () => void = () => {};

  private el: HTMLElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('aside');
    this.el.className = 'bld-drawer';
    this.el.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.el);

    this.el.addEventListener('pointerenter', () => (this.hovered = true));
    this.el.addEventListener('pointerleave', () => (this.hovered = false));
    // clicks inside must not fall through to the map's deselect handler
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.bld-close')) this.close();
    });

    addEventListener('keydown', this.onKey);
  }

  get isOpen(): boolean {
    return this.id !== null;
  }

  /** measured width in px — the focus camera frames the building into the space
   *  right of this, and the CSS clamps it (`max-width: 86vw`) on narrow screens */
  get width(): number {
    return this.id === null ? 0 : this.el.getBoundingClientRect().width;
  }

  open(id: string) {
    if (this.id === id) return;
    this.id = id;
    const info = infoFor(id);

    const rows = info.residents.length
      ? info.residents
          .map(
            (r) =>
              `<li class="bld-row"><span>${esc(r.label)}</span><span class="bld-floor">${
                r.floor === 0 ? '1 этаж' : r.floor + 1 + ' этаж'
              }</span></li>`
          )
          .join('')
      : '<li class="bld-row bld-empty">Список резидентов уточняется</li>';

    const count = info.residents.length;
    this.el.innerHTML = `
      <button class="bld-close" type="button" aria-label="Закрыть">&times;</button>
      <div class="bld-kind">${esc(info.kind)}</div>
      <h2 class="bld-name">${esc(info.name)}</h2>
      <div class="bld-count">${count ? count + ' ' + plural(count) : 'Резиденты не назначены'}</div>
      <ul class="bld-list">${rows}</ul>
    `;
    this.el.classList.add('open');
    this.el.setAttribute('aria-hidden', 'false');
  }

  close() {
    if (this.id === null) return;
    this.id = null;
    this.el.classList.remove('open');
    this.el.setAttribute('aria-hidden', 'true');
    this.onClose();
  }

  dispose() {
    removeEventListener('keydown', this.onKey);
    this.el.remove();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };
}

/** Russian plural for «резидент» — 1 резидент, 2 резидента, 5 резидентов */
function plural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'резидент';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'резидента';
  return 'резидентов';
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
  );
}
