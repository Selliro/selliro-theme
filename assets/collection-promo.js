/**
 * Collection promotion tiles — background video control.
 * Videos (Shopify upload, MP4 link, YouTube, Vimeo) load and play only while the tile is on
 * screen, stay muted and looped, and have a pause/play button (WCAG 2.2.2).
 * Visitors who prefer reduced motion see the poster image until they press play.
 */
(() => {
  if (window.__collectionPromoInit) return;
  window.__collectionPromoInit = true;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function postToIframe(iframe, action) {
    if (!iframe || !iframe.contentWindow || !iframe.src) return;
    const type = iframe.dataset.cpIframe;
    const message =
      type === 'youtube'
        ? { event: 'command', func: action === 'play' ? 'playVideo' : 'pauseVideo', args: [] }
        : { method: action === 'play' ? 'play' : 'pause' };
    iframe.contentWindow.postMessage(JSON.stringify(message), '*');
  }

  function setup(tile) {
    if (tile.dataset.cpReady) return;
    tile.dataset.cpReady = 'true';
    const video = tile.querySelector('.collection-promo__video');
    const iframe = tile.querySelector('.collection-promo__iframe');
    const toggle = tile.querySelector('[data-cp-toggle]');
    if (!video && !iframe) return;

    let userPaused = reducedMotion; // reduced motion: start paused until the visitor asks
    let loaded = false;

    const load = () => {
      if (loaded) return;
      loaded = true;
      if (video) {
        const source = video.querySelector('source[data-src]');
        if (source) {
          source.src = source.dataset.src;
          video.load();
        }
        video.addEventListener('playing', () => tile.classList.add('is-playing'));
      }
      if (iframe) {
        iframe.src = iframe.dataset.src;
        iframe.addEventListener('load', () => tile.classList.add('is-playing'), { once: true });
      }
    };

    const play = () => {
      load();
      if (video) video.play().catch(() => {});
      if (iframe) postToIframe(iframe, 'play');
    };

    const pause = () => {
      if (video) video.pause();
      if (iframe) postToIframe(iframe, 'pause');
    };

    const syncToggle = () => {
      if (!toggle) return;
      toggle.setAttribute('aria-pressed', String(userPaused));
      toggle.setAttribute('aria-label', userPaused ? toggle.dataset.labelPlay : toggle.dataset.labelPause);
      tile.classList.toggle('is-paused', userPaused);
    };

    toggle?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      userPaused = !userPaused;
      if (userPaused) pause();
      else play();
      syncToggle();
    });

    new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible && !userPaused) play();
        else if (!visible) pause();
      },
      { rootMargin: '200px 0px' }
    ).observe(tile);

    syncToggle();
  }

  const init = (root = document) => root.querySelectorAll('[data-cp-tile].collection-promo--video').forEach(setup);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();

  // Filtering / sorting / infinite scroll re-render the grid — pick up new tiles.
  new MutationObserver(() => init()).observe(document.body, { childList: true, subtree: true });
})();
