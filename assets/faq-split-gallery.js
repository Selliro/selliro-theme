/**
 * FAQ split gallery: accordion + scroll-linked translateY on inner gallery images (.faq-split-gallery__img).
 */
(function () {
  const ROOT = '[data-faq-split-root]';
  const TRIGGER = '[data-faq-split-trigger]';
  const ITEM = '[data-faq-item]';
  const SECTION = '.faq-split-gallery';
  const FIGURE = '.faq-split-gallery__figure';
  const INNER_MEDIA = '.faq-split-gallery__img';

  let parallaxBound = false;
  let parallaxRaf = 0;

  function readParallaxIntensity(sectionEl) {
    const raw = getComputedStyle(sectionEl).getPropertyValue('--faq-parallax-intensity').trim();
    const n = parseFloat(raw, 10);
    return Number.isFinite(n) ? n : 36;
  }

  function updateParallaxTransforms() {
    parallaxRaf = 0;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll(`${SECTION} ${INNER_MEDIA}`).forEach((el) => {
        el.style.transform = '';
        el.style.willChange = '';
      });
      return;
    }

    const vh = window.innerHeight || 1;

    document.querySelectorAll(SECTION).forEach((sectionEl) => {
      const intensity = readParallaxIntensity(sectionEl);
      const figures = sectionEl.querySelectorAll(`:scope ${FIGURE}`);

      figures.forEach((fig, index) => {
        const media = fig.querySelector(INNER_MEDIA);
        if (!media) return;

        if (intensity <= 0) {
          media.style.transform = '';
          media.style.willChange = '';
          return;
        }

        const rect = fig.getBoundingClientRect();
        const centerY = rect.top + rect.height * 0.5;
        /* Normalized distance from viewport center; ~-1..1 as the block moves through view */
        const normalized = (centerY - vh * 0.5) / (vh * 0.65);
        const clamped = Math.max(-1, Math.min(1, normalized));
        const direction = index === 0 ? -1 : 1;
        const yPx = clamped * intensity * direction;

        /* Keep image vertically centered in frame while parallax shifts (full cover, no gaps) */
        media.style.transform = `translate3d(0, calc(-50% + ${yPx}px), 0)`;
        media.style.willChange = 'transform';
      });
    });
  }

  function scheduleParallaxUpdate() {
    if (parallaxRaf) return;
    parallaxRaf = window.requestAnimationFrame(updateParallaxTransforms);
  }

  function bindParallaxScroll() {
    if (parallaxBound) return;
    parallaxBound = true;
    window.addEventListener('scroll', scheduleParallaxUpdate, { passive: true });
    window.addEventListener('resize', scheduleParallaxUpdate, { passive: true });
    scheduleParallaxUpdate();
  }

  function initParallax() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll(`${SECTION} ${INNER_MEDIA}`).forEach((el) => {
        el.style.transform = '';
        el.style.willChange = '';
      });
      return;
    }
    bindParallaxScroll();
  }

  function setOpen(item, open) {
    const trigger = item.querySelector(TRIGGER);
    const panelId = trigger && trigger.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;

    item.classList.toggle('is-open', open);
    if (trigger) {
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (panel) {
      panel.inert = !open;
    }
  }

  function closeAll(root) {
    root.querySelectorAll(ITEM).forEach((el) => setOpen(el, false));
  }

  function initRoot(root) {
    if (root.dataset.faqSplitInit === '1') return;
    root.dataset.faqSplitInit = '1';

    root.addEventListener('click', (event) => {
      const trigger = event.target.closest(TRIGGER);
      if (!trigger || !root.contains(trigger)) return;

      const item = trigger.closest(ITEM);
      if (!item) return;

      const wasOpen = item.classList.contains('is-open');
      const allowCollapse = root.getAttribute('data-allow-collapse') === 'true';

      closeAll(root);

      if (!wasOpen) {
        setOpen(item, true);
      } else if (!allowCollapse) {
        setOpen(item, true);
      }
    });

    root.addEventListener('keydown', (event) => {
      const trigger = event.target.closest(TRIGGER);
      if (!trigger || !root.contains(trigger)) return;

      const triggers = Array.from(root.querySelectorAll(TRIGGER));
      const index = triggers.indexOf(trigger);
      if (index < 0) return;

      let nextIndex = -1;
      if (event.key === 'ArrowDown') {
        nextIndex = Math.min(index + 1, triggers.length - 1);
      } else if (event.key === 'ArrowUp') {
        nextIndex = Math.max(index - 1, 0);
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = triggers.length - 1;
      }

      if (nextIndex >= 0 && nextIndex !== index) {
        event.preventDefault();
        triggers[nextIndex].focus();
      }
    });
  }

  function boot() {
    document.querySelectorAll(ROOT).forEach(initRoot);
    initParallax();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', (event) => {
    const root = event.target.querySelector && event.target.querySelector(ROOT);
    if (root) {
      delete root.dataset.faqSplitInit;
      initRoot(root);
    }
    scheduleParallaxUpdate();
  });
})();
