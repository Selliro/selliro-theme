/**
 * Whispo cart API (import from '@whispo/cart').
 *
 *   addToCart(formData | { items }, { source })     POST /cart/add.js
 *   changeLine(lineKey, quantity, { source })       POST /cart/change.js (quantity 0 removes the line)
 *   updateCart({ updates, note, attributes })       POST /cart/update.js
 *   getCart()                                       GET  /cart.js
 *
 * Every successful change publishes EVENTS.CART_UPDATED with { cart, sections, source, items? }:
 *   cart      the full cart object (item_count drives the header count)
 *   sections  freshly rendered HTML for every cart section on the page, so no second request is needed.
 *             A section asks to be included by adding data-cart-section="<section id>" to an element.
 *   source    who made the change ('product-form', 'cart-drawer', 'cart-page', 'quick-add', …)
 * Failures publish EVENTS.CART_ERROR with { message, source } and reject with an Error whose message
 * is the shop's own text (for example "You can only add 2 of this item to your cart").
 */
import { EVENTS, publish } from '@whispo/events';

const route = (/** @type {'cartAdd' | 'cartChange' | 'cartUpdate' | 'cart'} */ name, fallback) =>
  window.Whispo?.routes?.[name] || fallback;

/** Section ids that want fresh HTML after a cart change */
export function cartSections() {
  const ids = new Set(['cart-drawer']);
  document.querySelectorAll('[data-cart-section]').forEach((el) => {
    const id = /** @type {HTMLElement} */ (el).dataset.cartSection;
    if (id) ids.add(id);
  });
  return Array.from(ids);
}

/**
 * @param {string} url
 * @param {FormData | object} body
 */
async function post(url, body) {
  const isForm = body instanceof FormData;
  const response = await fetch(url, {
    method: 'POST',
    headers: isForm ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: isForm ? body : JSON.stringify(body),
  });
  let data = {};
  try {
    data = await response.json();
  } catch (_) {
    /* empty body */
  }
  if (!response.ok || /** @type {any} */ (data).status) {
    const message =
      /** @type {any} */ (data).description ||
      /** @type {any} */ (data).message ||
      window.Whispo?.strings?.cartError ||
      'Error';
    const error = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    /** @type {any} */ (error).data = data;
    throw error;
  }
  return /** @type {any} */ (data);
}

export async function getCart() {
  const response = await fetch(`${route('cart', '/cart')}.js`, { headers: { Accept: 'application/json' } });
  return response.json();
}

/**
 * @param {string} source
 * @param {any} error
 */
function fail(source, error) {
  publish(EVENTS.CART_ERROR, { message: error.message, source });
  throw error;
}

/**
 * @param {FormData | { items: Array<{ id: number, quantity: number, properties?: object, selling_plan?: number }> }} payload
 * @param {{ source?: string }} [options]
 */
export async function addToCart(payload, { source = 'product-form' } = {}) {
  const sections = cartSections();
  let body = payload;
  if (payload instanceof FormData) {
    payload.set('sections', sections.join(','));
    payload.set('sections_url', window.location.pathname);
  } else {
    body = { ...payload, sections, sections_url: window.location.pathname };
  }
  try {
    const result = await post(`${route('cartAdd', '/cart/add')}.js`, body);
    const cart = await getCart();
    const items = result.items || [result];
    publish(EVENTS.CART_UPDATED, { cart, sections: result.sections || {}, source, items });
    return { cart, items, sections: result.sections || {} };
  } catch (error) {
    return fail(source, error);
  }
}

/**
 * @param {string} lineKey cart line key (item.key)
 * @param {number} quantity
 * @param {{ source?: string }} [options]
 */
export async function changeLine(lineKey, quantity, { source = 'cart' } = {}) {
  try {
    const cart = await post(`${route('cartChange', '/cart/change')}.js`, {
      id: lineKey,
      quantity,
      sections: cartSections(),
      sections_url: window.location.pathname,
    });
    publish(EVENTS.CART_UPDATED, { cart, sections: cart.sections || {}, source });
    return cart;
  } catch (error) {
    return fail(source, error);
  }
}

/**
 * @param {{ updates?: object, note?: string, attributes?: object, discount?: string }} changes
 * @param {{ source?: string }} [options]
 */
export async function updateCart(changes, { source = 'cart' } = {}) {
  try {
    const cart = await post(`${route('cartUpdate', '/cart/update')}.js`, {
      ...changes,
      sections: cartSections(),
      sections_url: window.location.pathname,
    });
    publish(EVENTS.CART_UPDATED, { cart, sections: cart.sections || {}, source });
    return cart;
  } catch (error) {
    return fail(source, error);
  }
}

/*
 * Bridge for sections that post to /cart/add.js themselves (bundle builder, routine builder, wholesale order
 * form, new arrivals …) and announce it with a "cart:update" event: fetch the cart and the cart sections, then
 * publish EVENTS.CART_UPDATED like every other change, so the header count and the cart drawer follow.
 */
document.addEventListener('cart:update', async (event) => {
  const detail = /** @type {CustomEvent} */ (event).detail || {};
  try {
    const ids = cartSections();
    const [cart, sections] = await Promise.all([
      getCart(),
      fetch(`${window.location.pathname}?sections=${ids.join(',')}`, { headers: { Accept: 'application/json' } }).then((response) => response.json()),
    ]);
    publish(EVENTS.CART_UPDATED, { cart, sections, source: 'quick-add', origin: detail.sourceId });
  } catch (_) {
    /* the section already changed the cart; the count catches up on the next change */
  }
});
