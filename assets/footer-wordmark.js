/**
 * Footer wordmark (sections/footer.liquid): sizes the text so it spans the full footer width,
 * whatever its length, but no taller than "Maximum height" (% of the screen height, data-max-height),
 * and (optionally) lets the letters rise in when the footer scrolls into view.
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
    let size = Math.floor((available / width) * 100 * 100) / 100;
    // Cap by the screen height ("Maximum height", % of the viewport): the visible letters are about
    // leading × (1 − crop) × font-size tall. Keeps the footer short enough to stay pinned under the page.
    const maxShare = parseFloat(root.dataset.maxHeight || '');
    if (maxShare > 0) {
      const leading = parseFloat(styles.getPropertyValue('--fw-leading')) || 0.8;
      const crop = parseFloat(styles.getPropertyValue('--fw-crop')) || 0;
      const visible = leading * (1 - crop);
      const cap = (window.innerHeight * maxShare) / 100 / visible;
      if (cap > 0 && size > cap) size = Math.floor(cap * 100) / 100;
    }
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
      window.addEventListener('resize', refit, { passive: true }); // the height cap follows the window height

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
      // Stacked footer reveal (body[data-footer-reveal="pin"], sections/footer.liquid): the wordmark sits
      // under the footer card at first, so the letters rise when the card has moved off it ("footer:stack").
      if (document.body.getAttribute('data-footer-reveal') === 'pin') {
        const onStack = (/** @type {Event} */ event) => {
          if (!(/** @type {CustomEvent} */ (event).detail || {}).bottomShown) return;
          document.removeEventListener('footer:stack', onStack);
          root.classList.add('is-in');
        };
        document.addEventListener('footer:stack', onStack);
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          io.disconnect();
          root.classList.add('is-in');
        },
        { threshold: 0.25 }
      );
      io.observe(root);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setup());
  else setup();
  document.addEventListener('shopify:section:load', (e) => setup(e.target));
})();
