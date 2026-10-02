// Header: transparent over the hero, solid ivory afterwards; current section in the nav;
// small-screen menu.
export function initHeader() {
  const header = document.querySelector('[data-header]');
  const track = document.querySelector('[data-hero-track]');
  if (!header) return;

  let ticking = false;
  const update = () => {
    ticking = false;
    // measured on the track, not on what follows the sticky stage (that keeps its in-flow slot)
    const limit = track ? track.getBoundingClientRect().bottom : window.innerHeight;
    header.classList.toggle('is-solid', limit <= header.offsetHeight + 1);
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  // nav-state-active
  const links = [...header.querySelectorAll('[data-nav]')];
  const sections = links.map((a) => document.getElementById(a.dataset.nav)).filter(Boolean);
  const visible = new Map();
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => visible.set(en.target.id, en.isIntersecting));
      const current = sections.find((s) => visible.get(s.id));
      links.forEach((a) => {
        if (current && a.dataset.nav === current.id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  sections.forEach((s) => io.observe(s));

  // small-screen menu
  const toggle = header.querySelector('[data-menu-toggle]');
  const menu = header.querySelector('[data-menu]');
  if (!toggle || !menu) return;
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    header.classList.toggle('menu-open', open);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !header.contains(e.target)) setOpen(false);
  });
}
