import { MediaSlider, STRIP_H } from '../../page/mediaSlider';
import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { MUSEUM_SECTIONS, type MuseumSection } from './museumSections';

/**
 * The four era sections, built from the table.
 *
 * Structurally «О Крестах»'s `sectionRun.ts` — a sticky left column beside a
 * scrolling body column, both placed by the shared grid's role classes — with
 * three differences, each of which follows from the light not travelling:
 *
 *  1. **No geometry table.** `SectionGeom`, the station invariant, `iconY`'s
 *     three-phase clamp and the per-section `--sec-pin` all exist to keep a
 *     light aligned to a box that moves. Nothing here is aligned to a box.
 *  2. **No `.sec-icon`.** The aside carries the era and the years, and the light
 *     behind it is the same cross in every section.
 *  3. **The sticky column is centred by CSS**, not by a measured pin — the cross
 *     is at 50 % of the viewport, so `top: calc(50% - …)` puts the era inside it
 *     without JavaScript ever reading a height.
 *
 * The one measurement that remains is each section's `offsetTop`, which the
 * colour track needs; a picture block changing slides can move it, so the
 * slider's resize hook is wired straight back to a re-measure.
 */
export class MuseumRun {
  readonly sections: HTMLElement[] = [];
  /** a slide of a different aspect became active and the section's box moved */
  onMediaResize: () => void = () => {};

  constructor(add: (el: HTMLElement) => void) {
    for (const s of MUSEUM_SECTIONS) {
      const el = this.build(s);
      this.sections.push(el);
      add(el);
    }
  }

  private build(s: MuseumSection): HTMLElement {
    const el = document.createElement('section');
    el.className = 'mus';
    el.dataset.section = s.id;
    el.innerHTML =
      `<div class="mus-grid page-grid">` +
      `<div class="mus-col col-aside">` +
      `<h2 class="mus-era">${escapeHtml(bindShortWords(s.era))}</h2>` +
      `<p class="mus-years">${escapeHtml(s.years)}</p>` +
      `</div>` +
      `<div class="mus-body col-main"></div>` +
      `</div>`;

    const body = el.querySelector('.mus-body') as HTMLElement;

    const kicker = document.createElement('p');
    kicker.className = 'mus-kicker';
    kicker.textContent = bindShortWords(s.kicker);
    body.appendChild(kicker);

    for (const b of s.body) {
      if (b.kind === 'p') {
        const p = document.createElement('p');
        p.textContent = bindShortWords(b.text);
        body.appendChild(p);
        continue;
      }
      if (b.kind === 'h3') {
        const h = document.createElement('h3');
        h.className = 'mus-h3';
        h.textContent = bindShortWords(b.text);
        body.appendChild(h);
        continue;
      }
      if (b.kind === 'list') {
        const ul = document.createElement('ul');
        ul.className = 'mus-list';
        // The star is a `::before` clip-path, not an <img> and not a list
        // marker: `.news-filters__dot` already draws the frame's four-pointed
        // star that way, so this is the same polygon at the same size rather
        // than a tenth asset that has to stay in sync with it.
        ul.innerHTML = b.items
          .map((t) => `<li>${escapeHtml(bindShortWords(t))}</li>`)
          .join('');
        body.appendChild(ul);
        continue;
      }
      // Not retained. The run is built once and lives for the session, exactly
      // as «О Крестах»'s does — there is no teardown path to hand a `destroy()`
      // to, and an API nothing calls is a claim that one exists.
      body.appendChild(new MediaSlider(b.items, { onResize: () => this.onMediaResize() }).el);
    }

    return el;
  }

  /**
   * Size every slider frame to its own tallest slide.
   *
   * The shared `--ms-h: 410px` is «О Крестах»'s number, where the photographs
   * are mixed portrait and landscape. All of «Музей»'s are wide, so a constant
   * 410 padded 49px of dead air above and below each one.
   *
   * The height comes from the `width`/`height` ATTRIBUTES, which the data model
   * requires on every `MediaItem` — never from a measured box. A slide is
   * `loading="lazy"`, so its measured height is 0 until it decodes, and reading
   * that is round 27's desync bug (the page grew 18859 → 20056 mid-scroll and
   * dragged the light 585px off its station). Intrinsic numbers are known
   * before the first byte arrives.
   *
   * Capped at the shared 410 so a portrait still behaves as it does elsewhere.
   */
  fitFrames() {
    for (const sec of this.sections) {
      for (const ms of sec.querySelectorAll<HTMLElement>('.ms--slider')) {
        const w = ms.clientWidth;
        if (!w) continue;
        let tallest = 0;
        for (const img of ms.querySelectorAll('img')) {
          const iw = Number(img.getAttribute('width'));
          const ih = Number(img.getAttribute('height'));
          if (iw > 0 && ih > 0) tallest = Math.max(tallest, (ih / iw) * w);
        }
        if (tallest > 0) ms.style.setProperty('--ms-h', `${Math.round(Math.min(tallest, STRIP_H))}px`);
      }
    }
  }

  /** each section's top within the scroller — what the colour stops are built on */
  tops(): number[] {
    return this.sections.map((el) => el.offsetTop);
  }

  /** bottom of the last section, i.e. where the handoff zone begins */
  get lastBottom(): number {
    const last = this.sections[this.sections.length - 1];
    return last ? last.offsetTop + last.offsetHeight : 0;
  }

  get firstTop(): number {
    return this.sections[0]?.offsetTop ?? 0;
  }

}
