/**
 * Placeholder wordmarks for the branded residents.
 *
 * ALL INVENTED. These stand in for the logos of whatever cafés, bars and hotels
 * actually sign, so the drawer and the hover summary can be judged with real
 * furniture in them rather than with bare text.
 *
 * Drawn rather than sourced, deliberately:
 *
 *  - a pitch that ships real trademarks for businesses which are not signed
 *    tenants is a liability, and a placeholder that looks like a real brand is
 *    the kind of thing that survives into a client deck by accident;
 *  - `currentColor` + `stroke` means each mark inherits the map's ink and
 *    restyles for free when the palette moves. A downloaded raster logo would
 *    have to be re-cut by hand for the drawer, the hover rail and any dark
 *    variant later.
 *
 * One flat 24×24 grid, 1.5 stroke, no fills — so a row of them reads as one
 * set rather than as clip-art. Swap the whole map for the client's real assets
 * when they exist; nothing else needs to change.
 */

const ATTR =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

export const RESIDENT_LOGOS: Record<string, string> = {
  /** «Полка» — books stood on a shelf */
  polka: `<svg ${ATTR}>
    <path d="M3.5 19.8h17"/>
    <rect x="5.6" y="7.2" width="3.2" height="12.6"/>
    <rect x="10.4" y="4.6" width="3.2" height="15.2"/>
    <rect x="15.2" y="9.4" width="3.2" height="10.4"/>
  </svg>`,

  /** «Свет» — a source and its rays; the site's own motif at small size */
  svet: `<svg ${ATTR}>
    <circle cx="12" cy="12" r="3.3"/>
    <path d="M12 3.4v2.5M12 18.1v2.5M3.4 12h2.5M18.1 12h2.5"/>
    <path d="M5.9 5.9l1.8 1.8M16.3 16.3l1.8 1.8M18.1 5.9l-1.8 1.8M7.7 16.3l-1.8 1.8"/>
  </svg>`,

  /** «Галерея» — a plate in a frame; restaurant inside an art block */
  galereya: `<svg ${ATTR}>
    <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="1.2"/>
    <circle cx="12" cy="12" r="3.9"/>
  </svg>`,

  /** «Башня» — the water tower it occupies */
  bashnya: `<svg ${ATTR}>
    <path d="M8.4 20.2h7.2"/>
    <path d="M9.4 20.2V9.6h5.2v10.6"/>
    <path d="M9.4 9.6 12 4.8l2.6 4.8"/>
    <path d="M12 4.8V2.9"/>
  </svg>`,

  /** «Набережная» — water, three courses of it */
  naberezhnaya: `<svg ${ATTR}>
    <path d="M2.8 8.4q2.6-2.6 5.2 0t5.2 0t5.2 0"/>
    <path d="M2.8 13.2q2.6-2.6 5.2 0t5.2 0t5.2 0"/>
    <path d="M2.8 18q2.6-2.6 5.2 0t5.2 0t5.2 0"/>
  </svg>`,

  /** Cosmos Hotel Group — the operator of both cross blocks. A placeholder
   *  mark, NOT the company's real identity: an orbit round a body. */
  cosmos: `<svg ${ATTR}>
    <circle cx="12" cy="12" r="4.2"/>
    <ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-24 12 12)"/>
  </svg>`,

  /** Музей «Кресты» — a framed cross, the complex's own motif */
  museum: `<svg ${ATTR}>
    <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="1.2"/>
    <path d="M12 7.4v9.2M7.4 12h9.2"/>
  </svg>`,

  /** «Тесто» — a wheat ear for the bakery */
  testo: `<svg ${ATTR}>
    <path d="M12 21V8.2"/>
    <path d="M12 8.2c0-2.5 1.6-4.4 4-5-.2 2.6-1.6 4.4-4 5Z"/>
    <path d="M12 8.2c0-2.5-1.6-4.4-4-5 .2 2.6 1.6 4.4 4 5Z"/>
    <path d="M12 13.4c0-2.2 1.5-3.8 3.6-4.4-.2 2.3-1.5 3.9-3.6 4.4Z"/>
    <path d="M12 13.4c0-2.2-1.5-3.8-3.6-4.4.2 2.3 1.5 3.9 3.6 4.4Z"/>
  </svg>`,

  /** «Погреб» — the wine bar */
  pogreb: `<svg ${ATTR}>
    <path d="M8 3.6h8l-.7 5.3A3.4 3.4 0 0 1 12 11.8a3.4 3.4 0 0 1-3.3-2.9Z"/>
    <path d="M12 11.8v7.6M9 19.4h6"/>
  </svg>`,
};

/** the mark for a brand key, or an empty string if there is none */
export function logoFor(key: string | undefined): string {
  return (key && RESIDENT_LOGOS[key]) || '';
}
