/**
 * Ticker Duo — two marquee rows moving in opposite directions.
 *
 * Idle: each row moves at its own base speed (block "Speed" setting).
 * Scrolling (down or up): rows speed up in proportion to how fast the page scrolls,
 * then ease smoothly back to the base speed once scrolling stops.
 * Optional "reverse on scroll up" flips direction while scrolling up.
 *
 * Settings come from data attributes on <ticker-duo>:
 *   data-scroll-boost="true|false"
 *   data-boost-strength="1..10"       → maximum extra speed while scrolling
 *   data-scroll-up="faster|reverse"
 * and on each .ticker-duo__track:
 *   data-speed="<seconds>"            → seconds for 4 text groups to pass (lower = faster)
 */
(() => {
  if (customElements.get('ticker-duo')) return;

  const MAX_CLONE_ROUNDS = 12;
  /** Scroll speed (px/s) that reaches the full boost. A brisk wheel/trackpad scroll is ~1500–3000px/s. */
  const FULL_BOOST_SCROLL_SPEED = 2200;
  /** Seconds for the boost to build up / fall back. */
  const ATTACK = 0.12;
  const RELEASE = 0.55;
  /** How fast the scroll impulse fades when scroll events stop arriving. */
  const IMPULSE_DECAY = 0.12;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  class TickerDuo extends HTMLElement {
    connectedCallback() {
      this.tracks = Array.from(this.querySelectorAll('.ticker-duo__track'));
      if (!this.tracks.length || reducedMotion.matches) return;

      this.boostEnabled = this.dataset.scrollBoost !== 'false';
      const strength = Math.min(10, Math.max(1, parseFloat(this.dataset.boostStrength || '5')));
      this.maxExtra = strength * 0.7; // strength 5 → up to 4.5× base speed
      this.reverseOnUp = this.dataset.scrollUp === 'reverse';

      this.positions = this.tracks.map(() => 0);
      this.mult = 1; // current speed multiplier (signed when reversing)
      this.impulse = 0; // 0..1 scroll intensity
      this.scrollSign = 1;
      this.lastScrollY = window.scrollY;
      this.lastScrollT = performance.now();
      this.lastFrameT = 0;
      this.rafId = null;
      this.isVisible = false;

      this.tick = this.tick.bind(this);
      this.onScroll = this.onScroll.bind(this);
      this.onResize = this.onResize.bind(this);

      this.measure();

      if (this.boostEnabled) window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onResize, { passive: true });

      // Re-measure when fonts / icons finish loading and change the text width.
      this.resizeObserver = new ResizeObserver(() => this.measure());
      this.tracks.forEach((t) => {
        const first = t.querySelector('.ticker-duo__group');
        if (first) this.resizeObserver.observe(first);
      });

      // Only animate while on screen.
      this.observer = new IntersectionObserver(
        (entries) => {
          this.isVisible = entries.some((e) => e.isIntersecting);
          if (this.isVisible) this.start();
          else this.stop();
        },
        { rootMargin: '100px 0px' }
      );
      this.observer.observe(this);
    }

    disconnectedCallback() {
      window.removeEventListener('scroll', this.onScroll);
      window.removeEventListener('resize', this.onResize);
      this.observer?.disconnect();
      this.resizeObserver?.disconnect();
      clearTimeout(this.resizeTimer);
      this.stop();
    }

    /** Clone groups so every track is ≥ 2.5× the viewport, then cache loop widths and base speeds. */
    measure() {
      this.loopWidths = [];
      this.baseSpeeds = [];

      this.tracks.forEach((track, i) => {
        const groups = Array.from(track.querySelectorAll('.ticker-duo__group'));
        const originals = groups.slice(0, 8);
        if (!originals.length || track.scrollWidth === 0) {
          this.loopWidths[i] = 0;
          this.baseSpeeds[i] = 0;
          return;
        }

        groups.slice(1).forEach((g) => g.setAttribute('aria-hidden', 'true'));

        const minWidth = window.innerWidth * 2.5;
        let rounds = 0;
        while (track.scrollWidth < minWidth && rounds < MAX_CLONE_ROUNDS) {
          originals.forEach((g) => {
            const clone = g.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            track.appendChild(clone);
          });
          rounds++;
        }

        // Groups come in full rounds of 8, so half the track always ends on a group boundary.
        this.loopWidths[i] = track.scrollWidth / 2;

        const seconds = Math.max(4, parseFloat(track.dataset.speed || '28'));
        const groupWidth = originals[0].getBoundingClientRect().width || 300;
        this.baseSpeeds[i] = (groupWidth * 4) / seconds; // px per second
      });
    }

    onResize() {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => this.measure(), 150);
    }

    onScroll() {
      const now = performance.now();
      const y = window.scrollY;
      const dy = y - this.lastScrollY;
      const dt = Math.max(8, now - this.lastScrollT) / 1000;
      this.lastScrollY = y;
      this.lastScrollT = now;
      if (dy === 0) return;

      this.scrollSign = dy > 0 ? 1 : -1;
      const intensity = Math.min(1, Math.abs(dy) / dt / FULL_BOOST_SCROLL_SPEED);
      // Keep the strongest recent impulse so a single fast flick is felt.
      this.impulse = Math.max(this.impulse, intensity);
    }

    start() {
      if (this.rafId === null) {
        this.lastFrameT = 0;
        this.rafId = requestAnimationFrame(this.tick);
      }
    }

    stop() {
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    tick(now) {
      const dt = this.lastFrameT ? Math.min(0.05, (now - this.lastFrameT) / 1000) : 1 / 60;
      this.lastFrameT = now;

      // Target multiplier from the current scroll impulse.
      let target = 1 + this.impulse * this.maxExtra;
      if (this.reverseOnUp && this.scrollSign < 0 && this.impulse > 0.05) target = -target;

      // Ease toward the target: quick build-up, gentle settle back to normal.
      const rising = Math.abs(target) > Math.abs(this.mult) && Math.sign(target) === Math.sign(this.mult);
      const tau = rising ? ATTACK : RELEASE;
      this.mult += (target - this.mult) * (1 - Math.exp(-dt / tau));

      // Scroll impulse fades out when scrolling stops.
      this.impulse *= Math.exp(-dt / IMPULSE_DECAY);
      if (this.impulse < 0.001) this.impulse = 0;

      this.tracks.forEach((track, i) => {
        const half = this.loopWidths[i];
        if (!half) return;
        const dir = track.classList.contains('is-reverse') ? 1 : -1;
        let p = this.positions[i] + this.baseSpeeds[i] * this.mult * dir * dt;
        p %= half;
        if (p > 0) p -= half;
        this.positions[i] = p;
        track.style.transform = `translate3d(${p.toFixed(2)}px, 0, 0)`;
      });

      this.rafId = this.isVisible ? requestAnimationFrame(this.tick) : null;
    }
  }

  customElements.define('ticker-duo', TickerDuo);
})();
