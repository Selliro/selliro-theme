/**
 * Timeline — <story-timeline> (sections/timeline.liquid)
 *
 * Vertical: the milestone crossing the middle of the screen becomes active, the rail fills with overall
 * scroll progress, and milestones already passed stay lit.
 * Horizontal: year buttons and arrows scroll a snap track; swiping the track updates the active year
 * and the progress line.
 * Theme editor: selecting a milestone block brings it into view.
 */
(() => {
  if (customElements.get('story-timeline')) return;

  class StoryTimeline extends HTMLElement {
    connectedCallback() {
      this.items = Array.from(this.querySelectorAll('[data-tl-item]'));
      if (!this.items.length) return;
      this.dots = Array.from(this.querySelectorAll('[data-tl-dot]'));
      this.horizontal = this.dataset.layout === 'horizontal';
      this.active = -1;

      if (this.horizontal) this.setupHorizontal();
      else this.setupVertical();

      this.setActive(0);
      this.setAttribute('data-ready', '');

      this.onBlockSelect = (event) => {
        const item = event.target.closest && event.target.closest('[data-tl-item]');
        if (!item || !this.contains(item)) return;
        const index = this.items.indexOf(item);
        if (this.horizontal) this.goTo(index);
        else {
          this.setActive(index);
          item.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      };
      document.addEventListener('shopify:block:select', this.onBlockSelect);
    }

    disconnectedCallback() {
      this.io?.disconnect();
      window.removeEventListener('scroll', this.onScroll);
      window.removeEventListener('resize', this.onScroll);
      this.track?.removeEventListener('scroll', this.onTrackScroll);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
    }

    setActive(index) {
      if (index < 0 || index === this.active) return;
      this.active = index;
      this.items.forEach((item, i) => {
        item.classList.toggle('is-active', i === index);
        item.classList.toggle('is-seen', i < index);
      });
      this.dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.classList.toggle('is-seen', i < index);
        dot.toggleAttribute('aria-current', i === index);
      });

      if (!this.horizontal) return;
      const last = this.items.length - 1;
      this.style.setProperty('--tl-progress', last > 0 ? (index / last).toFixed(4) : '1');
      if (this.prevBtn) this.prevBtn.disabled = index <= 0;
      if (this.nextBtn) this.nextBtn.disabled = index >= last;

      // Keep the active year visible when the year bar itself scrolls (many milestones / mobile)
      const dot = this.dots[index];
      const bar = dot?.closest('.tl__years');
      if (bar && bar.scrollWidth > bar.clientWidth) {
        bar.scrollTo({ left: dot.offsetLeft - (bar.clientWidth - dot.offsetWidth) / 2, behavior: 'smooth' });
      }
    }

    /* ------------------------------------------------------------ vertical */
    setupVertical() {
      // A milestone is "active" while it crosses a thin band in the middle of the viewport
      this.io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) this.setActive(this.items.indexOf(entry.target));
          });
        },
        { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
      );
      this.items.forEach((item) => this.io.observe(item));

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
    }

    // Rail fill: 0 when the first milestone reaches the middle of the screen, 1 when the last one does
    updateProgress() {
      const first = this.items[0].getBoundingClientRect();
      const last = this.items[this.items.length - 1].getBoundingClientRect();
      const mid = window.innerHeight / 2;
      const start = first.top + first.height / 2;
      const span = last.top + last.height / 2 - start || 1;
      const progress = Math.max(0, Math.min(1, (mid - start) / span));
      this.style.setProperty('--tl-progress', progress.toFixed(4));
    }

    /* ------------------------------------------------------------ horizontal */
    setupHorizontal() {
      this.track = this.querySelector('[data-tl-track]');
      this.prevBtn = this.querySelector('[data-tl-prev]');
      this.nextBtn = this.querySelector('[data-tl-next]');
      if (!this.track) return;

      this.goTo = (index) => {
        const i = Math.max(0, Math.min(this.items.length - 1, index));
        this.track.scrollTo({ left: this.items[i].offsetLeft - this.items[0].offsetLeft });
        this.setActive(i);
      };

      this.dots.forEach((dot, i) => dot.addEventListener('click', () => this.goTo(i)));
      this.prevBtn?.addEventListener('click', () => this.goTo(this.active - 1));
      this.nextBtn?.addEventListener('click', () => this.goTo(this.active + 1));

      // The slide whose start is nearest the track's start is the active one
      this.onTrackScroll = () => {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
          this.frame = null;
          const start = this.track.scrollLeft;
          const max = this.track.scrollWidth - this.track.clientWidth;
          let best = 0;
          if (max > 0 && start >= max - 2) {
            best = this.items.length - 1;
          } else {
            let dist = Infinity;
            this.items.forEach((item, i) => {
              const d = Math.abs(item.offsetLeft - this.items[0].offsetLeft - start);
              if (d < dist) {
                dist = d;
                best = i;
              }
            });
          }
          this.setActive(best);
        });
      };
      this.track.addEventListener('scroll', this.onTrackScroll, { passive: true });
    }
  }

  customElements.define('story-timeline', StoryTimeline);
})();
