import './styles/fonts.css';
// FIRST, so every stylesheet below can reference the vocabulary.
// Generated layer before the hand-written one: tokens.css references --ref-*.
import './styles/tokens.gen.css';
import './styles/tokens.css';
import './styles/global.css';
// Shared components, after the element resets in global.css and before the
// screen sheets — a screen must be able to override the component, not lose to it.
import './styles/button.css';
import './styles/grid.css';
import './styles/page.css';
import './styles/pages.css';
import './screens/main/main.css';
import './screens/concept/concept.css';
import './screens/contacts/contacts.css';

import { MainScreen } from './screens/main/MainScreen';
import { ConceptScreen } from './screens/concept/ConceptScreen';
import { ContactsScreen } from './screens/contacts/ContactsScreen';
import { ContactsPage } from './screens/contacts/ContactsPage';
import { NewsScreen } from './screens/news/NewsScreen';
import { ArticleScreen } from './screens/news/ArticleScreen';
import { RentScreen } from './screens/rent/RentScreen';
import { Router } from './router';
import { ScrollIntent } from './shared/scrollIntent';

// global film grain overlay (tiny generated noise tile, blend: overlay)
function makeGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const grain = document.getElementById('grain')!;
  grain.style.backgroundImage = `url(${c.toDataURL()})`;
}

async function boot() {
  makeGrain();

  const el = (id: string) => document.getElementById(id)!;
  const main = new MainScreen(el('screen-main'));

  // ROUND 24: seven routes, one registry. Adding a page is one entry here and
  // one in `HASHES` — it used to be five places in router.ts.
  //
  // `icons` is the round-12 light-on-arbitrary-SVG showcase. It kept the
  // `#contacts` hash and a real nav link until now, which TUNING_LOG had flagged
  // as "must be replaced before the client sees the nav as finished". It moved
  // to `#icons`, off the nav, keeping `?admin` and `?icon=N` for the deck.
  const router = new Router(main, {
    main,
    concept: new ConceptScreen(el('screen-concept')),
    contacts: new ContactsPage(el('screen-contacts-page')),
    news: new NewsScreen(el('screen-news')),
    article: new ArticleScreen(el('screen-article')),
    rent: new RentScreen(el('screen-rent')),
    icons: new ContactsScreen(el('screen-contacts')),
  });

  // Scrolling up at the top of the main screen goes back to wherever the reader
  // came from. Wired HERE, in the composition root, so `MainScreen` never
  // learns that routes exist — it only owns the light and its own DOM.
  const back = new ScrollIntent(
    el('screen-main'),
    () => router.goBackFromMain(),
  );
  back.attach();
  router.onEnterMain = () => back.reset();

  router.showInitial();
  await main.initRenderer();
}

boot().catch((err) => {
  console.error('[kresty] boot failed', err);
});
