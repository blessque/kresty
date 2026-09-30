import { ContentScreen } from '../../page/ContentScreen';
import { ContactForm } from '../../page/contactForm';
import { buildPageHead } from '../../page/pageHead';
import {
  CATEGORIES,
  OFFERS,
  ZONE_PLACE,
  offersIn,
  sqm,
  type Category,
  type Offer,
  type Role,
} from '../../shared/estate';
import { T } from '../../styles/tokens.gen';
import { cardArea, cardMarkup, cardName, t } from './rentCard';
import {
  ABOUT,
  ABOUT_HEADING,
  FACTS,
  FACTS_HEADING,
  FACTS_NOTE,
  FORM_HEADING,
  FORM_LEAD,
  LEAD,
} from './rentCopy';

/**
 * «Аренда» (Figma `1320:112`) — the real inventory since round 32, a leasing
 * tool since 32.1, and since ROUND 32.2 the designer's own page and card:
 *
 *   the head                      — what this is, in the designer's lead
 *   «Кресты — точка притяжения…»  — five facts in one column
 *   five tabs                     — «Открыть ресторан…», «Снять офис», …
 *     with that tab's cards stacked in the right column, one per row
 *   «Об аренде»                   — three sentences: fit-out, terraces, parking
 *   «Контакты»                    — the form
 *
 * ROUND 32.2 TOOK OFF «Территория» (the aerial with a point per space), «Как
 * арендовать» and the five fit-out rows of «Состояние помещений» — the
 * designer's page has none of them; «Об аренде» says the rules in a sentence
 * each. A tab is a TASK, said the way the reader would say it; a mixed building
 * is a card in each tab it serves, framed by its own floors (М1's restaurant is
 * «1 этаж», its offices «2–3 этажи»). Fifteen offers make twenty cards.
 *
 * ALL PANELS LIVE IN THE DOM and all but one are `hidden` (round 28's reason: a
 * switch must never flash an empty box; the lazy photos keep their boxes).
 *
 * TODO(copy): the head and the facts are the designer's (rentCopy.ts, with the
 * unsourced figures flagged there); each space's words are in shared/estate.ts.
 */
export class RentScreen extends ContentScreen {
  private active = 0;
  private tabs: HTMLButtonElement[] = [];
  private panels: HTMLElement[] = [];
  private form!: ContactForm;

  constructor(el: HTMLElement) {
    super(el, 'rent-page');
    // `#rent/b` → `#rent/m1` is the SAME route, so the router ignores it (it
    // returns early when `route === current`). A typed address, Back and Forward
    // all arrive this way, so the page follows its own hash while it is showing.
    // INSTANT, like a fresh arrival: an address is a place, not a gesture.
    addEventListener('hashchange', () => {
      if (this.el.classList.contains('hidden')) return;
      const slug = this.hashSlug();
      if (slug) this.land(slug, 'instant');
    });
  }

  private hashSlug(): string | null {
    const slug = decodeURIComponent(location.hash.replace(/^#rent\/?/, ''));
    return OFFERS.some((o) => o.slug === slug) ? slug : null;
  }

  protected stops() {
    return [{ top: 0, color: T.bgLightMain }];
  }

  /** a `#rent/<slug>` arrival opens that space's tab and lands on its card */
  start(restore?: number) {
    super.start(restore);
    const slug = this.hashSlug();
    if (!slug || restore !== undefined) return;
    requestAnimationFrame(() => this.land(slug, 'instant'));
  }

  /**
   * Open the tab of the slug's FIRST role — the one the map's drawer means by
   * «Аренда» (М1 lands among the restaurants) — then bring the card up and mark
   * it.
   */
  private land(slug: string, behavior: ScrollBehavior) {
    const offer = OFFERS.find((o) => o.slug === slug);
    if (!offer) return;
    this.select(CATEGORIES.findIndex((c) => c.id === offer.roles[0].cat));
    const card = this.panels[this.active].querySelector<HTMLElement>(`.rent-card[data-slug="${slug}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior, block: 'center' });
    card.classList.remove('rent-card--flash');
    // a reflow between the two, so a second landing on the same card replays
    void card.offsetWidth;
    card.classList.add('rent-card--flash');
  }

  protected build() {
    this.shell.add(
      buildPageHead({ title: 'Аренда', lead: LEAD, onPartner: () => this.onNavigate('contacts') }),
    );

    this.shell.add(
      block(
        FACTS_HEADING,
        `<dl class="rent-stats">` +
          FACTS.map(([v, k]) => `<div class="rent-stat"><dt>${t(k)}</dt><dd>${t(v)}</dd></div>`).join('') +
          `</dl>` +
          `<p class="page-prose">${t(FACTS_NOTE)}</p>`,
      ),
    );

    this.shell.add(this.buildDirectory());
    this.shell.add(block(ABOUT_HEADING, ABOUT.map((p) => `<p class="page-prose">${t(p)}</p>`).join('')));

    this.form = new ContactForm(this.shell.scroller, {
      heading: FORM_HEADING,
      lead: FORM_LEAD,
      icon: false, // no page light on this page — an empty box would just be a hole
      wideHead: false, // a short block, not a longread section — see ContactFormCopy
    });
    this.form.onResize = () => this.shell.measure();
    this.shell.add(this.form.el);
  }

  /**
   * The five tabs in `.col-aside` and their panels in `.col-main`. The tabs ARE
   * the block's heading — the designer drew no H2 over them — so the tablist
   * carries the name for assistive technology instead.
   */
  private buildDirectory(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'page-block page-grid rent-dir';

    const aside = document.createElement('div');
    aside.className = 'col-aside';
    const list = document.createElement('div');
    list.className = 'rent-tabs';
    list.role = 'tablist';
    list.ariaOrientation = 'vertical';
    list.ariaLabel = 'Для какого бизнеса';

    const main = document.createElement('div');
    main.className = 'col-main';

    CATEGORIES.forEach((cat, i) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'rent-tab';
      tab.id = `rent-tab-${cat.id}`;
      tab.role = 'tab';
      tab.setAttribute('aria-controls', `rent-panel-${cat.id}`);
      tab.innerHTML = `<span class="rent-tab__label">${t(cat.name)}</span>`;
      tab.addEventListener('click', () => this.select(i));
      tab.addEventListener('keydown', (e) => this.onTabKey(e, i));
      this.tabs[i] = tab;
      list.appendChild(tab);

      const panel = this.buildPanel(cat.id, cat.note);
      panel.setAttribute('aria-labelledby', tab.id);
      this.panels[i] = panel;
      main.appendChild(panel);
    });

    aside.appendChild(list);
    section.appendChild(aside);
    section.appendChild(main);
    this.apply();
    return section;
  }

  /** the tab's line with its area range, then its cards in one column */
  private buildPanel(id: Category, note: string): HTMLElement {
    const items = offersIn(id);
    const areas = items.map(({ offer, role }) => cardArea(offer, role));
    const lo = Math.min(...areas);
    const hi = Math.max(...areas);
    const range = lo === hi ? `${sqm(lo)}.` : `От ${sqm(lo).replace(' м²', '')} до ${sqm(hi)}.`;

    const panel = document.createElement('div');
    panel.className = 'rent-panel';
    panel.id = `rent-panel-${id}`;
    panel.role = 'tabpanel';
    panel.dataset.cat = id;
    panel.innerHTML = `<p class="page-prose">${t(`${note} ${range}`)}</p>`;

    const cards = document.createElement('div');
    cards.className = 'rent-cards';
    for (const { offer, role } of items) {
      const card = document.createElement('article');
      card.className = 'rent-card';
      card.dataset.slug = offer.slug;
      card.innerHTML = cardMarkup(offer, role);
      card.querySelector('.rent-card__cta')!.addEventListener('click', () => this.ask(offer, role));
      cards.appendChild(card);
    }
    panel.appendChild(cards);
    return panel;
  }

  /**
   * `shell.measure()` IS THE POINT, not housekeeping: the panels differ in
   * height by thousands of pixels, so a switch moves everything below and the
   * seam must re-read it.
   */
  private select(i: number) {
    if (i < 0 || i === this.active) return;
    this.active = i;
    this.apply();
    this.shell.measure();
  }

  private apply() {
    this.tabs.forEach((tab, i) => {
      const on = i === this.active;
      tab.classList.toggle('on', on);
      tab.ariaSelected = String(on);
      // roving tabindex: the control is one tab stop, the arrows move inside it
      tab.tabIndex = on ? 0 : -1;
    });
    this.panels.forEach((p, i) => p.toggleAttribute('hidden', i !== this.active));
  }

  private onTabKey(e: KeyboardEvent, i: number) {
    const last = this.tabs.length - 1;
    let to: number;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        to = i === last ? 0 : i + 1;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        to = i === 0 ? last : i - 1;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    this.select(to);
    this.tabs[to].focus();
  }

  /** «Обсудить помещение» — the form, already naming the space */
  private ask(o: Offer, r: Role) {
    this.form.prefill(
      `Здравствуйте! Интересует «${cardName(o, r)}» (${ZONE_PLACE[o.zone].toLowerCase()}), ` +
        `${sqm(cardArea(o, r))}. Пришлите, пожалуйста, планировки и условия аренды.`,
    );
    this.form.el.scrollIntoView({ behavior: 'smooth' });
  }
}

/** an H2 in the aside and whatever the block says in the main column */
function block(heading: string, body: string): HTMLElement {
  const s = document.createElement('section');
  s.className = 'page-block page-grid';
  s.innerHTML =
    `<div class="col-aside"><h2 class="page-h2">${t(heading)}</h2></div>` +
    `<div class="col-main page-flow">${body}</div>`;
  return s;
}
