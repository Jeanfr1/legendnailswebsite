import { DEFAULT_FINISH, FINISHES } from '../data/finishes.js';

// The active finish is the single source for every label, swatch and image that shows it
// (hero layers, finished hand, docked hand, captions). Everyone subscribes; nobody keeps a copy.
const listeners = new Set();
let active = DEFAULT_FINISH;

export const finishState = {
  get: () => active,
  info: (id = active) => FINISHES.find((f) => f.id === id),
  set(id) {
    if (id === active || !FINISHES.some((f) => f.id === id)) return;
    active = id;
    listeners.forEach((fn) => fn(id));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export const media = {
  reduced: window.matchMedia('(prefers-reduced-motion: reduce)'),
  wide: window.matchMedia('(min-width: 900px) and (min-height: 560px)'),
};

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const range = (v, a, b) => clamp01((v - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
// fade in over [a, b], hold, fade out over [c, d]
export const windowed = (v, a, b, c, d) => Math.min(range(v, a, b), 1 - range(v, c, d));
