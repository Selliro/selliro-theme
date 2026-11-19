/**
 * Section reveal — shared scroll-in animation for homepage sections
 * (New Arrivals, Shop by category, Black Friday countdown, Build your Bundle, collage, before/after,
 * beauty bundle, FAQ, testimonials, Latest stories). Styles: assets/section-reveal.css.
 *
 * Markup (all optional except the root):
 *   [data-reveal]                 section root; animates once when it scrolls into view
 *   [data-reveal-title]           heading — rises word by word (an inner element such as a highlight moves as one word)
 *   [data-reveal-fade]            eyebrow / subtitle / text — fades up after the title, in DOM order
 *   [data-reveal-card]            card — reveals upwards, staggered; its [data-reveal-zoom] (or img) settles from a zoom
 *   [data-reveal-slide="left|right"]  panel — glides in from that side
 *   [data-reveal-pop]             small overlay (label, hotspot, badge) — pops in once the images have landed
 *   [data-reveal-rise]            large block (testimonial column, slider) — rises from below, staggered
 *
 * Skipped for reduced motion and in the theme editor; everything is visible without it.
 */
(() => {
  if (window.__sectionRevealInit) return;
  window.__sectionRevealInit = true;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX_STAGGER = 8;

  const splitTitle = (el) => {
    let i = 0;
    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        node.classList.add('sr-w');
        node.style.setProperty('--sr-i', String(i++));
        return;
      }
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return;
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(part));
        const w = document.createElement('span');
        w.className = 'sr-w';
        w.style.setProperty('--sr-i', String(i++));
        w.textContent = part;
        frag.appendChild(w);
      });
      node.replaceWith(frag);
    });
    return i;
  };

  const prepare = (root) => {
    root.setAttribute('data-reveal-ready', '');
    let words = 0;
    root.querySelectorAll('[data-reveal-title]').forEach((t) => (words = Math.max(words, splitTitle(t))));
    const headEnd = 0.15 + words * 0.08;
    root.style.setProperty('--sr-head-end', `${headEnd}s`);
    const stagger = (selector) => {
      const els = root.querySelectorAll(selector);
      els.forEach((el, k) => el.style.setProperty('--sr-i', String(Math.min(k, MAX_STAGGER))));
      return Math.min(els.length, MAX_STAGGER);
    };
    const fades = stagger('[data-reveal-fade]');
    const pops = stagger('[data-reveal-pop]');
    const rises = stagger('[data-reveal-rise]');
    const cards = Array.from(root.querySelectorAll('[data-reveal-card]'));
    cards.forEach((card, k) => {
      card.style.setProperty('--sr-i', String(Math.min(k, MAX_STAGGER)));
      const zoom = card.querySelectorAll('[data-reveal-zoom]');
      (zoom.length ? zoom : card.querySelectorAll('img')).forEach((z) => z.classList.add('sr-zoom'));
    });
    root.classList.add('sr-anim');
    // Longest chain (in ms) — after that the root hands back to the normal styles
    return Math.max(
      2600 + Math.min(cards.length, MAX_STAGGER) * 120 + headEnd * 1000,
      (headEnd + fades * 0.1 + 1) * 1000,
      (1 + pops * 0.12 + 0.8) * 1000,
      (headEnd + 0.1 + rises * 0.15 + 1.2) * 1000
    );
  };

  const setup = (scope = document) => {
    if (reduced() || !('IntersectionObserver' in window)) return;
    if (window.Shopify && window.Shopify.designMode) return;
    const roots = scope.querySelectorAll('[data-reveal]:not([data-reveal-ready])');
    if (!roots.length) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          const root = entry.target;
          root.classList.add('is-in');
          // Hand back to the normal styles once everything has landed, so hover effects run without delays.
          setTimeout(() => root.classList.remove('sr-anim', 'is-in'), Number(root.dataset.revealDuration || 3000));
        }),
      // Start once the section's top is a little way up the screen. (A ratio threshold such as 0.12 can never be
      // reached by sections taller than ~8 screens, e.g. long feature grids on phones, which then stayed hidden.)
      { threshold: 0, rootMargin: '0px 0px -12% 0px' }
    );
    roots.forEach((root) => {
      root.dataset.revealDuration = String(Math.round(prepare(root)));
      io.observe(root);
    });
  };

  // Sections that load their content later (e.g. product recommendations) call this once it's in place
  window.SectionReveal = { setup };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setup());
  else setup();
  document.addEventListener('shopify:section:load', (e) => setup(e.target));
})();
