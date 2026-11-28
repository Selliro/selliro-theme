/**
 * Whispo cart items (<cart-items data-section-id>), used by the cart drawer ("cart-drawer") and the cart page
 * (its section id). Markup: snippets/cart-line.liquid, snippets/cart-summary.liquid.
 *
 *   quantity   changes are sent after a short pause (several clicks become one request); 0 removes the line
 *   remove     the trash button removes the line
 *   note       saved after typing stops
 *   discounts  apply a code (Enter or the button) / remove a chip; codes the cart can't use show an error
 * After every change the fresh HTML for this section comes back with the cart (assets/cart.js) and replaces the
 * content, keeping keyboard focus on the same control. Changes made elsewhere (product form, quick add) are
 * picked up the same way through EVENTS.CART_UPDATED. Line errors (stock limits) show under the line and are
 * announced.
 */
import { Component } from '@whispo/component';
import { changeLine, updateCart } from '@whispo/cart';
import { EVENTS, subscribe } from '@whispo/events';
import { debounce, parseHTML } from '@whispo/utilities';

class CartItems extends Component {
  setup() {
    const source = this.#source();

    this.on('change', '.quantity__input', (_event, input) => {
      const field = /** @type {HTMLInputElement} */ (input);
      this.#queueQuantity(field.dataset.lineKey || '', Number(field.value));
    });
    this.on('click', '[data-remove]', (_event, button) => {
      this.#change(/** @type {HTMLElement} */ (button).dataset.remove || '', 0);
    });

    const saveNote = debounce((/** @type {string} */ note) => updateCart({ note }, { source }).catch(() => {}), 500);
    this.on('input', '[data-ref="note"]', (_event, field) => saveNote(/** @type {HTMLTextAreaElement} */ (field).value));

    this.on('click', '[data-ref="discountApply"]', () => this.#applyDiscount());
    this.on('keydown', '[data-ref="discountInput"]', (event) => {
      if (/** @type {KeyboardEvent} */ (event).key !== 'Enter') return;
      event.preventDefault();
      this.#applyDiscount();
    });
    this.on('click', '[data-remove-code]', (_event, button) => this.#removeDiscount(/** @type {HTMLElement} */ (button).dataset.removeCode || ''));

    subscribe(EVENTS.CART_UPDATED, ({ sections }) => {
      const html = sections?.[this.dataset.sectionId || ''];
      if (html) this.#render(html);
    }, { signal: this.signal });
  }

  #source() {
    return this.dataset.sectionId === 'cart-drawer' ? 'cart-drawer' : 'cart-page';
  }

  /** @type {Map<string, number>} */
  #pending = new Map();

  #flush = debounce(() => {
    const entries = Array.from(this.#pending.entries());
    this.#pending.clear();
    entries.forEach(([key, quantity]) => this.#change(key, quantity));
  }, 350);

  /** @param {string} key @param {number} quantity */
  #queueQuantity(key, quantity) {
    if (!key) return;
    this.#pending.set(key, quantity);
    this.#flush();
  }

  /** @param {string} key @param {number} quantity */
  async #change(key, quantity) {
    const line = /** @type {HTMLElement | null} */ (this.querySelector(`[data-line-key="${CSS.escape(key)}"]`));
    line?.setAttribute('aria-busy', 'true');
    this.toggleAttribute('data-busy', true);

    // Expected total for this variant across every line (discounts can split one item into several lines)
    const variantId = line?.dataset.variantId || '';
    const sameVariant = Array.from(this.querySelectorAll(`[data-variant-id="${CSS.escape(variantId)}"]`));
    const totalBefore = sameVariant.reduce((sum, el) => sum + Number(/** @type {HTMLElement} */ (el).dataset.quantity || 0), 0);
    const expected = totalBefore - Number(line?.dataset.quantity || 0) + quantity;

    try {
      const cart = await changeLine(key, quantity, { source: this.#source() });
      // Shopify caps the quantity at what is in stock without failing: say so
      const total = (cart.items || [])
        .filter((/** @type {any} */ entry) => String(entry.variant_id) === variantId)
        .reduce((/** @type {number} */ sum, /** @type {any} */ entry) => sum + entry.quantity, 0);
      if (variantId && total < expected) {
        this.#lineError(key, window.Whispo?.strings?.quantityError || '');
      }
    } catch (error) {
      line?.removeAttribute('aria-busy');
      this.#lineError(key, /** @type {Error} */ (error).message);
    } finally {
      this.removeAttribute('data-busy');
    }
  }

  /** @param {string} key @param {string} message */
  #lineError(key, message) {
    const error = /** @type {HTMLElement | null} */ (this.querySelector(`[data-line-key="${CSS.escape(key)}"] [data-line-error]`));
    if (!error || !message) return;
    error.textContent = message;
    error.hidden = false;
  }

  /** @returns {string[]} */
  #codes() {
    const list = /** @type {HTMLElement | null} */ (this.querySelector('[data-codes]'));
    return (list?.dataset.codes || '').split(',').map((code) => code.trim()).filter(Boolean);
  }

  async #applyDiscount() {
    const { discountInput, discountError } = this.refs;
    const code = discountInput?.value.trim();
    if (!code) return;
    if (discountError) discountError.hidden = true;
    const codes = this.#codes();
    if (codes.includes(code)) return;
    try {
      const cart = await updateCart({ discount: [...codes, code].join(',') }, { source: this.#source() });
      const applied = cart.discount_codes?.find((/** @type {any} */ entry) => entry.code.toLowerCase() === code.toLowerCase());
      if (applied && !applied.applicable) {
        const error = /** @type {HTMLElement | null} */ (this.querySelector('[data-ref="discountError"]'));
        if (error) {
          error.textContent = (window.Whispo?.strings?.discountNotApplicable || '').replace('[code]', code);
          error.hidden = false;
        }
      }
    } catch (error) {
      if (discountError) {
        discountError.textContent = /** @type {Error} */ (error).message;
        discountError.hidden = false;
      }
    }
  }

  /** @param {string} code */
  async #removeDiscount(code) {
    const codes = this.#codes().filter((entry) => entry !== code);
    await updateCart({ discount: codes.join(',') }, { source: this.#source() }).catch(() => {});
  }

  /** @param {string} html section HTML from the Section Rendering API */
  #render(html) {
    const fresh = parseHTML(html).querySelector(`cart-items[data-section-id="${CSS.escape(this.dataset.sectionId || '')}"]`);
    if (!fresh) return;

    // Remember the focused control so keyboard users stay where they were
    const active = document.activeElement;
    let focusSelector = '';
    if (active instanceof HTMLElement && this.contains(active)) {
      const line = active.closest('[data-line-key]');
      if (line && active.matches('.quantity__input, .quantity__button, [data-remove]')) {
        const key = CSS.escape(/** @type {HTMLElement} */ (line).dataset.lineKey || '');
        const role = active.matches('.quantity__input') ? '.quantity__input' : active.matches('[data-remove]') ? '[data-remove]' : `.quantity__button[data-ref="${active.dataset.ref}"]`;
        focusSelector = `[data-line-key="${key}"] ${role}`;
      } else if (active.dataset.ref) {
        focusSelector = `[data-ref="${active.dataset.ref}"]`;
      }
    }
    const openFolds = Array.from(this.querySelectorAll('details.cart-summary__fold')).map((fold) => /** @type {HTMLDetailsElement} */ (fold).open);

    this.replaceChildren(...Array.from(fresh.childNodes));
    this.refresh();

    this.querySelectorAll('details.cart-summary__fold').forEach((fold, index) => {
      if (openFolds[index]) /** @type {HTMLDetailsElement} */ (fold).open = true;
    });
    if (focusSelector) {
      const target = /** @type {HTMLElement | null} */ (this.querySelector(focusSelector));
      (target || /** @type {HTMLElement | null} */ (this.querySelector('[data-dialog-close]')))?.focus({ preventScroll: true });
    }
  }
}

Component.define('cart-items', CartItems);
