/**
 * Countdown banner — <countdown-banner> (sections/countdown-banner.liquid)
 *
 * Counts down to data-end (ISO date with the store's timezone offset) once a second.
 * The server renders the starting values, so nothing jumps when the script loads.
 * When time is up, data-after-end decides: 'message' (swap the timer for the message),
 * 'hide' (hide the whole section) or 'zeros' (keep 00 : 00 : 00 : 00).
 */
(() => {
  if (customElements.get('countdown-banner')) return;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = (n) => (n > 99 ? String(n) : String(n).padStart(2, '0'));

  class CountdownBanner extends HTMLElement {
    connectedCallback() {
      this.initParallax();
      this.end = Date.parse(this.dataset.end || '');
      if (Number.isNaN(this.end)) return;
      this.nums = {};
      this.querySelectorAll('[data-cdb]').forEach((el) => (this.nums[el.dataset.cdb] = el));
      this.timer = this.querySelector('.cdb__timer');
      this.message = this.querySelector('[data-cdb-expired]');
      this.tick = this.tick.bind(this);
      this.tick();
      this.interval = setInterval(this.tick, 1000);
      // Catch up straight away when the tab comes back into view
      this.onVisible = () => !document.hidden && this.tick();
      document.addEventListener('visibilitychange', this.onVisible);
    }

    disconnectedCallback() {
      this.parallaxIo?.disconnect();
      if (this.onParallax) {
        window.removeEventListener('scroll', this.onParallax);
        window.removeEventListener('resize', this.onParallax);
      }
      clearInterval(this.interval);
      document.removeEventListener('visibilitychange', this.onVisible);
    }

    /**
     * Scroll parallax, like the FAQ gallery: each image slides inside its frame as the section passes
     * through the screen — left images one way, right images the other (collage cards alternate).
     */
    initParallax() {
      const intensity = parseFloat(getComputedStyle(this).getPropertyValue('--cdb-parallax')) || 0;
      if (intensity <= 0 || reduced()) return;
      this.cards = Array.from(this.querySelectorAll('.cdb__card')).map((card) => {
        const left = card.closest('.cdb__media--left');
        const second = card.classList.contains('cdb__card--2');
        return { card, dir: (left ? -1 : 1) * (second ? -1 : 1) };
      });
      if (!this.cards.length) return;
      this.classList.add('cdb--parallax');
      this.intensity = intensity;
      this.onParallax = () => {
        if (this.parallaxFrame) return;
        this.parallaxFrame = requestAnimationFrame(() => {
          this.parallaxFrame = null;
          const vh = window.innerHeight || 1;
          this.cards.forEach(({ card, dir }) => {
            const rect = card.getBoundingClientRect();
            if (!rect.height) return;
            const normalized = Math.max(-1, Math.min(1, (rect.top + rect.height / 2 - vh / 2) / (vh * 0.65)));
            // keep within the 10% overflow above/below the frame so no edge ever shows
            const limit = Math.min(this.intensity, rect.height * 0.1);
            card.style.setProperty('--cdb-py', `${(normalized * limit * dir).toFixed(1)}px`);
          });
        });
      };
      this.parallaxIo = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            window.addEventListener('scroll', this.onParallax, { passive: true });
            window.addEventListener('resize', this.onParallax, { passive: true });
            this.onParallax();
          } else {
            window.removeEventListener('scroll', this.onParallax);
            window.removeEventListener('resize', this.onParallax);
          }
        },
        { rootMargin: '25% 0px' }
      );
      this.parallaxIo.observe(this);
      this.onParallax();
    }

    tick() {
      const left = Math.max(0, Math.floor((this.end - Date.now()) / 1000));
      const values = {
        days: Math.floor(left / 86400),
        hours: Math.floor((left % 86400) / 3600),
        minutes: Math.floor((left % 3600) / 60),
        seconds: left % 60,
      };
      Object.entries(values).forEach(([unit, value]) => {
        const el = this.nums[unit];
        if (!el) return;
        const next = pad(value);
        if (el.textContent === next) return;
        el.textContent = next;
        if (!reduced()) {
          el.classList.remove('is-tick');
          void el.offsetWidth; // restart the animation
          el.classList.add('is-tick');
        }
      });
      if (left === 0) this.finish();
    }

    finish() {
      clearInterval(this.interval);
      this.classList.add('is-expired');
      const action = this.dataset.afterEnd;
      if (action === 'hide' && !(window.Shopify && window.Shopify.designMode)) {
        const section = this.closest('.shopify-section');
        (section || this).hidden = true;
      } else if (action === 'message' && this.message) {
        if (this.timer) this.timer.hidden = true;
        this.message.hidden = false;
      }
    }
  }

  customElements.define('countdown-banner', CountdownBanner);
})();
