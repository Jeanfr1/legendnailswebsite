// "Your next chapter": a tile opens a larger view with a button to call the salon.
// Without JavaScript (or without <dialog>) the tiles stay plain links to the image.
export function initGallery() {
  const dialog = document.querySelector('[data-lightbox]');
  const cards = [...document.querySelectorAll('[data-style-card]')];
  if (!dialog || !cards.length || typeof dialog.showModal !== 'function') return;

  const img = dialog.querySelector('[data-lightbox-img]');
  const title = dialog.querySelector('[data-lightbox-title]');
  const text = dialog.querySelector('[data-lightbox-text]');
  const count = dialog.querySelector('[data-lightbox-count]');
  let index = 0;
  let opener = null;

  const show = (i) => {
    index = (i + cards.length) % cards.length;
    const card = cards[index];
    const thumb = card.querySelector('img');
    img.src = card.getAttribute('href');
    img.alt = thumb ? thumb.alt : '';
    img.dataset.kind = card.querySelector('.style-media--hand') ? 'hand' : 'cutout';
    title.textContent = card.dataset.title;
    text.textContent = card.dataset.text;
    count.textContent = `${index + 1} / ${cards.length}`;
  };

  cards.forEach((card, i) => {
    card.setAttribute('aria-haspopup', 'dialog');
    card.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      opener = card;
      show(i);
      dialog.showModal();
      dialog.querySelector('[data-lightbox-close]').focus();
    });
  });

  dialog.querySelector('[data-lightbox-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-lightbox-prev]').addEventListener('click', () => show(index - 1));
  dialog.querySelector('[data-lightbox-next]').addEventListener('click', () => show(index + 1));
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
  // click on the backdrop closes
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (opener) opener.focus();
  });
}
