/**
 * Blog list page (sections/main-blog.liquid)
 *  - <blog-list-view>  Grid / List switch for every post on the page (the featured one included).
 *                      The choice is remembered in this browser (localStorage); without one,
 *                      the section's "Default view" setting is used.
 *                      Switching morphs each card to its new place with the View Transitions API
 *                      where the browser supports it (skipped for reduced motion).
 */
(() => {
  if (customElements.get('blog-list-view')) return;

  const STORAGE_KEY = 'whispo-blog-view';
  const VIEWS = ['grid', 'list'];
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const readStored = () => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value && VIEWS.includes(value) ? value : null;
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
      const hasSwitch = Boolean(this.querySelector('[data-blog-view]'));
      this.apply((hasSwitch && readStored()) || this.dataset.defaultView || 'grid');

      this.onClick = (/** @type {MouseEvent} */ event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-blog-view]') : null;
        if (!(button instanceof HTMLElement) || !this.contains(button)) return;
        event.preventDefault();
        this.switchTo(button.dataset.blogView || 'grid');
      };
      this.addEventListener('click', this.onClick);
    }

    disconnectedCallback() {
      if (this.onClick) this.removeEventListener('click', this.onClick);
    }

    /** @param {string} view */
    switchTo(view) {
      if (!VIEWS.includes(view) || view === this.dataset.view) return;
      store(view);

      if (typeof document.startViewTransition !== 'function' || reduceMotion()) {
        this.apply(view);
        return;
      }

      // Name the cards that are on screen so each one morphs from its old box to its new one
      const cards = /** @type {HTMLElement[]} */ (Array.from(this.querySelectorAll('.blog-card'))).filter((card) => {
        const rect = card.getBoundingClientRect();
        return rect.bottom > -200 && rect.top < window.innerHeight + 200;
      });
      cards.forEach((card, index) => {
        card.style.setProperty('view-transition-name', `blog-card-${index}`);
        card.style.setProperty('view-transition-class', 'blog-card');
        card.style.animation = 'none'; // the entrance animation must not replay
      });

      const transition = document.startViewTransition(() => this.apply(view));
      transition.finished.finally(() => {
        cards.forEach((card) => {
          card.style.removeProperty('view-transition-name');
          card.style.removeProperty('view-transition-class');
        });
      });
    }

    /** @param {string} view */
    apply(view) {
      this.dataset.view = VIEWS.includes(view) ? view : 'grid';
      this.querySelectorAll('[data-blog-view]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button instanceof HTMLElement && button.dataset.blogView === this.dataset.view));
      });
    }
  }

  customElements.define('blog-list-view', BlogListView);
})();
