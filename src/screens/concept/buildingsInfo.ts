/**
 * Resident data for the «Концепция» map drawer, keyed by the stable part ids
 * that buildingSplit.ts assigns.
 *
 * IDs are assigned by descending triangle count, so they follow modelling
 * detail rather than size — `b00` is the finely-modelled domed church, not one
 * of the big cross blocks. The mapping below was verified against each part's
 * measured footprint and screen position; the comments record both so it can be
 * re-checked without guessing.
 *
 * IDs are assigned AFTER the sliver absorption in buildingSplit.ts, so changing
 * `MIN_FOOTPRINT_FRAC` or `MIN_TRIS` renumbers everything from the first part it
 * drops onward. That has already bitten once — tightening the filter shifted
 * `b13`+ by one and silently moved the labels. Re-derive the table if you touch
 * those thresholds.
 *
 * ALL COPY IS PLACEHOLDER — plausible programme for the redevelopment, written
 * to be replaced with the client's real content. Swapping the text needs no
 * code change. Replacing `map.glb` re-derives the ids and invalidates this map.
 */

export interface Resident {
  label: string;
  /** storey index; 0 = ground floor */
  floor: number;
}

export interface BuildingInfo {
  name: string;
  /** one line under the title — what the building is */
  kind: string;
  residents: Resident[];
}

export const BUILDINGS_INFO: Record<string, BuildingInfo> = {
  // 8482 tris · 3.98×2.42 · centre of the plan — the domed, column-fronted
  // building; its four columns are absorbed into it by the footprint rule
  b00: {
    name: 'Церковь',
    kind: 'Домовый храм · реставрация',
    residents: [
      { label: 'Концертный зал', floor: 0 },
      { label: 'Выставочное пространство', floor: 1 },
      { label: 'Лекторий', floor: 1 },
    ],
  },
  // 2758 tris · 9.77×9.77 · left of the plan — cross block, welded to its
  // courtyard and apse so it selects as one unit
  b01: {
    name: 'Первый корпус',
    kind: 'Крестообразный корпус · 1892',
    residents: [
      { label: 'Музей истории тюрьмы', floor: 0 },
      { label: 'Книжный магазин «Полка»', floor: 0 },
      { label: 'Кофейня «Свет»', floor: 0 },
      { label: 'Лофт-апартаменты 12–18', floor: 1 },
      { label: 'Лофт-апартаменты 21–28', floor: 2 },
      { label: 'Мастерские резидентов', floor: 3 },
      { label: 'Смотровая галерея', floor: 4 },
    ],
  },
  // 2626 tris · 9.77×9.77 · right of the plan — the second cross block
  b02: {
    name: 'Второй корпус',
    kind: 'Крестообразный корпус · 1890',
    residents: [
      { label: 'Центр современного искусства', floor: 0 },
      { label: 'Ресторан «Галерея»', floor: 0 },
      { label: 'Резиденции художников', floor: 1 },
      { label: 'Студии звукозаписи', floor: 2 },
      { label: 'Апартаменты 30–44', floor: 3 },
      { label: 'Общественная терраса', floor: 4 },
    ],
  },
  // 316 tris · 1.98×4.06 · south-east edge
  b03: {
    name: 'Юго-восточный флигель',
    kind: 'Жилой корпус',
    residents: [
      { label: 'Пекарня', floor: 0 },
      { label: 'Апартаменты 1–9', floor: 1 },
      { label: 'Апартаменты 10–18', floor: 2 },
    ],
  },
  // 304 tris · 1.76×1.76 · round volume at the north-west
  b04: {
    name: 'Водонапорная башня',
    kind: 'Инженерное сооружение · памятник',
    residents: [
      { label: 'Смотровая площадка', floor: 3 },
      { label: 'Бар «Башня»', floor: 2 },
    ],
  },
  // 280 tris · 4.88×2.22 · wide volume, north-centre
  b05: {
    name: 'Административный корпус',
    kind: 'Офисы и сервисы квартала',
    residents: [
      { label: 'Управляющая компания', floor: 0 },
      { label: 'Коворкинг «Набережная»', floor: 1 },
      { label: 'Переговорные', floor: 2 },
      { label: 'Офисы резидентов', floor: 3 },
    ],
  },
  // 272 tris · 2.48×3.81 · tall volume, centre-south
  b06: {
    name: 'Мастерские',
    kind: 'Производственный корпус',
    residents: [
      { label: 'Столярная мастерская', floor: 0 },
      { label: 'Керамическая студия', floor: 0 },
      { label: 'Ателье', floor: 1 },
      { label: 'Мастерские резидентов', floor: 2 },
    ],
  },
  // 232 tris · 1.86×5.16 · long volume on the west edge
  b07: {
    name: 'Западный флигель',
    kind: 'Жилой корпус',
    residents: [
      { label: 'Детская студия', floor: 0 },
      { label: 'Апартаменты 1–12', floor: 1 },
      { label: 'Апартаменты 13–24', floor: 2 },
    ],
  },
  // 208 tris · 2.58×2.45 · south-centre
  b08: {
    name: 'Кухонный корпус',
    kind: 'Гастрономический квартал',
    residents: [
      { label: 'Фуд-холл', floor: 0 },
      { label: 'Винный бар', floor: 1 },
    ],
  },
  // 204 tris · 1.91×2.48 · south-west
  b09: {
    name: 'Прачечная',
    kind: 'Сервисный корпус',
    residents: [
      { label: 'Прачечная самообслуживания', floor: 0 },
      { label: 'Пункт выдачи', floor: 0 },
    ],
  },
  // 142 tris · 2.75×1.94 · north-east
  b10: {
    name: 'Больничный корпус',
    kind: 'Медицина и жильё',
    residents: [
      { label: 'Медицинский центр', floor: 0 },
      { label: 'Аптека', floor: 0 },
      { label: 'Апартаменты 1–14', floor: 1 },
    ],
  },
  // 130 tris · 2.58×1.40 · south-centre
  b11: {
    name: 'Гаражный корпус',
    kind: 'Паркинг',
    residents: [{ label: 'Подземный паркинг', floor: 0 }],
  },
  // 128 tris · 1.44×2.63 · south
  b12: {
    name: 'Котельная',
    kind: 'Инженерный корпус',
    residents: [{ label: 'Техническая служба квартала', floor: 0 }],
  },
  // 110 tris · 2.50×1.47 · north-centre
  b13: {
    name: 'Проходная',
    kind: 'Входная группа',
    residents: [
      { label: 'Информационный центр', floor: 0 },
      { label: 'Сувенирный магазин', floor: 0 },
    ],
  },
  // 110 tris · 2.75×1.94 · far east
  b14: {
    name: 'Восточный флигель',
    kind: 'Жилой корпус',
    residents: [
      { label: 'Апартаменты 1–9', floor: 1 },
      { label: 'Апартаменты 10–18', floor: 2 },
    ],
  },
  // 68 tris · 2.74×5.17 · large but only 0.43 high — a paved yard, not a volume
  b15: {
    name: 'Прогулочный двор',
    kind: 'Общественное пространство',
    residents: [{ label: 'Летняя сцена', floor: 0 }],
  },
  // 59 tris · 1.07×1.38 · east
  b16: {
    name: 'Караульная',
    kind: 'Сервисный павильон',
    residents: [{ label: 'Пост охраны', floor: 0 }],
  },
  // 48 tris · 2.67×1.87 · only 0.21 high — a canopy
  b17: {
    name: 'Складской навес',
    kind: 'Навес',
    residents: [],
  },
  // 46 tris · 6.95×1.64 · 0.09 high — the long bar along the north edge
  b18: {
    name: 'Ограда по набережной',
    kind: 'Историческая ограда · реставрация',
    residents: [],
  },
};

/** Every part opens a drawer; unmapped ones get a neutral stub rather than
 *  nothing, so the interaction never feels broken while copy is pending. */
export function infoFor(id: string): BuildingInfo {
  return (
    BUILDINGS_INFO[id] ?? {
      name: 'Строение ' + id.replace(/^b0?/, ''),
      kind: 'Назначение уточняется',
      residents: [],
    }
  );
}
