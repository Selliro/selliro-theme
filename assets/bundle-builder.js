/**
 * Bundle builder — <bundle-builder>
 *
 * Shoppers add products into a "box". Discount tiers (qty → % off) unlock as the box fills.
 * The box is added to the cart in one request; if the reached tier has a discount code, the code is
 * applied to the cart afterwards (the discount itself must exist in Shopify admin → Discounts).
 */
(() => {
  if (customElements.get('bundle-builder')) return;

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Shopify money format → string. Amounts are in the smallest currency unit. */
  function formatMoney(cents, format) {
    const fmt = format || '${{amount}}';
    const value = Number(cents) || 0;
    const withDelimiters = (number, precision, thousands = ',', decimal = '.') => {
      const fixed = (number / 100).toFixed(precision);
      const [whole, frac] = fixed.split('.');
      const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      return frac ? grouped + decimal + frac : grouped;
    };
    return fmt.replace(/\{\{\s*(\w+)\s*\}\}/, (_, key) => {
      switch (key) {
        case 'amount_no_decimals':
          return withDelimiters(value, 0);
        case 'amount_with_comma_separator':
          return withDelimiters(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator':
          return withDelimiters(value, 0, '.', ',');
        case 'amount_with_apostrophe_separator':
          return withDelimiters(value, 2, "'", '.');
        case 'amount_with_space_separator':
          return withDelimiters(value, 2, ' ', ',');
        default:
          return withDelimiters(value, 2);
      }
    });
  }

  const esc = (str) =>
    String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fill = (tpl, map) => Object.entries(map).reduce((s, [k, v]) => s.split(`[${k}]`).join(String(v)), tpl || '');

  class BundleBuilder extends HTMLElement {
    connectedCallback() {
      this.cards = Array.from(this.querySelectorAll('[data-bb-card]'));
      this.products = new Map();
      this.cards.forEach((card) => {
        const data = card.querySelector('[data-bb-product]');
        if (!data) return;
        try {
          this.products.set(String(card.dataset.productId), JSON.parse(data.textContent));
        } catch (e) {
          /* malformed JSON — skip this card */
        }
      });

      this.min = Math.max(1, parseInt(this.dataset.min || '2', 10));
      this.max = Math.max(this.min, parseInt(this.dataset.max || '8', 10));
      this.slotCount = Math.max(1, parseInt(this.dataset.slots || '4', 10));
      this.moneyFormat = this.dataset.moneyFormat;
      this.tiers = Array.from(this.querySelectorAll('[data-bb-tier]'))
        .map((el) => ({ el, qty: Number(el.dataset.qty), pct: Number(el.dataset.pct), code: el.dataset.code || '' }))
        .filter((t) => t.qty > 0)
        .sort((a, b) => a.qty - b.qty);

      /** @type {Map<string, {productId: string, variantId: string, qty: number}>} */
      this.lines = new Map();

      this.el = {
        slots: this.querySelector('[data-bb-slots]'),
        items: this.querySelector('[data-bb-items]'),
        status: this.querySelector('[data-bb-status]'),
        count: this.querySelector('[data-bb-count]'),
        fill: this.querySelector('[data-bb-fill]'),
        subtotal: this.querySelector('[data-bb-subtotal]'),
        savings: this.querySelector('[data-bb-savings]'),
        saveRow: this.querySelector('[data-bb-save-row]'),
        total: this.querySelector('[data-bb-total]'),
        cta: this.querySelector('[data-bb-cta]'),
        ctaLabel: this.querySelector('[data-bb-cta-label]'),
        fillBtn: this.querySelector('[data-bb-fill-btn]'),
        error: this.querySelector('[data-bb-error]'),
        live: this.querySelector('[data-bb-live]'),
        bar: this.querySelector('[data-bb-bar]'),
        barCount: this.querySelector('[data-bb-bar-count]'),
        barTotal: this.querySelector('[data-bb-bar-total]'),
        box: this.querySelector('[data-bb-box]'),
      };
      this.ctaText = this.el.ctaLabel ? this.el.ctaLabel.textContent : '';

      this.onClick = this.onClick.bind(this);
      this.onChange = this.onChange.bind(this);
      this.addEventListener('click', this.onClick);
      this.addEventListener('change', this.onChange);

      // Mobile summary bar shows while the grid is on screen and the box is not.
      this.barIo = new IntersectionObserver(() => this.updateBar(), { threshold: [0, 0.15] });
      this.barIo.observe(this.el.box);
      this.barIo.observe(this);

      this.cards.forEach((card) => this.markAvailability(card));
      this.render();

      // Draw the heading underline when it scrolls into view.
      const hl = this.querySelector('[data-bb-hl]');
      if (hl) {
        if (reducedMotion()) hl.classList.add('is-drawn');
        else {
          this.hlIo = new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) {
                hl.classList.add('is-drawn');
                this.hlIo.disconnect();
              }
            },
            { threshold: 0.6 }
          );
          this.hlIo.observe(hl);
        }
      }
    }

    disconnectedCallback() {
      this.hlIo?.disconnect();
      this.barIo?.disconnect();
      clearTimeout(this.successTimer);
    }

    /* ---------------------------------------------------------------- helpers */

    count() {
      let n = 0;
      this.lines.forEach((l) => (n += l.qty));
      return n;
    }

    variant(productId, variantId) {
      const p = this.products.get(String(productId));
      return p && p.variants.find((v) => String(v.id) === String(variantId));
    }

    /** Selected option values on a card (one per option group), in option order. */
    cardOptions(card) {
      return Array.from(card.querySelectorAll('[data-bb-option]')).map((group) => {
        const checked = group.querySelector('[data-bb-swatch]:checked');
        return checked ? checked.value : null;
      });
    }

    cardVariant(card) {
      const p = this.products.get(String(card.dataset.productId));
      if (!p) return null;
      const chosen = this.cardOptions(card);
      if (!chosen.length) return p.variants.find((v) => v.available) || p.variants[0] || null;
      return p.variants.find((v) => (v.options || []).every((o, i) => chosen[i] == null || o === chosen[i])) || null;
    }

    cardVariantId(card) {
      const v = this.cardVariant(card);
      return v ? String(v.id) : '';
    }

    /** Grey out option values that can't be bought with the other current selections. */
    markAvailability(card) {
      const p = this.products.get(String(card.dataset.productId));
      if (!p) return;
      const chosen = this.cardOptions(card);
      card.querySelectorAll('[data-bb-option]').forEach((group, gi) => {
        group.querySelectorAll('[data-bb-swatch]').forEach((input) => {
          const ok = p.variants.some(
            (v) => v.available && (v.options || []).every((o, i) => (i === gi ? o === input.value : chosen[i] == null || o === chosen[i]))
          );
          input.closest('.bb-swatch')?.classList.toggle('is-unavailable', !ok);
        });
        const label = group.querySelector('[data-bb-option-value]');
        if (label) label.textContent = chosen[gi] || '';
      });
    }

    lineForProduct(productId) {
      for (const [key, line] of this.lines) if (line.productId === String(productId)) return [key, line];
      return [null, null];
    }

    activeTier(n = this.count()) {
      let tier = null;
      this.tiers.forEach((t) => {
        if (n >= t.qty) tier = t;
      });
      return tier;
    }

    nextTier(n = this.count()) {
      return this.tiers.find((t) => n < t.qty) || null;
    }

    announce(tpl, title) {
      if (!this.el.live) return;
      this.el.live.textContent = fill(tpl, { title, count: this.count() });
    }

    /* ---------------------------------------------------------------- events */

    onClick(event) {
      const t = event.target instanceof Element ? event.target : null;
      if (!t) return;

      const add = t.closest('[data-bb-add]');
      if (add && !add.disabled) return this.toggle(add.closest('[data-bb-card]'));

      const remove = t.closest('[data-bb-remove]');
      if (remove) return this.removeLine(remove.dataset.bbRemove);

      const step = t.closest('[data-bb-step]');
      if (step) return this.step(step.dataset.key, Number(step.dataset.bbStep));

      if (t.closest('[data-bb-fill-btn]')) return this.autoFill();
      if (t.closest('[data-bb-cta]')) return this.addToCart();
    }

    onChange(event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.matches('[data-bb-swatch]')) return;
      const card = input.closest('[data-bb-card]');
      const productId = card.dataset.productId;
      const v = this.cardVariant(card);
      this.markAvailability(card);
      this.renderCardPrice(card, v);
      if (!v) return;

      // If this product is already in the box, swap the variant in place.
      const [key, line] = this.lineForProduct(productId);
      if (line && v) {
        this.lines.delete(key);
        this.lines.set(String(v.id), { ...line, variantId: String(v.id) });
        this.render();
      }
    }

    /* ---------------------------------------------------------------- actions */

    toggle(card) {
      const productId = String(card.dataset.productId);
      const [key] = this.lineForProduct(productId);
      const p = this.products.get(productId);
      if (key) {
        this.lines.delete(key);
        this.render();
        this.announce(this.dataset.announceRemoved, p ? p.title : '');
        return;
      }
      if (this.count() >= this.max) return this.flashStatus(fill(this.dataset.msgMax, { count: this.max }));
      const variantId = this.cardVariantId(card);
      if (!variantId) return;
      this.lines.set(variantId, { productId, variantId, qty: 1 });
      this.render({ added: variantId });
      this.announce(this.dataset.announceAdded, p ? p.title : '');
    }

    removeLine(key) {
      const line = this.lines.get(key);
      if (!line) return;
      const p = this.products.get(line.productId);
      this.lines.delete(key);
      this.render();
      this.announce(this.dataset.announceRemoved, p ? p.title : '');
      // Keep keyboard focus inside the box
      const nextRemove = this.querySelector('[data-bb-remove]');
      if (nextRemove) nextRemove.focus();
      else this.el.cta?.focus();
    }

    step(key, delta) {
      const line = this.lines.get(key);
      if (!line) return;
      if (delta > 0 && this.count() >= this.max) return this.flashStatus(fill(this.dataset.msgMax, { count: this.max }));
      line.qty += delta;
      if (line.qty <= 0) return this.removeLine(key);
      this.render();
      this.querySelector(`[data-bb-step="${delta}"][data-key="${key}"]`)?.focus();
    }

    /** Add the first available products not yet in the box until the next tier (or the minimum) is reached. */
    autoFill() {
      const target = (this.nextTier() || {}).qty || Math.max(this.min, this.count() + 1);
      const goal = Math.min(this.max, target);
      for (const card of this.cards) {
        if (this.count() >= goal) break;
        const productId = String(card.dataset.productId);
        if (this.lineForProduct(productId)[0]) continue;
        const add = card.querySelector('[data-bb-add]');
        if (!add || add.disabled) continue;
        const variantId = this.cardVariantId(card);
        const v = this.variant(productId, variantId);
        if (!v || !v.available) continue;
        this.lines.set(variantId, { productId, variantId, qty: 1 });
      }
      this.render({ pop: true });
      if (this.el.live) this.el.live.textContent = fill(this.dataset.itemsCount, { count: this.count() });
    }

    flashStatus(text) {
      if (!this.el.status) return;
      this.el.status.textContent = text;
      this.el.status.classList.remove('is-flash');
      void this.el.status.offsetWidth;
      this.el.status.classList.add('is-flash');
    }

    /* ---------------------------------------------------------------- render */

    renderCardPrice(card, v) {
      const priceEl = card.querySelector('[data-bb-card-price]');
      if (!v) {
        const add = card.querySelector('[data-bb-add]');
        if (add) {
          add.setAttribute('data-soldout', '');
          add.disabled = true;
        }
        return;
      }
      if (!priceEl) return;
      const compare =
        v.compare > v.price
          ? `<span class="new-arrivals-card__price new-arrivals-card__price--compare">${formatMoney(v.compare, this.moneyFormat)}</span>`
          : '';
      priceEl.innerHTML = `${compare}<span class="new-arrivals-card__price new-arrivals-card__price--current">${formatMoney(v.price, this.moneyFormat)}</span>`;
      const add = card.querySelector('[data-bb-add]');
      if (add) {
        add.toggleAttribute('data-soldout', !v.available);
        add.disabled = !v.available;
      }
    }

    render({ added = null, pop = false } = {}) {
      const n = this.count();
      const tier = this.activeTier(n);
      const next = this.nextTier(n);
      let subtotal = 0;
      const lines = [];
      this.lines.forEach((line, key) => {
        const v = this.variant(line.productId, line.variantId);
        const p = this.products.get(line.productId);
        if (!v || !p) return;
        subtotal += v.price * line.qty;
        lines.push({ key, line, v, p });
      });
      const savings = tier ? Math.round((subtotal * tier.pct) / 100) : 0;

      // Cards — once the box is full, products that aren't in it are locked
      const full = n >= this.max;
      this.cards.forEach((card) => {
        const [, line] = this.lineForProduct(card.dataset.productId);
        const on = !!line;
        card.classList.toggle('is-selected', on);
        card.classList.toggle('is-locked', full && !on);
        const add = card.querySelector('[data-bb-add]');
        if (add) {
          const soldOut = add.hasAttribute('data-soldout');
          add.disabled = soldOut || (full && !on);
          add.setAttribute('aria-pressed', String(on));
          const label = add.querySelector('[data-bb-add-label]');
          if (label && !soldOut) label.textContent = on ? this.dataset.addedLabel : this.dataset.addLabel;
        }
        const qty = card.querySelector('[data-bb-card-qty]');
        if (qty) qty.textContent = line && line.qty > 1 ? `×${line.qty}` : '';
      });

      // Slots: one tile per unit, plus empty tiles up to the slot count (or the next tier)
      const units = [];
      lines.forEach(({ key, line, v, p }) => {
        for (let i = 0; i < line.qty; i++) units.push({ key, img: esc(v.image || p.image || ''), title: esc(p.title) });
      });
      const totalSlots = Math.min(this.max, Math.max(this.slotCount, units.length, next ? next.qty : 0));
      const slotsHtml = [];
      for (let i = 0; i < totalSlots; i++) {
        const u = units[i];
        const tierAt = this.tiers.find((t) => t.qty === i + 1);
        if (u) {
          slotsHtml.push(
            `<li class="bb__slot is-filled${(added && u.key === added) || pop ? ' is-new' : ''}" style="--i:${i}">` +
              (u.img ? `<img src="${u.img}" alt="" width="120" height="120">` : '') +
              `<span class="visually-hidden">${u.title}</span>` +
              (tierAt ? `<span class="bb__slot-tag" aria-hidden="true">-${tierAt.pct}%</span>` : '') +
              `</li>`
          );
        } else {
          slotsHtml.push(
            `<li class="bb__slot" style="--i:${i}"><span class="visually-hidden">${esc(this.dataset.emptySlot)}</span>` +
              `<span class="bb__slot-num" aria-hidden="true">${i + 1}</span>` +
              (tierAt ? `<span class="bb__slot-tag" aria-hidden="true">-${tierAt.pct}%</span>` : '') +
              `</li>`
          );
        }
      }
      this.el.slots.innerHTML = slotsHtml.join('');
      this.el.slots.style.setProperty('--bb-slot-count', String(totalSlots));

      // Item list with steppers
      this.el.items.innerHTML = lines
        .map(({ key, line, v, p }) => {
          const name = esc(p.title);
          const img = esc(v.image || p.image || '');
          const variantTitle = v.title && v.title !== 'Default Title' ? `<span class="bb__item-variant">${esc(v.title)}</span>` : '';
          return (
            `<li class="bb__item">` +
            `<span class="bb__item-thumb">${img ? `<img src="${img}" alt="" width="56" height="56">` : ''}</span>` +
            `<span class="bb__item-info"><span class="bb__item-title">${name}</span>${variantTitle}` +
            `<span class="bb__item-price">${formatMoney(v.price * line.qty, this.moneyFormat)}</span></span>` +
            `<span class="bb__stepper">` +
            `<button type="button" data-bb-step="-1" data-key="${key}" aria-label="${esc(this.dataset.decrease)} — ${name}">−</button>` +
            `<span class="bb__stepper-qty" aria-live="off">${line.qty}</span>` +
            `<button type="button" data-bb-step="1" data-key="${key}" aria-label="${esc(this.dataset.increase)} — ${name}"${n >= this.max ? ' disabled' : ''}>+</button>` +
            `</span>` +
            `<button type="button" class="bb__item-remove" data-bb-remove="${key}" aria-label="${esc(fill(this.dataset.removeAria, { title: p.title }))}">` +
            `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>` +
            `</button>` +
            `</li>`
          );
        })
        .join('');

      // Tiers
      const topQty = this.tiers.length ? this.tiers[this.tiers.length - 1].qty : this.min;
      this.tiers.forEach((t) => t.el.classList.toggle('is-unlocked', n >= t.qty));
      this.tiers.forEach((t) => t.el.classList.toggle('is-next', next === t));
      if (this.el.fill) this.el.fill.style.transform = `scaleX(${Math.min(1, n / Math.max(1, topQty))})`;

      // Status
      let status;
      const firstTier = this.tiers[0];
      if (n < this.min) status = fill(this.dataset.msgMin, { count: this.min - n, discount: firstTier ? `${firstTier.pct}%` : '' });
      else if (next) status = fill(this.dataset.msgMore, { count: next.qty - n, discount: `${next.pct}%` });
      else if (tier) status = fill(this.dataset.msgTop, { discount: `${tier.pct}%` });
      else status = '';
      if (this.el.status) this.el.status.textContent = status;

      // Totals
      this.el.subtotal.innerHTML = savings
        ? `<s>${formatMoney(subtotal, this.moneyFormat)}</s>`
        : formatMoney(subtotal, this.moneyFormat);
      if (this.el.saveRow) this.el.saveRow.hidden = !savings;
      if (this.el.savings) this.el.savings.textContent = `−${formatMoney(savings, this.moneyFormat)}`;
      this.el.total.textContent = formatMoney(subtotal - savings, this.moneyFormat);
      if (this.el.count) {
        this.el.count.textContent = String(n);
        this.el.count.classList.remove('is-bump');
        void this.el.count.offsetWidth;
        if (n) this.el.count.classList.add('is-bump');
      }

      if (this.el.cta) this.el.cta.disabled = n < this.min;
      if (this.el.fillBtn) this.el.fillBtn.hidden = !next && n >= this.min;
      if (this.el.error) this.el.error.hidden = true;

      this.dataset.state = n === 0 ? 'empty' : n < this.min ? 'building' : 'ready';
      this.subtotalCache = { n, total: subtotal - savings };
      this.updateBar();
    }

    updateBar() {
      if (!this.el.bar) return;
      const { n = 0, total = 0 } = this.subtotalCache || {};
      const mobile = window.matchMedia('(max-width: 989px)').matches;
      const boxRect = this.el.box.getBoundingClientRect();
      const selfRect = this.getBoundingClientRect();
      const boxVisible = boxRect.top < window.innerHeight && boxRect.bottom > 0;
      const sectionVisible = selfRect.top < window.innerHeight && selfRect.bottom > 0;
      this.el.bar.hidden = !(mobile && n > 0 && sectionVisible && !boxVisible);
      if (this.el.barCount) this.el.barCount.textContent = fill(this.dataset.itemsCount, { count: n });
      if (this.el.barTotal) this.el.barTotal.textContent = formatMoney(total, this.moneyFormat);
    }

    /* ---------------------------------------------------------------- cart */

    async addToCart() {
      const btn = this.el.cta;
      if (!btn || btn.disabled || btn.getAttribute('aria-busy') === 'true') return;
      const n = this.count();
      const tier = this.activeTier(n);
      const bundleId = `${this.dataset.sectionId || 'bundle'}-${Date.now().toString(36)}`;
      const form = new FormData();
      let i = 0;
      this.lines.forEach((line) => {
        form.append(`items[${i}][id]`, line.variantId);
        form.append(`items[${i}][quantity]`, String(line.qty));
        if (this.dataset.property === 'true') form.append(`items[${i}][properties][_bundle]`, bundleId);
        i++;
      });
      const sections = Array.from(document.querySelectorAll('cart-items-component'))
        .map((el) => el.dataset && el.dataset.sectionId)
        .filter(Boolean);
      if (sections.length && !(tier && tier.code)) form.append('sections', sections.join(','));

      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      if (this.el.error) this.el.error.hidden = true;
      const routes = (window.Theme && window.Theme.routes) || {};
      try {
        const res = await fetch(routes.cart_add_url || '/cart/add.js', {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
          body: form,
        });
        let json = await res.json();
        if (json.status) throw new Error(json.description || json.message || 'Error');

        // Apply the tier's discount code to the cart (the discount must exist in Shopify admin).
        if (tier && tier.code) {
          const update = await fetch(routes.cart_update_url || '/cart/update.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ discount: tier.code, sections: sections.join(',') || undefined }),
          });
          if (update.ok) json = await update.json();
        }

        document.dispatchEvent(
          new CustomEvent('cart:update', {
            bubbles: true,
            detail: {
              resource: json,
              sourceId: 'bundle-builder',
              data: { source: 'product-form-component', itemCount: n, sections: json.sections },
            },
          })
        );
        btn.classList.add('is-success');
        if (this.el.ctaLabel) this.el.ctaLabel.textContent = this.dataset.success || this.ctaText;
        clearTimeout(this.successTimer);
        this.successTimer = setTimeout(() => {
          btn.classList.remove('is-success');
          if (this.el.ctaLabel) this.el.ctaLabel.textContent = this.ctaText;
        }, 2600);
      } catch (error) {
        if (this.el.error) {
          this.el.error.textContent = error.message;
          this.el.error.hidden = false;
        }
      } finally {
        btn.removeAttribute('aria-busy');
        btn.disabled = this.count() < this.min;
      }
    }
  }

  customElements.define('bundle-builder', BundleBuilder);
})();
