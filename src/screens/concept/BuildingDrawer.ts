import { infoFor, type BuildingInfo, type Resident } from './buildingsInfo';
import { bindShortWords } from '../../shared/ruTypography';
import { escapeHtml } from '../../shared/escapeHtml';
import { asset } from '../../shared/assetUrl';

/**
 * Left-side drawer listing a building's residents.
 *
 * Owns its own DOM and nothing else — ConceptScreen calls open()/close() and
 * reads `isOpen` / `hovered` so it can freeze the plan's lean while the pointer
 * is over the panel (the lean maps raw cursor position to shear across the
 * whole screen, and DEADZONE is 0, so without this the plan would keep tilting
 * while you read).
 *
 * ROUND 10.3 layout: a photographic hero carrying the operator's wordmark, the
 * close control over it, then the reading column. Buildings without a photo
 * (everything but the two hotels so far) open straight into the column — the
 * hero is optional by construction, not a hole to fill.
 */

/**
 * The two UI icons are INLINED rather than referenced from
 * `/resources/*.svg`, even though both files exist there.
 *
 * `<img src>` cannot be recoloured, and both icons need to be: the close sits
 * white over the hero photo but must go dark on a building that has no hero,
 * and the chevron follows the link colour. `currentColor` gives both for free
 * and costs two paths. The geometry is copied verbatim from the designer's
 * files — only the hard-coded `white` / `#36A0FF` became `currentColor`.
 */
const ICON_CLOSE = `<svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
  <path d="M4 16L10 10M10 10L16 4M10 10L16 16M10 10L4 4" stroke="currentColor" stroke-width="1.84615"/>
</svg>`;

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
      ? info.residents.map(row).join('')
      : `<li class="bld-row bld-empty">${t('Список резидентов уточняется')}</li>`;

    // ROUND 18 cut the grey `kind` line that used to stand above the heading.
    // The operator wordmark stays — it is a brand mark rather than a caption,
    // and it is the only thing that distinguishes the two hotels at a glance.
    const mark = info.logo
      ? `<img class="bld-logo" src="${escapeHtml(asset(info.logo))}" alt="" aria-hidden="true">`
      : '';

    this.el.innerHTML = `
      <div class="bld-scroll">
        ${hero(info)}
        <div class="bld-body">
          ${mark}
          <h2 class="bld-name">${t(info.name)}</h2>
          <p class="bld-brief">${t(info.brief)}</p>
          <ul class="bld-list">${rows}</ul>
        </div>
      </div>
      <button class="bld-close" type="button" aria-label="Закрыть">${ICON_CLOSE}</button>
    `;
    // a re-opened drawer must start at the top, not wherever the last building
    // was scrolled to
    const scroll = this.el.querySelector('.bld-scroll');
    if (scroll) scroll.scrollTop = 0;
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

/** the photographic header */
function hero(info: BuildingInfo): string {
  if (!info.photo) return '';
  return `<div class="bld-hero">
    <img class="bld-photo" src="${escapeHtml(asset(info.photo))}" alt="" aria-hidden="true">
  </div>`;
}

/**
 * One resident row: a name and the floor it is on, and nothing else.
 *
 * ROUND 18 removed the outbound links — the per-resident CTA («Купить билет»,
 * «Забронировать стол») and the building's own «Сайт отеля». With them went the
 * branded/plain distinction, so there is one row shape again rather than two.
 * `Brand.url` / `Brand.cta` in `buildingsInfo.ts` are left in place but now have
 * no reader.
 */
function row(r: Resident): string {
  // The hotel IS the building — it occupies every storey, so a floor number
  // there would be wrong as well as noisy. The Figma shows it as a plain
  // two-line entry with nothing in the right column.
  const floor =
    r.type === 'hotel'
      ? ''
      : `<span class="bld-floor">${t(r.floor === 0 ? '1 этаж' : r.floor + 1 + ' этаж')}</span>`;
  // a resident that stands for many units («Номера», count 126) says so —
  // otherwise the drawer would flatten 126 rooms into one anonymous line
  const label = r.count && r.count > 1 ? t(`${r.label} · ${r.count}`) : t(r.label);
  return `<li class="bld-row"><span class="bld-resident">${label}</span>${floor}</li>`;
}

/** bind short words, then escape — every string the drawer renders goes through
 *  this, so «на 126 номеров» can never break across a line */
function t(s: string): string {
  return escapeHtml(bindShortWords(s));
}
