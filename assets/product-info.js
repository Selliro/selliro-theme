/**
 * Whispo product page behaviour (sections/main-product.liquid, also used by featured product and quick view).
 *
 * <product-info data-section-id data-product-url data-variant-id data-featured-media-id>
 *   Root of one product. When <variant-picker> reports a new selection it requests the section rendered for
 *   those option values (Section Rendering API + option_values) and swaps every [data-variant-update] part
 *   (price, inventory, buttons, picker …) for the fresh one, shows the variant's media, updates ?variant= in
 *   the address bar (main product only) and publishes EVENTS.VARIANT_CHANGED. A value that belongs to another
 *   product (combined listing) replaces the whole product. Slow responses for an old selection are ignored.
 *
 * <variant-picker>   reports changes; keeps the "Color: Rose" legend text in step immediately.
 * <product-form>     adds to cart in place (@whispo/cart): busy state, shop error messages, then the cart drawer
 *                    opens (CART_UPDATED source data-source, default "product-form") or the cart page loads
 *                    (cart type "page").
 * <gift-card-recipient>  enables the recipient fields only when the box is ticked; sends the time zone offset.
 * <pickup-availability>  loads sections/pickup-availability.liquid for the variant.
 * <sticky-buy-bar>   moved to <body> (so no section's stacking context traps it); shown while the main
 *                    "Add to cart" button is out of view; its button submits the main form.
 * <read-more>        clamps long descriptions with a "Read more" / "Read less" toggle.
 * <share-button>     native share sheet, or copies the link.
 */
import { Component } from '@whispo/component';
import { addToCart } from '@whispo/cart';
import { EVENTS, publish } from '@whispo/events';
import { parseHTML } from '@whispo/utilities';

/* ======================================================================= product-info */
class ProductInfo extends Component {
  /** @type {AbortController | null} */
  #request = null;

  setup() {
    this.on('variant-picker:change', (event) => this.#load(/** @type {CustomEvent} */ (event).detail));
  }

  /** @param {{ ids: string[], productUrl?: string }} detail */
  async #load({ ids, productUrl }) {
    const sectionId = this.dataset.sectionId;
    if (!sectionId) return;
    const targetUrl = productUrl || this.dataset.productUrl || window.location.pathname;
    const otherProduct = Boolean(productUrl) && productUrl !== this.dataset.productUrl;

    this.#request?.abort();
    const request = (this.#request = new AbortController());
    this.setAttribute('aria-busy', 'true');

    try {
      const url = new URL(targetUrl, window.location.origin);
      url.searchParams.set('section_id', sectionId);
      if (ids.length) url.searchParams.set('option_values', ids.join(','));
      const response = await fetch(url, { signal: request.signal });
      const html = await response.text();
      if (request.signal.aborted) return;

      const next = parseHTML(html).querySelector(`product-info[data-section-id="${CSS.escape(sectionId)}"]`);
      if (!(next instanceof HTMLElement)) return;

      if (otherProduct) {
        this.replaceChildren(...Array.from(next.childNodes));
        for (const name of ['data-product-url', 'data-variant-id', 'data-featured-media-id']) {
          const value = next.getAttribute(name);
          if (value !== null) this.setAttribute(name, value);
        }
      } else {
        this.#swapParts(next);
      }

      const variantId = next.dataset.variantId || '';
      this.dataset.variantId = variantId;
      this.dataset.featuredMediaId = next.dataset.featuredMediaId || '';
      if (this.dataset.featuredMediaId) {
        /** @type {any} */ (this.querySelector('media-gallery'))?.showMedia?.(this.dataset.featuredMediaId);
      }

      if (this.hasAttribute('data-update-url')) {
        const address = new URL(otherProduct ? new URL(targetUrl, window.location.origin) : window.location.href);
        if (variantId) address.searchParams.set('variant', variantId);
        else address.searchParams.delete('variant');
        window.history.replaceState({}, '', address.toString());
      }

      document.querySelector(`sticky-buy-bar[data-section-id="${CSS.escape(sectionId)}"]`)?.dispatchEvent(
        new CustomEvent('sticky-buy-bar:update', { detail: { next } })
      );
      publish(EVENTS.VARIANT_CHANGED, { variantId, sectionId, productUrl: this.dataset.productUrl });
    } catch (error) {
      if (/** @type {Error} */ (error).name !== 'AbortError') console.error(error);
    } finally {
      if (this.#request === request) this.removeAttribute('aria-busy');
    }
  }

  /** @param {HTMLElement} next */
  #swapParts(next) {
    const focused = document.activeElement;
    const focusedValue = focused instanceof HTMLElement ? focused.dataset.optionValueId : undefined;
    const quantity = /** @type {HTMLInputElement | null} */ (this.querySelector('.product-form__quantity input'));
    const keepQuantity = quantity?.value;

    this.querySelectorAll('[data-variant-update]').forEach((part) => {
      if (!(part instanceof HTMLElement)) return;
      if (part.closest('product-info') !== this) return;
      const key = part.dataset.variantUpdate;
      if (key === 'media-root') return;
      const fresh = next.querySelector(`[data-variant-update="${CSS.escape(key || '')}"]`);
      if (fresh) part.replaceWith(document.importNode(fresh, true));
    });

    // Keep what the shopper typed in the quantity field when it is still valid
    const newQuantity = /** @type {HTMLInputElement | null} */ (this.querySelector('.product-form__quantity input'));
    if (newQuantity && keepQuantity && Number(keepQuantity) >= Number(newQuantity.min || 1)) newQuantity.value = keepQuantity;

    if (focusedValue) {
      /** @type {HTMLElement | null} */ (this.querySelector(`[data-option-value-id="${CSS.escape(focusedValue)}"]`))?.focus({ preventScroll: true });
    }
  }
}

/* ===================================================================== variant-picker */
class VariantPicker extends Component {
  setup() {
    this.on('change', (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'radio') {
        const legend = target.closest('fieldset')?.querySelector('.variant-picker__selected');
        if (legend) legend.textContent = target.value;
      }
      const chosen = this.#chosen();
      const productUrl = chosen.map((el) => el.dataset.productUrl).find((url) => url && url !== this.dataset.productUrl);
      this.emit('variant-picker:change', {
        ids: chosen.map((el) => el.dataset.optionValueId).filter(Boolean),
        productUrl,
      });
    });
  }

  /** @returns {HTMLElement[]} the checked radio or selected <option> of each option */
  #chosen() {
    const radios = Array.from(this.querySelectorAll('input[type="radio"]:checked'));
    const selects = Array.from(this.querySelectorAll('select')).map((select) => select.selectedOptions[0]);
    return /** @type {HTMLElement[]} */ ([...radios, ...selects].filter(Boolean));
  }
}

/* ======================================================================= product-form */
class ProductForm extends Component {
  setup() {
    this.on('submit', (event) => this.#submit(/** @type {SubmitEvent} */ (event)));
  }

  /** @param {SubmitEvent} event */
  async #submit(event) {
    const form = /** @type {HTMLFormElement} */ (event.target);
    if (!form.matches('form[data-type="add-to-cart-form"]')) return;
    event.preventDefault();
    if (!form.reportValidity()) return;

    const button = /** @type {HTMLButtonElement | null} */ (form.querySelector('[type="submit"][name="add"]'));
    if (!button || button.disabled || button.getAttribute('aria-busy') === 'true') return;

    const error = /** @type {HTMLElement | null} */ (form.querySelector('[data-ref="error"]'));
    if (error) error.hidden = true;
    button.setAttribute('aria-busy', 'true');

    const data = new FormData(form);
    if (data.get('selling_plan') === '') data.delete('selling_plan');
    // The quantity field may sit outside the form (form attribute)
    if (!data.has('quantity')) data.set('quantity', '1');

    try {
      await addToCart(data, { source: this.dataset.source || 'product-form' });
      if (this.dataset.cartType === 'page' || !document.querySelector('cart-drawer')) {
        window.location.href = window.Whispo?.routes?.cart || '/cart';
      }
    } catch (failure) {
      if (error) {
        error.textContent = /** @type {Error} */ (failure).message;
        error.hidden = false;
      }
    } finally {
      button.removeAttribute('aria-busy');
    }
  }
}

/* ================================================================ gift-card-recipient */
class GiftCardRecipient extends Component {
  setup() {
    const { toggle, fields, offset } = this.refs;
    if (!toggle) return;
    const sync = () => {
      const on = toggle.checked;
      fields.hidden = !on;
      (this.refs.field || []).forEach((/** @type {HTMLInputElement} */ field) => (field.disabled = !on));
      if (offset) {
        offset.disabled = !on;
        offset.value = String(new Date().getTimezoneOffset());
      }
    };
    this.on('change', sync, { target: toggle });
    sync();
  }
}

/* ================================================================ pickup-availability */
class PickupAvailability extends Component {
  setup() {
    if (this.hidden || !this.dataset.variantId) return;
    this.#load();
  }

  async #load() {
    const root = this.dataset.rootUrl || '/';
    const url = `${root.replace(/\/$/, '')}/variants/${this.dataset.variantId}/?section_id=pickup-availability`;
    try {
      const response = await fetch(url, { signal: this.signal });
      const content = parseHTML(await response.text()).querySelector('[data-pickup-content]');
      if (!content || !content.children.length) {
        this.hidden = true;
        return;
      }
      this.replaceChildren(...Array.from(content.childNodes));
    } catch (_) {
      this.hidden = true;
    }
  }
}

/* ===================================================================== sticky-buy-bar */
class StickyBuyBar extends Component {
  /** @type {IntersectionObserver | null} */
  #observer = null;

  setup() {
    // Inside a quick view or the theme editor's off-page render: stay where we are and do nothing
    if (this.closest('dialog')) return;
    if (this.parentElement !== document.body) {
      const sectionId = this.dataset.sectionId;
      document.querySelectorAll(`body > sticky-buy-bar[data-section-id="${CSS.escape(sectionId || '')}"]`).forEach((old) => old.remove());
      document.body.append(this);
      return; // reconnects in <body> and runs setup again
    }

    const target = document.getElementById(`ProductForm-${this.dataset.sectionId}`)?.querySelector('[name="add"]');
    if (!target) return;
    this.#observer = new IntersectionObserver(([entry]) => {
      const past = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      this.toggleAttribute('data-visible', past);
      this.setAttribute('aria-hidden', String(!past));
      this.inert = !past;
    });
    this.#observer.observe(target);

    this.on('sticky-buy-bar:update', (event) => {
      const next = /** @type {CustomEvent} */ (event).detail.next;
      const fresh = next?.ownerDocument?.querySelector(`sticky-buy-bar[data-section-id="${CSS.escape(this.dataset.sectionId || '')}"]`);
      if (!fresh) return;
      this.querySelectorAll('[data-sticky-update]').forEach((part) => {
        const key = /** @type {HTMLElement} */ (part).dataset.stickyUpdate || '';
        const replacement = fresh.querySelector(`[data-sticky-update="${CSS.escape(key)}"]`);
        if (replacement) part.replaceWith(document.importNode(replacement, true));
      });
    });

    document.addEventListener('shopify:section:unload', (event) => {
      if (/** @type {Element} */ (event.target).id === `shopify-section-${this.dataset.sectionId}`) this.remove();
    }, { signal: this.signal });
  }

  teardown() {
    this.#observer?.disconnect();
  }
}

/* ========================================================================== read-more */
class ReadMore extends Component {
  setup() {
    const { content, toggle } = this.refs;
    if (!content || !toggle) return;
    const measure = () => {
      this.toggleAttribute('data-clamped', true);
      const overflowing = content.scrollHeight > content.clientHeight + 2;
      toggle.hidden = !overflowing;
      if (!overflowing) this.removeAttribute('data-clamped');
    };
    this.on('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      this.toggleAttribute('data-clamped', !open);
      toggle.textContent = open ? toggle.dataset.lessLabel : toggle.dataset.moreLabel;
    }, { target: toggle });
    measure();
  }
}

/* ======================================================================= share-button */
class ShareButton extends Component {
  setup() {
    const { button, status } = this.refs;
    if (!button) return;
    this.on('click', async () => {
      const url = this.dataset.url || window.location.href;
      if (navigator.share) {
        try {
          await navigator.share({ title: document.title, url });
        } catch (_) {
          /* dismissed */
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        if (status) {
          status.textContent = this.dataset.copiedLabel || '';
          window.setTimeout(() => (status.textContent = ''), 3000);
        }
      } catch (_) {
        window.prompt('', url);
      }
    }, { target: button });
  }
}

Component.define('product-info', ProductInfo);
Component.define('variant-picker', VariantPicker);
Component.define('product-form', ProductForm);
Component.define('gift-card-recipient', GiftCardRecipient);
Component.define('pickup-availability', PickupAvailability);
Component.define('sticky-buy-bar', StickyBuyBar);
Component.define('read-more', ReadMore);
Component.define('share-button', ShareButton);
