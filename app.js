/**
 * 3000VND — Modular Portfolio & Lightbox Engine
 * Very minimal, much modular, breezy maintenance.
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

const renderMedia = (item, isLightbox = false, isFirstVisible = false) => {
  if (isVideo(item)) {
    return isLightbox
      ? `<video src="${item.src}" controls autoplay loop playsinline></video>`
      : `<video src="${item.src}" poster="${item.poster || ''}" muted loop playsinline preload="metadata"></video><span class="video-badge" role="img" aria-label="Video">▶︎</span>`;
  }
  const priority = isFirstVisible ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<img src="${item.src}" alt="${item.alt || item.title}" ${isLightbox ? '' : priority}>`;
};

const renderFilmstripMedia = item => {
  if (isVideo(item)) {
    const requestedTime = Number(item.thumbnailTime);
    const thumbnailTime = Number.isFinite(requestedTime) && requestedTime >= 0
      ? requestedTime
      : 1;
    return `<video data-src="${item.src}" data-time="${thumbnailTime}" muted playsinline preload="none" aria-hidden="true"></video>`;
  }
  return `<img src="${item.src}" alt="${item.alt || item.title}" loading="lazy">`;
};

// --- 2. Portfolio Module ---
const Portfolio = {
  videoPreviewObserver: null,
  previewVisibility: new Map(),
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
    this.videoPreviewObserver?.disconnect();
    this.videoPreviewObserver = null;
    this.previewVisibility.clear();
    const items = getItems();
    const limit = window.innerWidth <= 768 ? 3 : 5;
    const mobileMode = window.matchMedia("(max-width: 768px)").matches;

    grid.innerHTML = items.map((item, idx) => `
      <div class="portfolio-entry ${state.category === 'all' && idx >= limit && !state.expanded ? 'hidden-item' : ''}" data-index="${idx}">
        <div class="portfolio-item ${item.category}">
          ${renderMedia(item, false, idx === 0)}
        </div>
        <div class="portfolio-caption">
          <div class="portfolio-title">${item.title}</div>
        </div>
      </div>
    `).join('');

    if (!mobileMode) {
      const entries = $$(".portfolio-entry", grid);
      entries.forEach(entry => {
        entry.addEventListener("pointerenter", event => {
          if (event.pointerType === "touch") return;
          entries.forEach(candidate =>
            candidate.classList.toggle("is-expanded", candidate === entry)
          );
        });
        entry.addEventListener("pointerleave", event => {
          if (event.pointerType === "touch") return;
          entry.classList.remove("is-expanded");
        });
      });
    }
    const videos = $$(".portfolio-item video", grid);
    videos.forEach(video => {
      const card = video.closest(".portfolio-item");
      const syncBadge = () => card.classList.toggle("is-playing", !video.paused && !video.ended);
      video.addEventListener("playing", syncBadge);
      video.addEventListener("pause", syncBadge);
      video.addEventListener("ended", syncBadge);
    });
    if (mobileMode && videos.length && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          this.previewVisibility.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
        });
        this.syncMobilePreviews(videos);
      }, { threshold: [0, 0.85] });

      this.videoPreviewObserver = observer;
      videos.forEach(video => observer.observe(video));
    } else if (!mobileMode) {
      // Keep desktop playback active while the pointer moves over the caption.
      videos.forEach(video => {
        const card = video.closest(".portfolio-entry");
        card.addEventListener("pointerenter", event => {
          if (event.pointerType !== "touch") video.play().catch(() => {});
        });
        card.addEventListener("pointerleave", event => {
          if (event.pointerType !== "touch") video.pause();
        });
      });
    }

    const btn = $('#show-more-btn');
    if (btn) {
      btn.style.display = state.category === 'all' && items.length > limit ? 'inline-block' : 'none';
      btn.textContent = state.expanded ? 'Show Less ↑' : 'Show More Works ↓';
    }
  },

  syncMobilePreviews(videos) {
    const activeVideo = [...this.previewVisibility.entries()]
      .filter(([video, ratio]) => videos.includes(video) && ratio >= 0.85)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    videos.forEach(video => {
      if (video === activeVideo) {
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute("muted", "");
        video.setAttribute("playsinline", "");
        video.autoplay = true;
        video.play().catch(() => {});
      } else {
        video.autoplay = false;
        video.pause();
      }
    });
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
      const entry = e.target.closest('.portfolio-entry');
      if (entry?.dataset.index != null) {
        $("video", entry)?.pause();
        Lightbox.open(Number(entry.dataset.index));
      }
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
  filmstripVideoObserver: null,

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
    this.filmstripVideoObserver?.disconnect();
    this.filmstripVideoObserver = null;
    document.body.style.overflow = '';
    this.el.style.display = 'none';
    if (window.matchMedia("(max-width: 768px)").matches) {
      const grid = $("#portfolio-grid");
      if (grid) Portfolio.syncMobilePreviews($$(".portfolio-item video", grid));
    }
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
    this.filmstripVideoObserver?.disconnect();
    this.filmstripVideoObserver = null;
    this.filmstrip.innerHTML = getItems().map((item, idx) => `
      <div class="lightbox-thumb ${idx === state.index ? 'active' : ''}" data-index="${idx}" tabindex="0" role="button" aria-label="${item.title}">
        ${renderFilmstripMedia(item)}
      </div>
    `).join('');
    this.observeFilmstripVideos();
    this.syncThumbs();
  },

  observeFilmstripVideos() {
    const videos = $$('video[data-src]', this.filmstrip);
    if (!videos.length) return;

    if (!("IntersectionObserver" in window)) {
      videos.forEach(video => this.loadFilmstripVideo(video));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        this.loadFilmstripVideo(entry.target);
      });
    }, { root: this.filmstrip, rootMargin: "80px" });

    this.filmstripVideoObserver = observer;
    videos.forEach(video => observer.observe(video));
  },

  loadFilmstripVideo(video) {
    if (video.dataset.loaded) return;
    video.dataset.loaded = "true";
    video.addEventListener("loadedmetadata", () => {
      const requestedTime = Number(video.dataset.time);
      const lastFrameTime = Number.isFinite(video.duration)
        ? Math.max(0, video.duration - 0.05)
        : requestedTime;
      video.currentTime = Math.min(requestedTime, lastFrameTime);
    }, { once: true });
    video.preload = "metadata";
    video.src = video.dataset.src;
    video.load();
  },

  syncThumbs() {
    $$('.lightbox-thumb', this.filmstrip).forEach((t, i) => {
      const active = i === state.index;
      t.classList.toggle('active', active);
      if (active) {
        requestAnimationFrame(() => {
          t.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
        });
      }
    });
  }
};

// --- 4. Utilities & Bootstrap ---
function setupEmailCopy() {
  const emailLink = $('#email-link');
  if (!emailLink) return;

  emailLink.addEventListener('click', e => {
    e.preventDefault();
    const email = emailLink.textContent.trim();
    navigator.clipboard.writeText(email).then(() => {
      showCopyToast(e.clientX, e.clientY);
    });
  });
}

function showCopyToast(x, y) {
  document.querySelectorAll('.copy-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = 'Copied!';
  toast.style.left = `${x}px`;
  toast.style.top = `${y}px`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 1000);
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.category === 'all') Portfolio.render(); }, 150);
});

document.addEventListener('DOMContentLoaded', () => {
  Portfolio.init();
  Lightbox.init();
  setupEmailCopy();
});
