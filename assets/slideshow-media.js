/**
 * Slideshow media (blocks/_slide.liquid + snippets/slide-media.liquid)
 *
 * - Only the showing slide's videos play; the others are paused (listens to Horizon's `slideshow:select`).
 * - MP4 links and YouTube / Vimeo embeds load the first time their slide is shown (or the one after it).
 * - Everything pauses while the slideshow is off screen.
 * - Each video slide has a pause / play button; a visitor's pause sticks until they press play.
 * - Reduced motion: videos stay paused on their cover image until play is pressed.
 */
(() => {
  if (window.__slideshowMediaInit) return;
  window.__slideshowMediaInit = true;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const post = (iframe, kind, play) => {
    if (!iframe.contentWindow || !iframe.src) return;
    const msg =
      kind === 'youtube'
        ? { event: 'command', func: play ? 'playVideo' : 'pauseVideo', args: [] }
        : { method: play ? 'play' : 'pause' };
    iframe.contentWindow.postMessage(JSON.stringify(msg), '*');
  };

  /** Load the media of a slide (sets src on MP4 sources / iframes once). */
  const load = (slide) => {
    if (!slide || slide.dataset.mediaLoaded) return;
    slide.dataset.mediaLoaded = 'true';
    slide.querySelectorAll('video source[data-src]').forEach((source) => {
      source.src = source.dataset.src;
      source.removeAttribute('data-src');
      source.parentElement.load();
    });
    slide.querySelectorAll('iframe[data-src]').forEach((iframe) => {
      if (reduced()) {
        // Swap autoplay off so the embed waits on its cover until play is pressed
        iframe.dataset.src = iframe.dataset.src.replace('autoplay=1', 'autoplay=0');
      }
      iframe.addEventListener(
        'load',
        () => {
          const pane = iframe.closest('.slide__media');
          if (pane && slide.dataset.mediaState === 'playing') pane.classList.add('is-playing');
          // Background video: no captions overlay
          if (iframe.dataset.slideIframe === 'youtube') {
            iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unloadModule', args: ['captions'] }), '*');
          }
        },
        { once: true }
      );
      iframe.src = iframe.dataset.src;
      iframe.removeAttribute('data-src');
    });
  };

  const setSlidePlaying = (slide, play) => {
    if (!slide) return;
    slide.dataset.mediaState = play ? 'playing' : 'paused';
    slide.querySelectorAll('.slide__media').forEach((pane) => {
      const video = pane.querySelector('video');
      const iframe = pane.querySelector('iframe');
      if (video) {
        if (play) video.play()?.catch(() => {});
        else video.pause();
      }
      if (iframe) {
        if (iframe.src) post(iframe, iframe.dataset.slideIframe, play);
        if (iframe.src) pane.classList.toggle('is-playing', play);
      }
    });
    const toggle = slide.querySelector('[data-slide-toggle]');
    if (toggle) {
      const paused = !play;
      toggle.setAttribute('aria-pressed', String(paused));
      toggle.setAttribute('aria-label', paused ? toggle.dataset.labelPlay : toggle.dataset.labelPause);
    }
  };

  class SlideshowMedia {
    constructor(root) {
      this.root = root;
      this.component = root.querySelector('slideshow-component');
      this.slides = Array.from(root.querySelectorAll('slideshow-slide'));
      this.visible = false;
      if (!this.slides.some((s) => s.querySelector('.slide__media video, .slide__media iframe'))) return;

      root.addEventListener('slideshow:select', () => this.sync());
      root.addEventListener('click', (event) => {
        const toggle = event.target instanceof Element && event.target.closest('[data-slide-toggle]');
        if (!toggle) return;
        const slide = toggle.closest('slideshow-slide');
        const nowPaused = toggle.getAttribute('aria-pressed') !== 'true';
        slide.dataset.userPaused = String(nowPaused);
        load(slide);
        setSlidePlaying(slide, !nowPaused);
      });
      // aria-hidden also flips while swiping/scrolling the slides
      this.mo = new MutationObserver(() => this.sync());
      this.slides.forEach((s) => this.mo.observe(s, { attributes: true, attributeFilter: ['aria-hidden'] }));

      this.io = new IntersectionObserver(
        (entries) => {
          this.visible = entries.some((e) => e.isIntersecting);
          this.sync();
        },
        { threshold: 0.2 }
      );
      this.io.observe(root);
      document.addEventListener('visibilitychange', () => this.sync());
    }

    active() {
      return this.slides.find((s) => s.getAttribute('aria-hidden') === 'false') || this.slides[0];
    }

    sync() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        const current = this.active();
        const index = this.slides.indexOf(current);
        if (this.visible) {
          load(current);
          load(this.slides[index + 1]); // warm up the next slide
        }
        this.slides.forEach((slide) => {
          const shouldPlay =
            slide === current && this.visible && !document.hidden && slide.dataset.userPaused !== 'true' && !(reduced() && slide.dataset.userPaused !== 'false');
          if (slide.dataset.mediaLoaded || !shouldPlay) setSlidePlaying(slide, shouldPlay);
        });
      });
    }
  }

  const init = (scope = document) =>
    scope.querySelectorAll('[data-slideshow-media]:not([data-slideshow-media-ready])').forEach((root) => {
      root.setAttribute('data-slideshow-media-ready', '');
      new SlideshowMedia(root);
    });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
  document.addEventListener('shopify:section:load', (e) => init(e.target));
})();
