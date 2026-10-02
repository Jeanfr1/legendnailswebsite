// Generates the web images (WebP) and the geometry the hero reads, from the PNGs in
// design/source/images. The PNGs stay the source of truth; run `npm run images` after
// changing any of them (and `python3 scripts/hand-variants.py` first if 02 changed).
//
// Two decisions live here:
// - Mirroring. In the opening portrait the nails point up-left; the macro nails and the
//   finished hand point up-right. Everything of the "macro world" (nail layers, brush,
//   hand) is flopped once, so the camera can move from the portrait into the macro nail and
//   back out to the hand without a visible roll.
// - Registration. Base, colour states and gloss share one canvas in the kit. They are cut
//   to the same box (union of their visible areas) so they still stack exactly, and their
//   axis is measured on the visible pixels ("normalise by the visible area", catalogue p.2).
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'design/source/images';
const OUT = 'src/assets/img';
const PUBLIC = 'public';

const webp = { quality: 84, alphaQuality: 92, effort: 6, smartSubsample: true };
const photo = { quality: 80, effort: 6, smartSubsample: true };

await mkdir(OUT, { recursive: true });
const report = [];
const meta = {};
const r4 = (v) => +v.toFixed(4);

async function write(input, name, width, options = webp) {
  const info = await sharp(input).resize({ width, withoutEnlargement: true }).webp(options).toFile(path.join(OUT, name));
  report.push(`${name.padEnd(30)} ${String(info.width).padStart(4)}x${String(info.height).padEnd(5)} ${(info.size / 1024).toFixed(0).padStart(4)} KB`);
  return info;
}

async function raw(file, { flop = false } = {}) {
  const img = sharp(path.join(SRC, file)).ensureAlpha();
  if (flop) img.flop();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function alphaBox({ data, width, height }, threshold = 8) {
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

// Centroid, main axis and length of the visible pixels (alpha-weighted PCA).
function axis({ data, width, height }, threshold = 8) {
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > threshold) { n++; sx += x; sy += y; }
  const cx = sx / n, cy = sy / n;
  let xx = 0, yy = 0, xy = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > threshold) {
        const dx = x - cx, dy = y - cy;
        xx += dx * dx; yy += dy * dy; xy += dx * dy;
      }
  let angle = 0.5 * Math.atan2(2 * xy, xx - yy); // y-down radians
  let ux = Math.cos(angle), uy = Math.sin(angle);
  if (uy > 0) { ux = -ux; uy = -uy; angle += Math.PI; } // point the axis upwards (towards the tip)
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > threshold) {
        const p = (x - cx) * ux + (y - cy) * uy;
        if (p < lo) lo = p;
        if (p > hi) hi = p;
      }
  return { cx, cy, angle: Math.atan2(uy, ux), length: hi - lo, centre: (lo + hi) / 2 };
}

// ---------- nail layers (registered, flopped, one shared box) ----------
const NAIL_LAYERS = {
  base: '03-base-marfim.png',
  nude: '04-nude.png',
  french: '05-francesinha.png',
  olive: '06-verde-oliva.png',
  gloss: '07-brilho.png',
};
{
  const raws = {};
  for (const [id, file] of Object.entries(NAIL_LAYERS)) raws[id] = await raw(file, { flop: true });
  const boxes = Object.values(raws).map((r) => alphaBox(r));
  const left = Math.max(0, Math.min(...boxes.map((b) => b.left)) - 6);
  const top = Math.max(0, Math.min(...boxes.map((b) => b.top)) - 6);
  const right = Math.max(...boxes.map((b) => b.left + b.width)) + 6;
  const bottom = Math.max(...boxes.map((b) => b.top + b.height)) + 6;
  const box = { left, top, width: right - left, height: bottom - top };
  const a = axis(raws.base);
  // the axis centre (midway between cuticle and tip) is the anchor the hero positions
  const ax = a.cx + Math.cos(a.angle) * a.centre;
  const ay = a.cy + Math.sin(a.angle) * a.centre;
  meta.nail = {
    ratio: r4(box.height / box.width),
    cx: r4((ax - box.left) / box.width),
    cy: r4((ay - box.top) / box.height),
    angle: r4((a.angle * 180) / Math.PI), // degrees, y-down, axis pointing to the tip
    length: r4(a.length / box.width),
  };
  for (const [id, r] of Object.entries(raws)) {
    const cut = await sharp(r.data, { raw: { width: r.width, height: r.height, channels: 4 } }).extract(box).png().toBuffer();
    await write(cut, `nail-${id}-880.webp`, 880);
    await write(cut, `nail-${id}-480.webp`, 480);
  }
}

// ---------- brush (flopped, trimmed; bristle tip measured on the source) ----------
{
  const r = await raw('09-pincel.png', { flop: true });
  const box = alphaBox(r);
  const cut = await sharp(r.data, { raw: { width: r.width, height: r.height, channels: 4 } }).extract(box).png().toBuffer();
  await write(cut, 'brush-640.webp', 640);
  // source (not flopped): bristle tip ≈ (250, 1050), cap centre ≈ (1080, 330)
  const W = r.width;
  const tip = { x: W - 1 - 250, y: 1050 };
  const cap = { x: W - 1 - 1080, y: 330 };
  meta.brush = {
    ratio: r4(box.height / box.width),
    tipX: r4((tip.x - box.left) / box.width),
    tipY: r4((tip.y - box.top) / box.height),
    angle: r4((Math.atan2(cap.y - tip.y, cap.x - tip.x) * 180) / Math.PI), // tip -> cap
  };
}

// ---------- finished hand: French (kit) + nude / olive (scripts/hand-variants.py) ----------
{
  const files = { french: '02-mao-isolada.png', nude: 'derived/hand-nude.png', olive: 'derived/hand-olive.png' };
  const first = await raw(files.french, { flop: true });
  const box = alphaBox(first);
  const W = first.width;
  // middle-finger nail, measured on its GrabCut mask (scripts/hand-variants.py): centre
  // (966.8, 167.2), length 130 px, axis -42.5° (y-down). The kit's macro nail is slimmer than
  // this real one (length/width 2.7 vs 2.2), so the hand-over uses a length between the two
  // (136 px) to match both length and width as well as possible. Flopped: x mirrored, 180 - a.
  const nail = { x: W - 1 - 966.8, y: 167.2, length: 136, angle: -(180 - 42.5) };
  meta.hand = {
    ratio: r4(box.height / box.width),
    nailX: r4((nail.x - box.left) / box.width),
    nailY: r4((nail.y - box.top) / box.height),
    nailLength: r4(nail.length / box.width),
    nailAngle: nail.angle,
  };
  for (const [id, file] of Object.entries(files)) {
    const r = id === 'french' ? first : await raw(file, { flop: true });
    const cut = await sharp(r.data, { raw: { width: r.width, height: r.height, channels: 4 } }).extract(box).png().toBuffer();
    await write(cut, `hand-${id}-1100.webp`, 1100);
    await write(cut, `hand-${id}-640.webp`, 640);
  }
}

// ---------- opening portrait ----------
{
  const file = path.join(SRC, '01-retrato.png');
  for (const w of [1536, 1024, 720]) await write(file, `portrait-${w}.webp`, w, photo);
  // small, pre-blurred copy: crossfaded in while the camera moves in (cheaper than a CSS blur)
  await write(await sharp(file).resize({ width: 384 }).blur(2.2).toBuffer(), 'portrait-soft.webp', 384, photo);
  // index-finger nail on the source (1536 x 1024): centre, length, axis (y-down, to the tip)
  meta.portrait = { width: 1536, height: 1024, nailX: 1257, nailY: 372, nailLength: 64, nailAngle: -128.7 };
}

// ---------- trimmed cut-outs ----------
async function trimmed(file) {
  const { data, info } = await sharp(path.join(SRC, file))
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}
{
  const t = await trimmed('08-traco.png');
  await write(t.buffer, 'ribbon-1200.webp', 1200);
  await write(t.buffer, 'ribbon-640.webp', 640);
  meta.ribbon = { ratio: r4(t.height / t.width) };
}
{
  const t = await trimmed('10-composicao.png');
  await write(t.buffer, 'composition-1000.webp', 1000);
  await write(t.buffer, 'composition-560.webp', 560);
  meta.composition = { ratio: r4(t.height / t.width) };
}
{
  const t = await trimmed('11-logo.png');
  await write(t.buffer, 'logo-1280.webp', 1280);
  await write(t.buffer, 'logo-420.webp', 420);
  meta.logo = { ratio: r4(t.height / t.width) };
}

await writeFile('src/data/asset-meta.json', JSON.stringify(meta, null, 2) + '\n');

// ---------- gallery: stable URLs for the larger view (lightbox, and the plain link without JS) ----------
{
  const { copyFile } = await import('node:fs/promises');
  await mkdir(path.join(PUBLIC, 'gallery'), { recursive: true });
  const large = { nude: 'hand-nude-1100', french: 'nail-french-880', 'soft-colour': 'nail-olive-880', 'nail-art': 'composition-1000' };
  for (const [slug, file] of Object.entries(large)) {
    await copyFile(path.join(OUT, `${file}.webp`), path.join(PUBLIC, 'gallery', `${slug}.webp`));
    report.push(`public/gallery/${slug}.webp`);
  }
}

// ---------- favicon, touch icon, social preview ----------
// The almond terminal on the "l" of the wordmark, as a small mark.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#F6F0E9"/>
  <path d="M27 19v31" stroke="#59634F" stroke-width="7" stroke-linecap="round"/>
  <ellipse cx="38.5" cy="16.5" rx="5.6" ry="10.5" transform="rotate(38 38.5 16.5)" fill="#D2ADA1"/>
</svg>
`;
await writeFile(path.join(PUBLIC, 'favicon.svg'), favicon);
await sharp(Buffer.from(favicon)).resize(180, 180).png().toFile(path.join(PUBLIC, 'apple-touch-icon.png'));

{
  const W = 1200;
  const H = 630;
  const portrait = await sharp(path.join(SRC, '01-retrato.png')).resize({ height: H }).extract({ left: 945 - 680, top: 0, width: 680, height: H }).toBuffer();
  const logo = await sharp((await trimmed('11-logo.png')).buffer).resize({ width: 430 }).toBuffer();
  const logoMeta = await sharp(logo).metadata();
  await sharp({ create: { width: W, height: H, channels: 4, background: '#F6F0E9' } })
    .composite([
      { input: portrait, left: W - 680, top: 0 },
      { input: logo, left: 70, top: Math.round((H - logoMeta.height) / 2) },
    ])
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(path.join(PUBLIC, 'og-image.jpg'));
  report.push('public/og-image.jpg           1200x630');
}

console.log(report.join('\n'));
console.log(JSON.stringify(meta, null, 2));
