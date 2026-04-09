import { Component } from '@theme/component';

/**
 * Quick add on product cards: direct add-to-cart when possible, or navigate to the product page
 * for multi-option products (quick view drawer removed).
 *
 * @extends {Component}
 */
export class QuickAddComponent extends Component {
  /** @type {AbortController | null} */
  #abortController = null;

  get productPageUrl() {
    const productCard = /** @type {import('./product-card').ProductCard | null} */ (this.closest('product-card'));
    const productLink = productCard?.getProductCardLink();

    if (!productLink?.href) return '';

    const url = new URL(productLink.href);

    if (url.searchParams.has('variant')) {
      return url.toString();
    }

    const selectedVariantId = this.#getSelectedVariantId();
    if (selectedVariantId) {
      url.searchParams.set('variant', selectedVariantId);
    }

    return url.toString();
  }

  /**
   * @returns {string | null}
   */
  #getSelectedVariantId() {
    const productCard = /** @type {import('./product-card').ProductCard | null} */ (this.closest('product-card'));
    return productCard?.getSelectedVariantId() || null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#abortController?.abort();
  }

  /**
   * "Choose options" — go to product page with selected variant when possible.
   * @param {Event} event
   */
  handleClick = (event) => {
    event.preventDefault();
    const href = this.productPageUrl;
    if (!href) return;

    const url = new URL(href, window.location.origin);
    const shouldOpenInNewTab =
      event instanceof MouseEvent && (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1);

    if (shouldOpenInNewTab) {
      window.open(url.href, '_blank');
    } else {
      window.location.href = url.href;
    }
  };

  /**
   * Preload product page HTML on hover/focus (used by product-card for faster navigation).
   * @param {string} productPageUrl
   * @returns {Promise<Document | null>}
   */
  fetchProductPage = async (productPageUrl) => {
    if (!productPageUrl) return null;

    this.#abortController?.abort();
    this.#abortController = new AbortController();

    try {
      const response = await fetch(productPageUrl, {
        signal: this.#abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch product page: HTTP error ${response.status}`);
      }

      const responseText = await response.text();
      return new DOMParser().parseFromString(responseText, 'text/html');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return null;
      }
      throw error;
    } finally {
      this.#abortController = null;
    }
  };
}

if (!customElements.get('quick-add-component')) {
  customElements.define('quick-add-component', QuickAddComponent);
}
