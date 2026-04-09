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
