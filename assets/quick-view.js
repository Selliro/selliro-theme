/**
 * Whispo quick view: [data-quick-view="{product url}"] buttons (product cards) open the product in a dialog.
 *
 * The content is sections/quick-view.liquid rendered for that product (Section Rendering API), so the variant
 * picker, price and add to cart behave exactly as on the product page (assets/product-info.js). One dialog is
 * created on first use and reused; responses are cached per product while the page is open. If loading fails,
 * the button falls back to the product page.
 */
import { openDialog } from '@whispo/dialog';
import { parseHTML } from '@whispo/utilities';
import '@whispo/product-info';
import '@whispo/quantity-input';

/** @type {Map<string, string>} */
const cache = new Map();

/** @returns {HTMLDialogElement} */
function getDialog() {
  let dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById('QuickView'));
  if (dialog) return dialog;
  const strings = window.Whispo?.strings || {};
  dialog = document.createElement('dialog');
  dialog.id = 'QuickView';
  dialog.className = 'dialog quick-view';
  dialog.setAttribute('aria-labelledby', 'QuickViewTitle');
  dialog.innerHTML = `
    <div class="dialog__panel quick-view__panel color-scheme-1">
      <button type="button" class="icon-button quick-view__close" data-dialog-close>
        <svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
        <span class="visually-hidden"></span>
      </button>
      <div class="quick-view__body" data-quick-view-body></div>
    </div>`;
  /** @type {HTMLElement} */ (dialog.querySelector('.visually-hidden')).textContent = strings.close || 'Close';
  document.body.append(dialog);
  return dialog;
}

/** @param {string} url @param {HTMLElement} button */
async function show(url, button) {
  button.setAttribute('aria-busy', 'true');
  try {
    let html = cache.get(url);
    if (!html) {
      const target = new URL(url, window.location.origin);
      target.searchParams.set('section_id', 'quick-view');
      const response = await fetch(target);
      if (!response.ok) throw new Error(String(response.status));
      html = await response.text();
      cache.set(url, html);
    }
    const content = parseHTML(html).querySelector('.quick-view__content');
    if (!content) throw new Error('No content');
    const dialog = getDialog();
    /** @type {HTMLElement} */ (dialog.querySelector('[data-quick-view-body]')).replaceChildren(content);
    openDialog(dialog, button);
  } catch (_) {
    window.location.href = url;
  } finally {
    button.removeAttribute('aria-busy');
  }
}

document.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('[data-quick-view]') : null;
  if (!(button instanceof HTMLElement)) return;
  event.preventDefault();
  show(button.dataset.quickView || '', button);
});

// Drop the cached copy after a cart change, so stock and "in cart" quantities are current next time
document.addEventListener('whispo:cart-updated', () => cache.clear());
