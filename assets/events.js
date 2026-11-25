/**
 * Whispo theme events (import from '@whispo/events').
 *
 * Components talk through bubbling DOM events on `document`, so none of them needs to know about the
 * others (the cart drawer listens for CART_UPDATED; the product form only announces it).
 *
 *   import { EVENTS, publish, subscribe } from '@whispo/events';
 *   publish(EVENTS.CART_UPDATED, { cart, source: 'product-form' });
 *   const stop = subscribe(EVENTS.CART_UPDATED, ({ cart }) => …, { signal: this.signal });
 */

export const EVENTS = Object.freeze({
  /** detail: { cart, source, items? } — after any change to the cart */
  CART_UPDATED: 'whispo:cart-updated',
  /** detail: { message, source } — a cart request failed */
  CART_ERROR: 'whispo:cart-error',
  /** detail: { variant, productId, sectionId } — the selected variant changed */
  VARIANT_CHANGED: 'whispo:variant-changed',
  /** detail: { id } — a drawer / modal opened or closed */
  DIALOG_OPENED: 'whispo:dialog-opened',
  DIALOG_CLOSED: 'whispo:dialog-closed',
});

/**
 * @param {string} type
 * @param {any} [detail]
 */
export function publish(type, detail) {
  document.dispatchEvent(new CustomEvent(type, { detail }));
}

/**
 * @param {string} type
 * @param {(detail: any, event: CustomEvent) => void} handler
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {() => void} unsubscribe
 */
export function subscribe(type, handler, options = {}) {
  const listener = (/** @type {Event} */ event) => handler(/** @type {CustomEvent} */ (event).detail, /** @type {CustomEvent} */ (event));
  document.addEventListener(type, listener, { signal: options.signal });
  return () => document.removeEventListener(type, listener);
}
