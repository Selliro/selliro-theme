/**
 * Before / after comparison: pointer drag + keyboard (slider role).
 */
(function () {
  const ROOT = '[data-before-after-root]';
  const VIEWPORT = '[data-before-after-viewport]';
  const HANDLE = '[data-before-after-handle]';

  /**
   * @param {number} n
   * @param {number} min
   * @param {number} max
   */
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /**
   * @param {HTMLElement} root
   */
  function initRoot(root) {
    if (root.dataset.beforeAfterInit === '1') return;
    root.dataset.beforeAfterInit = '1';

    /* Root may be the same node as the viewport (both attrs on one element). */
    const viewport = root.matches(VIEWPORT) ? root : root.querySelector(VIEWPORT);
    const handle = root.querySelector(HANDLE);
    if (!viewport || !handle) return;

    let dragging = false;

    /**
     * @param {number} percent
     */
    function setSplit(percent) {
      const p = clamp(Math.round(percent), 0, 100);
      root.style.setProperty('--before-after-split', `${p}%`);
      handle.setAttribute('aria-valuenow', String(p));
      handle.setAttribute(
        'aria-valuetext',
        `${p}% ${root.getAttribute('data-i18n-before-visible') || 'before image visible'}`
      );
    }

    /**
     * @param {number} clientX
     */
    function percentFromClientX(clientX) {
      const rect = viewport.getBoundingClientRect();
      if (rect.width <= 0) return 50;
      return ((clientX - rect.left) / rect.width) * 100;
    }

    const initialRaw = parseInt(root.getAttribute('data-initial-position') || '50', 10);
    setSplit(Number.isFinite(initialRaw) ? initialRaw : 50);

    /**
     * @param {PointerEvent} e
     */
    function onPointerMove(e) {
      if (!dragging) return;
      setSplit(percentFromClientX(e.clientX));
    }

    function onPointerUp() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    }

    /**
     * @param {PointerEvent} e
     */
    function onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
      setSplit(percentFromClientX(e.clientX));
      if (handle !== e.target && !handle.contains(e.target)) {
        handle.focus();
      }
    }

    viewport.addEventListener('pointerdown', onPointerDown);

    handle.addEventListener('keydown', (e) => {
      const current = parseInt(handle.getAttribute('aria-valuenow') || '50', 10);
      let next = current;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = current - 5;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = current + 5;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = 100;
      else if (e.key === 'PageDown') next = current - 20;
      else if (e.key === 'PageUp') next = current + 20;
      else return;
      e.preventDefault();
      setSplit(next);
    });

    peekOnce(root, viewport, handle, setSplit);
  }

  /**
   * First time the slider scrolls into view, sweep the handle a little left, then right, then back,
   * so shoppers see it can be dragged. Stops for good as soon as they touch it.
   * Skipped for reduced motion and in the theme editor.
   * @param {HTMLElement} root
   * @param {HTMLElement} viewport
   * @param {HTMLElement} handle
   * @param {(percent: number) => void} setSplit
   */
  function peekOnce(root, viewport, handle, setSplit) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.Shopify && window.Shopify.designMode) return;
    if (!('IntersectionObserver' in window)) return;

    const start = parseInt(handle.getAttribute('aria-valuenow') || '50', 10);
    const reach = Math.min(18, start - 5, 95 - start);
    if (reach < 6) return;

    let frame = 0;
    let timer = 0;
    let stopped = false;
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      io.disconnect();
    };
    viewport.addEventListener('pointerdown', stop, { once: true });
    handle.addEventListener('keydown', stop, { once: true });

    const DURATION = 2200;
    const ease = (t) => 0.5 - Math.cos(Math.PI * t) / 2;
    const run = () => {
      const t0 = performance.now();
      const step = (now) => {
        if (stopped) return;
        const t = Math.min(1, (now - t0) / DURATION);
        // 0 → -reach → +reach → 0, eased per leg
        let offset;
        if (t < 0.25) offset = -reach * ease(t / 0.25);
        else if (t < 0.75) offset = -reach + 2 * reach * ease((t - 0.25) / 0.5);
        else offset = reach * (1 - ease((t - 0.75) / 0.25));
        setSplit(start + offset);
        if (t < 1) frame = requestAnimationFrame(step);
        else setSplit(start);
      };
      frame = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        // Let the image reveal finish first
        timer = setTimeout(run, root.closest('.sr-anim') ? 1400 : 500);
      },
      { threshold: 0.55 }
    );
    io.observe(viewport);
  }

  function boot() {
    document.querySelectorAll(ROOT).forEach(initRoot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('shopify:section:load', (event) => {
    const root = event.target.querySelector && event.target.querySelector(ROOT);
    if (root) {
      delete root.dataset.beforeAfterInit;
      initRoot(root);
    }
  });
})();
