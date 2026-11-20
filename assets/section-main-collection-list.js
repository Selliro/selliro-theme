/**
 * Collections page (sections/main-collection-list.liquid)
 *  - <collection-list-page>
 *      [data-coll-find]   "Find a collection" box: hides cards whose title doesn't match as you type
 *      [data-coll-sort]   Sort menu: Featured (page order), Name A–Z / Z–A, Most products
 *      [data-coll-status] "Showing N collections" — kept in step with the search
 *      [data-coll-nomatch] shown when nothing matches, with a "Clear search" button
 *  While a search or a non-Featured sort is active the grid gets [data-plain], which turns off the
 *  Editorial large first card so the results read as an even list.
 */
(() => {
  if (customElements.get('collection-list-page')) return;

  class CollectionListPage extends HTMLElement {
    connectedCallback() {
      this.grid = this.querySelector('[data-coll-grid]');
      if (!this.grid) return;
      this.items = /** @type {HTMLElement[]} */ (Array.from(this.grid.querySelectorAll('[data-coll-item]')));
      this.find = /** @type {HTMLInputElement | null} */ (this.querySelector('[data-coll-find]'));
      this.sort = /** @type {HTMLSelectElement | null} */ (this.querySelector('[data-coll-sort]'));
      this.status = this.querySelector('[data-coll-status]');
      this.noMatch = /** @type {HTMLElement | null} */ (this.querySelector('[data-coll-nomatch]'));

      this.onInput = () => this.update();
      this.onSort = () => {
        this.reorder();
        this.update();
      };
      this.onClick = (/** @type {MouseEvent} */ event) => {
        if (!(event.target instanceof Element) || !event.target.closest('[data-coll-clear]')) return;
        if (this.find) {
          this.find.value = '';
          this.find.focus();
        }
        this.update();
      };
      this.onKey = (/** @type {KeyboardEvent} */ event) => {
        if (event.key === 'Escape' && this.find && this.find.value) {
          this.find.value = '';
          this.update();
        }
      };

      this.find?.addEventListener('input', this.onInput);
      this.find?.addEventListener('keydown', this.onKey);
      this.sort?.addEventListener('change', this.onSort);
      this.addEventListener('click', this.onClick);
    }

    disconnectedCallback() {
      this.find?.removeEventListener('input', this.onInput);
      this.find?.removeEventListener('keydown', this.onKey);
      this.sort?.removeEventListener('change', this.onSort);
      this.removeEventListener('click', this.onClick);
    }

    /** Re-order the cards for the chosen sort */
    reorder() {
      if (!this.grid || !this.items) return;
      const mode = this.sort ? this.sort.value : 'featured';
      const byIndex = (/** @type {HTMLElement} */ a, /** @type {HTMLElement} */ b) =>
        Number(a.dataset.index) - Number(b.dataset.index);
      const sorted = [...this.items].sort((a, b) => {
        if (mode === 'az') return (a.dataset.title || '').localeCompare(b.dataset.title || '');
        if (mode === 'za') return (b.dataset.title || '').localeCompare(a.dataset.title || '');
        if (mode === 'products') return Number(b.dataset.count) - Number(a.dataset.count) || byIndex(a, b);
        return byIndex(a, b);
      });
      sorted.forEach((item) => this.grid?.appendChild(item));
    }

    /** Apply the search, then refresh the status line, the no-match message and the layout */
    update() {
      if (!this.grid || !this.items) return;
      const query = (this.find ? this.find.value : '').trim().toLowerCase();
      let visible = 0;
      for (const item of this.items) {
        const match = !query || (item.dataset.title || '').includes(query);
        item.hidden = !match;
        if (match) visible += 1;
      }

      const sorted = Boolean(this.sort && this.sort.value !== 'featured');
      this.grid.toggleAttribute('data-plain', Boolean(query) || sorted);
      if (this.noMatch) this.noMatch.hidden = visible > 0;
      this.grid.hidden = visible === 0;

      if (this.status) {
        const template = visible === 1 ? this.dataset.showingOne : this.dataset.showing;
        if (template) this.status.textContent = template.replace('[count]', String(visible));
      }
    }
  }

  customElements.define('collection-list-page', CollectionListPage);
})();
