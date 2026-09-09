import logoSvg from '../assets/logo.svg?raw';

/**
 * The wordmark, top left, linking home (round 24).
 *
 * It existed twice before this — `.concept-home` in `concept.css` and
 * `.fx-home` in `contacts.css`, byte-for-byte the same geometry in two
 * stylesheets, with the same six lines of JS in two screens. Four new pages
 * would have made it six copies, which is the point at which a duplicate stops
 * being cheaper than an abstraction.
 *
 * THE BOX IS ONE SITEWIDE: 251.2 × 40 at (32, 32). The 251.2 is not authored —
 * the svg's viewBox is `0 0 314 50`, so 40 tall is 251.2 wide and the aspect is
 * the asset's. Changing it means re-verifying that all seven map captions still
 * place, because `.concept-home` is an obstacle in `mapLabels.ts`'s solver.
 */
export function buildHomeLink(onHome: () => void): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'page-home';
  a.href = '#';
  a.innerHTML = logoSvg;
  a.setAttribute('aria-label', 'На главную');
  a.addEventListener('click', (e) => {
    e.preventDefault();
    onHome();
  });
  return a;
}
