/**
 * Routine builder — <routine-builder>
 *
 * A sentence with blank words. Tapping a blank opens its answer tray; choosing fills the blank,
 * moves on to the next empty blank, recolors the mood background and re-ranks the live results.
 * Results are scored by how many chosen answers recommend each product (available first),
 * topped up from the fallback collection, and re-ordered with a FLIP animation.
 * When there are more products than fit in one row, the list becomes a scroll-snap carousel
 * with previous/next buttons and a progress bar.
 * Scroll-in intro: the card unfolds, the sentence rises word by word and the blanks pop in
 * (IntersectionObserver + CSS transitions; skipped for reduced motion and in the theme editor).
 */
(() => {
  if (customElements.get('routine-builder')) return;

  const STORAGE_PREFIX = 'routine-builder:';
  const ADVANCE_DELAY = 260;
  const FLOAT_OVERLAP = 0.35; // second image starts when the first is 35% through its rise
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const storage = {
    get(key) {
      try {
        return JSON.parse(localStorage.getItem(key) || 'null');
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* ignore */
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        /* ignore */
      }
    },
  };

  class RoutineBuilder extends HTMLElement {
    connectedCallback() {
      this.blanks = Array.from(this.querySelectorAll('[data-rb-blank]'));
      this.trays = Array.from(this.querySelectorAll('[data-rb-tray]'));
      this.results = this.querySelector('[data-rb-results]');
      this.pool = this.querySelector('[data-rb-pool]');
      this.meter = Array.from(this.querySelectorAll('.rb__meter-seg'));
      this.addAllBtn = this.querySelector('[data-rb-add-all]');
      this.resetBtn = this.querySelector('[data-rb-reset]');
      this.hint = this.querySelector('[data-rb-hint]');
      this.resultsWrap = this.querySelector('[data-rb-results-wrap]');
      this.resultsTitle = this.querySelector('[data-rb-results-title]');
      this.scrollToResults = this.dataset.scrollResults === 'true';
      this.live = this.querySelector('[data-rb-live]');
      this.count = this.querySelector('[data-rb-count]');
      this.summary = this.querySelector('[data-rb-summary]');
      this.track = this.querySelector('[data-rb-track]');
      this.nav = this.querySelector('[data-rb-nav]');
      this.prevBtn = this.querySelector('[data-rb-prev]');
      this.nextBtn = this.querySelector('[data-rb-next]');
      this.progressBar = this.querySelector('[data-rb-progress]');
      this.wasDone = false;
      this.maxResults = parseInt(this.dataset.maxResults || '4', 10);
      this.accent = this.dataset.accent || '#f8d12f';
      this.storageKey = STORAGE_PREFIX + (this.dataset.sectionId || '');
      this.active = -1;

      this.onClick = this.onClick.bind(this);
      this.onChange = this.onChange.bind(this);
      this.onKeydown = this.onKeydown.bind(this);
      this.onDocClick = this.onDocClick.bind(this);
      this.onBlockSelect = this.onBlockSelect.bind(this);

      this.addEventListener('click', this.onClick);
      this.addEventListener('change', this.onChange);
      this.addEventListener('keydown', this.onKeydown);
      document.addEventListener('click', this.onDocClick);
      document.addEventListener('shopify:block:select', this.onBlockSelect);

      if (this.dataset.remember === 'true') this.restore();
      this.refresh({ animate: false });
      this.initFloats();
      this.initCarousel();
      this.initIntro();

      // Invite the first interaction: open the first empty blank when the section scrolls into view.
      this.io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          this.io.disconnect();
          if (this.active === -1) {
            const first = this.firstEmpty();
            if (first > -1) this.open(first, { focus: false });
          }
        },
        { threshold: 0.4 }
      );
      this.io.observe(this);
    }

    disconnectedCallback() {
      if (this.onFloatScroll) {
        window.removeEventListener('scroll', this.onFloatScroll);
        window.removeEventListener('resize', this.onFloatScroll);
        window.removeEventListener('pageshow', this.onFloatScroll);
      }
      this.floatIo?.disconnect();
      this.carouselRo?.disconnect();
      this.introIo?.disconnect();
      clearTimeout(this.introTimer);
      document.removeEventListener('click', this.onDocClick);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      this.io?.disconnect();
      clearTimeout(this.timer);
    }

    /* ---------------------------------------------------------------- state */

    picked(i) {
      return Array.from(this.trays[i].querySelectorAll('.rb__option-input:checked'));
    }

    firstEmpty(after = -1) {
      for (let k = 1; k <= this.blanks.length; k++) {
        const i = (after + k) % this.blanks.length;
        if (!this.picked(i).length) return i;
      }
      return -1;
    }

    /* ---------------------------------------------------------------- events */

    onClick(event) {
      const t = event.target instanceof Element ? event.target : null;
      if (!t) return;
      const blank = t.closest('[data-rb-blank]');
      if (blank) {
        const i = Number(blank.dataset.rbBlank);
        if (this.active !== i) return this.open(i);
        // Keyboard activation (Enter/Space reports detail 0) on an already open blank moves into its answers;
        // a pointer click toggles it closed.
        if (event.detail === 0) return this.open(i, { focus: true });
        return this.close();
      }
      if (t.closest('[data-rb-prev]')) return this.slide(-1);
      if (t.closest('[data-rb-next]')) return this.slide(1);
      if (t.closest('[data-rb-done]')) return this.advance();
      if (t.closest('[data-rb-reset]')) return this.reset();
      if (t.closest('[data-rb-add-all]')) return this.addAll();
    }

    onChange(event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains('rb__option-input')) return;
      this.refresh();
      this.save();
      const tray = input.closest('[data-rb-tray]');
      if (tray && tray.dataset.multiple !== 'true' && input.checked) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.advance(), ADVANCE_DELAY);
      }
    }

    onKeydown(event) {
      if (event.key === 'Escape' && this.active > -1) {
        const blank = this.blanks[this.active];
        this.close();
        blank?.focus();
      }
    }

    onDocClick(event) {
      if (this.active === -1) return;
      if (!(event.target instanceof Node) || this.contains(event.target)) return;
      this.close();
    }

    onBlockSelect(event) {
      if (!this.contains(event.target)) return;
      const blank = event.target.closest('[data-rb-blank]');
      if (blank) this.open(Number(blank.dataset.rbBlank), { focus: false });
    }

    /* ---------------------------------------------------------------- trays */

    open(i, { focus = true } = {}) {
      clearTimeout(this.timer);
      this.active = i;
      this.blanks.forEach((b, k) => {
        b.setAttribute('aria-expanded', String(k === i));
        b.classList.toggle('is-active', k === i);
      });
      this.trays.forEach((t, k) => {
        t.hidden = k !== i;
        if (k === i) {
          t.classList.remove('is-entering');
          void t.offsetWidth; // restart the enter animation
          t.classList.add('is-entering');
        }
      });
      this.dataset.open = 'true';
      if (focus) {
        const first = this.trays[i].querySelector('.rb__option-input:checked') || this.trays[i].querySelector('.rb__option-input');
        first?.focus({ preventScroll: true });
      }
    }

    close() {
      this.active = -1;
      this.blanks.forEach((b) => {
        b.setAttribute('aria-expanded', 'false');
        b.classList.remove('is-active');
      });
      this.trays.forEach((t) => (t.hidden = true));
      delete this.dataset.open;
    }

    advance() {
      const next = this.firstEmpty(this.active);
      if (next > -1 && next !== this.active) this.open(next);
      else this.close();
    }

    reset() {
      this.trays.forEach((t) => t.querySelectorAll('input').forEach((i) => (i.checked = false)));
      storage.remove(this.storageKey);
      this.refresh();
      this.open(0);
    }

    /* ---------------------------------------------------------------- render */

    refresh({ animate = true } = {}) {
      const colors = [];
      let answered = 0;

      this.blanks.forEach((blank, i) => {
        const picked = this.picked(i);
        const textEl = blank.querySelector('[data-rb-blank-text]');
        const thumbs = blank.querySelector('[data-rb-thumbs]');
        const labels = picked.map((p) => p.dataset.label || '');
        const filled = labels.length > 0;
        if (filled) answered++;

        const next = filled ? this.joinLabels(labels) : textEl.dataset.placeholder;
        if (textEl.textContent !== next) {
          textEl.textContent = next;
          if (animate && !reducedMotion()) {
            textEl.classList.remove('is-swapping');
            void textEl.offsetWidth;
            textEl.classList.add('is-swapping');
          }
        }
        blank.classList.toggle('is-filled', filled);
        const color = filled ? picked[0].dataset.color || this.accent : '';
        if (color) {
          blank.style.setProperty('--rb-c', color);
          colors.push(color);
        } else {
          blank.style.removeProperty('--rb-c');
        }

        thumbs.replaceChildren();
        picked
          .filter((p) => p.dataset.thumb)
          .slice(0, 3)
          .forEach((p) => {
            const img = document.createElement('img');
            img.src = p.dataset.thumb;
            img.alt = '';
            img.width = 28;
            img.height = 28;
            thumbs.appendChild(img);
          });
      });

      // Mood colors follow the answers (cycled across the three clouds); with no answers the palette shows.
      ['--rb-m1', '--rb-m2', '--rb-m3'].forEach((v, k) => {
        if (colors.length) this.style.setProperty(v, colors[k % colors.length]);
        else this.style.removeProperty(v);
      });

      this.meter.forEach((seg, i) => seg.classList.toggle('is-on', i < answered));
      if (this.count) this.count.textContent = String(answered);
      this.renderSummary();
      const done = this.blanks.length > 0 && answered === this.blanks.length;
      const state = answered === 0 ? 'idle' : done ? 'done' : 'live';
      this.dataset.progress = state;
      if (this.hint) this.hint.classList.toggle('is-hidden', answered > 0);
      if (this.resetBtn) this.resetBtn.hidden = answered === 0;
      if (this.resultsWrap) this.resultsWrap.setAttribute('aria-hidden', String(!done));

      // Products stay hidden until every blank is filled.
      const justCompleted = done && !this.wasDone;
      this.renderResults(done ? this.rank() : [], animate && !justCompleted);
      if (justCompleted) this.reveal(animate);
      this.wasDone = done;
    }

    reveal(animate) {
      const items = Array.from(this.results.querySelectorAll('.rb__result'));
      if (this.live && animate) {
        // Announce completion to screen readers (string comes from the locale file).
        this.live.textContent = (this.live.dataset.ready || '').replace('[count]', String(items.length));
      }
      if (animate) this.animateResultsIntro();
      if (animate && !reducedMotion()) {
        items.forEach((li, i) =>
          li.animate(
            [
              { opacity: 0, transform: 'translateY(28px) scale(0.96)' },
              { opacity: 1, transform: 'none' },
            ],
            { duration: 700, delay: 260 + i * 110, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }
          )
        );
      }
      if (animate && this.scrollToResults && this.resultsWrap) {
        setTimeout(() => {
          const rect = this.resultsWrap.getBoundingClientRect();
          if (rect.top > window.innerHeight * 0.55) {
            window.scrollBy({ top: rect.top - window.innerHeight * 0.18, behavior: reducedMotion() ? 'auto' : 'smooth' });
          }
          this.resultsTitle?.focus({ preventScroll: true });
        }, 380);
      }
    }

    /* ---------------------------------------------------------------- floating images */

    initFloats() {
      this.floats = document.getElementById(`RbFloats-${this.dataset.sectionId}`);
      if (!this.floats) return;
      this.floatEls = Array.from(this.floats.querySelectorAll('[data-rb-float]'));
      this.floatRise = this.floatEls.map(() => 0);
      const speed = parseFloat(this.floats.dataset.speed || '0');
      if (!this.floatEls.length || !speed || reducedMotion()) {
        this.floats.classList.add('is-static');
        return;
      }
      // Share of the section's scroll the images take to cross the screen. Bigger = slower:
      // speed 4 → 0.51 (about 1.5× page speed), speed 10 → 0.3, speed 1 → 0.62.
      this.floatWindow = Math.min(0.7, Math.max(0.3, 0.3 + (10 - speed) * 0.035));
      if (this.floats.dataset.first === 'right') this.floatEls.reverse();

      this.onFloatScroll = () => {
        if (this.floatFrame) return;
        this.floatFrame = requestAnimationFrame(() => {
          this.floatFrame = null;
          this.updateFloats();
        });
      };
      this.floatIo = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            window.addEventListener('scroll', this.onFloatScroll, { passive: true });
            window.addEventListener('resize', this.onFloatScroll, { passive: true });
            this.updateFloats();
          } else {
            window.removeEventListener('scroll', this.onFloatScroll);
            window.removeEventListener('resize', this.onFloatScroll);
            // Section is far away: hide the images so a stale position can never show over other sections.
            this.floatEls.forEach((el) => el.classList.remove('is-passing'));
          }
        },
        { rootMargin: '50% 0px' }
      );
      this.floatIo.observe(this.floats);
      this.updateFloats();
      // Layout can still shift after load (images, fonts, restored scroll position) — re-measure then.
      window.addEventListener('load', this.onFloatScroll, { once: true });
      window.addEventListener('pageshow', this.onFloatScroll);
      this.floats.classList.add('is-ready');
    }

    /**
     * One after the other, overlapping: the first rises from below the screen, and once it is about a third of
     * the way up, the second follows from the bottom. The pair is centred on the middle of the section's scroll.
     * Positions are worked out in screen space so each pass always runs bottom → top, whatever the layout.
     */
    updateFloats() {
      const rect = this.floats.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const progress = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height)));
      const span = this.floatWindow;
      const pivot = 0.5;
      const offset = span * FLOAT_OVERLAP; // how far the first image has travelled when the second sets off
      const first = pivot - (span + offset * (this.floatEls.length - 1)) / 2;

      this.floatEls.forEach((el, i) => {
        const start = first + i * offset;
        const local = Math.min(1, Math.max(0, (progress - start) / span));
        const box = el.getBoundingClientRect();
        const naturalTop = box.top - this.floatRise[i];
        const margin = box.height * 0.3; // extra room so tilted corners never peek in
        const target = vh + margin - local * (vh + box.height + margin * 2);
        const rise = target - naturalTop;
        this.floatRise[i] = rise;
        el.style.setProperty('--rise', `${rise.toFixed(1)}px`);
        el.style.setProperty('--spin', `${((0.5 - local) * 8).toFixed(2)}deg`);
        el.classList.toggle('is-passing', local > 0 && local < 1);
      });
    }

    /* ---------------------------------------------------------------- scroll-in intro */

    /** Wrap each word of an element's text in <span class="rb-w"> (whitespace stays as text, so wrapping is unchanged). */
    splitWords(el, start = 0) {
      let i = start;
      Array.from(el.childNodes).forEach((node) => {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return;
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(part));
          const w = document.createElement('span');
          w.className = 'rb-w';
          w.textContent = part;
          w.style.setProperty('--i', String(i++));
          frag.appendChild(w);
        });
        node.replaceWith(frag);
      });
      return i;
    }

    initIntro() {
      const sentence = this.querySelector('.rb__sentence');
      if (!sentence || reducedMotion() || !('IntersectionObserver' in window)) return;
      if (window.Shopify && window.Shopify.designMode) return; // merchants see everything at once in the editor

      // One running index across words and blanks, so the sentence reads in left to right.
      let i = 0;
      Array.from(sentence.children).forEach((child) => {
        if (child.classList.contains('rb__words')) i = this.splitWords(child, i);
        else if (child.classList.contains('rb__blank')) child.style.setProperty('--i', String(i++));
      });
      const STEP = 60;
      const end = 300 + i * STEP;
      this.style.setProperty('--rb-intro-end', `${end}ms`);
      this.classList.add('rb--intro');

      this.introIo = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          this.introIo.disconnect();
          this.classList.add('is-in');
          // Hand back to the normal styles once everything has landed (restores hover transitions).
          this.introTimer = setTimeout(() => this.classList.remove('rb--intro', 'is-in'), end + 1400);
        },
        { threshold: 0.18, rootMargin: '0px 0px -8% 0px' }
      );
      this.introIo.observe(this.querySelector('.rb__panel') || this);
    }

    /** Results heading, answer chips, step numbers and the dashed routine line animate in one after another. */
    animateResultsIntro() {
      if (reducedMotion()) return;
      const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
      const spring = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
      if (this.resultsTitle && !this.resultsTitle.dataset.split) {
        this.splitWords(this.resultsTitle);
        this.resultsTitle.dataset.split = 'true';
      }
      this.resultsTitle?.querySelectorAll('.rb-w').forEach((w, k) =>
        w.animate(
          [
            { opacity: 0, transform: 'translateY(0.6em) rotate(3deg)', filter: 'blur(8px)' },
            { opacity: 1, transform: 'none', filter: 'blur(0)' },
          ],
          { duration: 800, delay: 120 + k * 70, easing: ease, fill: 'backwards' }
        )
      );
      this.summary?.querySelectorAll('li').forEach((chip, k) =>
        chip.animate(
          [
            { opacity: 0, transform: 'translateY(10px) scale(0.7)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 600, delay: 380 + k * 80, easing: spring, fill: 'backwards' }
        )
      );
      this.results.querySelectorAll('.rb__result').forEach((li, k) => {
        li.querySelector('.rb__step')?.animate(
          [
            { opacity: 0, transform: 'scale(0.3) rotate(-90deg)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 700, delay: 420 + k * 110, easing: spring, fill: 'backwards' }
        );
        try {
          li.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
            duration: 700,
            delay: 560 + k * 110,
            easing: ease,
            fill: 'backwards',
            pseudoElement: '::before',
          });
        } catch (e) {
          /* pseudo-element animation not supported — line simply shows */
        }
      });
    }

    /* ---------------------------------------------------------------- summary chips */

    renderSummary() {
      if (!this.summary) return;
      const chips = [];
      this.trays.forEach((tray) =>
        tray.querySelectorAll('.rb__option-input:checked').forEach((input) => {
          const li = document.createElement('li');
          li.textContent = input.dataset.label || '';
          if (input.dataset.color) li.style.setProperty('--rb-c', input.dataset.color);
          chips.push(li);
        })
      );
      this.summary.replaceChildren(...chips);
    }

    /* ---------------------------------------------------------------- carousel */

    initCarousel() {
      if (!this.track) return;
      this.onTrackScroll = () => {
        if (this.trackFrame) return;
        this.trackFrame = requestAnimationFrame(() => {
          this.trackFrame = null;
          this.updateCarouselUi();
        });
      };
      this.results.addEventListener('scroll', this.onTrackScroll, { passive: true });
      if ('ResizeObserver' in window) {
        this.carouselRo = new ResizeObserver(() => this.updateCarousel());
        this.carouselRo.observe(this.track);
      }
      this.updateCarousel();
    }

    /** Switch between grid and carousel: carousel once the products no longer fit in one row (CSS --rb-grid-max). */
    updateCarousel({ resetScroll = false } = {}) {
      if (!this.track) return;
      const count = this.results.querySelectorAll('.rb__result').length;
      const max = parseFloat(getComputedStyle(this.track).getPropertyValue('--rb-grid-max')) || 4;
      const carousel = count > max;
      this.results.classList.toggle('is-carousel', carousel);
      if (this.nav) this.nav.hidden = !carousel;
      if (this.progressBar) this.progressBar.hidden = !carousel;
      if (resetScroll) this.results.scrollTo({ left: 0, behavior: 'auto' });
      this.updateCarouselUi();
    }

    updateCarouselUi() {
      if (!this.results.classList.contains('is-carousel')) return;
      const el = this.results;
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      const pos = Math.min(max, Math.abs(el.scrollLeft)); // RTL reports negative offsets
      if (this.prevBtn) this.prevBtn.disabled = pos <= 2;
      if (this.nextBtn) this.nextBtn.disabled = pos >= max - 2;
      if (this.progressBar) {
        const size = el.scrollWidth ? (el.clientWidth / el.scrollWidth) * 100 : 100;
        const start = max ? (pos / max) * (100 - size) : 0;
        this.progressBar.style.setProperty('--rb-thumb-size', `${size.toFixed(2)}%`);
        this.progressBar.style.setProperty('--rb-thumb-start', `${start.toFixed(2)}%`);
      }
    }

    /** Move one view (a full row of cards) back or forward. */
    slide(dir) {
      const el = this.results;
      const rtl = getComputedStyle(el).direction === 'rtl';
      const card = el.querySelector('.rb__result');
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const step = card ? Math.max(card.offsetWidth + gap, Math.floor((el.clientWidth + gap) / (card.offsetWidth + gap)) * (card.offsetWidth + gap)) : el.clientWidth;
      el.scrollBy({ left: dir * step * (rtl ? -1 : 1), behavior: reducedMotion() ? 'auto' : 'smooth' });
    }

    joinLabels(labels) {
      if (labels.length < 2) return labels[0] || '';
      return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`;
    }

    rank() {
      const scores = new Map();
      this.trays.forEach((t) =>
        t.querySelectorAll('.rb__option-input:checked').forEach((input) =>
          (input.dataset.products || '')
            .split(',')
            .filter(Boolean)
            .forEach((id) => scores.set(id, (scores.get(id) || 0) + 1))
        )
      );
      const order = Array.from(this.querySelectorAll('.rb__result:not([data-duplicate])')).map((li) => li.dataset.productId);
      const available = (id) => this.item(id)?.dataset.available !== 'false';
      const ids = Array.from(scores.keys()).sort(
        (a, b) =>
          Number(available(b)) - Number(available(a)) || scores.get(b) - scores.get(a) || order.indexOf(a) - order.indexOf(b)
      );
      Array.from(this.pool.querySelectorAll('[data-fallback]'))
        .sort((a, b) => Number(a.dataset.fallback) - Number(b.dataset.fallback))
        .forEach((li) => {
          const id = li.dataset.productId;
          if (ids.length < this.maxResults && !ids.includes(id) && available(id)) ids.push(id);
        });
      return ids.slice(0, this.maxResults);
    }

    item(id) {
      return this.querySelector(`.rb__result[data-product-id="${CSS.escape(id)}"]:not([data-duplicate])`);
    }

    renderResults(ids, animate) {
      const current = Array.from(this.results.querySelectorAll('.rb__result'));
      const first = new Map(current.map((li) => [li, li.getBoundingClientRect()]));
      const sameOrder = current.length === ids.length && current.every((li, i) => li.dataset.productId === ids[i]);
      if (sameOrder) return;

      // Return items no longer in the routine to the pool.
      current.forEach((li) => {
        if (!ids.includes(li.dataset.productId)) this.pool.appendChild(li);
      });

      const items = ids.map((id) => this.item(id)).filter(Boolean);
      items.forEach((li, i) => {
        const step = li.querySelector('.rb__step');
        if (step) step.textContent = String(i + 1).padStart(2, '0');
        this.results.appendChild(li);
      });
      this.updateCarousel({ resetScroll: true });

      if (this.addAllBtn) {
        this.addAllBtn.disabled = this.variantItems().length === 0;
        this.addAllBtn.removeAttribute('data-done');
      }

      if (!animate || reducedMotion()) return;

      // FLIP: animate moved cards from their old spot, fade new ones in.
      items.forEach((li, i) => {
        const before = first.get(li);
        const after = li.getBoundingClientRect();
        if (before) {
          const dx = before.left - after.left;
          const dy = before.top - after.top;
          if (dx || dy) {
            li.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
              duration: 520,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            });
          }
        } else {
          li.animate(
            [
              { opacity: 0, transform: 'translateY(18px) scale(0.97)' },
              { opacity: 1, transform: 'none' },
            ],
            { duration: 560, delay: i * 70, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }
          );
        }
      });
    }

    /* ---------------------------------------------------------------- persistence */

    save() {
      if (this.dataset.remember !== 'true') return;
      const data = this.trays.map((t) => Array.from(t.querySelectorAll('.rb__option-input:checked')).map((i) => i.value));
      storage.set(this.storageKey, data);
    }

    restore() {
      const data = storage.get(this.storageKey);
      if (!Array.isArray(data)) return;
      data.forEach((values, i) => {
        const tray = this.trays[i];
        if (!tray || !Array.isArray(values)) return;
        tray.querySelectorAll('.rb__option-input').forEach((input) => (input.checked = values.includes(input.value)));
      });
    }

    /* ---------------------------------------------------------------- cart */

    variantItems() {
      return Array.from(this.results.querySelectorAll('[data-new-arrivals-add]:not([disabled])'))
        .map((b) => ({ id: b.getAttribute('data-variant-id'), quantity: parseInt(b.getAttribute('data-quantity') || '1', 10) || 1 }))
        .filter((x) => x.id);
    }

    async addAll() {
      const btn = this.addAllBtn;
      const items = this.variantItems();
      if (!btn || !items.length || btn.getAttribute('aria-busy') === 'true') return;
      const form = new FormData();
      items.forEach((it, i) => {
        form.append(`items[${i}][id]`, it.id);
        form.append(`items[${i}][quantity]`, String(it.quantity));
      });
      const sections = Array.from(document.querySelectorAll('cart-items-component'))
        .map((n) => n.dataset && n.dataset.sectionId)
        .filter(Boolean);
      if (sections.length) form.append('sections', sections.join(','));

      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      try {
        const url = (window.Theme && window.Theme.routes && window.Theme.routes.cart_add_url) || '/cart/add.js';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
          body: form,
        });
        const json = await res.json();
        if (json.status) {
          document.dispatchEvent(
            new CustomEvent('cart:error', {
              bubbles: true,
              detail: { sourceId: 'routine-builder', data: { message: json.message, description: json.description, errors: json.errors } },
            })
          );
          return;
        }
        document.dispatchEvent(
          new CustomEvent('cart:update', {
            bubbles: true,
            detail: {
              resource: {},
              sourceId: 'routine-builder',
              data: { source: 'product-form-component', itemCount: items.reduce((s, i) => s + i.quantity, 0), sections: json.sections },
            },
          })
        );
        btn.setAttribute('data-done', '');
      } catch (e) {
        console.error(e);
      } finally {
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
      }
    }
  }

  customElements.define('routine-builder', RoutineBuilder);
})();
