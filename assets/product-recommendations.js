/**
 * Whispo product recommendations (<product-recommendations data-url>).
 *
 * Loads a section through the Product Recommendations API once the element is near the screen and moves its
 * [data-recommendations] content in. Stays hidden when Shopify returns no products. With data-heading, an
 * <h2> is added above the list (the "Pair it with" block). Used by the "Pair it with" block (complementary
 * products) and the product recommendations section ("You may also like").
 */
import { Component } from '@whispo/component';
import { parseHTML } from '@whispo/utilities';

class ProductRecommendations extends Component {
  setup() {
    if (this.dataset.loaded) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        this.#load();
      },
      { rootMargin: '0px 0px 400px 0px' }
    );
    observer.observe(this.hidden ? this.parentElement || this : this);
    this.signal.addEventListener('abort', () => observer.disconnect());
  }

  async #load() {
    const url = this.dataset.url;
    if (!url) return;
    try {
      const response = await fetch(url, { signal: this.signal });
      const content = parseHTML(await response.text()).querySelector('[data-recommendations]');
      if (!content || Number(content.getAttribute('data-count') || 0) === 0) {
        this.hidden = true;
        return;
      }
      const nodes = Array.from(content.childNodes);
      // The recommendations section keeps its own [data-recommendations] wrapper
      if (this.querySelector('[data-recommendations]')) {
        this.querySelector('[data-recommendations]')?.replaceWith(content);
        this.dataset.loaded = 'true';
        this.hidden = false;
        return;
      }
      if (this.dataset.heading) {
        const heading = document.createElement('h2');
        heading.className = 'pair-with__heading';
        heading.textContent = this.dataset.heading;
        nodes.unshift(heading);
      }
      this.replaceChildren(...nodes);
      this.dataset.loaded = 'true';
      this.hidden = false;
    } catch (error) {
      if (/** @type {Error} */ (error).name !== 'AbortError') this.hidden = true;
    }
  }
}

Component.define('product-recommendations', ProductRecommendations);
