/**
 * Product page extras for the ported Selliro sections (sections/pdp-routine.liquid, product-story.liquid …)
 *  - [data-pdp-add]      one-tap add to cart; announces it with "cart:update", which assets/cart.js turns into
 *                        a Whispo cart update (header count and cart drawer)
 *  - <pdp-routine>       routine steps carousel: centre card active, arrows + dots
 *  - <pdp-routine-stepper> routine "step by step guide": photo stage + numbered steps, auto-advance
 *  - <pdp-pair-carousel> "Pair it with" when it has 3+ products: swipe / arrows / dots, one card per view
 */
(() => {
  if (window.__pdpInit) return;
  window.__pdpInit = true;

  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- quick add */
  const cartAddUrl = () => (window.Theme && window.Theme.routes && window.Theme.routes.cart_add_url) || '/cart/add.js';

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pdp-add]');
    if (!button || button.disabled) return;
    event.preventDefault();

    const body = new FormData();
    body.append('id', button.dataset.variantId);
    body.append('quantity', '1');
    const sections = Array.from(document.querySelectorAll('cart-items-component'))
      .map((node) => node.dataset.sectionId)
      .filter(Boolean);
    if (sections.length) body.append('sections', sections.join(','));

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    fetch(cartAddUrl(), { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html' }, body })
      .then((response) => response.json())
      .then((json) => {
        if (json.status) {
          document.dispatchEvent(
            new CustomEvent('cart:error', { bubbles: true, detail: { sourceId: 'pdp-add', data: { message: json.message, description: json.description } } })
          );
          return;
        }
        button.classList.add('is-added');
        setTimeout(() => button.classList.remove('is-added'), 1800);
        document.dispatchEvent(
          new CustomEvent('cart:update', {
            bubbles: true,
            detail: {
              resource: {},
              sourceId: String(button.dataset.variantId),
              data: { source: 'product-form-component', itemCount: 1, productId: button.dataset.productId, sections: json.sections },
            },
          })
        );
      })
      .catch((error) => console.error(error))
      .finally(() => {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      });
  });

  /* ---------------------------------------------------------------- sticky add to cart */
  if (!customElements.get('pdp-routine')) {
    class PdpRoutine extends HTMLElement {
      connectedCallback() {
        this.track = this.querySelector('[data-pdp-routine-track]');
        this.cards = Array.from(this.querySelectorAll('[data-pdp-routine-card]'));
        this.dots = Array.from(this.querySelectorAll('[data-pdp-routine-dot]'));
        if (!this.track || !this.cards.length) return;

        this.querySelector('[data-pdp-routine-prev]')?.addEventListener('click', () => this.go(this.active - 1));
        this.querySelector('[data-pdp-routine-next]')?.addEventListener('click', () => this.go(this.active + 1));
        this.dots.forEach((dot, i) => dot.addEventListener('click', () => this.go(i)));
        this.cards.forEach((card, i) => card.addEventListener('click', () => i !== this.active && this.go(i)));

        this.onScroll = () => {
          if (this.frame) return;
          this.frame = requestAnimationFrame(() => {
            this.frame = null;
            const mid = this.track.getBoundingClientRect().left + this.track.clientWidth / 2;
            let best = 0;
            let bestDist = Infinity;
            this.cards.forEach((card, i) => {
              const r = card.getBoundingClientRect();
              const d = Math.abs(r.left + r.width / 2 - mid);
              if (d < bestDist) {
                bestDist = d;
                best = i;
              }
            });
            this.setActive(best);
          });
        };
        this.track.addEventListener('scroll', this.onScroll, { passive: true });
        window.addEventListener('resize', this.onScroll, { passive: true });

        const start = Math.min(this.cards.length - 1, Math.max(0, parseInt(this.dataset.start || '0', 10)));
        requestAnimationFrame(() => this.go(start, true));
      }

      disconnectedCallback() {
        window.removeEventListener('resize', this.onScroll);
      }

      setActive(i) {
        if (i === this.active) return;
        this.active = i;
        this.cards.forEach((card, k) => {
          card.classList.toggle('is-active', k === i);
          card.setAttribute('aria-current', k === i ? 'true' : 'false');
        });
        this.dots.forEach((dot, k) => dot.setAttribute('aria-current', k === i ? 'true' : 'false'));
        const prev = this.querySelector('[data-pdp-routine-prev]');
        const next = this.querySelector('[data-pdp-routine-next]');
        if (prev) prev.disabled = i <= 0;
        if (next) next.disabled = i >= this.cards.length - 1;
      }

      go(i, instant) {
        const index = Math.max(0, Math.min(this.cards.length - 1, i));
        const card = this.cards[index];
        const left = card.offsetLeft - (this.track.clientWidth - card.offsetWidth) / 2;
        this.track.scrollTo({ left, behavior: instant || reduced() ? 'auto' : 'smooth' });
        this.setActive(index);
      }
    }
    customElements.define('pdp-routine', PdpRoutine);
  }

  /* ---------------------------------------------------------------- routine: step by step guide */
  if (!customElements.get('pdp-routine-stepper')) {
    class PdpRoutineStepper extends HTMLElement {
      connectedCallback() {
        this.steps = Array.from(this.querySelectorAll('[data-rs-step]'));
        this.triggers = this.steps.map((step) => step.querySelector('[data-rs-trigger]'));
        this.panels = this.steps.map((step) => step.querySelector('.pdp-rs__panel'));
        this.frames = Array.from(this.querySelectorAll('[data-rs-frame]'));
        this.bars = Array.from(this.querySelectorAll('[data-rs-bar]'));
        this.current = this.querySelector('[data-rs-current]');
        this.stage = this.querySelector('[data-rs-stage]');
        if (!this.steps.length) return;

        this.speed = Math.max(2000, parseInt(this.dataset.speed || '6000', 10));
        this.active = -1;
        this.paused = new Set();

        this.triggers.forEach((trigger, i) => {
          trigger?.addEventListener('click', () => this.go(i, true));
          trigger?.addEventListener('keydown', (event) => {
            const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
            if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              const to = event.key === 'Home' ? 0 : this.steps.length - 1;
              this.go(to, true);
              this.triggers[to]?.focus();
              return;
            }
            if (!(event.key in keys)) return;
            event.preventDefault();
            const to = (i + keys[event.key] + this.steps.length) % this.steps.length;
            this.go(to, true);
            this.triggers[to]?.focus();
          });
        });
        this.querySelector('[data-rs-prev]')?.addEventListener('click', () => this.step(-1, true));
        this.querySelector('[data-rs-next]')?.addEventListener('click', () => this.step(1, true));

        // Swipe the photo to change step
        if (this.stage) {
          let startX = 0;
          let startY = 0;
          let tracking = false;
          this.stage.addEventListener('pointerdown', (event) => {
            if (event.target.closest('button')) return;
            tracking = true;
            startX = event.clientX;
            startY = event.clientY;
          });
          this.stage.addEventListener('pointerup', (event) => {
            if (!tracking) return;
            tracking = false;
            const dx = event.clientX - startX;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(event.clientY - startY)) this.step(dx < 0 ? 1 : -1, true);
          });
          this.stage.addEventListener('pointercancel', () => (tracking = false));
        }

        // Auto-advance: pauses on hover, focus, off-screen or hidden tab; stops after the shopper picks a step
        this.autoplay = this.dataset.autoplay === 'true' && !reduced() && this.steps.length > 1;
        if (this.autoplay) {
          this.classList.add('is-playing');
          this.addEventListener('pointerenter', () => this.pause('hover'));
          this.addEventListener('pointerleave', () => this.resume('hover'));
          this.addEventListener('focusin', () => this.pause('focus'));
          this.addEventListener('focusout', (event) => {
            if (!this.contains(/** @type {Node} */ (event.relatedTarget))) this.resume('focus');
          });
          this.onVisibility = () => (document.hidden ? this.pause('tab') : this.resume('tab'));
          document.addEventListener('visibilitychange', this.onVisibility);
          this.pause('view');
          this.observer = new IntersectionObserver(
            ([entry]) => (entry.isIntersecting ? this.resume('view') : this.pause('view')),
            { threshold: 0.35 }
          );
          this.observer.observe(this);
        }

        // Theme editor: selecting a step block opens it
        this.onBlockSelect = (event) => {
          const index = this.steps.findIndex((step) => step.contains(event.target) || step === event.target);
          if (index >= 0) this.go(index, true);
        };
        document.addEventListener('shopify:block:select', this.onBlockSelect);

        const start = Math.min(this.steps.length - 1, Math.max(0, parseInt(this.dataset.start || '0', 10)));
        this.go(start, false, true);

        // Keep the section the same height whichever step is open (no jumping when steps change)
        this.list = this.querySelector('.pdp-rs__steps');
        this.reserve = () => {
          if (!this.list) return;
          let collapsed = 0;
          let tallest = 0;
          this.steps.forEach((step, k) => {
            const panel = this.panels[k];
            const inner = panel?.firstElementChild;
            collapsed += step.offsetHeight - (panel ? panel.offsetHeight : 0);
            if (inner) tallest = Math.max(tallest, inner.scrollHeight + (k === this.active ? 0 : 20));
          });
          const gap = parseFloat(getComputedStyle(this.list).rowGap) || 0;
          const total = Math.ceil(collapsed + tallest + gap * (this.steps.length - 1));
          if (this.list.style.minHeight !== `${total}px`) this.list.style.minHeight = `${total}px`;
        };
        this.lastWidth = 0;
        this.sizer = new ResizeObserver(() => {
          if (this.offsetWidth === this.lastWidth) return;
          this.lastWidth = this.offsetWidth;
          this.list.style.minHeight = '';
          requestAnimationFrame(this.reserve);
        });
        this.sizer.observe(this);
        document.fonts?.ready.then(() => requestAnimationFrame(this.reserve));

        // Load every step photo once the section is close, so any step opens instantly
        this.loader = new IntersectionObserver(
          ([entry]) => {
            if (!entry.isIntersecting) return;
            this.frames.forEach((frame) => frame.querySelector('img')?.setAttribute('loading', 'eager'));
            this.loader?.disconnect();
          },
          { rootMargin: '400px 0px' }
        );
        this.loader.observe(this);
      }

      disconnectedCallback() {
        clearTimeout(this.timer);
        this.observer?.disconnect();
        this.loader?.disconnect();
        this.sizer?.disconnect();
        if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
        if (this.onBlockSelect) document.removeEventListener('shopify:block:select', this.onBlockSelect);
      }

      step(delta, user) {
        this.go((this.active + delta + this.steps.length) % this.steps.length, user);
      }

      go(index, user, initial) {
        if (user) this.stopAutoplay();
        const changed = index !== this.active;
        this.active = index;

        this.steps.forEach((step, k) => {
          step.classList.toggle('is-active', k === index);
          step.classList.toggle('is-done', k < index);
          this.triggers[k]?.setAttribute('aria-expanded', String(k === index));
          if (this.panels[k]) this.panels[k].inert = k !== index;
        });
        this.frames.forEach((frame, k) => {
          frame.classList.toggle('is-active', k === index);
          if (k === index) frame.removeAttribute('aria-hidden');
          else frame.setAttribute('aria-hidden', 'true');
          // Load the next photo ahead of time
          if (k === (index + 1) % this.frames.length) frame.querySelector('img')?.setAttribute('loading', 'eager');
        });
        this.bars.forEach((bar, k) => {
          bar.classList.toggle('is-done', k < index);
          bar.classList.remove('is-active');
        });
        if (this.bars[index]) {
          void this.bars[index].offsetWidth; // restart the fill animation
          this.bars[index].classList.add('is-active');
        }
        if (this.current) this.current.textContent = String(index + 1);
        if (changed || initial) this.schedule(this.speed);
      }

      stopAutoplay() {
        if (!this.autoplay) return;
        this.autoplay = false;
        clearTimeout(this.timer);
        this.classList.remove('is-playing', 'is-paused');
      }

      schedule(ms) {
        clearTimeout(this.timer);
        if (!this.autoplay) return;
        this.remaining = ms;
        this.startedAt = performance.now();
        if (this.paused.size) return;
        this.timer = setTimeout(() => this.step(1, false), ms);
      }

      pause(reason) {
        if (!this.autoplay) return;
        const wasRunning = this.paused.size === 0;
        this.paused.add(reason);
        this.classList.add('is-paused');
        if (wasRunning) {
          clearTimeout(this.timer);
          this.remaining = Math.max(400, this.remaining - (performance.now() - this.startedAt));
        }
      }

      resume(reason) {
        if (!this.autoplay || !this.paused.has(reason)) return;
        this.paused.delete(reason);
        if (this.paused.size) return;
        this.classList.remove('is-paused');
        this.startedAt = performance.now();
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.step(1, false), this.remaining);
      }
    }
    customElements.define('pdp-routine-stepper', PdpRoutineStepper);
  }

  /* ------------------------------------------------------- pair it with carousel */
  if (!customElements.get('pdp-pair-carousel')) {
    class PdpPairCarousel extends HTMLElement {
      connectedCallback() {
        this.track = /** @type {HTMLElement | null} */ (this.querySelector('[data-pair-track]'));
        if (!this.track) return;
        this.prev = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-pair-prev]'));
        this.next = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-pair-next]'));
        this.dots = /** @type {HTMLElement[]} */ (Array.from(this.querySelectorAll('[data-pair-dot]')));

        this.onScroll = () => {
          if (!this.frame) this.frame = requestAnimationFrame(() => this.update());
        };
        this.onClick = (/** @type {MouseEvent} */ event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (!target) return;
          if (target.closest('[data-pair-prev]')) this.go(this.index() - 1);
          else if (target.closest('[data-pair-next]')) this.go(this.index() + 1);
          else {
            const dot = /** @type {HTMLElement | null} */ (target.closest('[data-pair-dot]'));
            if (dot) this.go(Number(dot.dataset.pairDot));
          }
        };
        this.onKey = (/** @type {KeyboardEvent} */ event) => {
          if (event.target !== this.track) return;
          if (event.key === 'ArrowRight') this.go(this.index() + 1);
          else if (event.key === 'ArrowLeft') this.go(this.index() - 1);
          else return;
          event.preventDefault();
        };

        this.track.addEventListener('scroll', this.onScroll, { passive: true });
        this.addEventListener('click', this.onClick);
        this.addEventListener('keydown', this.onKey);
        this.resizer = new ResizeObserver(() => this.update());
        this.resizer.observe(this.track);
        this.update();
      }

      disconnectedCallback() {
        this.track?.removeEventListener('scroll', this.onScroll);
        this.removeEventListener('click', this.onClick);
        this.removeEventListener('keydown', this.onKey);
        this.resizer?.disconnect();
      }

      /** Distance from one card to the next (card width + gap) */
      stepSize() {
        const items = this.track ? this.track.children : null;
        if (!items || items.length < 2) return this.track ? this.track.clientWidth : 1;
        return Math.max(1, /** @type {HTMLElement} */ (items[1]).offsetLeft - /** @type {HTMLElement} */ (items[0]).offsetLeft);
      }

      index() {
        if (!this.track) return 0;
        const max = this.track.scrollWidth - this.track.clientWidth;
        // at the very end the last card counts as current even if it can't snap to the start
        if (this.track.scrollLeft >= max - 2) return (this.dots || []).length - 1;
        return Math.round(this.track.scrollLeft / this.stepSize());
      }

      /** @param {number} i */
      go(i) {
        if (!this.track) return;
        const count = this.track.children.length;
        const target = Math.max(0, Math.min(count - 1, i));
        this.track.scrollTo({ left: target * this.stepSize(), behavior: reduced() ? 'auto' : 'smooth' });
      }

      update() {
        this.frame = 0;
        if (!this.track) return;
        const max = this.track.scrollWidth - this.track.clientWidth;
        // everything fits (wide column): hide the arrows and dots
        this.classList.toggle('is-static', max <= 2);
        const current = this.index();
        if (this.prev) this.prev.disabled = this.track.scrollLeft <= 2;
        if (this.next) this.next.disabled = this.track.scrollLeft >= max - 2;
        (this.dots || []).forEach((dot, i) => dot.classList.toggle('is-active', i === current));
      }
    }
    customElements.define('pdp-pair-carousel', PdpPairCarousel);
  }
})();

