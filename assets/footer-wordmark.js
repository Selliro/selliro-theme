/**
 * Footer wordmark (sections/footer.liquid): sizes the text so it spans the full footer width,
 * whatever its length, and (optionally) lets the letters rise in one by one when it comes into view.
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
      // Letters rise in once, the first time the wordmark is well in view
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io.disconnect();
          root.classList.add('is-in');
        },
        { threshold: 0.4 }
      );
      io.observe(root);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setup());
  else setup();
  document.addEventListener('shopify:section:load', (e) => setup(e.target));
})();
