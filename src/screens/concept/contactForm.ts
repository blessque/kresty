import { escapeHtml } from '../../shared/escapeHtml';
import { bindShortWords } from '../../shared/ruTypography';

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

const LEAD = 'Для консультации по типам помещений и возможным форматам сотрудничества:';
const DEPT = 'Клиентский отдел';
const PHONE = '+7 812 654-40-11';
const NOTE =
  'Либо заполните форму ниже, указав ваши контакты и интересующие форматы сотрудничества';

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
  /** called when the textarea grows, so the page can re-measure below it */
  onResize: () => void = () => {};

  constructor(scroller: HTMLElement) {
    this.el.className = 'contact-form';
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
      const control =
        f.type === 'textarea'
          ? `<textarea ${common} rows="1"></textarea>`
          : `<input type="${f.type}" ${common}>`;
      return (
        `<div class="cf-field cf-field--${f.name}">` +
        `<label for="${id}">${escapeHtml(f.label)}</label>` +
        control +
        `</div>`
      );
    }).join('');

    return (
      `<div class="sec-grid">` +
      `<div class="sec-col">` +
      `<div class="sec-icon" aria-hidden="true"></div>` +
      `<h2 class="sec-h2">${escapeHtml(bindShortWords('Расскажем о Крестах и возможностях аренды'))}</h2>` +
      `</div>` +
      `<div class="sec-body">` +
      `<p class="cf-lead">${escapeHtml(bindShortWords(LEAD))}</p>` +
      `<p class="cf-dept">${escapeHtml(DEPT)}<br>` +
      `<a class="cf-phone" href="tel:${PHONE.replace(/[^+\d]/g, '')}">${escapeHtml(PHONE)}</a></p>` +
      `<p class="cf-note">${escapeHtml(bindShortWords(NOTE))}</p>` +
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
