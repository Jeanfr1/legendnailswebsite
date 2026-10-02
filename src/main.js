import '@fontsource-variable/fraunces/soft.css';
import '@fontsource-variable/fraunces/soft-italic.css';
import '@fontsource-variable/jost';
import './styles/main.css';

import { initAnchors } from './js/scroll.js';
import { initHeader } from './js/header.js';
import { initPicker } from './js/picker.js';
import { initHero } from './js/hero.js';
import { initGallery } from './js/gallery.js';
import { initThread } from './js/thread.js';
import { initReveal } from './js/reveal.js';

const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());

initAnchors();
initHeader();
initPicker();
initHero();
initGallery();
initReveal();
initThread();
