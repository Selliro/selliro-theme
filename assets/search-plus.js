/**
 * Search extras for the search pop-up and the search page:
 *   <search-recent>   the shopper's recent searches (stored in this browser only), with remove and clear
 *   highlighting      the typed words are marked in result titles ([data-search-highlight])
 *   "View all" label  the footer button names the search: View all results for "cream"
 *   remembering       a search is saved when the shopper submits it, opens a result or lands on /search?q=
 */
const STORE_KEY = 'whispo-recent-searches';
const MAX_RECENT = 6;

const read = () => {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
  } catch (error) {
    return [];
  }
};

const write = (/** @type {string[]} */ list) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch (error) {
    /* storage unavailable (private mode): recent searches just aren't kept */
  }
  document.querySelectorAll('search-recent').forEach((el) => /** @type {any} */ (el).render?.());
};

export const rememberSearch = (/** @type {string} */ term) => {
  const clean = (term || '').trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 60 || /^id:/i.test(clean)) return;
  const list = read().filter((item) => item.toLowerCase() !== clean.toLowerCase());
  list.unshift(clean);
  write(list);
};

const escapeHtml = (/** @type {string} */ s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);

/* ------------------------------------------------------------ recent searches */
class SearchRecent extends HTMLElement {
  connectedCallback() {
    this.render();
    this.addEventListener('click', this.#onClick);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick);
  }

  render() {
    const list = read();
    this.hidden = list.length === 0;
    if (!list.length) {
      this.innerHTML = '';
      return;
    }
    const base = this.dataset.searchUrl || '/search';
    const removeLabel = this.dataset.removeLabel || 'Remove [term]';
    this.innerHTML = `
      <div class="sp-group__head">
        <h4 class="sp-group__title">${escapeHtml(this.dataset.label || 'Recent searches')}</h4>
        <button type="button" class="sp-group__clear" data-recent-clear>${escapeHtml(this.dataset.clearLabel || 'Clear')}</button>
      </div>
      <ul class="predictive-search-results__list sp-recent__list list-unstyled" role="listbox" aria-label="${escapeHtml(this.dataset.label || '')}">
        ${list
          .map(
            (term, i) => `
          <li class="sp-recent__item" ref="resultsItems[]" role="option" style="--i:${i}">
            <a class="sp-recent__link" href="${base}?q=${encodeURIComponent(term)}&options%5Bprefix%5D=last">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 6.5V10l2.5 1.5"/></svg>
              <span>${escapeHtml(term)}</span>
            </a>
            <button type="button" class="sp-recent__remove" data-recent-remove="${escapeHtml(term)}" aria-label="${escapeHtml(removeLabel.replace('[term]', term))}">
              <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>
            </button>
          </li>`
          )
          .join('')}
      </ul>`;
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const target = /** @type {Element} */ (event.target);
    if (target.closest('[data-recent-clear]')) {
      event.preventDefault();
      write([]);
      return;
    }
    const remove = target.closest('[data-recent-remove]');
    if (remove) {
      event.preventDefault();
      const term = remove.getAttribute('data-recent-remove') || '';
      write(read().filter((item) => item !== term));
    }
  };
}

if (!customElements.get('search-recent')) customElements.define('search-recent', SearchRecent);

/* --------------------------------------------------------------- highlighting */
/** @param {ParentNode} root @param {string} query */
const highlight = (root, query) => {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ''))
    .filter((w) => w.length > 1);
  root.querySelectorAll('[data-search-highlight]').forEach((node) => {
    const el = /** @type {HTMLElement} */ (node);
    // Marks don't change the text, so textContent is always the plain title (also after a morph)
    const original = el.textContent || '';
    const key = `${words.join(' ')}|${original}`;
    if (el.dataset.highlightKey === key) return;
    el.dataset.highlightKey = key;
    if (!words.length) {
      if (el.querySelector('mark')) el.textContent = original;
      return;
    }
    const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    el.innerHTML = escapeHtml(original).replace(pattern, '<mark>$1</mark>');
  });
};

/* --------------------------------------------------- pop-up wiring (per form) */
const wire = (/** @type {Element} */ component) => {
  if (!(component instanceof HTMLElement) || component.dataset.searchPlus) return;
  component.dataset.searchPlus = 'true';

  const input = /** @type {HTMLInputElement | null} */ (component.querySelector('input[type="search"]'));
  const results = component.querySelector('.predictive-search-form__content');
  const viewAll = /** @type {HTMLElement | null} */ (component.querySelector('[data-view-all-template]'));
  if (!input) return;

  const refresh = () => {
    const query = input.value.trim();
    if (results) highlight(results, query);
    if (viewAll) {
      const template = viewAll.dataset.viewAllTemplate || '';
      if (!viewAll.dataset.defaultLabel) viewAll.dataset.defaultLabel = viewAll.innerHTML;
      viewAll.innerHTML = query && template
        ? `<span>${template.replace('[terms]', escapeHtml(query))}</span><span aria-hidden="true">→</span>`
        : viewAll.dataset.defaultLabel;
    }
    component.classList.toggle('sp-has-query', query.length > 0);
  };

  let frame = 0;
  const queue = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(refresh);
  };
  if (results) new MutationObserver(queue).observe(results, { childList: true, subtree: true });
  input.addEventListener('input', queue);

  // Remember the search when it is submitted or a result is opened
  component.querySelector('form')?.addEventListener('submit', () => rememberSearch(input.value));
  component.addEventListener('click', (event) => {
    const link = /** @type {Element} */ (event.target).closest('a[href]');
    if (!link) return;
    // Popular and recent searches run right here in the pop-up (Cmd/Ctrl-click still opens the results page)
    const quick = link.closest('.sp-chip, .sp-recent__link');
    const mouse = /** @type {MouseEvent} */ (event);
    if (quick && !mouse.metaKey && !mouse.ctrlKey && !mouse.shiftKey) {
      event.preventDefault();
      const term = (quick.textContent || '').trim();
      if (!term) return;
      input.value = term;
      input.focus();
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: term }));
      rememberSearch(term);
      return;
    }
    if (link.closest('search-recent')) return;
    if (input.value.trim()) rememberSearch(input.value);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && input.value.trim()) rememberSearch(input.value);
  });
  queue();
};

const wireAll = () => document.querySelectorAll('predictive-search-component').forEach(wire);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireAll);
else wireAll();
customElements.whenDefined('predictive-search-component').then(wireAll);

// Landing on /search?q=… (any search form) counts as a search
try {
  const params = new URLSearchParams(location.search);
  if (location.pathname.endsWith('/search') && params.get('q')) rememberSearch(params.get('q') || '');
} catch (error) {
  /* ignore */
}

// The search page highlights its own result titles too
if (location.pathname.endsWith('/search')) {
  const run = () => {
    const query = new URLSearchParams(location.search).get('q') || '';
    document.querySelectorAll('.search-page-plus').forEach((root) => highlight(root, query));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}
