/**
 * Routine builder — <routine-builder>
 *
 * A sentence with blank words. Tapping a blank opens its answer tray; choosing fills the blank,
 * moves on to the next empty blank, recolors the mood background and re-ranks the live results.
 * Results are scored by how many chosen answers recommend each product (available first),
 * topped up from the fallback collection, and re-ordered with a FLIP animation.
 */
(() => {
  if (customElements.get('routine-builder')) return;

  const STORAGE_PREFIX = 'routine-builder:';
  const ADVANCE_DELAY = 260;
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
      this.ghosts = Array.from(this.querySelectorAll('[data-rb-ghost]'));
      this.meter = Array.from(this.querySelectorAll('.rb__meter-seg'));
      this.addAllBtn = this.querySelector('[data-rb-add-all]');
      this.resetBtn = this.querySelector('[data-rb-reset]');
      this.hint = this.querySelector('[data-rb-hint]');
      this.titles = {
        idle: this.querySelector('[data-rb-title-idle]'),
        live: this.querySelector('[data-rb-title-live]'),
        done: this.querySelector('[data-rb-title-done]'),
      };
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
        return this.active === i ? this.close() : this.open(i);
      }
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

      // Mood colors follow the answers (cycled across the three clouds).
      const mood = colors.length ? colors : [this.accent];
      ['--rb-m1', '--rb-m2', '--rb-m3'].forEach((v, k) => this.style.setProperty(v, mood[k % mood.length]));

      this.meter.forEach((seg, i) => seg.classList.toggle('is-on', i < answered));
      const state = answered === 0 ? 'idle' : answered === this.blanks.length ? 'done' : 'live';
      this.dataset.progress = state;
      Object.entries(this.titles).forEach(([k, el]) => el && (el.hidden = k !== state));
      if (this.hint) this.hint.classList.toggle('is-hidden', answered > 0);
      if (this.resetBtn) this.resetBtn.hidden = answered === 0;

      this.renderResults(answered ? this.rank() : [], animate);
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

      // Ghost placeholders fill any empty slots.
      this.ghosts.forEach((g, i) => {
        g.hidden = i < items.length;
        this.results.appendChild(g);
      });

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
