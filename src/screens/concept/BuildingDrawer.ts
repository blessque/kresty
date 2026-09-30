import { infoFor, type Resident } from './buildingsInfo';
import { bindShortWords } from '../../shared/ruTypography';
import { escapeHtml } from '../../shared/escapeHtml';
import { asset } from '../../shared/assetUrl';
import { offersOn } from '../../shared/estate';

/**
 * Left-side drawer: one building, said to a VISITOR.
 *
 * Owns its own DOM and nothing else — ConceptScreen calls open()/close() and
 * reads `isOpen` / `hovered` so it can freeze the plan's lean while the pointer
 * is over the panel (the lean maps raw cursor position to shear across the
 * whole screen, and DEADZONE is 0, so without this the plan would keep tilting
 * while you read).
 *
 * ROUND 32.1 — THE DESIGNER'S FRAME `1268:340`, for every building. No opaque
 * panel any more: a white fade rises out of the left edge and a centred column
 * sits in it — a star-cut photograph, the name, one sentence, and «Аренда» only
 * where something is free to let. The close moved to the screen's corner.
 *
 * THE MAP IS FOR GUESTS FIRST (the client's rule). Round 32 put a tenant's
 * listing in here — «Свободно для аренды», areas, formats — and it read as a
 * leasing sheet on a map people open to find a restaurant. The figures live on
 * «Аренда»; the drawer only says the way there.
 *
 * The resident list survives where the frame has no rent to offer instead, or
 * where an operator runs the building: the hotels, the church, the pier and the
 * parking. A rentable building IS the designer's frame, which has no list.
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
const ICON_CLOSE = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
  <path d="M2 14L14 2M14 14L2 2" stroke="currentColor" stroke-width="2"/>
</svg>`;

export class BuildingDrawer {
  /** currently open building id, or null */
  id: string | null = null;
  /** pointer is over the panel — the caller should not lean the plan */
  hovered = false;
  onClose: () => void = () => {};
  /** «Аренда» — the screen routes this to `#rent/<slug>` */
  onRent: (slug: string) => void = () => {};

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
      const target = e.target as HTMLElement;
      if (target.closest('.bld-close')) this.close();
      const lease = target.closest<HTMLElement>('[data-rent]');
      if (lease?.dataset.rent) this.onRent(lease.dataset.rent);
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
    const offers = offersOn(id);

    const listed = !offers.length || info.logo;
    const rows = listed && info.residents.length ? info.residents.map(row).join('') : '';

    // The operator wordmark stays — it is a brand mark rather than a caption,
    // and it is the only thing that distinguishes the two hotels at a glance.
    const mark = info.logo
      ? `<img class="bld-logo" src="${escapeHtml(asset(info.logo))}" alt="" aria-hidden="true">`
      : '';

    // one button however many offers a building holds: it names the first, and
    // «Аренда» lands on that card — the rest are on the same page
    const rent = offers.length
      ? `<button class="btn btn--onlight bld-rent" type="button" data-rent="${escapeHtml(offers[0].slug)}">Аренда</button>`
      : '';

    this.el.innerHTML = `
      <div class="bld-scroll">
        <div class="bld-body">
          ${star(info.photo ?? offers[0]?.photo.src)}
          <div class="bld-text">
            ${mark}
            <h3 class="bld-name">${t(info.name)}</h3>
            <p class="bld-brief">${t(info.brief)}</p>
          </div>
          ${rows ? `<ul class="bld-list">${rows}</ul>` : ''}
          ${rent}
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

/**
 * The photograph, cut to the site's four-point star (the designer's `Star 2` is
 * the same drawing as the 12px bullet, `src/assets/star-bullet.svg`, at 360).
 * A building with no photo of its own borrows its first offer's render; the
 * church, the pier and the parking have neither and open straight on the name.
 */
function star(photo: string | undefined): string {
  if (!photo) return '';
  return `<div class="bld-star">
    <img class="bld-photo shimmer" src="${escapeHtml(asset(photo))}" alt="" aria-hidden="true">
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
    r.type === 'hotel' ? '' : `<span class="bld-floor">${t(storeys(r))}</span>`;
  // a resident that stands for many units («Номера», count 126) says so —
  // otherwise the drawer would flatten 126 rooms into one anonymous line
  const label = r.count && r.count > 1 ? t(`${r.label} · ${r.count}`) : t(r.label);
  return `<li class="bld-row"><span class="bld-resident">${label}</span>${floor}</li>`;
}

/** «1 этаж», or «1–3 этажи» for a resident that spans several */
function storeys(r: Resident): string {
  if (r.to === undefined || r.to === r.floor) return `${r.floor + 1} этаж`;
  return `${r.floor + 1}–${r.to + 1} этажи`;
}

/** bind short words, then escape — every string the drawer renders goes through
 *  this, so «на 126 номеров» can never break across a line */
function t(s: string): string {
  return escapeHtml(bindShortWords(s));
}
