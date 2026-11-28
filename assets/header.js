/**
 * Whispo header (sections/header.liquid).
 *
 * <header-component>
 *   Size       Publishes --header-height (header only) and --header-bottom (distance from the top of the
 *              screen to the header's bottom edge) on <html>; used by scroll-padding, the mega menu
 *              overlay and sticky elements further down the page.
 *   Sticky     data-sticky="always" stays at the top; "scroll-up" slides away while scrolling down and
 *              comes back when scrolling up (data-hidden). data-scrolled is set once the page has
 *              scrolled, for the shadow. Never hides while a submenu is open.
 *   Submenus   Items with [data-submenu] (dropdown or mega menu) open:
 *                - on hover with a short delay, closing a moment after the pointer leaves;
 *                - with the chevron button next to the link (aria-expanded / aria-controls);
 *                - on the first tap on touch screens (the second tap follows the link).
 *              Escape closes and returns focus to the chevron; leaving with Tab or clicking outside
 *              closes. Only one submenu is open at a time. data-menu-open on the header names the open
 *              type (the mega menu dims the page).
 *   Disclosures  details[data-disclosure] (country/region, language): one open at a time, closed on an
 *              outside click and on Escape.
 *   Theme editor  Selecting a "Mega menu image" block opens its menu; deselecting closes it.
 *
 * <cart-count>
 *   Keeps the cart bubble and its screen reader label in sync with EVENTS.CART_UPDATED.
 *
 * No-JS: submenus open with :hover / :focus-within (assets/section-header.css), disclosures are native.
 */
import { Component } from '@whispo/component';
import { EVENTS, subscribe } from '@whispo/events';

const OPEN_DELAY = 90;
const CLOSE_DELAY = 220;

class HeaderComponent extends Component {
  /** @type {HTMLElement | null} */
  #openItem = null;

  /** @type {number | undefined} */
  #timer;

  /** last pointer type, so a tap can be told apart from a mouse click */
  #pointerType = 'mouse';

  #lastScroll = 0;

  #ticking = false;

  setup() {
    this.#observeSize();
    this.#setupSticky();
    this.#setupSubmenus();
    this.#setupDisclosures();
    this.#setupEditor();
  }

  teardown() {
    window.clearTimeout(this.#timer);
    this.#resizeObserver?.disconnect();
  }

  /* ---------------------------------------------------------------------------- size */

  /** @type {ResizeObserver | null} */
  #resizeObserver = null;

  #observeSize() {
    const root = document.documentElement;
    const update = () => {
      const rect = this.getBoundingClientRect();
      root.style.setProperty('--header-height', `${Math.round(rect.height)}px`);
      root.style.setProperty('--header-bottom', `${Math.max(0, Math.round(rect.bottom))}px`);
    };
    this.#resizeObserver = new ResizeObserver(update);
    this.#resizeObserver.observe(this);
    this.#updateBottom = update;
    update();
  }

  /** @type {() => void} */
  #updateBottom = () => {};

  /* -------------------------------------------------------------------------- sticky */

  #setupSticky() {
    this.#lastScroll = window.scrollY;
    this.on('scroll', () => this.#onScroll(), { target: window, passive: true });
    this.#onScroll();
  }

  #onScroll() {
    if (this.#ticking) return;
    this.#ticking = true;
    window.requestAnimationFrame(() => {
      this.#ticking = false;
      const y = Math.max(0, window.scrollY);
      const mode = this.dataset.sticky;
      this.toggleAttribute('data-scrolled', mode !== 'none' && y > 4);

      if (mode === 'scroll-up') {
        const delta = y - this.#lastScroll;
        const pastHeader = y > this.offsetHeight * 2;
        if (delta > 6 && pastHeader && !this.#openItem && !document.documentElement.classList.contains('has-dialog')) {
          this.toggleAttribute('data-hidden', true);
        } else if (delta < -6 || !pastHeader) {
          this.toggleAttribute('data-hidden', false);
        }
      }
      this.#lastScroll = y;
      this.#updateBottom();
    });
  }

  /* ------------------------------------------------------------------------ submenus */

  #setupSubmenus() {
    this.on('pointerdown', (event) => {
      this.#pointerType = event.pointerType || 'mouse';
    }, { target: document, capture: true });

    for (const item of /** @type {HTMLElement[]} */ (this.refs.item || [])) {
      this.on('pointerenter', (event) => {
        if (event.pointerType !== 'mouse') return;
        this.#schedule(() => this.open(item), this.#openItem ? 0 : OPEN_DELAY);
      }, { target: item });

      this.on('pointerleave', (event) => {
        if (event.pointerType !== 'mouse') return;
        this.#schedule(() => this.close(item), CLOSE_DELAY);
      }, { target: item });

      this.on('focusout', (event) => {
        const next = /** @type {FocusEvent} */ (event).relatedTarget;
        if (next instanceof Node && item.contains(next)) return;
        if (this.#openItem === item) this.close(item);
      }, { target: item });
    }

    // Chevron button
    this.on('click', '.header__toggle', (_event, button) => {
      const item = /** @type {HTMLElement} */ (button.closest('[data-submenu]'));
      if (this.#openItem === item) this.close(item);
      else this.open(item);
    });

    // First tap on a link with a submenu opens it instead of following the link
    this.on('click', '[data-submenu] > .header__link', (event, link) => {
      if (this.#pointerType === 'mouse' || this.#pointerType === 'pen') return;
      const item = /** @type {HTMLElement} */ (link.parentElement);
      if (this.#openItem !== item) {
        event.preventDefault();
        this.open(item);
      }
    });

    this.on('keydown', (event) => {
      if (event.key !== 'Escape' || !this.#openItem) return;
      const item = this.#openItem;
      this.close(item);
      /** @type {HTMLElement | null} */ (item.querySelector('.header__toggle'))?.focus();
    });

    // Outside click or tap
    this.on('pointerdown', (event) => {
      if (!this.#openItem) return;
      const target = event.target instanceof Node ? event.target : null;
      if (target && this.#openItem.contains(target)) return;
      this.close(this.#openItem);
    }, { target: document });

    this.on('click', '.header__overlay', () => {
      if (this.#openItem) this.close(this.#openItem);
    });
  }

  /** @param {() => void} fn @param {number} delay */
  #schedule(fn, delay) {
    window.clearTimeout(this.#timer);
    if (delay <= 0) fn();
    else this.#timer = window.setTimeout(fn, delay);
  }

  /** @param {HTMLElement} item */
  open(item) {
    if (this.#openItem === item) return;
    if (this.#openItem) this.close(this.#openItem, true);
    window.clearTimeout(this.#timer);
    this.#updateBottom();
    item.toggleAttribute('data-open', true);
    item.querySelector('.header__toggle')?.setAttribute('aria-expanded', 'true');
    this.#openItem = item;
    this.dataset.menuOpen = item.dataset.submenu || '';
  }

  /**
   * @param {HTMLElement} item
   * @param {boolean} [switching] another submenu opens right away (keeps the overlay on)
   */
  close(item, switching = false) {
    item.toggleAttribute('data-open', false);
    item.querySelector('.header__toggle')?.setAttribute('aria-expanded', 'false');
    if (this.#openItem === item) this.#openItem = null;
    if (!switching) delete this.dataset.menuOpen;
  }

  /* --------------------------------------------------------------------- disclosures */

  #setupDisclosures() {
    const all = () => /** @type {HTMLDetailsElement[]} */ (Array.from(this.querySelectorAll('details[data-disclosure]')));

    this.on('toggle', (event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.matches('[data-disclosure]') || !details.open) return;
      all().forEach((other) => {
        if (other !== details) other.open = false;
      });
      if (this.#openItem) this.close(this.#openItem);
    }, { capture: true });

    this.on('pointerdown', (event) => {
      const target = event.target instanceof Node ? event.target : null;
      all().forEach((details) => {
        if (details.open && !(target && details.contains(target))) details.open = false;
      });
    }, { target: document });

    this.on('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const open = all().find((details) => details.open);
      if (!open) return;
      event.stopPropagation();
      event.preventDefault();
      open.open = false;
      /** @type {HTMLElement | null} */ (open.querySelector('summary'))?.focus();
    });
  }

  /* -------------------------------------------------------------------- theme editor */

  #setupEditor() {
    if (!window.Shopify?.designMode) return;
    this.on('shopify:block:select', (event) => {
      const item = event.target instanceof Element ? event.target.closest('[data-submenu]') : null;
      if (item instanceof HTMLElement) this.open(item);
    }, { target: document });
    this.on('shopify:block:deselect', () => {
      if (this.#openItem) this.close(this.#openItem);
    }, { target: document });
  }
}

class CartCount extends Component {
  setup() {
    subscribe(EVENTS.CART_UPDATED, (detail) => {
      const count = Number(detail?.cart?.item_count ?? NaN);
      if (Number.isNaN(count)) return;
      this.update(count);
    }, { signal: this.signal });
  }

  /** @param {number} count */
  update(count) {
    const { bubble, label } = this.refs;
    const strings = window.Whispo?.strings || {};
    if (bubble) bubble.textContent = count > 99 ? '99+' : String(count);
    const template = count === 1 ? strings.cartCountOne : strings.cartCountOther;
    if (label && template) label.textContent = template.replace(/\d+/, String(count));
    this.toggleAttribute('data-empty', count === 0);
  }
}

Component.define('header-component', HeaderComponent);
Component.define('cart-count', CartCount);
