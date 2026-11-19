import { Component } from '@theme/component';

/**
 * Announcement banner custom element that allows fading between content.
 * Based on the Slideshow component.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} slideshowContainer
 * @property {HTMLElement[]} [slides]
 * @property {HTMLButtonElement} [previous]
 * @property {HTMLButtonElement} [next]
 *
 * @extends {Component<Refs>}
 */
export class AnnouncementBar extends Component {
  #current = 0;

  /**
   * The interval ID for automatic playback.
   * @type {number|undefined}
   */
  #interval = undefined;

  /** @type {number | undefined} */
  #leavingTimer = undefined;

  connectedCallback() {
    super.connectedCallback();

    if (this.pauseOnHover) {
      this.addEventListener('mouseenter', this.suspend);
      this.addEventListener('mouseleave', this.resume);
    }
    document.addEventListener('visibilitychange', this.#handleVisibilityChange);

    // Swipe left / right on touch screens
    this.addEventListener('pointerdown', this.#handlePointerDown);
    this.addEventListener('pointerup', this.#handlePointerUp);

    this.play();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.suspend();
    clearTimeout(this.#leavingTimer);
    document.removeEventListener('visibilitychange', this.#handleVisibilityChange);
  }

  /** Pause while the pointer is over the bar (section setting "Pause on hover"). */
  get pauseOnHover() {
    return this.hasAttribute('pause-on-hover');
  }

  /** @type {{ x: number, y: number } | null} */
  #pointerStart = null;

  /** @param {PointerEvent} event */
  #handlePointerDown = (event) => {
    if (event.pointerType === 'mouse') return;
    this.#pointerStart = { x: event.clientX, y: event.clientY };
  };

  /** @param {PointerEvent} event */
  #handlePointerUp = (event) => {
    const start = this.#pointerStart;
    this.#pointerStart = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(event.clientY - start.y)) return;
    if (dx < 0) this.next();
    else this.previous();
    this.resume();
  };

  next() {
    this.current += 1;
  }

  previous() {
    this.current -= 1;
  }

  /**
   * Starts automatic slide playback.
   * @param {number} [interval] - The time interval in seconds between slides.
   */
  play(interval = this.autoplayInterval) {
    if (!this.autoplay) return;

    this.paused = false;

    this.#interval = setInterval(() => {
      if ((this.pauseOnHover && this.matches(':hover')) || document.hidden) return;

      this.next();
    }, interval);
  }

  /**
   * Pauses automatic slide playback.
   */
  pause() {
    this.paused = true;
    this.suspend();
  }

  get paused() {
    return this.hasAttribute('paused');
  }

  set paused(paused) {
    this.toggleAttribute('paused', paused);
  }

  /**
   * Suspends automatic slide playback.
   */
  suspend() {
    clearInterval(this.#interval);
    this.#interval = undefined;
  }

  /**
   * Resumes automatic slide playback if autoplay is enabled.
   */
  resume() {
    if (!this.autoplay || this.paused) return;

    this.pause();
    this.play();
  }

  get autoplay() {
    return Boolean(this.autoplayInterval);
  }

  get autoplayInterval() {
    const interval = this.getAttribute('autoplay');
    const value = parseInt(`${interval}`, 10);

    if (Number.isNaN(value)) return undefined;

    return value * 1000;
  }

  get current() {
    return this.#current;
  }

  set current(current) {
    const slides = this.refs.slides ?? [];
    // Which way the slides move (CSS: [data-direction]); set before the slides change so they start on the right side
    this.dataset.direction = current < this.#current ? 'prev' : 'next';
    void this.offsetWidth;
    this.#current = current;

    let relativeIndex = current % slides.length;
    if (relativeIndex < 0) {
      relativeIndex += slides.length;
    }

    slides.forEach((slide, index) => {
      const wasVisible = slide.getAttribute('aria-hidden') === 'false';
      const visible = index === relativeIndex;
      // The slide moving out animates to the other side (CSS: [data-leaving])
      if (wasVisible && !visible) slide.setAttribute('data-leaving', '');
      else slide.removeAttribute('data-leaving');
      slide.setAttribute('aria-hidden', `${!visible}`);
    });

    clearTimeout(this.#leavingTimer);
    this.#leavingTimer = window.setTimeout(() => {
      slides.forEach((slide) => slide.removeAttribute('data-leaving'));
    }, 700);
  }

  /**
   * Pause the slideshow when the page is hidden.
   */
  #handleVisibilityChange = () => (document.hidden ? this.pause() : this.resume());
}

if (!customElements.get('announcement-bar-component')) {
  customElements.define('announcement-bar-component', AnnouncementBar);
}
