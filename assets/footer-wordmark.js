/**
 * Footer wordmark (sections/footer.liquid): sizes the text so it spans the full footer width,
 * whatever its length, and (optionally) lets the letters rise in one by one as you scroll it into view
 * (scroll-linked: --fw-q, see setup).
 */
(() => {
  if (window.__footerWordmarkInit) return;
  window.__footerWordmarkInit = true;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fit = (root) => {
    const text = root.querySelector('[data-footer-wordmark-text]');
    if (!text) return;
    const styles = getComputedStyle(root);
    const available = root.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
    if (available <= 0) return;
    text.style.setProperty('--fw-size', '100px');
    const width = text.getBoundingClientRect().width;
    if (!width) return;
    const size = Math.floor((available / width) * 100 * 100) / 100;
    text.style.setProperty('--fw-size', `${size}px`);
  };

  const split = (root) => {
    const text = root.querySelector('[data-footer-wordmark-text]');
    if (!text || text.dataset.split) return;
    const chars = Array.from(text.textContent);
    text.textContent = '';
    chars.forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'footer-wordmark__letter';
      span.style.setProperty('--fw-i', String(i));
      span.textContent = ch === ' ' ? ' ' : ch;
      text.appendChild(span);
    });
    text.dataset.split = 'true';
  };

  const setup = (scope = document) => {
    scope.querySelectorAll('[data-footer-wordmark]:not([data-fw-ready])').forEach((root) => {
      root.setAttribute('data-fw-ready', '');
      const refit = () => fit(root);
      refit();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
      if ('ResizeObserver' in window) new ResizeObserver(refit).observe(root);

      // The theme's "blur bottom edge of screen" effect would always sit on top of the wordmark
      // (it is at the very bottom of the page) — fade the blur out while the wordmark is on screen.
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
          document.body.classList.toggle('footer-wordmark-visible', entries.some((e) => e.isIntersecting));
        }).observe(root);
      }

      const animate =
        root.classList.contains('footer-wordmark--animate') &&
        !reduced() &&
        'IntersectionObserver' in window &&
        !(window.Shopify && window.Shopify.designMode);
      if (!animate) return;
      split(root);
      refit();
      root.classList.add('is-ready');
      const text = root.querySelector('[data-footer-wordmark-text]');
      if (text) text.style.setProperty('--fw-n', String(text.children.length || 1));

      // Scroll-linked: the letters rise one after another as the wordmark is uncovered, and only finish
      // when all of it is in view (the end of the page). --fw-q = share of the wordmark uncovered (0–1).
      // Whatever covers it counts: the page above (#MainContent) and, in the stacked footer reveal
      // (sections/footer.liquid), the footer card and copyright bar sliding up off it. Scrolling back up hides them again.
      const main = document.getElementById('MainContent');
      const section = root.closest('.shopify-section');
      const covers = section ? [...section.querySelectorAll('.footer-main, .footer__content-bottom > .footer__page-width')] : [];
      let frame = 0;
      let last = -1;
      const update = () => {
        frame = 0;
        const rect = root.getBoundingClientRect();
        const vh = window.innerHeight;
        if (rect.top > vh || rect.bottom < 0) {
          if (last !== 0 && rect.top > vh) root.style.setProperty('--fw-q', (last = 0).toString());
          return;
        }
        let cover = 0;
        if (main) cover = Math.max(cover, main.getBoundingClientRect().bottom);
        covers.forEach((el) => (cover = Math.max(cover, el.getBoundingClientRect().bottom)));
        const visible = Math.min(rect.bottom, vh) - Math.max(rect.top, cover);
        const q = Math.max(0, Math.min(1, visible / Math.max(1, rect.height)));
        const rounded = Math.round(q * 1000) / 1000;
        if (rounded !== last) root.style.setProperty('--fw-q', String((last = rounded)));
      };
      const queue = () => {
        if (!frame) frame = requestAnimationFrame(update);
      };
      window.addEventListener('scroll', queue, { passive: true });
      window.addEventListener('resize', queue, { passive: true });
      update();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setup());
  else setup();
  document.addEventListener('shopify:section:load', (e) => setup(e.target));
})();
