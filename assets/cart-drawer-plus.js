/**
 * Cart drawer extras (snippets/cart-drawer.liquid):
 *   <cart-shipping-progress>  free shipping bar; converts the threshold when the shopper uses another currency
 *   <cart-recommendations>    "You may also like" row with quick add, rendered from sections/cart-recommendations
 *   added-item highlight      the row of a product that was just added pulses once
 *
 * The drawer is re-rendered (morphed) after every cart change. <cart-recommendations> carries
 * data-skip-subtree-update, so the morph leaves its products alone; it reloads itself when its data-cart-key
 * (a hash of the cart lines) changes, and the results are cached per cart state.
 */
import { CartAddEvent, ThemeEvents } from '@theme/events';
import { prefersReducedMotion } from '@theme/utilities';

const SECTION_ID = 'cart-recommendations';

/* -------------------------------------------------------------- free shipping */
class CartShippingProgress extends HTMLElement {
  static observedAttributes = ['data-total', 'data-threshold'];

  connectedCallback() {
    this.#queue();
  }

  attributeChangedCallback() {
    this.#queue();
  }

  #queue() {
    // Run after the morph has finished updating this element's other attributes (style, class)
    queueMicrotask(() => this.#convert());
  }

  #convert() {
    const currency = window.Shopify?.currency;
    const rate = parseFloat(currency?.rate || '1');
    if (!currency?.active || !rate || rate === 1 || currency.active === this.dataset.shopCurrency) return;

    const threshold = Math.round(Number(this.dataset.threshold) * rate);
    const total = Number(this.dataset.total);
    const remaining = Math.max(0, threshold - total);
    const percent = threshold > 0 ? Math.min(100, (total / threshold) * 100) : 100;

    this.style.setProperty('--ship-progress', `${percent}%`);
    this.classList.toggle('cart-ship--unlocked', remaining === 0);
    const amount = this.querySelector('[data-shipping-amount]');
    if (amount) {
      try {
        amount.textContent = new Intl.NumberFormat(document.documentElement.lang || undefined, {
          style: 'currency',
          currency: currency.active,
        }).format(remaining / 100);
      } catch (error) {
        /* keep the server-rendered amount */
      }
    }
  }
}

/* ------------------------------------------------------------ recommendations */
/** @type {Map<string, string>} */
const cache = new Map();

// Products the cart refused (for example app bundles that need their own page): skipped for this visit
const BLOCKED_KEY = 'whispo-cart-recs-blocked';
const blocked = new Set(
  (() => {
    try {
      return JSON.parse(sessionStorage.getItem(BLOCKED_KEY) || '[]');
    } catch (error) {
      return [];
    }
  })()
);
const block = (/** @type {string} */ id) => {
  blocked.add(id);
  try {
    sessionStorage.setItem(BLOCKED_KEY, JSON.stringify([...blocked]));
  } catch (error) {
    /* storage unavailable: still skipped until the page reloads */
  }
};

class CartRecommendations extends HTMLElement {
  static observedAttributes = ['data-cart-key', 'data-product-id'];

  /** @type {number | undefined} */
  #timer;
  #requestKey = '';

  connectedCallback() {
    this.addEventListener('submit', this.#onSubmit);
    this.addEventListener('click', this.#onClick);
    this.#schedule(true);
  }

  disconnectedCallback() {
    this.removeEventListener('submit', this.#onSubmit);
    this.removeEventListener('click', this.#onClick);
    clearTimeout(this.#timer);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== null && oldValue !== newValue) this.#schedule(false);
  }

  get #url() {
    const productId = this.dataset.productId;
    if (productId) {
      const limit = Math.min(10, Number(this.dataset.limit || 6) + 4);
      return `${this.dataset.recsUrl}?product_id=${productId}&limit=${limit}&intent=related&section_id=${SECTION_ID}`;
    }
    const root = this.dataset.rootUrl || '/';
    return `${root.endsWith('/') ? root : `${root}/`}?section_id=${SECTION_ID}`;
  }

  /** @param {boolean} initial */
  #schedule(initial) {
    clearTimeout(this.#timer);
    // First load waits for an idle moment so it never competes with the page; later loads follow cart changes
    const run = () => this.#load();
    if (initial && 'requestIdleCallback' in window) {
      this.#timer = window.setTimeout(() => window.requestIdleCallback(run, { timeout: 2500 }), 600);
    } else {
      this.#timer = window.setTimeout(run, initial ? 800 : 40);
    }
  }

  async #load() {
    const url = this.#url;
    const key = `${url}|${this.dataset.cartKey}`;
    this.#requestKey = key;

    let html = cache.get(key);
    if (html === undefined) {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        html = doc.querySelector('[data-cart-recs-content]')?.outerHTML || '';
        cache.set(key, html);
      } catch (error) {
        return;
      }
    }
    if (this.#requestKey !== key) return; // the cart changed again meanwhile

    // Let a just-added card show its tick before the row refreshes
    const justAdded = this.querySelector('.cart-recs__add.is-added');
    if (justAdded) await new Promise((resolve) => setTimeout(resolve, 1250));
    if (this.#requestKey !== key) return;

    this.#render(html);
  }

  /** @param {string} html */
  #render(html) {
    const scroll = this.querySelector('[data-cart-recs-track]')?.scrollLeft || 0;
    this.innerHTML = html;
    this.querySelectorAll('.cart-recs__card[data-product-id]').forEach((card) => {
      if (blocked.has(/** @type {HTMLElement} */ (card).dataset.productId || '')) card.remove();
    });
    let track = this.querySelector('[data-cart-recs-track]');
    if (track && !track.children.length) {
      this.innerHTML = '';
      track = null;
    }
    this.classList.toggle('is-empty', !track);
    if (!track) return;
    track.scrollLeft = scroll;
    track.addEventListener('scroll', () => this.#updateArrows(), { passive: true });
    this.#updateArrows();
  }

  #updateArrows() {
    const track = this.querySelector('[data-cart-recs-track]');
    if (!track) return;
    const prev = this.querySelector('[data-cart-recs-prev]');
    const next = this.querySelector('[data-cart-recs-next]');
    const max = track.scrollWidth - track.clientWidth - 2;
    if (prev instanceof HTMLButtonElement) prev.disabled = track.scrollLeft <= 2;
    if (next instanceof HTMLButtonElement) next.disabled = track.scrollLeft >= max;
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const target = /** @type {Element} */ (event.target);
    const arrow = target.closest('[data-cart-recs-prev], [data-cart-recs-next]');
    if (!arrow) return;
    const track = this.querySelector('[data-cart-recs-track]');
    const card = track?.querySelector('.cart-recs__card');
    if (!track || !card) return;
    const step = card.getBoundingClientRect().width + 12;
    const direction = arrow.hasAttribute('data-cart-recs-prev') ? -1 : 1;
    track.scrollBy({ left: direction * step, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  /** @param {SubmitEvent} event */
  #onSubmit = async (event) => {
    const form = /** @type {Element} */ (event.target).closest('[data-cart-recs-form]');
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();

    const button = form.querySelector('.cart-recs__add');
    if (!button || button.classList.contains('is-loading')) return;
    button.classList.add('is-loading');

    const body = new FormData(form);
    body.set('quantity', '1');
    const sectionIds = Array.from(document.querySelectorAll('cart-items-component'))
      .map((node) => /** @type {HTMLElement} */ (node).dataset.sectionId)
      .filter(Boolean);
    if (sectionIds.length) body.append('sections', sectionIds.join(','));

    try {
      const response = await fetch(window.Theme?.routes?.cart_add_url || '/cart/add.js', {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body,
      });
      const json = await response.json();
      button.classList.remove('is-loading');
      if (!response.ok || json.status) {
        // The product can't be added from here (e.g. an app bundle): offer its page instead
        const card = form.closest('.cart-recs__card');
        const link = card?.querySelector('.cart-recs__title');
        button.classList.add('is-error');
        if (card instanceof HTMLElement && link instanceof HTMLAnchorElement) {
          block(card.dataset.productId || '');
          setTimeout(() => {
            const view = document.createElement('a');
            view.className = 'cart-recs__add cart-recs__add--view';
            view.href = link.href;
            view.textContent = this.dataset.viewLabel || 'View';
            view.title = json.description || json.message || '';
            form.replaceChildren(view);
          }, 420);
        }
        return;
      }
      button.classList.add('is-added');
      // Show the tick, then fold the card away (the refreshed list replaces the row a moment later)
      const card = form.closest('.cart-recs__card');
      if (card instanceof HTMLElement) {
        setTimeout(() => {
          if (!card.isConnected) return;
          if (prefersReducedMotion()) return card.remove();
          card.style.setProperty('--card-w', `${card.getBoundingClientRect().width}px`);
          card.classList.add('is-leaving');
          card.addEventListener('animationend', () => card.remove(), { once: true });
        }, 750);
      }
      this.dispatchEvent(
        new CartAddEvent(json, String(json.variant_id || body.get('id')), {
          source: 'cart-recommendations',
          itemCount: 1,
          productId: String(json.product_id || ''),
          sections: json.sections,
        })
      );
    } catch (error) {
      button.classList.remove('is-loading');
    }
  };
}

/* --------------------------------------------------------- added-item pulse */
/** @param {any} detail */
function addedVariantIds(detail) {
  const ids = new Set();
  const resource = detail?.resource;
  if (resource?.variant_id) ids.add(String(resource.variant_id));
  if (Array.isArray(resource?.items)) resource.items.forEach((item) => item?.variant_id && ids.add(String(item.variant_id)));
  if (detail?.sourceId && /^\d+$/.test(String(detail.sourceId))) ids.add(String(detail.sourceId));
  if (detail?.data?.variantId) ids.add(String(detail.data.variantId));
  return ids;
}

document.addEventListener(ThemeEvents.cartUpdate, (event) => {
  const detail = /** @type {CustomEvent} */ (event).detail;
  const data = detail?.data || {};
  if (data.source === 'cart-items-component' || data.didError) return;
  const ids = addedVariantIds(detail);
  if (!ids.size) return;

  // The drawer morphs in the same tick; mark the rows once the new markup is in place
  setTimeout(() => {
    ids.forEach((id) => {
      document.querySelectorAll(`.cart-drawer [data-variant-id="${id}"]`).forEach((row) => {
        row.classList.remove('is-just-added');
        void (/** @type {HTMLElement} */ (row).offsetWidth);
        row.classList.add('is-just-added');
        setTimeout(() => row.classList.remove('is-just-added'), 1800);
      });
    });
  }, 80);
});

if (!customElements.get('cart-shipping-progress')) customElements.define('cart-shipping-progress', CartShippingProgress);
if (!customElements.get('cart-recommendations')) customElements.define('cart-recommendations', CartRecommendations);
