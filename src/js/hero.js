// Hero: "do gesto ao detalhe" (roteiro p.2).
//
// One smoothed scroll value drives everything, so the scene is a pure function of the scroll
// position and runs backwards as smoothly as forwards:
//   0–20 %  gesture      portrait, wordmark, CTAs
//   20–40 % closer       camera moves in on a nail, the wordmark settles in the header,
//                        the photo nail hands over to the macro nail (same size, same angle)
//   40–60 % layers       base, colour and shine separate a little
//   60–80 % colour       a band of polish covers the colour layer, the layers realign,
//                        one reflection crosses the surface
//   80–100% the hand     camera pulls back to the finished hand
// After the pin releases, the hand docks into the frame of "Beautifully considered".
//
// Modes (picked in index.html before first paint, kept in sync here):
//   scroll  – desktop: sticky stage over ~2 extra screens, orbit and layer labels
//   compact – small screens: shorter track, same story, no orbit/labels
//   static  – prefers-reduced-motion: no pin, no zoom; the finished hand and the picker
//             live in "Beautifully considered"
import meta from '../data/asset-meta.json';
import { finishState, media, lerp, range, smooth, easeInOut, windowed } from './state.js';

const IMG = import.meta.glob('../assets/img/*.webp', { eager: true, query: '?url', import: 'default' });
const url = (name) => IMG[`../assets/img/${name}.webp`];

// Scroll script, in fractions of the pinned distance.
const T = {
  intro: [0.05, 0.15], // hero text fades out
  mark: [0.08, 0.26], // wordmark travels into the header
  zoom: [0.1, 0.42], // camera moves in on the index-finger nail
  soft: [0.2, 0.34], // the photo goes soft (depth of field)
  wash: [0.3, 0.41], // ivory takes over the background
  macroIn: [0.29, 0.37], // macro nail fades in over the photo nail
  travel: [0.34, 0.5], // … and settles into its own composition
  split: [0.45, 0.57], // base / colour / shine separate
  labels: [0.49, 0.52, 0.56, 0.585],
  ribbon: [0.47, 0.57, 0.77, 0.84],
  brushIn: [0.575, 0.615],
  paint: [0.6, 0.715],
  brushOut: [0.71, 0.76],
  join: [0.7, 0.78], // layers realign
  shine: [0.76, 0.85], // a single reflection
  pull: [0.82, 0.97], // camera pulls back to the finished hand
  swap: [0.845, 0.9], // macro nail -> hand
  steps: [
    [0.17, 0.21, 0.4, 0.44],
    [0.44, 0.48, 0.6, 0.63],
    [0.62, 0.65, 0.8, 0.83],
  ],
  final: [0.87, 0.95],
};

// Geometry in fractions of the stage (W × H).
const LAYOUT = {
  scroll: {
    focus: { x: 0.5, y: 0.32 }, // object-position of the portrait
    target: { x: 0.6, y: 0.5 }, // where the photo nail drifts while the camera moves in
    macro: { x: 0.64, y: 0.5, len: 0.62, maxW: 0.46 }, // nail centre; length × H (capped × W)
    hand: { x: 0.7, y: 0.55, h: 0.8, maxW: 0.5 }, // final hand box: centre, height × H
    sep: 0.1, // layer separation × H
    zoom: 5,
    orbit: true,
    labels: true,
  },
  compact: {
    focus: { x: 0.8, y: 0.3 },
    target: { x: 0.5, y: 0.38 },
    macro: { x: 0.52, y: 0.37, len: 0.4, maxW: 0.78 },
    hand: { x: 0.54, y: 0.36, h: 0.5, maxW: 0.92 },
    sep: 0.06,
    zoom: 4,
    orbit: false,
    labels: false,
  },
};

const BRUSH_ANGLE = -42; // on screen, bristles -> cap (degrees, y down)
const SMOOTH = 0.14; // per-frame catch-up of the scrubbed scroll position
const deg = Math.PI / 180;

const root = document.documentElement;

export function initHero() {
  const track = document.querySelector('[data-hero-track]');
  const stage = document.querySelector('[data-stage]');
  if (!track || !stage) return;

  const el = {
    portrait: stage.querySelector('[data-portrait]'),
    soft: stage.querySelector('[data-portrait-soft]'),
    fade: stage.querySelector('[data-fade]'),
    wash: stage.querySelector('[data-wash]'),
    ribbon: stage.querySelector('[data-ribbon]'),
    macro: stage.querySelector('[data-macro]'),
    base: stage.querySelector('[data-layer="base"]'),
    ghost: stage.querySelector('[data-layer="ghost"]'),
    paint: stage.querySelector('[data-layer="paint"]'),
    gloss: stage.querySelector('[data-layer="gloss"]'),
    shine: stage.querySelector('[data-shine]'),
    brush: stage.querySelector('[data-brush]'),
    labels: [...stage.querySelectorAll('[data-label]')],
    mover: stage.querySelector('[data-hand-mover]'),
    hand: stage.querySelector('[data-hand-img]'),
    mark: stage.querySelector('[data-mark-img]'),
    intro: stage.querySelector('[data-hero-intro]'),
    steps: [...stage.querySelectorAll('[data-step]')],
    final: stage.querySelector('[data-hero-final]'),
    bar: stage.querySelector('[data-progress-bar]'),
    cue: stage.querySelector('[data-cue]'),
    brand: document.querySelector('[data-brand-img]'),
    frame: document.querySelector('[data-hand-frame]'),
    slot: document.querySelector('[data-hand-slot]'),
  };

  // ---------- images (all small; set once, the finish swaps between cached files) ----------
  const nailSet = (id) => `${url(`nail-${id}-480`)} 480w, ${url(`nail-${id}-880`)} 880w`;
  const handSet = (id) => `${url(`hand-${id}-640`)} 640w, ${url(`hand-${id}-1100`)} 1100w`;
  function setImage(img, srcset, src, sizes) {
    img.sizes = sizes;
    img.srcset = srcset;
    img.src = src;
  }
  function paintFinish(id, fade) {
    setImage(el.ghost, nailSet(id), url(`nail-${id}-880`), '60vh');
    setImage(el.paint, nailSet(id), url(`nail-${id}-880`), '60vh');
    setImage(el.hand, handSet(id), url(`hand-${id}-1100`), '(min-width: 900px) 45vw, 90vw');
    if (fade) [el.paint, el.hand].forEach((img) => img.animate?.([{ opacity: 0.35 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' }));
  }
  function loadScene() {
    el.soft.src = url('portrait-soft');
    setImage(el.base, nailSet('base'), url('nail-base-880'), '60vh');
    setImage(el.gloss, nailSet('gloss'), url('nail-gloss-880'), '60vh');
    el.brush.src = url('brush-640');
    setImage(el.ribbon, `${url('ribbon-640')} 640w, ${url('ribbon-1200')} 1200w`, url('ribbon-1200'), '90vw');
    el.shine.style.setProperty('--nail-mask', `url("${url('nail-base-480')}")`);
    paintFinish(finishState.get(), false);
    // the other finishes, so a switch never waits for the network
    ['nude', 'french', 'olive'].forEach((id) => {
      new Image().src = url(`nail-${id}-880`);
      new Image().src = url(`hand-${id}-1100`);
    });
  }
  finishState.subscribe((id) => {
    if (mode !== 'static') paintFinish(id, media.reduced.matches === false);
  });

  // ---------- state ----------
  let mode = '';
  let L = LAYOUT.scroll;
  let W = 1, H = 1;
  let G = {}; // measured geometry
  let sy = window.scrollY; // smoothed scroll position
  let target = sy;
  let raf = 0;
  let docked = null;

  function currentMode() {
    if (media.reduced.matches) return 'static';
    return media.wide.matches ? 'scroll' : 'compact';
  }

  // ---------- measuring (on start, resize, mode change, late layout) ----------
  function measure() {
    W = stage.clientWidth || window.innerWidth;
    H = stage.clientHeight || window.innerHeight;
    const P = meta.portrait;
    const N = meta.nail;
    const K = meta.hand;

    // portrait, cover-fitted like object-fit: cover with the layout's focus point
    const k0 = Math.max(W / P.width, H / P.height);
    const ox = (W - P.width * k0) * L.focus.x;
    const oy = (H - P.height * k0) * L.focus.y;
    el.portrait.style.width = `${P.width}px`;
    el.portrait.style.height = `${P.height}px`;

    // macro nail: box width M0 at rest, anchored on the middle of the nail axis
    const Lm = Math.min(L.macro.len * H, L.macro.maxW * W);
    const M0 = Lm / N.length;
    const bw = M0;
    const bh = M0 * N.ratio;
    const ax = N.cx * bw;
    const ay = N.cy * bh;
    el.macro.style.width = `${bw}px`;
    el.macro.style.height = `${bh}px`;
    el.macro.style.transformOrigin = `${ax}px ${ay}px`;

    // paint mask: positions of cuticle and tip on the CSS gradient line
    const th = N.angle * deg;
    const u = { x: Math.cos(th), y: Math.sin(th) };
    const half = (N.length * bw) / 2;
    const alpha = N.angle + 90; // CSS gradient angle pointing to the tip
    const dir = { x: Math.sin(alpha * deg), y: -Math.cos(alpha * deg) };
    const lineLen = Math.abs(bw * Math.sin(alpha * deg)) + Math.abs(bh * Math.cos(alpha * deg));
    const along = (px, py) => 0.5 + ((px - bw / 2) * dir.x + (py - bh / 2) * dir.y) / lineLen;
    const cut = { x: ax - u.x * half, y: ay - u.y * half };
    const tip = { x: ax + u.x * half, y: ay + u.y * half };
    el.macro.style.setProperty('--grad-angle', `${alpha}deg`);

    // brush: scale so it reads a little shorter than the nail
    const brushW = Lm * 0.62;
    const brushH = brushW * meta.brush.ratio;
    el.brush.style.width = `${brushW}px`;
    el.brush.style.height = `${brushH}px`;
    el.brush.style.transformOrigin = `${meta.brush.tipX * brushW}px ${meta.brush.tipY * brushH}px`;

    el.ribbon.style.width = `${Lm * 1.55}px`;

    // final hand box
    let hh = L.hand.h * H;
    let hw = hh / K.ratio;
    if (hw > L.hand.maxW * W) {
      hw = L.hand.maxW * W;
      hh = hw * K.ratio;
    }
    const hand = { left: L.hand.x * W - hw / 2, top: L.hand.y * H - hh / 2, w: hw, h: hh };
    el.mover.style.width = `${hw}px`;
    el.mover.style.height = `${hh}px`;
    const nailF = { x: hand.left + K.nailX * hw, y: hand.top + K.nailY * hh };
    const nailLenF = K.nailLength * hw;

    // wordmark -> header logo (FLIP); the header is fixed, the stage sits at the top while pinned
    el.mark.style.transform = '';
    const sr = stage.getBoundingClientRect();
    const mr = el.mark.getBoundingClientRect();
    const br = el.brand.getBoundingClientRect();
    const markFly = {
      dx: br.left - (mr.left - sr.left),
      dy: br.top - (mr.top - sr.top),
      s: br.width / mr.width,
    };

    // docking: from the hand's final place in the hero to the frame in the next section
    const trackTop = track.getBoundingClientRect().top + window.scrollY;
    const S0 = trackTop + track.offsetHeight - H; // the pin releases here
    let dock = null;
    if (el.slot) {
      const r = el.slot.getBoundingClientRect();
      const slotDoc = { left: r.left + window.scrollX, top: r.top + window.scrollY, w: r.width, h: r.height };
      // done when the frame is centred in the viewport (or as soon as it is fully in view)
      const S1 = Math.max(S0 + H * 0.35, Math.min(slotDoc.top + slotDoc.h / 2 - H / 2, slotDoc.top - 24));
      dock = { S0, S1, from: hand, to: { left: slotDoc.left, top: slotDoc.top - S0, w: slotDoc.w, h: slotDoc.h } };
    }

    G = { k0, ox, oy, Lm, bw, bh, ax, ay, cut, tip, along, brushW, brushH, hand, nailF, nailLenF, markFly, trackTop, S0, dock };
  }

  // local point in the macro box -> stage coordinates, for the current macro transform
  function toStage(m, px, py) {
    const c = Math.cos(m.rot * deg);
    const s = Math.sin(m.rot * deg);
    const dx = (px - G.ax) * m.sc;
    const dy = (py - G.ay) * m.sc;
    return { x: m.cx + dx * c - dy * s, y: m.cy + dx * s + dy * c };
  }

  // ---------- render ----------
  function render(time) {
    const scrollable = track.offsetHeight - H;
    const p = scrollable > 0 ? Math.min(1, Math.max(0, (sy - G.trackTop) / scrollable)) : 0;
    const P = meta.portrait;
    const N = meta.nail;
    const K = meta.hand;

    // camera on the portrait
    const ez = easeInOut(range(p, ...T.zoom));
    const z = Math.exp(lerp(0, Math.log(L.zoom), ez));
    const k = G.k0 * z;
    const restNail = { x: G.ox + P.nailX * G.k0, y: G.oy + P.nailY * G.k0 };
    const photoNail = { x: lerp(restNail.x, L.target.x * W, ez), y: lerp(restNail.y, L.target.y * H, ez) };
    const wash = smooth(range(p, ...T.wash));
    el.portrait.style.transform = `translate3d(${photoNail.x - P.nailX * k}px, ${photoNail.y - P.nailY * k}px, 0) scale(${k})`;
    el.portrait.style.visibility = wash >= 1 ? 'hidden' : 'visible';
    el.soft.style.opacity = smooth(range(p, ...T.soft));
    el.wash.style.opacity = wash;

    // macro nail: locked to the photo nail, then travelling to its own place
    const et = easeInOut(range(p, ...T.travel));
    const lockLen = P.nailLength * k;
    const m = {
      cx: lerp(photoNail.x, L.macro.x * W, et),
      cy: lerp(photoNail.y, L.macro.y * H, et),
      len: Math.exp(lerp(Math.log(lockLen), Math.log(G.Lm), et)),
      ang: lerp(P.nailAngle, N.angle, et),
    };

    // pull back: the hand comes in at the macro nail's size and shrinks to its final box
    const ep = easeInOut(range(p, ...T.pull));
    const sHand = Math.exp(lerp(Math.log(G.Lm / G.nailLenF), 0, ep));
    const handNail = { x: lerp(L.macro.x * W, G.nailF.x, ep), y: lerp(L.macro.y * H, G.nailF.y, ep) };
    if (p >= T.pull[0]) {
      m.cx = handNail.x;
      m.cy = handNail.y;
      m.len = G.nailLenF * sHand;
      m.ang = lerp(N.angle, K.nailAngle, ep);
    }

    // orbit: a very discreet drift while the layers are apart (scroll mode, motion allowed)
    const apart = easeInOut(range(p, ...T.split)) * (1 - easeInOut(range(p, ...T.join)));
    const orbit = L.orbit ? apart : 0;
    const t = time / 1000;
    m.rot = m.ang - N.angle + orbit * 2 * Math.sin(t * 0.55);
    m.sc = m.len / (N.length * G.bw);
    const swap = smooth(range(p, ...T.swap));
    el.macro.style.opacity = smooth(range(p, ...T.macroIn)) * (1 - swap);
    el.macro.style.visibility = p < T.macroIn[0] || swap >= 1 ? 'hidden' : 'visible';
    el.macro.style.transform = `translate3d(${m.cx - G.ax}px, ${m.cy - G.ay}px, 0) rotate(${m.rot}deg) scale(${m.sc})`;

    // layers apart: screen-space offsets ("up and a little right"), converted into the box
    const sepPx = L.sep * H * apart;
    const dirA = (-72 + orbit * 7 * Math.sin(t * 0.42 + 1.3)) * deg;
    const off = { x: Math.cos(dirA) * sepPx, y: Math.sin(dirA) * sepPx };
    const c = Math.cos(-m.rot * deg) / m.sc;
    const s = Math.sin(-m.rot * deg) / m.sc;
    const local = { x: off.x * c - off.y * s, y: off.x * s + off.y * c };
    el.gloss.style.transform = `translate3d(${local.x}px, ${local.y}px, 0) scale(${1 + 0.035 * apart})`;
    el.base.style.transform = `translate3d(${-local.x}px, ${-local.y}px, 0) scale(${1 - 0.035 * apart})`;
    el.shine.style.transform = el.gloss.style.transform;

    // colour: the band of polish follows the brush from cuticle to tip
    const paint = easeInOut(range(p, ...T.paint));
    const front = lerp(-0.04, 1.04, paint);
    const a0 = G.along(G.cut.x, G.cut.y);
    const a1 = G.along(G.tip.x, G.tip.y);
    const stop = lerp(a0, a1, front);
    el.paint.style.setProperty('--paint-a', `${(stop * 100).toFixed(2)}%`);
    el.paint.style.setProperty('--paint-b', `${((stop + 0.03) * 100).toFixed(2)}%`);
    el.ghost.style.opacity = 0.42 * (1 - paint);

    // one reflection
    const sh = range(p, ...T.shine);
    const band = lerp(a0 - 0.1, a1 + 0.1, easeInOut(sh));
    el.shine.style.setProperty('--shine', `${(band * 100).toFixed(2)}%`);
    el.shine.style.opacity = sh > 0 && sh < 1 ? Math.sin(sh * Math.PI) : 0;

    // brush: bristle tip on the paint front, in and out towards the upper right
    const bIn = easeInOut(range(p, ...T.brushIn));
    const bOut = easeInOut(range(p, ...T.brushOut));
    const fx = lerp(G.cut.x, G.tip.x, Math.min(1, Math.max(0, front)));
    const fy = lerp(G.cut.y, G.tip.y, Math.min(1, Math.max(0, front)));
    const touch = toStage(m, fx, fy);
    const away = (1 - bIn) + bOut;
    const bx = touch.x + away * W * 0.32;
    const by = touch.y - away * H * 0.36;
    el.brush.style.opacity = bIn * (1 - bOut);
    el.brush.style.visibility = bIn <= 0 || bOut >= 1 ? 'hidden' : 'visible';
    el.brush.style.transform = `translate3d(${bx - meta.brush.tipX * G.brushW}px, ${by - meta.brush.tipY * G.brushH}px, 0) rotate(${BRUSH_ANGLE - meta.brush.angle + away * 8}deg)`;

    // labels next to each layer
    if (L.labels) {
      const lv = windowed(p, ...T.labels);
      const offsets = { gloss: 1, paint: 0, base: -1 };
      el.labels.forEach((li) => {
        const o = offsets[li.dataset.label];
        const q = toStage(m, G.ax, G.ay);
        const x = q.x + m.len * 0.4;
        const y = q.y + off.y * o - m.len * 0.06 * o;
        li.style.opacity = lv;
        li.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
    }

    // ribbon of polish behind the layers
    const rv = windowed(p, ...T.ribbon);
    el.ribbon.style.opacity = rv * 0.9;
    el.ribbon.style.visibility = rv <= 0 ? 'hidden' : 'visible';
    el.ribbon.style.transform = `translate3d(${L.macro.x * W - G.Lm * 0.95}px, ${L.macro.y * H - G.Lm * 0.05 + (1 - rv) * 30}px, 0) rotate(${-10 + apart * 4}deg)`;

    // finished hand (in the hero)
    const dockT = docking();
    const handOn = smooth(range(p, ...T.swap));
    el.mover.style.opacity = handOn;
    el.mover.style.visibility = handOn <= 0 || dockT >= 1 ? 'hidden' : 'visible';
    if (dockT > 0 && G.dock) {
      // pin released: travel in document space from the hero box to the frame
      const d = G.dock;
      const e = easeInOut(dockT);
      const left = lerp(d.from.left, d.to.left, e);
      const top = lerp(d.from.top, d.to.top, e);
      const sc = lerp(1, d.to.w / d.from.w, e);
      el.mover.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${sc})`;
    } else if (handOn > 0) {
      el.mover.style.transform = `translate3d(${handNail.x - K.nailX * G.hand.w * sHand}px, ${handNail.y - K.nailY * G.hand.h * sHand}px, 0) scale(${sHand})`;
    } else {
      // invisible: park it at its final size, so a huge box never adds overflow
      el.mover.style.transform = `translate3d(${G.hand.left}px, ${G.hand.top}px, 0)`;
    }
    const isDocked = dockT >= 1;
    if (isDocked !== docked) {
      docked = isDocked;
      el.frame?.classList.toggle('is-docked', isDocked);
    }

    // wordmark -> header
    const em = easeInOut(range(p, ...T.mark));
    const f = G.markFly;
    el.mark.style.transform = em > 0 ? `translate3d(${f.dx * em}px, ${f.dy * em}px, 0) scale(${lerp(1, f.s, em)})` : '';
    el.mark.style.opacity = em >= 1 ? 0 : 1;
    root.classList.toggle('mark-docked', em >= 1);

    // copy
    const io = range(p, ...T.intro);
    el.fade.style.opacity = 1 - wash; // keeps the captions readable over the photo until the ivory takes over
    el.intro.style.opacity = 1 - io;
    el.intro.style.transform = `translate3d(0, ${-28 * easeInOut(io)}px, 0)`;
    el.intro.style.visibility = io >= 1 ? 'hidden' : 'visible';
    el.steps.forEach((step, i) => {
      const v = windowed(p, ...T.steps[i]);
      step.style.opacity = v;
      step.style.transform = `translate3d(0, ${(1 - v) * 16}px, 0)`;
      step.style.visibility = v <= 0 ? 'hidden' : 'visible';
    });
    // the closing copy steps aside once the pin releases, so it never runs under the header
    const fv = range(p, ...T.final) * (1 - range(dockT, 0, 0.3));
    el.final.style.opacity = fv;
    el.final.style.transform = `translate3d(0, ${(1 - easeInOut(fv)) * 18}px, 0)`;
    el.final.style.visibility = fv <= 0 ? 'hidden' : 'visible';
    el.final.classList.toggle('is-live', fv > 0.6);
    el.bar.style.transform = `scaleX(${p})`;
    el.bar.parentElement.style.opacity = 1 - range(dockT, 0, 0.12);
    el.cue.style.opacity = 1 - range(p, 0, 0.04);

    return orbit > 0.001;
  }

  function docking() {
    if (!G.dock) return 0;
    return range(sy, G.dock.S0, G.dock.S1);
  }

  // ---------- loop ----------
  function frame(time) {
    raf = 0;
    const diff = target - sy;
    sy = Math.abs(diff) < 0.5 ? target : sy + diff * SMOOTH;
    const animating = render(time);
    if (sy !== target || animating) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!raf && mode !== 'static') raf = requestAnimationFrame(frame);
  }
  function onScroll() {
    target = window.scrollY;
    kick();
  }

  // ---------- modes ----------
  const STYLED = () => [
    el.portrait, el.soft, el.fade, el.wash, el.ribbon, el.macro, el.base, el.ghost, el.paint, el.gloss, el.shine, el.brush,
    el.mover, el.mark, el.intro, el.final, el.bar, el.bar.parentElement, el.cue, ...el.labels, ...el.steps,
  ];
  function clearStyles() {
    STYLED().forEach((n) => n && n.removeAttribute('style'));
    el.frame?.classList.remove('is-docked');
    root.classList.remove('mark-docked');
    docked = null;
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    root.classList.remove('hero-scroll', 'hero-compact', 'hero-static');
    root.classList.add(`hero-${mode}`);
    root.classList.toggle('motion-ok', !media.reduced.matches);
    clearStyles();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (mode === 'static') {
      root.classList.remove('hero-live');
      return;
    }
    L = LAYOUT[mode];
    root.classList.add('hero-live'); // hidden-until-animated states only apply from here
    loadScene();
    refresh();
  }

  function refresh() {
    if (mode === 'static') return;
    measure();
    target = sy = window.scrollY;
    render(performance.now());
    kick();
  }

  setMode(currentMode());

  window.addEventListener('scroll', onScroll, { passive: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const next = currentMode();
      if (next !== mode) setMode(next);
      else refresh();
    }, 120);
  });
  media.reduced.addEventListener?.('change', () => setMode(currentMode()));
  media.wide.addEventListener?.('change', () => setMode(currentMode()));
  // fonts and images can move the section below (and its frame) after the first measure
  window.addEventListener('load', refresh, { once: true });
  document.fonts?.ready.then(refresh);
  if ('ResizeObserver' in window) {
    const content = document.querySelector('[data-content]');
    let last = 0;
    const ro = new ResizeObserver(() => {
      const h = content.offsetHeight;
      if (Math.abs(h - last) > 2) {
        last = h;
        refresh();
      }
    });
    if (content) ro.observe(content);
  }
}
