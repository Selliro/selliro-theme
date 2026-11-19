/**
 * Product story — <product-story> (sections/product-story.liquid)
 *
 * Desktop: the image column is sticky; whichever step crosses the middle of the screen becomes active.
 * Its image wipes / fades in (images of earlier steps stay underneath, so scrolling back reverses it),
 * the numbered rail highlights the step and fills with overall progress, and the HUD shows "02 / 04".
 * Mobile: each step shows its own image inline, so this only toggles the active classes.
 * Theme editor: selecting a step block scrolls to it and activates it.
 */
(() => {
  if (customElements.get('product-story')) return;

  const pad = (n) => String(n).padStart(2, '0');

  class ProductStory extends HTMLElement {
    connectedCallback() {
      this.steps = Array.from(this.querySelectorAll('[data-pstory-step]'));
      this.slides = Array.from(this.querySelectorAll('[data-pstory-slide]'));
      this.dots = Array.from(this.querySelectorAll('[data-pstory-dot]'));
      this.fill = this.querySelector('[data-pstory-fill]');
      this.current = this.querySelector('[data-pstory-current]');
      this.label = this.querySelector('[data-pstory-label]');
      this.labels = this.steps.map((step) => step.querySelector('.pstory__step-label span:not(.pstory__step-num)')?.textContent.trim() || '');
      if (!this.steps.length) return;

      this.slides.forEach((slide, i) => slide.style.setProperty('--z', String(i + 1)));

      // Clipped-away slides never count as "visible", so lazy images would only start loading as they
      // wipe in (showing the previous image instead). Load them all once the section gets close.
      this.preload = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          this.preload.disconnect();
          this.querySelectorAll('.pstory__slide img[loading="lazy"]').forEach((img) => (img.loading = 'eager'));
        },
        { rootMargin: '1200px 0px' }
      );
      this.preload.observe(this);
      this.active = -1;
      this.setActive(0);
      this.setAttribute('data-ready', '');

      // A step is "active" while it crosses a thin band in the middle of the viewport
      this.io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) this.setActive(this.steps.indexOf(entry.target));
          });
        },
        { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
      );
      this.steps.forEach((step) => this.io.observe(step));

      this.onScroll = () => {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
          this.frame = null;
          this.updateProgress();
        });
      };
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onScroll, { passive: true });
      this.updateProgress();

      this.onBlockSelect = (event) => {
        const step = event.target.closest && event.target.closest('[data-pstory-step]');
        if (!step || !this.contains(step)) return;
        this.setActive(this.steps.indexOf(step));
        step.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      document.addEventListener('shopify:block:select', this.onBlockSelect);
    }

    disconnectedCallback() {
      this.io?.disconnect();
      this.preload?.disconnect();
      window.removeEventListener('scroll', this.onScroll);
      window.removeEventListener('resize', this.onScroll);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
    }

    setActive(index) {
      if (index < 0 || index === this.active) return;
      this.active = index;
      this.steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
      this.slides.forEach((slide, i) => {
        slide.classList.toggle('is-active', i === index);
        slide.classList.toggle('is-past', i <= index);
      });
      this.dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
      if (this.current) this.current.textContent = pad(index + 1);
      if (this.label) this.label.textContent = this.labels[index] || '';
    }

    // Stacked cards: each card shrinks / dims a little as the cards after it slide up over it
    updateStack() {
      const cards = this.steps;
      const rects = cards.map((card) => card.getBoundingClientRect());
      cards.forEach((card, i) => {
        let covered = 0;
        for (let j = i + 1; j < cards.length; j++) {
          const h = rects[i].height || 1;
          covered += Math.max(0, Math.min(1, (rects[i].bottom - rects[j].top) / h));
        }
        card.style.setProperty('--stack-scale', Math.max(0.82, 1 - covered * 0.05).toFixed(4));
        card.style.setProperty('--stack-dim', Math.max(0.7, 1 - covered * 0.08).toFixed(4));
      });
    }

    // Rail fill: 0 when the first step reaches the middle of the screen, 1 when the last one does
    updateProgress() {
      if (this.dataset.layout === 'stacked' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.updateStack();
      if (!this.fill) return;
      const first = this.steps[0].getBoundingClientRect();
      const last = this.steps[this.steps.length - 1].getBoundingClientRect();
      const mid = window.innerHeight / 2;
      const start = first.top + first.height / 2;
      const end = last.top + last.height / 2;
      const span = end - start || 1;
      const progress = Math.max(0, Math.min(1, (mid - start) / span));
      this.style.setProperty('--pstory-progress', progress.toFixed(4));
    }
  }

  customElements.define('product-story', ProductStory);
})();
