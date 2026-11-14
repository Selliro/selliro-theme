/**
 * Featured collection grid (Shop by category) — scroll-in animation.
 * The heading rises word by word, then the cards reveal upwards one after another while their
 * photos settle from a slight zoom. Skipped for reduced motion and in the theme editor;
 * the section is fully visible without it.
 */
(() => {
  if (window.__fcgAnimInit) return;
  window.__fcgAnimInit = true;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Wrap words of the heading's text nodes; a highlighted word (span) animates as one unit. */
  const splitHeading = (el) => {
    let i = 0;
    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        node.classList.add('fcg-w');
        node.style.setProperty('--i', String(i++));
        return;
      }
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return;
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(part));
        const w = document.createElement('span');
        w.className = 'fcg-w';
        w.style.setProperty('--i', String(i++));
        w.textContent = part;
        frag.appendChild(w);
      });
      node.replaceWith(frag);
    });
    return i;
  };

  const setup = (root = document) => {
    if (reduced() || !('IntersectionObserver' in window)) return;
    if (window.Shopify && window.Shopify.designMode) return;
    root.querySelectorAll('[data-fcg]:not([data-fcg-ready])').forEach((section) => {
      section.setAttribute('data-fcg-ready', '');
      const title = section.querySelector('[data-fcg-title]');
      const words = title ? splitHeading(title) : 0;
      section.style.setProperty('--fcg-head-end', `${0.2 + words * 0.08}s`);
      const cards = Array.from(section.querySelectorAll('.featured-collection-grid__card'));
      cards.forEach((card, k) => card.style.setProperty('--i', String(k)));
      section.classList.add('fcg-anim');

      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io.disconnect();
          section.classList.add('is-in');
          // Return to the normal styles once everything has landed, so hover effects have no delays.
          setTimeout(() => section.classList.remove('fcg-anim', 'is-in'), 2600 + cards.length * 120);
        },
        { threshold: 0.15 }
      );
      io.observe(section);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setup());
  else setup();
  document.addEventListener('shopify:section:load', (e) => setup(e.target));
})();
