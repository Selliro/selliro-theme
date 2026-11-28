/**
 * Whispo predictive search (snippets/search-modal.liquid → <predictive-search>).
 *
 * As the visitor types, results come from the Predictive Search API rendered by
 * sections/predictive-search.liquid (/search/suggest?section_id=predictive-search), so all markup and
 * translations stay in Liquid. Responses are cached per query and slow requests are cancelled when the
 * text changes.
 *
 * Accessibility (WAI-ARIA combobox with a listbox popup)
 *   - input[role=combobox] gets aria-expanded and aria-activedescendant;
 *   - ArrowDown / ArrowUp move through the options, Home / End jump, Enter opens the active option,
 *     Escape closes the results first (a second Escape closes the modal);
 *   - the number of results is announced through the role="status" element.
 *
 * Refs: form, input, reset, results, status, popular (the "Popular links" shown before a search).
 * With [data-static] (suggestions turned off in Theme settings) only the clear button is wired.
 */
import { Component } from '@whispo/component';
import { debounce, parseHTML } from '@whispo/utilities';

const MIN_DELAY = 220;

class PredictiveSearch extends Component {
  /** @type {Map<string, string>} */
  #cache = new Map();

  /** @type {AbortController | null} */
  #request = null;

  /** @type {number} */
  #active = -1;

  setup() {
    const { input, form } = this.refs;
    if (!input) return;

    this.on('input', () => this.#toggleReset(), { target: input });
    this.on('reset', () => window.setTimeout(() => this.#onCleared()), { target: form });

    if (this.hasAttribute('data-static')) return;

    const search = debounce(() => this.#search(), MIN_DELAY);
    this.on('input', search, { target: input });
    this.on('keydown', (event) => this.#onKeydown(event), { target: input });
    this.on('focus', () => {
      if (input.value.trim() && this.refs.results?.childElementCount) this.#open();
    }, { target: input });
    this.on('pointerover', '[role="option"]', (_event, option) => this.#setActive(this.#options().indexOf(option), false));

    this.#toggleReset();
    if (input.value.trim()) this.#search();
  }

  teardown() {
    this.#request?.abort();
  }

  /** @returns {HTMLElement[]} */
  #options() {
    return Array.from(this.refs.results?.querySelectorAll('[role="option"]') || []);
  }

  #toggleReset() {
    const { input, reset } = this.refs;
    if (reset) reset.hidden = !input.value;
  }

  #onCleared() {
    this.#toggleReset();
    this.#request?.abort();
    this.#close(true);
    this.refs.input?.focus();
  }

  async #search() {
    const { input, results, status } = this.refs;
    const terms = input.value.trim();
    if (!terms) {
      this.#close(true);
      return;
    }

    this.#request?.abort();
    this.#request = new AbortController();
    this.setAttribute('aria-busy', 'true');

    try {
      let html = this.#cache.get(terms);
      if (!html) {
        const url = new URL(window.Whispo?.routes?.predictiveSearch || '/search/suggest', window.location.origin);
        url.searchParams.set('q', terms);
        url.searchParams.set('section_id', 'predictive-search');
        url.searchParams.set('resources[limit]', '4');
        url.searchParams.set('resources[limit_scope]', 'each');
        const response = await fetch(url, { signal: this.#request.signal });
        if (!response.ok) throw new Error(String(response.status));
        html = await response.text();
        this.#cache.set(terms, html);
      }
      // The text changed while the request was running
      if (input.value.trim() !== terms) return;

      const content = parseHTML(html).querySelector('[data-predictive-results]');
      if (!content) return;
      results.replaceChildren(...Array.from(content.childNodes));
      this.#active = -1;
      input.removeAttribute('aria-activedescendant');
      this.#open();

      const count = Number(content.getAttribute('data-count') || 0);
      if (status) status.textContent = this.#announce(count);
    } catch (error) {
      if (/** @type {Error} */ (error).name !== 'AbortError') this.#close(true);
    } finally {
      this.removeAttribute('aria-busy');
    }
  }

  /** @param {number} count */
  #announce(count) {
    const strings = window.Whispo?.strings || {};
    const template = count === 1 ? strings.searchResultsOne : strings.searchResultsOther;
    return template ? template.replace(/\d+/, String(count)) : String(count);
  }

  #open() {
    const { input, results, popular } = this.refs;
    results.hidden = false;
    if (popular) popular.hidden = true;
    input.setAttribute('aria-expanded', String(this.#options().length > 0));
    this.toggleAttribute('data-results', true);
  }

  /** @param {boolean} [empty] also remove the results (cleared text) */
  #close(empty = false) {
    const { input, results, popular, status } = this.refs;
    if (!results) return;
    results.hidden = true;
    if (empty) {
      results.replaceChildren();
      if (status) status.textContent = '';
      if (popular) popular.hidden = false;
    }
    input?.setAttribute('aria-expanded', 'false');
    input?.removeAttribute('aria-activedescendant');
    this.#active = -1;
    this.toggleAttribute('data-results', false);
  }

  /**
   * @param {number} index
   * @param {boolean} [scroll]
   */
  #setActive(index, scroll = true) {
    const options = this.#options();
    const { input } = this.refs;
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    this.#active = index;
    const option = options[index];
    if (option) {
      input.setAttribute('aria-activedescendant', option.id);
      if (scroll) option.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  /** @param {KeyboardEvent} event */
  #onKeydown(event) {
    const options = this.#options();
    const open = !this.refs.results.hidden && options.length > 0;

    switch (event.key) {
      case 'ArrowDown':
        if (!open) return;
        event.preventDefault();
        this.#setActive((this.#active + 1) % options.length);
        break;
      case 'ArrowUp':
        if (!open) return;
        event.preventDefault();
        this.#setActive(this.#active <= 0 ? options.length - 1 : this.#active - 1);
        break;
      case 'Home':
      case 'End':
        if (!open || this.#active < 0) return;
        event.preventDefault();
        this.#setActive(event.key === 'Home' ? 0 : options.length - 1);
        break;
      case 'Enter': {
        const option = options[this.#active];
        if (!open || !option) return;
        event.preventDefault();
        option.click();
        break;
      }
      case 'Escape':
        if (this.refs.results.hidden) return;
        // Keeps the modal open: the first Escape only closes the results
        event.preventDefault();
        event.stopPropagation();
        this.#close();
        break;
    }
  }
}

Component.define('predictive-search', PredictiveSearch);
