/**
 * Wholesale / B2B — <b2b-wholesale> (sections/b2b-wholesale.liquid)
 *
 * Bulk pricing calculator
 * - Preview mode (everyone who isn't a logged-in B2B customer): the section's tier blocks discount the retail price.
 *   Quantities move in case packs from the minimum order.
 * - Contract mode (logged-in Shopify B2B customer): the variant's real quantity price breaks and quantity rules
 *   from the customer's B2B catalog; the tier ladder is rebuilt from those breaks.
 * - Shows unit price, total, saving, the margin at retail price and how many more units unlock the next tier.
 * Add to cart (B2B customers, or everyone when "Let retail customers order" is on): adds the quantity and, in
 * preview mode, applies the reached tier's discount code to the cart.
 * Request a quote: fills the contact form with the product, variant, quantity and estimate and opens that tab.
 */
(() => {
  if (customElements.get('b2b-wholesale')) return;

  function formatMoney(cents, format) {
    const fmt = String(format || '${{amount}}').replace(/<[^>]*>/g, '');
    const value = Math.round(Number(cents) || 0);
    const group = (number, precision, thousands = ',', decimal = '.') => {
      const [whole, frac] = (number / 100).toFixed(precision).split('.');
      const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
      return frac ? grouped + decimal + frac : grouped;
    };
    return fmt.replace(/\{\{\s*(\w+)\s*\}\}/, (_, key) => {
      switch (key) {
        case 'amount_no_decimals':
          return group(value, 0);
        case 'amount_with_comma_separator':
          return group(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator':
          return group(value, 0, '.', ',');
        case 'amount_with_apostrophe_separator':
          return group(value, 2, "'", '.');
        case 'amount_with_space_separator':
          return group(value, 2, ' ', ',');
        default:
          return group(value, 2);
      }
    });
  }

  const fill = (template, map) =>
    Object.entries(map).reduce((text, [key, val]) => text.split(`[${key}]`).join(String(val)), template || '');

  class B2BWholesale extends HTMLElement {
    connectedCallback() {
      this.section = this.closest('.b2b') || this;
      this.format = this.dataset.moneyFormat;
      this.contract = this.dataset.mode === 'contract';
      this.caseSize = Math.max(1, parseInt(this.dataset.case, 10) || 1);
      this.minOrder = Math.max(1, parseInt(this.dataset.min, 10) || 1);

      const $ = (selector) => this.querySelector(selector);
      this.el = {
        qty: $('[data-b2b-qty]'),
        variant: $('[data-b2b-variant]'),
        variantField: $('[data-b2b-variant-field]'),
        tiers: $('[data-b2b-tiers]'),
        progress: $('[data-b2b-progress]'),
        nudge: $('[data-b2b-nudge]'),
        unit: $('[data-b2b-unit]'),
        retail: $('[data-b2b-retail]'),
        badge: $('[data-b2b-badge]'),
        total: $('[data-b2b-total]'),
        save: $('[data-b2b-save]'),
        margin: $('[data-b2b-margin]'),
        marginRow: $('[data-b2b-margin-row]'),
        marginNote: $('[data-b2b-margin-note]'),
        caseHint: $('[data-b2b-case]'),
        add: $('[data-b2b-add]'),
        addLabel: $('[data-b2b-add-label]'),
        error: $('[data-b2b-error]'),
        summary: $('[data-b2b-quote-summary]'),
        fProduct: $('[data-b2b-f-product]'),
        fVariant: $('[data-b2b-f-variant]'),
        fQty: $('[data-b2b-f-qty]'),
        fTotal: $('[data-b2b-f-total]'),
      };
      this.tabs = Array.from(this.querySelectorAll('[data-b2b-tab]'));
      this.panels = Array.from(this.querySelectorAll('[data-b2b-panel]'));

      try {
        this.data = JSON.parse($('[data-b2b-data]')?.textContent || '{}');
      } catch (e) {
        this.data = {};
      }
      this.products = this.data.products || [];
      this.blockTiers = (this.data.tiers || []).filter((t) => t.qty > 0).sort((a, b) => a.qty - b.qty);
      this.tierTemplate = this.el.tiers?.querySelector('.b2b__tier')?.cloneNode(true) || null;
      this.sortTierList();

      this.setupTabs();
      this.setupCalculator();

      // "Apply for a wholesale account" in the pitch column opens the form
      this.onApply = (event) => {
        if (!event.target.closest('[data-b2b-open-quote]')) return;
        event.preventDefault();
        this.openQuote(false);
      };
      this.section.addEventListener('click', this.onApply);

      // Coming back from a form submission: show the form tab with its message
      if (this.querySelector('[data-b2b-posted]')) {
        this.showTab('quote');
        requestAnimationFrame(() => this.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      }
      const success = this.querySelector('[data-b2b-success]');
      if (success) this.setupSuccess(success);
    }

    /* ------------------------------------------------------------ after sending */
    /**
     * The thank-you message stays on screen for the chosen delay (counted only while it is visible, and paused while
     * the visitor hovers or focuses it), then the
     * empty form comes back so another request can be sent. "Send another request" skips the wait.
     * The "sent" flag is removed from the address straight away, so a refresh shows the form, not the message.
     */
    setupSuccess(success) {
      this.success = success;
      this.formBody = this.querySelector('[data-b2b-form-body]');
      const url = new URL(location.href);
      if (url.searchParams.has('contact_posted')) {
        url.searchParams.delete('contact_posted');
        url.hash = '';
        history.replaceState(history.state, '', url.pathname + url.search);
      }
      requestAnimationFrame(() => success.focus({ preventScroll: true }));

      success.querySelector('[data-b2b-again]')?.addEventListener('click', () => this.showFormAgain(true));

      const delay = (parseInt(success.dataset.delay, 10) || 0) * 1000;
      if (!delay) return;
      const bar = success.querySelector('[data-b2b-timer]');
      let left = delay;
      let last = performance.now();
      let paused = false;
      // Count only while the message is actually on screen (the page may still be loading or scrolling to it)
      let onScreen = false;
      this.successIo = new IntersectionObserver(([entry]) => (onScreen = entry.intersectionRatio >= 0.6), {
        threshold: [0, 0.6, 1],
      });
      this.successIo.observe(success);
      const pause = () => (paused = true);
      const resume = () => {
        if (success.matches(':hover') || success.contains(document.activeElement && document.activeElement !== success ? document.activeElement : null)) return;
        paused = false;
      };
      success.addEventListener('pointerenter', pause);
      success.addEventListener('pointerleave', resume);
      success.addEventListener('focusin', (event) => {
        if (event.target !== success) pause();
      });
      success.addEventListener('focusout', () => setTimeout(resume, 0));
      const tick = (now) => {
        if (!this.success || this.success.hidden) return;
        if (!paused && onScreen && !document.hidden) left -= Math.min(100, now - last);
        last = now;
        if (bar) bar.style.transform = `scaleX(${Math.max(0, left / delay).toFixed(4)})`;
        if (left <= 0) return this.showFormAgain(false);
        this.successFrame = requestAnimationFrame(tick);
      };
      this.successFrame = requestAnimationFrame(tick);
    }

    showFormAgain(moveFocus) {
      cancelAnimationFrame(this.successFrame);
      this.successIo?.disconnect();
      if (this.success) this.success.hidden = true;
      if (!this.formBody) return;
      this.formBody.hidden = false;
      this.formBody.classList.remove('is-back');
      void this.formBody.offsetWidth;
      this.formBody.classList.add('is-back');
      // Moving focus is only right when the visitor asked for it (button); an automatic switch leaves focus alone
      const first = this.formBody.querySelector('input:not([type="hidden"]), select, textarea');
      if (moveFocus) first?.focus();
    }

    disconnectedCallback() {
      this.section.removeEventListener('click', this.onApply);
      clearTimeout(this.successTimer);
      cancelAnimationFrame(this.successFrame);
      this.successIo?.disconnect();
    }

    /* ------------------------------------------------------------ tabs */
    setupTabs() {
      this.tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => this.showTab(tab.dataset.b2bTab));
        tab.addEventListener('keydown', (event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          const next = this.tabs[(i + (event.key === 'ArrowRight' ? 1 : this.tabs.length - 1)) % this.tabs.length];
          this.showTab(next.dataset.b2bTab);
          next.focus();
        });
      });
    }

    showTab(name) {
      this.tabs.forEach((tab) => {
        const on = tab.dataset.b2bTab === name;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
      });
      this.panels.forEach((panel) => (panel.hidden = panel.dataset.b2bPanel !== name));
    }

    /* ------------------------------------------------------------ calculator */
    setupCalculator() {
      if (!this.products.length || !this.el.qty) return;
      this.productIndex = 0;
      this.variantIndex = 0;

      this.querySelectorAll('[data-b2b-product]').forEach((radio) => {
        radio.addEventListener('change', () => {
          this.querySelectorAll('.b2b__product').forEach((label) => label.classList.toggle('is-active', label.contains(radio)));
          this.selectProduct(Number(radio.value));
        });
      });
      this.el.variant?.addEventListener('change', () => {
        this.variantIndex = Number(this.el.variant.value);
        this.applyVariant(true);
      });
      this.querySelectorAll('[data-b2b-step]').forEach((button) => {
        button.addEventListener('click', () => this.setQty(this.qty + Number(button.dataset.b2bStep) * this.step));
      });
      this.el.qty.addEventListener('change', () => this.setQty(parseInt(this.el.qty.value, 10)));
      this.el.qty.addEventListener('input', () => {
        const value = parseInt(this.el.qty.value, 10);
        if (Number.isFinite(value) && value >= this.min) this.render(value);
      });
      this.el.tiers?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-b2b-tier]');
        if (button) this.setQty(Number(button.dataset.b2bTier));
      });
      this.el.add?.addEventListener('click', () => this.addToCart());
      this.querySelectorAll('[data-b2b-quote]').forEach((button) => button.addEventListener('click', () => this.openQuote(true)));

      this.selectProduct(0);
    }

    get product() {
      return this.products[this.productIndex];
    }

    get variantData() {
      return this.product.variants[this.variantIndex] || this.product.variants[0];
    }

    selectProduct(index) {
      this.productIndex = index;
      const variants = this.product.variants;
      const firstAvailable = variants.findIndex((v) => v.available);
      this.variantIndex = firstAvailable >= 0 ? firstAvailable : 0;

      const select = this.el.variant;
      if (select) {
        select.innerHTML = '';
        variants.forEach((v, i) => {
          const option = new Option(v.title, String(i), false, i === this.variantIndex);
          option.disabled = !v.available;
          select.append(option);
        });
      }
      if (this.el.variantField) this.el.variantField.hidden = variants.length < 2;
      this.applyVariant(false);
    }

    /** Pricing rules for the current variant: tiers, minimum and step */
    applyVariant(keepQty) {
      const v = this.variantData;
      this.base = v.price;
      if (this.contract) {
        this.min = Math.max(1, v.min || 1);
        this.step = Math.max(1, v.step || 1);
        this.max = v.max > 0 ? v.max : Infinity;
        this.tiers = (v.breaks || [])
          .filter((b) => b.qty > 0 && b.price < this.base)
          .sort((a, b) => a.qty - b.qty)
          .map((b) => ({ qty: b.qty, price: b.price, off: Math.round((1 - b.price / this.base) * 100), label: '' }));
        this.rebuildTierList();
      } else {
        this.step = this.caseSize;
        this.min = Math.max(this.minOrder, v.min || 1);
        this.max = v.max > 0 ? v.max : Infinity;
        this.tiers = this.blockTiers.map((t) => ({ ...t, price: Math.round(this.base * (1 - t.off / 100)) }));
      }
      if (this.el.caseHint && this.contract) this.el.caseHint.textContent = '';
      this.el.qty.min = String(this.min);
      this.el.qty.step = String(this.step);
      this.setQty(keepQty ? this.qty : this.min);
    }

    /** Round to whole steps (cases), within the minimum and maximum */
    normalize(qty) {
      let value = Number.isFinite(qty) ? qty : this.min;
      value = Math.max(this.min, value);
      if (this.step > 1) value = Math.ceil(value / this.step) * this.step;
      if (value < this.min) value = this.min;
      if (Number.isFinite(this.max)) value = Math.min(value, this.max);
      return value;
    }

    setQty(qty) {
      this.qty = this.normalize(qty);
      this.el.qty.value = String(this.qty);
      this.render(this.qty);
    }

    tierFor(qty) {
      let current = null;
      this.tiers.forEach((t) => {
        if (qty >= t.qty) current = t;
      });
      return current;
    }

    render(qty) {
      const fmt = (cents) => formatMoney(cents, this.format);
      const tier = this.tierFor(qty);
      const unit = tier ? tier.price : this.base;
      const total = unit * qty;
      const reference = this.base; // retail (preview) or catalog list price (contract)
      const saving = Math.max(0, (reference - unit) * qty);
      const off = reference > 0 ? Math.round((1 - unit / reference) * 100) : 0;
      this.current = { tier, unit, total, qty };

      this.el.unit.textContent = fmt(unit);
      this.el.retail.textContent = unit < reference ? fmt(reference) : '';
      this.el.badge.hidden = off <= 0;
      this.el.badge.textContent = `−${off}%`;
      this.el.total.textContent = fmt(total);
      this.el.save.textContent = fmt(saving);

      // Margin at the retail price: in preview the retail price, in contract mode the compare-at price if set
      const v = this.variantData;
      const rrp = this.contract ? (v.compare > unit ? v.compare : 0) : this.base;
      const showMargin = rrp > unit;
      this.el.marginRow.hidden = !showMargin;
      if (showMargin) {
        this.el.margin.textContent = `${Math.round(((rrp - unit) / rrp) * 100)}%`;
        this.el.marginNote.textContent = fill(this.el.marginNote.dataset.template, { amount: fmt(rrp - unit), price: fmt(rrp) });
      } else {
        this.el.marginNote.textContent = '';
      }

      // Ladder, progress and the nudge toward the next tier
      const items = Array.from(this.el.tiers?.querySelectorAll('.b2b__tier') || []);
      items.forEach((item) => {
        const tq = Number(item.dataset.qty);
        item.classList.toggle('is-reached', qty >= tq);
        item.classList.toggle('is-current', !!tier && tier.qty === tq);
      });
      const last = this.tiers[this.tiers.length - 1];
      if (this.el.progress) this.el.progress.style.width = last ? `${Math.min(100, (qty / last.qty) * 100).toFixed(1)}%` : '0%';
      const next = this.tiers.find((t) => t.qty > qty);
      const nudge = this.el.nudge;
      nudge.classList.toggle('is-top', !next && !!tier);
      if (qty < this.min) nudge.textContent = fill(this.dataset.textMin, { count: this.min });
      else if (next) nudge.textContent = fill(this.dataset.textNext, { count: next.qty - qty, discount: `${next.off}%` });
      else nudge.textContent = tier ? this.dataset.textTop : '';

      if (this.el.add) this.el.add.disabled = !v.available;
    }

    /** Order the server-rendered ladder by quantity (blocks can be in any order) */
    sortTierList() {
      const list = this.el.tiers;
      if (!list) return;
      Array.from(list.children)
        .sort((a, b) => Number(a.dataset.qty) - Number(b.dataset.qty))
        .forEach((li) => list.append(li));
    }

    /** Contract mode: the ladder shows the customer's own price breaks */
    rebuildTierList() {
      const list = this.el.tiers;
      if (!list || !this.tierTemplate) {
        if (list) list.innerHTML = '';
        return;
      }
      list.innerHTML = '';
      this.tiers.forEach((t, i) => {
        const li = this.tierTemplate.cloneNode(true);
        li.removeAttribute('data-shopify-editor-block');
        li.dataset.qty = String(t.qty);
        const button = li.querySelector('[data-b2b-tier]');
        button.dataset.b2bTier = String(t.qty);
        li.querySelector('.b2b__tier-name').textContent = String(i + 1).padStart(2, '0');
        li.querySelector('.b2b__tier-off').textContent = formatMoney(t.price, this.format);
        li.querySelector('.b2b__tier-qty').textContent = `${t.qty}+`;
        list.append(li);
      });
      if (this.el.progress) this.el.progress.parentElement.hidden = !this.tiers.length;
    }

    /* ------------------------------------------------------------ actions */
    openQuote(withSummary) {
      if (withSummary && this.current && this.product) {
        const v = this.variantData;
        const variantTitle = this.product.variants.length > 1 ? v.title : '';
        const productLabel = variantTitle ? `${this.product.title} (${variantTitle})` : this.product.title;
        const total = formatMoney(this.current.total, this.format);
        if (this.el.fProduct) this.el.fProduct.value = this.product.title;
        if (this.el.fVariant) this.el.fVariant.value = variantTitle;
        if (this.el.fQty) this.el.fQty.value = String(this.current.qty);
        if (this.el.fTotal) this.el.fTotal.value = total;
        if (this.el.summary) {
          this.el.summary.textContent = fill(this.dataset.textQuote, { quantity: this.current.qty, product: productLabel, total });
          this.el.summary.hidden = false;
        }
      }
      this.showTab('quote');
      const rect = this.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight * 0.6) this.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setTimeout(() => this.querySelector('[data-b2b-panel="quote"] input:not([type="hidden"])')?.focus({ preventScroll: true }), 350);
    }

    async addToCart() {
      const button = this.el.add;
      if (!button || !this.current) return;
      const routes = (window.Theme && window.Theme.routes) || {};
      const sections = Array.from(document.querySelectorAll('cart-items-component'))
        .map((el) => el.dataset && el.dataset.sectionId)
        .filter(Boolean)
        .join(',');
      const code = !this.contract && this.current.tier ? (this.current.tier.code || '').trim() : '';

      button.setAttribute('aria-busy', 'true');
      if (this.el.error) this.el.error.hidden = true;
      try {
        const res = await fetch(routes.cart_add_url || '/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            items: [{ id: this.variantData.id, quantity: this.current.qty }],
            sections: sections && !code ? sections : undefined,
          }),
        });
        let json = await res.json();
        if (!res.ok || json.status) throw new Error(json.description || json.message || this.dataset.textError);

        if (code) {
          const update = await fetch(routes.cart_update_url || '/cart/update.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ discount: code, sections: sections || undefined }),
          });
          if (update.ok) json = await update.json();
        }

        document.dispatchEvent(
          new CustomEvent('cart:update', {
            bubbles: true,
            detail: {
              resource: json,
              sourceId: 'b2b-wholesale',
              data: { source: 'product-form-component', itemCount: this.current.qty, sections: json.sections },
            },
          })
        );
        button.classList.add('is-success');
        if (this.el.addLabel) {
          this.addText = this.addText || this.el.addLabel.textContent;
          this.el.addLabel.textContent = this.dataset.textAdded;
        }
        clearTimeout(this.successTimer);
        this.successTimer = setTimeout(() => {
          button.classList.remove('is-success');
          if (this.el.addLabel && this.addText) this.el.addLabel.textContent = this.addText;
        }, 2600);
      } catch (error) {
        if (this.el.error) {
          this.el.error.textContent = error.message || this.dataset.textError;
          this.el.error.hidden = false;
        }
      } finally {
        button.removeAttribute('aria-busy');
      }
    }
  }

  customElements.define('b2b-wholesale', B2BWholesale);
})();
