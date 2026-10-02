import { media } from './state.js';

// In-page navigation. Long jumps (e.g. "Explore styles" from the top, which crosses the pinned
// hero) are instant; short ones are smooth when motion is allowed.
export function scrollToTarget(el, { focus = true } = {}) {
  if (!el) return;
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const top = el.id === 'top' ? 0 : Math.round(el.getBoundingClientRect().top + window.scrollY - margin);
  const distance = Math.abs(top - window.scrollY);
  if (focus) {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }
  if (distance < 1) return;
  const smooth = !media.reduced.matches && distance < window.innerHeight * 2.2;
  window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
}

export function initAnchors() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const hash = link.getAttribute('href');
    if (hash.length < 2) return;
    const target = document.querySelector(hash);
    if (!target) return;
    event.preventDefault();
    if (history.replaceState) history.replaceState(null, '', hash);
    scrollToTarget(target, { focus: hash !== '#top' });
  });

  // Arriving with a hash: the hero track only gets its final height once styles apply.
  if (location.hash.length > 1) {
    const target = document.querySelector(location.hash);
    if (target) window.addEventListener('load', () => scrollToTarget(target, { focus: false }), { once: true });
  }
}
