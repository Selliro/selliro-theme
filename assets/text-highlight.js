/**
 * Heading word highlight (snippets/text-highlight.liquid).
 * Draws the underline / marker / circle when the word scrolls into view. Re-scans when the
 * theme editor reloads a section. Reduced motion: drawn immediately (no transition in CSS).
 */
(() => {
  if (window.__textHighlightInit) return;
  window.__textHighlightInit = true;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) =>
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add('is-drawn');
              io.unobserve(entry.target);
            }),
          { threshold: 0.6 }
        )
      : null;

  const scan = (root = document) => {
    root.querySelectorAll('[data-text-hl]:not(.is-drawn)').forEach((el) => {
      if (!io || reduced()) el.classList.add('is-drawn');
      else io.observe(el);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan());
  else scan();
  document.addEventListener('shopify:section:load', (e) => scan(e.target));
})();
