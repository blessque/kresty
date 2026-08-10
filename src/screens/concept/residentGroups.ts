import { BUILDINGS_INFO, type Brand, type ResidentType } from './buildingsInfo';

/**
 * The resident sections that follow the map — one full viewport per group.
 *
 * ROUND 16. The brief was "one section per group of residents, each with its
 * own icon and its own background colour". None of the membership is authored
 * here: every resident in `buildingsInfo.ts` already carries a `ResidentType`,
 * so a group is just a set of those types and the members fall out of the map's
 * own data. That is the whole point — the section list and the building drawer
 * cannot drift apart, because there is one table and it is the drawer's.
 *
 * WHY THE COLOURS ARE DEEP AND NOT BRIGHT
 * ---------------------------------------
 * The brief asked for bright backgrounds. The hero light cannot survive one.
 * The ray-field canvas composites with `mix-blend-mode: screen`, which is
 * `1 − (1−a)(1−b)` — it can only ever lighten, so a pale field swallows the
 * light and `#ffffff` renders a blank white page (TUNING_LOG logs this as a
 * standing limitation of `bg`, not a tuning miss). Asked to choose, the user
 * kept the light, so the palette went deep instead: these sit at roughly 15–22 %
 * lightness, dark enough for the god-rays to read and saturated enough to still
 * be a colour rather than a grey.
 *
 * Making the light work on a bright field is not a palette change — it is the
 * eclipse composite mode, which is a different piece of work.
 *
 * The seven titles, the leads and the seven hexes are COPY AND TASTE. They are
 * deliberately all in this one table so the designer's pass is a text edit.
 */

export interface ResidentGroup {
  id: string;
  /** file under `public/resources/` — the client's own icon set */
  icon: string;
  title: string;
  /** one line under the title */
  lead: string;
  /** the section's own background, `#rrggbb` */
  bg: string;
  /** which resident types belong to this group */
  types: ResidentType[];
  /**
   * Invented top-ups, for groups the map's data leaves too thin to read as a
   * section. Marked `invented` on the way out so nothing placeholder can reach
   * a client deck unlabelled — the same discipline `residentLogos.ts` applies
   * to the wordmarks.
   */
  extra?: { label: string; count?: number }[];
}

/**
 * Residents whose TYPE puts them in the wrong section.
 *
 * `hall` legitimately covers both «Концертный зал» and «Переговорные» — one is
 * culture, the other is what you book from your desk. Rather than split the
 * type (which would re-key the drawer's summaries), the handful of genuine
 * mis-fits are re-pointed by label here, and this is the only place membership
 * is ever decided by name rather than by data.
 */
const LABEL_GROUP: Record<string, string> = {
  Переговорные: 'office',
};

export const RESIDENT_GROUPS: ResidentGroup[] = [
  {
    id: 'hotel',
    icon: 'Bed-640.svg',
    title: 'Отели',
    lead: '262 номера в двух корпусах-крестах, под управлением Cosmos Hotel Group.',
    bg: '#132a52',
    types: ['hotel', 'room'],
  },
  {
    id: 'restaurant',
    icon: 'Restaurant-640.svg',
    title: 'Рестораны и бары',
    lead: 'Гастрономический кластер квартала — от фуд-холла до панорамного зала под крышей.',
    bg: '#4e121f',
    types: ['restaurant', 'bar'],
  },
  {
    id: 'cafe',
    icon: 'Cup-640.svg',
    title: 'Кафе и пекарни',
    lead: 'Утренний слой квартала: кофе, хлеб и террасы вдоль набережной.',
    bg: '#452612',
    types: ['cafe'],
  },
  {
    id: 'spa',
    icon: 'SPA-640.svg',
    title: 'SPA и здоровье',
    lead: 'Спа-комплекс пятизвёздочного корпуса, открытый и для гостей квартала.',
    bg: '#0d3937',
    types: ['spa'],
    // the map carries exactly one spa resident — a section of one line is not a
    // section, so these four stand in until the operator's programme exists
    extra: [
      { label: 'Хаммам и сауны', count: 4 },
      { label: 'Бассейн 25 метров' },
      { label: 'Фитнес-зал' },
      { label: 'Салон красоты' },
    ],
  },
  {
    id: 'culture',
    icon: 'Window-640.svg',
    title: 'Культура',
    lead: 'Музей «Кресты», действующий храм и залы, оставшиеся от тюремной геометрии.',
    bg: '#38133f',
    types: ['museum', 'hall', 'church'],
  },
  {
    id: 'office',
    icon: 'Office-640.svg',
    title: 'Офисы и коворкинг',
    lead: 'Рабочий квартал внутри памятника: студии, коворкинг и офисы резидентов.',
    bg: '#2a2450',
    types: ['office'],
  },
  {
    id: 'shop',
    icon: 'Park-640.svg',
    title: 'Магазины и мастерские',
    lead: 'Первые этажи вдоль улицы Комсомола: книги, шоурумы, ателье и мастерские.',
    bg: '#14351d',
    types: ['shop', 'workshop'],
  },
];

export interface GroupEntry {
  label: string;
  /** summed across every building that lists it — see collectGroup */
  count: number;
  brand?: Brand;
  /** true for `extra` rows, so the UI can mark them */
  invented?: boolean;
}

/**
 * The members of one group, gathered out of `BUILDINGS_INFO`.
 *
 * MERGED BY LABEL, SUMMING `count`. «Офисы резидентов» is listed on four
 * separate buildings (8 + 12 + 9 + 6) and «Кафе» on two; left unmerged the
 * offices section would print the same row four times and claim nothing, where
 * one row reading 35 is the actual fact about the quarter.
 *
 * Branded residents sort first — they are the ones with a name worth reading —
 * and everything else keeps the order the map lists it in.
 *
 * `service` and `parking` reach no group on purpose: `buildingsInfo.ts` already
 * records that back-of-house "is not a selling point", and a section of
 * laundries and technical rooms would be the page arguing against itself.
 */
export function collectGroup(group: ResidentGroup): GroupEntry[] {
  const wanted = new Set<string>(group.types);
  const byLabel = new Map<string, GroupEntry>();

  for (const info of Object.values(BUILDINGS_INFO)) {
    for (const r of info.residents) {
      const forced = LABEL_GROUP[r.label];
      const mine = forced !== undefined ? forced === group.id : wanted.has(r.type);
      if (!mine) continue;
      const hit = byLabel.get(r.label);
      if (hit) {
        hit.count += r.count ?? 1;
        // a brand on any one of the merged rows carries the merged row
        hit.brand ??= r.brand;
      } else {
        byLabel.set(r.label, { label: r.label, count: r.count ?? 1, brand: r.brand });
      }
    }
  }

  // `rooms` is a BUILDING-level fact rather than a resident (the drawer lists
  // tenants you can walk into, and «Номера · 126» is not one), so the hotels
  // section has to fold it in the same way `summarize()` does.
  if (wanted.has('room')) {
    let rooms = 0;
    for (const info of Object.values(BUILDINGS_INFO)) rooms += info.rooms ?? 0;
    if (rooms > 0) byLabel.set('Номера', { label: 'Номера', count: rooms });
  }

  const found = [...byLabel.values()].sort(
    (a, b) => Number(!!b.brand) - Number(!!a.brand)
  );
  for (const e of group.extra ?? []) {
    found.push({ label: e.label, count: e.count ?? 1, invented: true });
  }
  return found;
}
