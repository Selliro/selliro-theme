/**
 * Whispo announcement bar (sections/announcement-bar.liquid → <announcement-bar>).
 *
 * data-style="slideshow"
 *   One announcement at a time ([data-active] on the visible slide). Previous / next buttons move by one.
 *   With data-autoplay it advances every data-speed ms; hover, keyboard focus inside the bar and the
 *   pause button stop it. Visitors who prefer reduced motion start paused. While paused, slide changes
 *   are announced (aria-live="polite"); while playing they are not, so screen readers aren't interrupted.
 *
 * data-style="marquee"
 *   The CSS animation runs the line; this script only wires the pause button ([data-paused] on the bar).
 *
 * Theme editor: selecting an announcement block shows it and pauses; deselecting resumes.
 */
import { Component } from '@whispo/component';
import { prefersReducedMotion } from '@whispo/utilities';

class AnnouncementBar extends Component {
  #index = 0;

  /** @type {number | undefined} */
  #timer;

  /** paused by the pause button (or reduced motion); hover / focus pauses are temporary */
  #userPaused = false;

  #hovering = false;

  #focused = false;

  setup() {
    const { previous, next, pause } = this.refs;
    const slides = this.#slides();
    this.#index = Math.max(0, slides.findIndex((slide) => slide.hasAttribute('data-active')));

    if (pause) this.on('click', () => this.#setUserPaused(!this.#userPaused), { target: pause });

    if (this.dataset.style === 'marquee') {
      if (prefersReducedMotion()) this.#setUserPaused(true);
      return;
    }

    if (previous) this.on('click', () => this.go(this.#index - 1, true), { target: previous });
    if (next) this.on('click', () => this.go(this.#index + 1, true), { target: next });

    this.on('pointerenter', () => {
      this.#hovering = true;
      this.#sync();
    });
    this.on('pointerleave', () => {
      this.#hovering = false;
      this.#sync();
    });
    this.on('focusin', () => {
      this.#focused = true;
      this.#sync();
    });
    this.on('focusout', (event) => {
      if (event.relatedTarget instanceof Node && this.contains(event.relatedTarget)) return;
      this.#focused = false;
      this.#sync();
    });

    if (window.Shopify?.designMode) {
      this.on('shopify:block:select', (event) => {
        const index = slides.indexOf(/** @type {HTMLElement} */ (event.target));
        if (index < 0) return;
        this.#setUserPaused(true);
        this.go(index);
      }, { target: document });
      this.on('shopify:block:deselect', () => this.#setUserPaused(false), { target: document });
    }

    if (!this.hasAttribute('data-autoplay') || prefersReducedMotion()) this.#userPaused = true;
    this.#updatePauseButton();
    this.#sync();
  }

  teardown() {
    window.clearInterval(this.#timer);
  }

  /** @returns {HTMLElement[]} */
  #slides() {
    return this.refs.slide || [];
  }

  /**
   * @param {number} index
   * @param {boolean} [byUser] moved with the buttons: restart the timer
   */
  go(index, byUser = false) {
    const slides = this.#slides();
    if (!slides.length) return;
    const nextIndex = (index + slides.length) % slides.length;
    const current = slides[this.#index];
    const target = slides[nextIndex];
    const forward = index > this.#index;

    if (current && current !== target) {
      current.removeAttribute('data-active');
      current.dataset.leaving = forward ? 'up' : 'down';
      current.addEventListener('animationend', () => delete current.dataset.leaving, { once: true });
      window.setTimeout(() => delete current.dataset.leaving, 700);
    }
    target.dataset.direction = forward ? 'up' : 'down';
    target.toggleAttribute('data-active', true);
    this.#index = nextIndex;
    if (byUser) this.#sync(true);
  }

  /** @param {boolean} paused */
  #setUserPaused(paused) {
    this.#userPaused = paused;
    this.toggleAttribute('data-paused', paused);
    this.#updatePauseButton();
    this.#sync();
  }

  #updatePauseButton() {
    const { pause, pauseLabel } = this.refs;
    if (!pause) return;
    pause.setAttribute('aria-pressed', String(this.#userPaused));
    const label = this.#userPaused ? pause.dataset.labelPlay : pause.dataset.labelPause;
    if (pauseLabel && label) pauseLabel.textContent = label;
  }

  /** Start or stop the autoplay timer from the current state. @param {boolean} [restart] */
  #sync(restart = false) {
    if (this.dataset.style !== 'slideshow') return;
    const playing = this.hasAttribute('data-autoplay') && !this.#userPaused && !this.#hovering && !this.#focused;
    this.refs.track?.setAttribute('aria-live', playing ? 'off' : 'polite');

    if (!playing) {
      window.clearInterval(this.#timer);
      this.#timer = undefined;
      return;
    }
    if (this.#timer && !restart) return;
    window.clearInterval(this.#timer);
    const speed = Number(this.dataset.speed) || 5000;
    this.#timer = window.setInterval(() => this.go(this.#index + 1), speed);
  }
}

Component.define('announcement-bar', AnnouncementBar);
