/**
 * Blog list page (sections/main-blog.liquid)
 *  - <blog-list-view>  grid / list switch. The choice is remembered in this browser
 *                      (localStorage), falling back to the section's "Default view" setting.
 */
(() => {
  if (customElements.get('blog-list-view')) return;

  const STORAGE_KEY = 'whispo-blog-view';
  const VIEWS = ['grid', 'list'];

  const readStored = () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  };

  const store = (/** @type {string} */ view) => {
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch (error) {
      // Storage blocked (private mode): the switch still works for this visit
    }
  };

  class BlogListView extends HTMLElement {
    connectedCallback() {
      this.buttons = /** @type {HTMLButtonElement[]} */ (Array.from(this.querySelectorAll('[data-blog-view]')));
      const stored = readStored();
      const initial = stored && VIEWS.includes(stored) && this.buttons.length ? stored : this.dataset.defaultView;
      this.apply(initial || 'grid');

      this.onClick = (/** @type {MouseEvent} */ event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-blog-view]') : null;
        if (!(button instanceof HTMLElement) || !this.contains(button)) return;
        const view = button.dataset.blogView || 'grid';
        if (view === this.dataset.view) return;
        this.apply(view);
        store(view);
      };
      this.addEventListener('click', this.onClick);
    }

    disconnectedCallback() {
      if (this.onClick) this.removeEventListener('click', this.onClick);
    }

    /** @param {string} view */
    apply(view) {
      this.dataset.view = VIEWS.includes(view) ? view : 'grid';
      for (const button of this.buttons || []) {
        button.setAttribute('aria-pressed', String(button.dataset.blogView === this.dataset.view));
      }
    }
  }

  customElements.define('blog-list-view', BlogListView);
})();
