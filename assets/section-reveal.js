/**
 * Section reveal — shared scroll-in animation for homepage sections
 * (Shop by category, Build your Bundle, …). Styles: assets/section-reveal.css.
 *
 * Markup (all optional except the root):
 *   [data-reveal]                 section root; animates once when it scrolls into view
 *   [data-reveal-title]           heading — rises word by word (an inner element such as a highlight moves as one word)
 *   [data-reveal-fade]            eyebrow / subtitle / text — fades up after the title, in DOM order
 *   [data-reveal-card]            card — reveals upwards, staggered; its [data-reveal-zoom] (or img) settles from a zoom
 *   [data-reveal-slide="left|right"]  panel — glides in from that side
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
    root.querySelectorAll('[data-reveal-fade]').forEach((el, k) => el.style.setProperty('--sr-i', String(k)));
    const cards = Array.from(root.querySelectorAll('[data-reveal-card]'));
    cards.forEach((card, k) => {
      card.style.setProperty('--sr-i', String(Math.min(k, MAX_STAGGER)));
      const zoom = card.querySelectorAll('[data-reveal-zoom]');
      (zoom.length ? zoom : card.querySelectorAll('img')).forEach((z) => z.classList.add('sr-zoom'));
    });
    root.classList.add('sr-anim');
    return 2600 + Math.min(cards.length, MAX_STAGGER) * 120 + headEnd * 1000;
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
      { threshold: 0.12 }
    );
    roots.forEach((root) => {
      root.dataset.revealDuration = String(Math.round(prepare(root)));
      io.observe(root);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setup());
  else setup();
  document.addEventListener('shopify:section:load', (e) => setup(e.target));
})();
