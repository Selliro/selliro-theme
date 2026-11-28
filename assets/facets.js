/**
 * Whispo filtering, sorting and pagination (snippets/facets.liquid, sections/main-collection.liquid,
 * sections/main-search.liquid → <facet-filters data-section-id data-form-id>).
 *
 * Any change to a field of the facets form (checkbox, price, sort) waits a moment for further changes, then
 * requests this section for the new URL (Section Rendering API) and swaps every [data-facets-update] region
 * (results, filters, chips, count, badge). Chip, "Clear all" and pagination links ([data-facet-link],
 * .pagination a) load the same way. The URL is pushed to history, and Back / Forward restore the results.
 * Open filter groups stay open and the focused field keeps focus. Without JavaScript the form submits normally.
 */
import { Component } from '@whispo/component';
import { debounce, parseHTML } from '@whispo/utilities';

class FacetFilters extends Component {
  /** @type {AbortController | null} */
  #request = null;

  setup() {
    const formId = this.dataset.formId || '';
    const form = /** @type {HTMLFormElement | null} */ (document.getElementById(formId));
    if (!form) return;

    const submit = debounce(() => this.#load(this.#urlFromForm(form)), 400);

    this.on('change', (event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return;
      if (field.form !== form) return;
      submit();
    });
    this.on('submit', (event) => {
      event.preventDefault();
      submit.cancel();
      this.#load(this.#urlFromForm(form));
    }, { target: form });

    this.on('click', '[data-facet-link], .pagination a', (event, link) => {
      const pointer = /** @type {MouseEvent} */ (event);
      if (pointer.metaKey || pointer.ctrlKey || pointer.shiftKey) return;
      event.preventDefault();
      const href = /** @type {HTMLAnchorElement} */ (link).href;
      const toTop = link.closest('.pagination') !== null;
      this.#load(href, true, toTop);
    });

    this.on('popstate', () => this.#load(window.location.href, false), { target: window });
  }

  /** @param {HTMLFormElement} form */
  #urlFromForm(form) {
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value === 'string' && value.trim() !== '') params.append(key, value);
    });
    const url = new URL(form.action, window.location.origin);
    url.search = params.toString();
    return url.toString();
  }

  /**
   * @param {string} href page URL to show
   * @param {boolean} [push] add to history
   * @param {boolean} [toTop] scroll to the top of the results (pagination)
   */
  async #load(href, push = true, toTop = false) {
    const sectionId = this.dataset.sectionId;
    if (!sectionId) return;
    this.#request?.abort();
    const request = (this.#request = new AbortController());
    this.setAttribute('aria-busy', 'true');

    try {
      const url = new URL(href, window.location.origin);
      url.searchParams.set('section_id', sectionId);
      const response = await fetch(url, { signal: request.signal });
      const fresh = parseHTML(await response.text()).querySelector(`facet-filters[data-section-id="${CSS.escape(sectionId)}"]`);
      if (!fresh) return;

      const focused = document.activeElement;
      const focusId = focused instanceof HTMLElement && this.contains(focused) ? focused.id : '';
      const open = new Set(
        Array.from(this.querySelectorAll('details.facet[open]')).map((el) => /** @type {HTMLElement} */ (el).dataset.facetKey)
      );
      const closed = new Set(
        Array.from(this.querySelectorAll('details.facet:not([open])')).map((el) => /** @type {HTMLElement} */ (el).dataset.facetKey)
      );

      this.querySelectorAll('[data-facets-update]').forEach((region) => {
        const key = /** @type {HTMLElement} */ (region).dataset.facetsUpdate || '';
        const replacement = fresh.querySelector(`[data-facets-update="${CSS.escape(key)}"]`);
        if (replacement) region.replaceWith(document.importNode(replacement, true));
      });

      this.querySelectorAll('details.facet').forEach((el) => {
        const details = /** @type {HTMLDetailsElement} */ (el);
        if (open.has(details.dataset.facetKey)) details.open = true;
        if (closed.has(details.dataset.facetKey)) details.open = false;
      });
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });

      const address = new URL(href, window.location.origin);
      address.searchParams.delete('section_id');
      if (push) window.history.pushState({ facets: true }, '', address.toString());
      if (toTop) this.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (error) {
      if (/** @type {Error} */ (error).name !== 'AbortError') window.location.href = href;
    } finally {
      if (this.#request === request) this.removeAttribute('aria-busy');
    }
  }
}

Component.define('facet-filters', FacetFilters);
