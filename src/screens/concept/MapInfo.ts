import { infoFor, summarize } from './buildingsInfo';
import { bindShortWords } from '../../shared/ruTypography';
import { escapeHtml } from '../../shared/escapeHtml';

/**
 * The left rail under the logo: the map's standing instruction, replaced by a
 * building summary while one is hovered.
 *
 * Round 10 moved this out of the bottom centre. It used to be a small 14px
 * line floating under the plan, which made it a caption for the whole screen —
 * but it is the only piece of guidance on the page, and it now also carries the
 * hover read-out, so it belongs in the same left column as the logo and the
 * news block on the main screen. One column, top-down: logo, then this.
 *
 * The hover state shows NAME + BRIEF + a summary of what the building holds.
 * Enumerating the residents here would make the drawer redundant — the hover is
 * a glance, the drawer is the reading.
 */

/**
 * Fade-out before the content swaps, and fade-in after. Mirrored in
 * `.map-info`'s CSS transition; the two must agree or the swap lands mid-fade.
 */
const SWAP_MS = 200;

export class MapInfo {
  private readonly el: HTMLElement;
  /** what is currently in the DOM */
  private rendered: string | null | undefined = undefined;
  /** what we are heading toward — may differ from `rendered` mid-swap */
  private pending: string | null | undefined = undefined;
  /** non-zero while a fade-out is in flight */
  private swapTimer = 0;
  /** suppressed while a building is focused — the drawer is doing this job */
  private muted = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'map-info';
    parent.appendChild(this.el);
    this.setHovered(null);
  }

  /**
   * `id` is the hovered building, or null for the standing hint.
   *
   * OVERRIDE BEHAVIOUR. Swaps do not queue. If a fade-out is already running,
   * a new target only updates `pending` and lets the running timer pick it up —
   * it does NOT restart the clock. Two things follow, and both are the point:
   *
   *  - sweeping quickly across buildings collapses into ONE fade cycle showing
   *    the latest target, instead of a backlog of 400ms out/in pairs;
   *  - the newest target still appears at the original deadline rather than
   *    being pushed back 200ms per pointer move, which is what restarting the
   *    timer would do and what makes this kind of reveal feel laggy.
   */
  setHovered(id: string | null) {
    if (id === this.pending) return;
    this.pending = id;

    // first paint: nothing to fade out of
    if (this.rendered === undefined) {
      this.render(id);
      return;
    }
    // a fade-out is already running — it will render whatever `pending` holds
    if (this.swapTimer) return;

    this.el.classList.add('swapping');
    this.swapTimer = window.setTimeout(() => {
      this.swapTimer = 0;
      this.render(this.pending!);
      this.el.classList.remove('swapping');
    }, SWAP_MS);
  }

  /** hide entirely (a building is focused and the drawer is doing this job) */
  setMuted(muted: boolean) {
    if (muted === this.muted) return;
    this.muted = muted;
    this.el.classList.toggle('muted', muted);
  }

  dispose() {
    clearTimeout(this.swapTimer);
    this.el.remove();
  }

  private render(id: string | null) {
    this.rendered = id;

    if (id === null) {
      this.el.innerHTML = `<p class="mi-hint">${t('Наведите на здание, чтобы узнать о резидентах')}</p>`;
      this.el.classList.remove('building');
      return;
    }

    const info = infoFor(id);
    const summary = summarize(info);

    // Name, brief, and what the building actually holds — nothing else.
    // Round 10.2 removed three things the designer called noise: the small
    // `kind` line («Паркинг», «Крестообразный корпус»), which repeated the
    // name at a size too small to be worth reading; the brand marks, which at
    // 26px read as icons rather than as identities; and «Нажмите, чтобы
    // открыть карточку», which explained an affordance the cursor already
    // shows. The summary replaces all three with the one fact a glance wants.
    this.el.innerHTML = `
      <h2 class="mi-name">${t(info.name)}</h2>
      <p class="mi-brief">${t(info.brief)}</p>
      ${summary ? `<p class="mi-summary">${t(summary)}</p>` : ''}
    `;
    this.el.classList.add('building');
  }
}

/** bind short words, then escape — every string the rail renders goes through
 *  this, so «на Неву» and «126 номеров» can never break across a line */
function t(s: string): string {
  return escapeHtml(bindShortWords(s));
}
