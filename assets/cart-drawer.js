/**
 * Whispo cart drawer (snippets/cart-drawer.liquid → <cart-drawer>).
 *
 *   - The header's cart link ([data-cart-toggle]) opens the drawer instead of going to the cart page.
 *   - Adding to cart from a product form, quick add or "Pair it with" opens it (EVENTS.CART_UPDATED);
 *     the new content arrives with that event (assets/cart-items.js).
 *   - Close badge: outside the panel, a round white badge with a cross follows the pointer, showing that a
 *     click there closes the drawer (mouse and pen only; hidden over the panel and for reduced motion it
 *     simply appears without following).
 */
import { Component } from '@whispo/component';
import { closeDialog, openDialog } from '@whispo/dialog';
import { EVENTS, subscribe } from '@whispo/events';
import { prefersReducedMotion } from '@whispo/utilities';

const OPEN_ON = new Set(['product-form', 'quick-add', 'pair-with']);

class CartDrawer extends Component {
  get dialog() {
    return /** @type {HTMLDialogElement | null} */ (this.querySelector('dialog'));
  }

  setup() {
    this.on('click', (event) => {
      const toggle = event.target instanceof Element ? event.target.closest('[data-cart-toggle]') : null;
      if (!toggle) return;
      event.preventDefault();
      this.open(/** @type {HTMLElement} */ (toggle));
    }, { target: document });

    subscribe(EVENTS.CART_UPDATED, ({ source }) => {
      if (OPEN_ON.has(source)) {
        // Close a quick view first, so the drawer is the only dialog
        document.querySelectorAll('dialog.dialog[open]').forEach((dialog) => {
          if (dialog !== this.dialog) closeDialog(dialog);
        });
        this.open();
      }
    }, { signal: this.signal });

    this.#setupCursor();
  }

  /** @param {HTMLElement} [opener] */
  open(opener) {
    const dialog = this.dialog;
    if (!dialog) return;
    if (!dialog.open) openDialog(dialog, opener || document.querySelector('[data-cart-toggle]'));
  }

  #setupCursor() {
    const { panel, cursor } = this.refs;
    const dialog = this.dialog;
    if (!panel || !cursor || !dialog) return;

    const hide = () => cursor.removeAttribute('data-visible');
    this.on('pointermove', (event) => {
      const pointer = /** @type {PointerEvent} */ (event);
      if (pointer.pointerType === 'touch') return;
      const overPanel = pointer.target instanceof Node && panel.contains(pointer.target);
      if (overPanel || dialog.hasAttribute('data-closing')) {
        hide();
        return;
      }
      if (!prefersReducedMotion() || !cursor.hasAttribute('data-visible')) {
        cursor.style.translate = `${pointer.clientX}px ${pointer.clientY}px`;
      }
      cursor.toggleAttribute('data-visible', true);
    }, { target: dialog });
    this.on('pointerleave', hide, { target: dialog });
    this.on('pointerdown', hide, { target: dialog });
    this.on('close', hide, { target: dialog });
  }
}

Component.define('cart-drawer', CartDrawer);
