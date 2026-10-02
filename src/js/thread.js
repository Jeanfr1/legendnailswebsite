import { media } from './state.js';

// "The pink stroke carries on as a discreet line between sections." One SVG path behind the
// content, through anchor points placed in each section (CSS --tx/--ty), drawn as you scroll.
export function initThread() {
  const content = document.querySelector('[data-content]');
  const svg = document.querySelector('[data-thread]');
  const path = svg && svg.querySelector('[data-thread-path]');
  const points = [...document.querySelectorAll('[data-thread-point]')];
  if (!content || !path || points.length < 2) return;

  let length = 0;
  let samples = []; // [y, length] pairs to map the scroll position onto the path

  function build() {
    const box = content.getBoundingClientRect();
    const W = content.clientWidth;
    const H = content.scrollHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.height = `${H}px`;
    const pts = points.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - box.left, y: r.top - box.top };
    });
    // end just above the footer: back towards the centre, or straight down in the gutter
    const last = pts[pts.length - 1];
    pts.push({ x: W < 900 ? last.x : W * 0.5, y: H - 2 });
    // Catmull-Rom through the points, as cubic Béziers
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const k = 0.22;
      const c1 = { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k };
      const c2 = { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k };
      d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    path.setAttribute('d', d);
    length = path.getTotalLength();
    samples = [];
    const steps = 160;
    let maxY = -Infinity;
    for (let i = 0; i <= steps; i++) {
      const l = (length * i) / steps;
      const y = path.getPointAtLength(l).y;
      maxY = Math.max(maxY, y); // monotonic: the drawn part never shrinks while going down
      samples.push([maxY, l]);
    }
    path.style.strokeDasharray = `${length} ${length}`;
    draw();
  }

  function draw() {
    if (!length) return;
    if (media.reduced.matches) {
      path.style.strokeDashoffset = '0';
      return;
    }
    const box = content.getBoundingClientRect();
    const y = window.innerHeight * 0.72 - box.top; // the line tip follows the lower part of the screen
    let l = 0;
    for (const [sy, sl] of samples) {
      if (sy <= y) l = sl;
      else break;
    }
    path.style.strokeDashoffset = String(length - l);
  }

  let ticking = false;
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        draw();
      });
    },
    { passive: true },
  );
  const ro = new ResizeObserver(() => build());
  ro.observe(content);
  window.addEventListener('load', build, { once: true });
  build();
}
