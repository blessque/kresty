import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { asset } from '../../shared/assetUrl';
import {
  FINISHES,
  ZONE_PLACE,
  cardFloors,
  keyFact,
  sqm,
  terraceArea,
  type Offer,
  type Role,
} from '../../shared/estate';

/**
 * One space on «Аренда» — the DESIGNER'S card, `card-rental-space` (Figma
 * `1335:1561`), since round 32.2.
 *
 *   photo
 *   name (H3), and where it stands under it (Caption Small, tertiary)
 *   the area (Factoid) and what comes with it (H3), on one baseline
 *   Формат · Этажность · Отделка — and a fourth cell only where it decides
 *   the lease (the pavilion's ceiling, the stage's power, an office's parking)
 *   the body, then the button
 *
 * Everything else the round-32.1 card said — the building part, every parking
 * figure, the notes — was taken off by the designer; it is still in
 * shared/estate.ts. A row with nothing to say is left out rather than shown as
 * «—».
 *
 * Strings go through `t()` — short words bound, then escaped — like the drawer.
 */

export const CTA_ASK = 'Обсудить помещение';

/** the card's own name: a role may name its part («Павильон для мероприятий») */
export function cardName(o: Offer, r: Role): string {
  return r.name ?? o.name;
}

/** the card's headline figure: a role with its own area quotes that */
export function cardArea(o: Offer, r: Role): number {
  return r.area ?? o.area;
}

/** everything signed for WITH this card's space, as one «+ …» line */
function extras(o: Offer, r: Role): string {
  const parts: string[] = [];
  const ter = terraceArea(o);
  if (ter) {
    const n = o.terraces.length;
    parts.push(`${n > 1 ? `${n} террасы` : 'терраса'} ${sqm(ter)}`);
  }
  // a part with an area of its own is signed WITH the building it adjoins, as a
  // terrace is: the business centre's card names its pavilion. Not the other
  // way round — the sources do not say the pavilion comes with the offices.
  if (!r.area) {
    for (const other of o.roles) {
      if (other !== r && other.area) parts.push(`${lower(other.name ?? o.name)} ${sqm(other.area)}`);
    }
  }
  return parts.length ? `+ ${parts.join(', ')}` : '';
}

function facts(o: Offer, r: Role): [string, string][] {
  const rows: [string, string][] = [['Формат', o.format]];
  const floors = cardFloors(o, r);
  if (floors) rows.push(['Этажность', floors]);
  rows.push(['Отделка', FINISHES[o.finish].card]);
  const key = keyFact(o, r);
  if (key) rows.push([key.label, key.value]);
  return rows;
}

export function cardMarkup(o: Offer, r: Role): string {
  const extra = extras(o, r);
  const rows = facts(o, r)
    .map(([k, v]) => `<div class="rent-card__fact"><dt>${t(k)}</dt><dd>${t(v)}</dd></div>`)
    .join('');
  return (
    img(o) +
    `<div class="rent-card__head">` +
    `<h3 class="rent-card__name">${t(cardName(o, r))}</h3>` +
    `<p class="rent-card__place">${t(ZONE_PLACE[o.zone])}</p>` +
    `</div>` +
    `<p class="rent-card__size">` +
    `<span class="rent-card__area">${t(sqm(cardArea(o, r)))}</span>` +
    (extra ? `<span class="rent-card__extra">${t(extra)}</span>` : '') +
    `</p>` +
    `<dl class="rent-card__facts">${rows}</dl>` +
    `<p class="rent-card__body">${t(o.body)}</p>` +
    `<button type="button" class="btn btn--onlight btn--secondary rent-card__cta">${CTA_ASK}</button>`
  );
}

/**
 * `width`/`height` ARE LOAD-BEARING with `loading="lazy"`: they reserve the box
 * before the fetch. Round 26 shipped lazy images with `auto` sizes, the page grew
 * 1 200px mid-scroll and dragged the seam with it (CONTENT_PAGES).
 */
function img(o: Offer): string {
  const p = o.photo;
  return (
    `<img class="rent-photo shimmer" src="${asset(encodeURI(p.src))}" alt="${escapeHtml(p.alt)}"` +
    ` decoding="async" loading="lazy" width="${p.w}" height="${p.h}">`
  );
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function t(s: string): string {
  return escapeHtml(bindShortWords(s));
}
