(() => {
  'use strict';
  const section = document.getElementById('screenshots');
  const dialog = document.getElementById('ndcShotViewer');
  if (!section || !dialog) return;
  const cards = [...section.querySelectorAll('.ndc-shot')];
  const filters = [...section.querySelectorAll('[data-shot-filter]')];
  const image = document.getElementById('ndcShotImage');
  let selected = 0, opener;
  const visible = () => cards.map((card, index) => card.hidden ? -1 : index).filter(index => index >= 0);
  function display(index) {
    selected = index;
    const card = cards[index];
    const thumbnail = card.querySelector('img');
    image.src = thumbnail.getAttribute('src');
    image.alt = thumbnail.alt;
    document.getElementById('ndcShotTitle').textContent = card.querySelector('h3').textContent;
    const items = visible();
    document.getElementById('ndcShotPosition').textContent = `${items.indexOf(index) + 1} / ${items.length}`;

  }
  function move(direction) {
    const items = visible();
    display(items[(items.indexOf(selected) + direction + items.length) % items.length]);
  }
  filters.forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.shotFilter;
    filters.forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
    cards.forEach(card => { card.hidden = category !== 'all' && card.dataset.category !== category; });
    const count = visible().length;
    document.getElementById('ndcShotCount').textContent = `${count} screenshot${count === 1 ? '' : 's'}`;
  }));
  cards.forEach((card, index) => card.querySelector('button').addEventListener('click', () => {
    opener = card.querySelector('button');
    display(index);
    dialog.showModal();
    dialog.querySelector('.ndc-viewer-close').focus();
    document.documentElement.classList.add('ndc-gallery-open');
  }));
  dialog.querySelector('.ndc-viewer-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {document.documentElement.classList.remove('ndc-gallery-open');opener?.focus();});
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  document.getElementById('ndcShotPrevious').addEventListener('click', () => move(-1));
  document.getElementById('ndcShotNext').addEventListener('click', () => move(1));
})();
