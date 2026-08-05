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

const ICON_CHEVRON = `<svg viewBox="0 0 19 19" fill="none" aria-hidden="true" focusable="false">
  <path d="M10.059 9.5L5 2L7.06956 2L14.3927 9.5L7.06956 17H5L10.059 9.5Z" fill="currentColor"/>
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

    // The wordmark replaces `kind` when a building has an operator — the Figma
    // shows the Cosmos mark and no lit line. Buildings without one keep `kind`,
    // which is the only thing identifying them.
    const mark = info.logo
      ? `<img class="bld-logo" src="${escapeHtml(asset(info.logo))}" alt="" aria-hidden="true">`
      : `<div class="bld-kind">${t(info.kind)}</div>`;

    this.el.innerHTML = `
      <div class="bld-scroll">
        ${hero(info)}
        <div class="bld-body">
          ${mark}
          <h2 class="bld-name">${t(info.name)}</h2>
          <p class="bld-brief">${t(info.brief)}</p>
          ${link(info)}
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

/** the building's own outbound link — «Сайт отеля ›», under the brief */
function link(info: BuildingInfo): string {
  if (!info.link) return '';
  return `<a class="bld-site" href="${escapeHtml(info.link.url)}" target="_blank" rel="noopener noreferrer">${t(
    info.link.label
  )}<span class="bld-chevron">${ICON_CHEVRON}</span></a>`;
}

/**
 * One resident row. A BRANDED resident (a hotel, restaurant, café or shop) gets
 * its outbound link with a chevron; a plain programme entry stays a name and a
 * floor, so the branded ones actually stand out instead of everything looking
 * equally important.
 *
 * `target="_blank"` + `rel="noopener noreferrer"`: the drawer lives over a
 * WebGL canvas with a running render loop, and navigating the tab away from it
 * mid-pitch would tear down the whole scene.
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
  if (!r.brand) {
    return `<li class="bld-row"><span>${label}</span>${floor}</li>`;
  }
  return `<li class="bld-row bld-row--brand">
    <span class="bld-brand">
      <span class="bld-label">${label}</span>
      <a class="bld-link" href="${escapeHtml(r.brand.url)}" target="_blank" rel="noopener noreferrer">${t(
        r.brand.cta
      )}<span class="bld-chevron">${ICON_CHEVRON}</span></a>
    </span>
    ${floor}
  </li>`;
}

/** bind short words, then escape — every string the drawer renders goes through
 *  this, so «на 126 номеров» can never break across a line */
function t(s: string): string {
  return escapeHtml(bindShortWords(s));
}
