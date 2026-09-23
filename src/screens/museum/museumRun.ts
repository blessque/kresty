import { MediaSlider } from '../../page/mediaSlider';
import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';
import { MUSEUM_SECTIONS, type MuseumSection } from './museumSections';

/**
 * The four era sections, built from the table.
 *
 * Structurally «О Крестах»'s `sectionRun.ts` — a full-width FACTOID heading band
 * above a body column, both placed by the shared grid's role classes — with two
 * differences, each of which follows from the light not travelling:
 *
 *  1. **No geometry table.** `SectionGeom`, the station invariant, `iconY`'s
 *     three-phase clamp and the per-section `--sec-pin` all exist to keep a
 *     light aligned to a box that moves. Nothing here is aligned to a box.
 *  2. **No aside at all.** «О Крестах» keeps a sticky four-column aside because
 *     it holds that section's lit icon; here the light is one cross bisected by
 *     the left edge, drawn on the shader canvas, and the body simply runs beside
 *     it. So `.mus-grid` has a single child.
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
    // ROUND 29: THE ERA NAME LEFT THE CROSS. It used to sit in `.mus-col`, a
    // sticky column pinned to `top: 50%` so the title rode inside the light
    // cross's convergence point. The client asked for the same full-width
    // FACTOID band the longread's sections now use, so era and years are a
    // heading block at the top of the section and the cross — which is the
    // shader canvas, never a child of that column — rotates on alone.
    //
    // `.mus-col` is gone rather than emptied, and `MuseumScreen.fadeEras()` with
    // it: that crossfade existed only because two PINNED titles were on screen
    // together at every boundary. An opener that scrolls away hands over by
    // itself.
    //
    // ROUND 29.2: A `<p class="loud">`, NOT AN `<h2>`. The era name reads as a
    // title where «О Крестах»'s openers read as sentences, so this one was the
    // close call — but the site cannot have an H2 that means 40px on one page
    // and 72px on another, and the treatment is what these two pages share. H2
    // is 40 everywhere; `.loud` is the opener. The years keep their own class
    // and their own size.
    el.innerHTML =
      `<div class="mus-head page-grid">` +
      `<div class="col-full">` +
      `<p class="mus-era loud">${escapeHtml(bindShortWords(s.era))}</p>` +
      `<p class="mus-years">${escapeHtml(s.years)}</p>` +
      `</div>` +
      `</div>` +
      `<div class="mus-grid page-grid">` +
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
        // The star is a `::before` MASK of `src/assets/star-bullet.svg` — not an
        // <img>, not a list marker, and (since round 27) not a clip-path either:
        // the real outline is four quadratic curves and straight edges between
        // their points read as a notched diamond at this size. Masking keys off
        // alpha, which is what lets one file take three colours. `.mus-list` is
        // 12px like every other star on the site as of round 29.
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

  /* ROUND 29 DELETED `fitFrames()`.
   *
   * It wrote a per-block `--ms-h` from the slides' intrinsic aspects, because
   * the shared 410 was «О Крестах»'s number — mixed portrait and landscape —
   * and all of «Музей»'s photographs are wide. At 559 in the body column a
   * 1304×728 render was 312 tall inside a 410 frame, leaving 49px of dead air
   * above and below every slide and 189px between a photo and the paragraph
   * under it.
   *
   * Both halves of that are gone. The strip is `100vw` now, and each slide is
   * `height: var(--ms-h); width: auto` — so a slide FILLS the height exactly and
   * takes the width its aspect gives it. There is no dead air to remove.
   */


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
