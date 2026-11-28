/**
 * Whispo slideshow (sections/slideshow.liquid → <slideshow-component>).
 *
 *   - One slide visible at a time ([data-active]); previous / next, the progress bars and swipes change it.
 *   - Autoplay (data-autoplay, every data-speed ms) starts once the shopper scrolls, moves the pointer or presses
 *     a key, so the first slide stays the page's main (LCP) image; the active bar fills over that time.
 *     Pauses while hovered or focused and with the pause button; reduced motion starts paused. While paused,
 *     slide changes are announced (aria-live="polite").
 *   - Videos play only on the visible slide.
 *   - Theme editor: selecting a slide block shows it and pauses; deselecting resumes.
 */
import { Component } from '@whispo/component';
import { prefersReducedMotion } from '@whispo/utilities';

class SlideshowComponent extends Component {
  #index = 0;

  /** @type {number | undefined} */
  #timer;

  #userPaused = false;

  #holding = false;

  /** @type {number | null} */
  #touchX = null;

  setup() {
    const { previous, next, pause, track } = this.refs;
    this.#index = Math.max(0, this.#slides().findIndex((slide) => slide.hasAttribute('data-active')));

    if (previous) this.on('click', () => this.go(this.#index - 1, true), { target: previous });
    if (next) this.on('click', () => this.go(this.#index + 1, true), { target: next });
    this.on('click', '[data-ref="bar[]"]', (_event, bar) => this.go(Number(/** @type {HTMLElement} */ (bar).dataset.index), true));
    if (pause) this.on('click', () => this.#setPaused(!this.#userPaused), { target: pause });

    const hold = (/** @type {boolean} */ on) => () => {
      this.#holding = on;
      this.#sync();
    };
    this.on('pointerenter', hold(true));
    this.on('pointerleave', hold(false));
    this.on('focusin', hold(true));
    this.on('focusout', (event) => {
      if (event.relatedTarget instanceof Node && this.contains(event.relatedTarget)) return;
      this.#holding = false;
      this.#sync();
    });

    // Swipe on touch screens
    if (track) {
      this.on('touchstart', (event) => (this.#touchX = event.touches[0].clientX), { target: track, passive: true });
      this.on('touchend', (event) => {
        if (this.#touchX === null) return;
        const delta = event.changedTouches[0].clientX - this.#touchX;
        this.#touchX = null;
        if (Math.abs(delta) > 50) this.go(this.#index + (delta < 0 ? 1 : -1), true);
      }, { target: track });
    }

    if (window.Shopify?.designMode) {
      this.on('shopify:block:select', (event) => {
        const index = this.#slides().indexOf(/** @type {HTMLElement} */ (event.target));
        if (index < 0) return;
        this.#setPaused(true);
        this.go(index);
      }, { target: document });
      this.on('shopify:block:deselect', () => this.#setPaused(false), { target: document });
    }

    if (!this.hasAttribute('data-autoplay') || prefersReducedMotion()) this.#userPaused = true;
    this.#updatePauseButton();
    this.#playVideos();

    // Autoplay starts once the shopper engages with the page (scroll, pointer, key), so the first slide stays
    // the page's main image while it loads. In the theme editor it starts right away.
    if (window.Shopify?.designMode) {
      this.#engaged = true;
    } else {
      const engage = () => {
        if (this.#engaged) return;
        this.#engaged = true;
        this.#sync(true);
      };
      for (const type of ['scroll', 'pointermove', 'pointerdown', 'keydown', 'touchstart']) {
        this.on(type, engage, { target: window, passive: true, once: true });
      }
    }
    this.#sync();
  }

  #engaged = false;

  teardown() {
    window.clearTimeout(this.#timer);
  }

  /** @returns {HTMLElement[]} */
  #slides() {
    return this.refs.slide || [];
  }

  /**
   * @param {number} index
   * @param {boolean} [byUser]
   */
  go(index, byUser = false) {
    const slides = this.#slides();
    if (slides.length < 2) return;
    const target = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.toggleAttribute('data-active', i === target));
    (this.refs.bar || []).forEach((/** @type {HTMLElement} */ bar, /** @type {number} */ i) => {
      if (i === target) bar.setAttribute('aria-current', 'true');
      else bar.removeAttribute('aria-current');
    });
    this.#index = target;
    this.#playVideos();
    this.#sync(true);
    if (byUser) this.refs.track?.setAttribute('aria-live', 'polite');
  }

  #playVideos() {
    this.#slides().forEach((slide, i) => {
      slide.querySelectorAll('video').forEach((video) => {
        if (i === this.#index && !prefersReducedMotion()) video.play().catch(() => {});
        else video.pause();
      });
    });
  }

  /** @param {boolean} paused */
  #setPaused(paused) {
    this.#userPaused = paused;
    this.#updatePauseButton();
    this.#sync(true);
  }

  #updatePauseButton() {
    const { pause, pauseLabel } = this.refs;
    if (!pause) return;
    pause.setAttribute('aria-pressed', String(this.#userPaused));
    const label = this.#userPaused ? pause.dataset.labelPlay : pause.dataset.labelPause;
    if (pauseLabel && label) pauseLabel.textContent = label;
  }

  /** @param {boolean} [restart] */
  #sync(restart = false) {
    const playing = this.hasAttribute('data-autoplay') && this.#engaged && !this.#userPaused && !this.#holding;
    this.toggleAttribute('data-playing', playing);
    this.refs.track?.setAttribute('aria-live', playing ? 'off' : 'polite');
    if (!playing) {
      window.clearTimeout(this.#timer);
      this.#timer = undefined;
      return;
    }
    if (this.#timer && !restart) return;
    window.clearTimeout(this.#timer);
    // Restart the bar animation
    const bar = (this.refs.bar || [])[this.#index];
    if (bar) {
      bar.removeAttribute('data-filling');
      void bar.offsetWidth;
      bar.setAttribute('data-filling', '');
    }
    this.#timer = window.setTimeout(() => this.go(this.#index + 1), Number(this.dataset.speed) || 6000);
  }
}

Component.define('slideshow-component', SlideshowComponent);
