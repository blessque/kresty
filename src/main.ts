import './styles/fonts.css';
// FIRST, so every stylesheet below can reference the vocabulary
import './styles/tokens.css';
import './styles/global.css';
import './screens/main/main.css';
import './screens/concept/concept.css';
import './screens/contacts/contacts.css';

import { MainScreen } from './screens/main/MainScreen';
import { ConceptScreen } from './screens/concept/ConceptScreen';
import { ContactsScreen } from './screens/contacts/ContactsScreen';
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

  const main = new MainScreen(document.getElementById('screen-main')!);
  const concept = new ConceptScreen(document.getElementById('screen-concept')!);
  // TEMPORARY: icon showcase for presentation stills (see screens/contacts/)
  const contacts = new ContactsScreen(document.getElementById('screen-contacts')!);
  const router = new Router(main, concept, contacts);

  // Scrolling up at the top of the main screen goes back to wherever the reader
  // came from. Wired HERE, in the composition root, so `MainScreen` never
  // learns that routes exist — it only owns the light and its own DOM.
  const back = new ScrollIntent(
    document.getElementById('screen-main')!,
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
