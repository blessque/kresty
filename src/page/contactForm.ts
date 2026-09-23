import { escapeHtml } from '../shared/escapeHtml';
import { bindShortWords } from '../shared/ruTypography';

/**
 * The contact form at the foot of «О Крестах» (Figma 727:26).
 *
 * There is no other form anywhere in this repo, so every convention here is
 * being set for the first time. Four decisions worth stating, because each is
 * a thing that bites rather than a preference:
 *
 * - REAL `<label>` ELEMENTS, not placeholders alone. Placeholder-only is an
 *   accessibility failure outright, and Safari's autofill heuristics do
 *   measurably worse without a label to read.
 * - The autofill background CANNOT be set with `background-color` on a dark
 *   field in Safari or Chrome; it needs `-webkit-text-fill-color` plus the
 *   `box-shadow: inset 0 0 0 1000px` trick, and `color-scheme: dark` so the
 *   UA picks dark defaults for anything left over. That is in concept.css.
 * - iOS zooms any focused input under 16px. The site's base is larger, so this
 *   is safe by default — but it is why no field here may drop below 16.
 * - The textarea GROWS on input rather than scrolling, so the reader can see
 *   what they wrote. It re-measures the page when it does, because the section
 *   tops below it move.
 *
 * No backend: the pitch is a prototype. Submit is intercepted and the form
 * swaps to a thank-you state.
 */

/**
 * ROUND 24 PARAMETERISED THE COPY. It was four module constants and a heading
 * hard-coded in the markup, which was fine while «О Крестах» was the only page
 * with a form — «Контакты» and «Аренда» carry the same form with their own
 * words, and a second copy of this file would be the thing that drifts.
 *
 * The defaults are «О Крестах»'s originals verbatim, so a caller that passes
 * nothing gets exactly what shipped.
 */
export interface ContactFormCopy {
  heading: string;
  lead: string;
  dept: string;
  phone: string;
  note: string;
  /** an icon box for the page light. Pages without a light omit it. */
  icon?: boolean;
  /**
   * ROUND 29: render the heading as a full-width FACTOID band above the grid,
   * the way the longread's sections do, rather than as a 40px `.page-h2` in the
   * four-column aside.
   *
   * True on «О Крестах», where this form is the sixth section of a longread and
   * has to look like the five above it. False on «Аренда» and «Контакты», whose
   * sections are short — a 72px heading over three lines of prose is a title
   * looking for a page.
   *
   * Deliberately NOT derived from `icon`, even though the two currently agree on
   * all three call sites. They mean different things — one is "this page has the
   * light", the other is "this page is a longread" — and collapsing them is how
   * the next page that has one but not the other gets the wrong layout silently.
   */
  wideHead?: boolean;
}

export const DEFAULT_CONTACT_COPY: ContactFormCopy = {
  heading: 'Расскажем о Крестах и возможностях аренды',
  lead: 'Для консультации по типам помещений и возможным форматам сотрудничества:',
  dept: 'Клиентский отдел',
  phone: '+7 812 654-40-11',
  note: 'Либо заполните форму ниже, указав ваши контакты и интересующие форматы сотрудничества',
  icon: true,
  wideHead: true,
};

interface Field {
  name: string;
  label: string;
  type: 'tel' | 'text' | 'textarea';
  autocomplete: string;
  inputmode?: string;
}

const FIELDS: Field[] = [
  { name: 'phone', label: 'Телефон', type: 'tel', autocomplete: 'tel', inputmode: 'tel' },
  { name: 'person', label: 'Контактное лицо', type: 'text', autocomplete: 'name' },
  { name: 'message', label: 'Сообщение', type: 'textarea', autocomplete: 'off' },
];

export class ContactForm {
  readonly el = document.createElement('section');
  private copy: ContactFormCopy;
  /** called when the textarea grows, so the page can re-measure below it */
  onResize: () => void = () => {};

  constructor(scroller: HTMLElement, copy: Partial<ContactFormCopy> = {}) {
    this.copy = { ...DEFAULT_CONTACT_COPY, ...copy };
    this.el.className = 'contact-form';
    // ROUND 24: the form is a LIGHT STATION now, so it needs an id for the
    // station-invariant warning to name it. It is deliberately not a
    // PAGE_SECTION — it has no `bg` and no `paras`, and adding one would put a
    // colour stop on the run that the colour track does not want.
    this.el.dataset.section = 'form';
    this.el.innerHTML = this.markup();
    scroller.appendChild(this.el);

    const form = this.el.querySelector('form')!;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      form.classList.add('sent');
    });

    const ta = this.el.querySelector('textarea')!;
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
      this.onResize();
    });
  }

  private markup(): string {
    const fields = FIELDS.map((f) => {
      const id = `cf-${f.name}`;
      const common =
        `id="${id}" name="${f.name}" autocomplete="${f.autocomplete}"` +
        (f.inputmode ? ` inputmode="${f.inputmode}"` : '');
      // ROUND 26: `placeholder=" "` — a single space, and it is a STATE HOOK
      // rather than a placeholder. It is what makes `:placeholder-shown` mean
      // "this field is empty", which is the only way pure CSS can know whether
      // the label should sit inside the field or above it. A real placeholder
      // would compete with the label for the same space; a space renders as
      // nothing. The label stays a real <label for>, because placeholder-only
      // is an accessibility failure and Safari's autofill reads the label.
      const control =
        f.type === 'textarea'
          ? `<textarea ${common} rows="1" placeholder=" "></textarea>`
          : `<input type="${f.type}" ${common} placeholder=" ">`;
      // the control comes FIRST so the label can be styled off it with `~`,
      // which only looks forward — the label is positioned absolutely, so
      // source order costs nothing visually
      return (
        `<div class="cf-field cf-field--${f.name}">` +
        control +
        `<label for="${id}">${escapeHtml(f.label)}</label>` +
        `</div>`
      );
    }).join('');
    const c = this.copy;

    return (
      // ROUND 24 PUT THE ICON BACK. Round 23 removed it on the grounds that it
      // was never lit — true, but the fix was to light it, not to delete it.
      // The design has an icon here; `SectionRun` now carries the form as a
      // sixth STATION so the box gets the same god-ray the five sections do.
      //
      // ROUND 29: two shapes, because this form is a longread section on one
      // page and a short block on two others. On the longread the heading is a
      // band above the grid and the aside holds only the lit icon; elsewhere
      // there is no aside column of its own at all — the heading is a plain
      // `.page-h2` in `.col-aside`, and with no `.sec-col` nothing can stick.
      (c.wideHead
        ? `<div class="sec-head page-grid">` +
          `<h2 class="sec-h2 head-wide">${escapeHtml(bindShortWords(c.heading))}</h2>` +
          `</div>`
        : '') +
      `<div class="sec-grid page-grid">` +
      (c.wideHead
        ? `<div class="sec-col col-aside">` +
          (c.icon ? `<div class="sec-icon" aria-hidden="true"></div>` : '') +
          `</div>`
        : `<div class="col-aside">` +
          `<h2 class="page-h2">${escapeHtml(bindShortWords(c.heading))}</h2>` +
          `</div>`) +
      `<div class="sec-body col-main">` +
      `<p class="cf-lead">${escapeHtml(bindShortWords(c.lead))}</p>` +
      `<p class="cf-dept">${escapeHtml(c.dept)}<br>` +
      `<a class="cf-phone" href="tel:${c.phone.replace(/[^+\d]/g, '')}">${escapeHtml(c.phone)}</a></p>` +
      `<p class="cf-note">${escapeHtml(bindShortWords(c.note))}</p>` +
      `<form novalidate>${fields}` +
      // ROUND 21: the shared button (styles/button.css). It is a class contract
      // rather than a factory precisely so it reaches this string.
      `<button type="submit" class="btn cf-submit">Отправить</button>` +
      `<p class="cf-thanks">Спасибо, мы свяжемся с вами.</p>` +
      `</form>` +
      `</div></div>`
    );
  }

  get top(): number {
    return this.el.offsetTop;
  }

  get height(): number {
    return this.el.offsetHeight;
  }
}
