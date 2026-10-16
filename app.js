/**
 * 3000VND — Modular Portfolio & Lightbox Engine
 * Goal: Minimal code, modular architecture, easy maintenance.
 */

// --- 1. State & DOM Utilities ---
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const state = {
  items: [],
  category: 'all',
  expanded: false,
  index: 0,
  open: false,
  prevFocus: null
};

const getItems = () =>
  state.category === 'all'
    ? state.items
    : state.items.filter(item => item.category === state.category);

const isVideo = item =>
  item.type === 'video' || /\.(mp4|webm|mov)$/i.test(item.src || '');

const renderMedia = (item, isLightbox = false) => {
  if (isVideo(item)) {
    return isLightbox
      ? `<video src="${item.src}" controls autoplay loop playsinline></video>`
      : `<video src="${item.src}" poster="${item.poster || ''}" muted loop playsinline preload="metadata" onmouseover="this.play()" onmouseout="this.pause()"></video><span class="video-badge">▶ Video</span>`;
  }
  return `<img src="${item.src}" alt="${item.alt || item.title}" ${isLightbox ? '' : 'loading="lazy"'}>`;
};

// --- 2. Portfolio Module ---
const Portfolio = {
  async init() {
    this.bindEvents();
    try {
      const res = await fetch('portfolio.json');
      state.items = await res.json();
      this.render();
    } catch {
      const grid = $('#portfolio-grid');
      if (grid) grid.innerHTML = '<p class="empty-msg">Unable to load artwork right now.</p>';
    }
  },

  render() {
    const grid = $('#portfolio-grid');
    if (!grid) return;
    const items = getItems();
    const limit = window.innerWidth <= 768 ? 3 : 5;

    grid.innerHTML = items.map((item, idx) => `
      <div class="portfolio-item ${item.category} ${state.category === 'all' && idx >= limit && !state.expanded ? 'hidden-item' : ''}" data-index="${idx}">
        ${renderMedia(item)}
        <div class="portfolio-caption">${item.title}</div>
      </div>
    `).join('');

    const btn = $('#show-more-btn');
    if (btn) {
      btn.style.display = state.category === 'all' && items.length > limit ? 'inline-block' : 'none';
      btn.textContent = state.expanded ? 'Show Less ↑' : 'Show More Works ↓';
    }
  },

  bindEvents() {
    $('.portfolio-tabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      $$('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
      state.category = btn.dataset.category;
      state.expanded = state.category !== 'all';
      this.render();
    });

    $('#portfolio-grid')?.addEventListener('click', e => {
      const card = e.target.closest('.portfolio-item');
      if (card?.dataset.index != null) Lightbox.open(Number(card.dataset.index));
    });

    $('#show-more-btn')?.addEventListener('click', () => {
      state.expanded = !state.expanded;
      this.render();
    });
  }
};

// --- 3. Lightbox Module ---
const Lightbox = {
  el: null,
  body: null,
  container: null,
  title: null,
  filmstrip: null,

  init() {
    this.el = $('#lightbox');
    if (!this.el) return;
    this.body = $('.lightbox-body', this.el);
    this.container = $('#lightbox-main-container', this.el);
    this.title = $('#lightbox-title', this.el);
    this.filmstrip = $('#lightbox-filmstrip', this.el);

    // Controls & click delegation
    this.el.addEventListener('click', e => {
      if (e.target.closest('.lightbox-close-btn') || e.target === this.el) this.close();
      if (e.target.closest('.prev-btn')) this.step(-1);
      if (e.target.closest('.next-btn')) this.step(1);
      const thumb = e.target.closest('.lightbox-thumb');
      if (thumb?.dataset.index != null) this.goTo(Number(thumb.dataset.index));
    });

    // Keyboard support
    document.addEventListener('keydown', e => {
      if (!state.open) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowLeft') this.step(-1);
      if (e.key === 'ArrowRight') this.step(1);
    });

    // Mobile popstate (back button)
    window.addEventListener('popstate', () => { if (state.open) this.close(true); });

    // Touch swipe gestures
    let sx = 0, sy = 0;
    this.body?.addEventListener('touchstart', e => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });

    this.body?.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) this.step(dx < 0 ? 1 : -1);
    }, { passive: true });
  },

  open(idx) {
    state.prevFocus = document.activeElement;
    state.index = idx;
    state.open = true;
    document.body.style.overflow = 'hidden';
    this.el.style.display = 'flex';
    history.pushState({ lightbox: true }, '');

    this.update();
    this.renderFilmstrip();
    $('.lightbox-close-btn', this.el)?.focus();
  },

  close(fromPopState = false) {
    if (!state.open) return;
    state.open = false;
    document.body.style.overflow = '';
    this.el.style.display = 'none';
    $('video', this.container)?.pause();
    state.prevFocus?.focus();
    if (!fromPopState) history.back();
  },

  step(dir) {
    const items = getItems();
    if (items.length) this.goTo((state.index + dir + items.length) % items.length);
  },

  goTo(idx) {
    state.index = idx;
    this.update();
    this.syncThumbs();
  },

  update() {
    const item = getItems()[state.index];
    if (!item) return;
    this.title.textContent = item.title;
    this.container.innerHTML = renderMedia(item, true);
  },

  renderFilmstrip() {
    this.filmstrip.innerHTML = getItems().map((item, idx) => `
      <div class="lightbox-thumb ${idx === state.index ? 'active' : ''}" data-index="${idx}" tabindex="0" role="button" aria-label="${item.title}">
        <img src="${isVideo(item) ? (item.poster || item.src) : item.src}" alt="${item.alt || item.title}">
      </div>
    `).join('');
    this.syncThumbs();
  },

  syncThumbs() {
    $$('.lightbox-thumb', this.filmstrip).forEach((t, i) => {
      const active = i === state.index;
      t.classList.toggle('active', active);
      if (active) t.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    });
  }
};

// --- 4. Utilities & Bootstrap ---
function copyEmail(btn) {
  navigator.clipboard.writeText('helomoto97@yahoo.com.vn').then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.category === 'all') Portfolio.render(); }, 150);
});

document.addEventListener('DOMContentLoaded', () => {
  Portfolio.init();
  Lightbox.init();
});
