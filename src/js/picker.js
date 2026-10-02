import { finishState } from './state.js';
import { FINISHES } from '../data/finishes.js';

const IMG = import.meta.glob('../assets/img/hand-*.webp', { eager: true, query: '?url', import: 'default' });
const handUrl = (id, w) => IMG[`../assets/img/hand-${id}-${w}.webp`];

// Every picker on the page drives the same state; this module only paints the parts outside
// the hero (buttons, labels, the hand in "Beautifully considered").
export function initPicker() {
  const pickers = [...document.querySelectorAll('[data-picker]')];
  const names = [...document.querySelectorAll('[data-finish-name]')];
  const live = document.querySelector('[data-finish-live]');
  const slotImg = document.querySelector('[data-slot-img]');

  pickers.forEach((group) => {
    group.hidden = false;
    group.querySelectorAll('[data-finish]').forEach((btn) => {
      const info = FINISHES.find((f) => f.id === btn.dataset.finish);
      btn.querySelector('.swatch')?.style.setProperty('--swatch', info.swatch);
      btn.addEventListener('click', () => finishState.set(btn.dataset.finish));
    });
  });

  // warm the cache so a switch is instant
  const preload = () => FINISHES.forEach((f) => [640, 1100].forEach((w) => (new Image().src = handUrl(f.id, w))));
  if (document.readyState === 'complete') preload();
  else window.addEventListener('load', preload, { once: true });

  const paint = (id, announce) => {
    const info = finishState.info(id);
    pickers.forEach((group) =>
      group.querySelectorAll('[data-finish]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.finish === id))),
    );
    names.forEach((el) => (el.textContent = info.name));
    document.documentElement.style.setProperty('--finish', info.swatch);
    if (slotImg) {
      slotImg.srcset = `${handUrl(id, 640)} 640w, ${handUrl(id, 1100)} 1100w`;
      slotImg.src = handUrl(id, 1100);
      slotImg.alt = info.alt;
    }
    if (announce && live) live.textContent = `Showing the ${info.name} finish`;
  };
  paint(finishState.get(), false);
  finishState.subscribe((id) => paint(id, true));
}
