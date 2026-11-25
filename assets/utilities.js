/**
 * Whispo utilities (import from '@whispo/utilities').
 *
 *   debounce(fn, wait)                 call fn once input has settled
 *   prefersReducedMotion()             true when the visitor asked for less motion
 *   fetchSection(sectionId, url?)      HTML of one section via the Section Rendering API (keeps locale/market)
 *   fetchSections(ids, url?)           several sections in one request: { [id]: html }
 *   parseHTML(html)                    DocumentFragment from an HTML string
 *   trapFocus(container) / releaseFocus()   keep keyboard focus inside a dialog while it is open
 *   formatMoney(cents)                 price in the shop's money format (window.Whispo.moneyFormat)
 */

/**
 * @template {(...args: any[]) => void} T
 * @param {T} fn
 * @param {number} wait
 * @returns {T & { cancel: () => void }}
 */
export function debounce(fn, wait = 200) {
  /** @type {number | undefined} */
  let timer;
  const debounced = /** @type {T & { cancel: () => void }} */ (
    (/** @type {any[]} */ ...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    }
  );
  debounced.cancel = () => window.clearTimeout(timer);
  return debounced;
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Build a URL for the Section Rendering API from the current page (or a given URL), so the shop's
 * locale and market are kept.
 * @param {string | string[]} sections
 * @param {string} [url]
 */
function sectionUrl(sections, url = window.location.href) {
  const target = new URL(url, window.location.origin);
  target.searchParams.set('sections', Array.isArray(sections) ? sections.join(',') : sections);
  return target.toString();
}

/**
 * @param {string[]} sectionIds
 * @param {string} [url]
 * @param {AbortSignal} [signal]
 * @returns {Promise<Record<string, string>>}
 */
export async function fetchSections(sectionIds, url, signal) {
  const response = await fetch(sectionUrl(sectionIds, url), { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Section request failed: ${response.status}`);
  return response.json();
}

/**
 * @param {string} sectionId
 * @param {string} [url]
 * @param {AbortSignal} [signal]
 */
export async function fetchSection(sectionId, url, signal) {
  const sections = await fetchSections([sectionId], url, signal);
  return sections[sectionId] || '';
}

/** @param {string} html */
export function parseHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

/* --------------------------------------------------------------------------- focus trap */
const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** @type {{ container: HTMLElement, previous: Element | null, onKey: (e: KeyboardEvent) => void } | null} */
let trap = null;

/**
 * @param {HTMLElement} container
 * @param {HTMLElement} [initialFocus]
 */
export function trapFocus(container, initialFocus) {
  releaseFocus(false);
  const focusables = () =>
    /** @type {HTMLElement[]} */ (Array.from(container.querySelectorAll(FOCUSABLE))).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
  const onKey = (/** @type {KeyboardEvent} */ event) => {
    if (event.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  trap = { container, previous: document.activeElement, onKey };
  document.addEventListener('keydown', onKey);
  (initialFocus || focusables()[0] || container).focus({ preventScroll: true });
}

/** @param {boolean} [restore] move focus back to where it was before trapFocus */
export function releaseFocus(restore = true) {
  if (!trap) return;
  document.removeEventListener('keydown', trap.onKey);
  const previous = trap.previous;
  trap = null;
  if (restore && previous instanceof HTMLElement && document.contains(previous)) previous.focus({ preventScroll: true });
}

/* -------------------------------------------------------------------------------- money */
/**
 * @param {number} cents
 * @param {string} [format] Shopify money format, e.g. "${{amount}}"
 */
export function formatMoney(cents, format = window.Whispo?.moneyFormat || '${{amount}}') {
  const value = Number(cents) / 100;
  const withDelimiters = (/** @type {number} */ amount, /** @type {number} */ decimals, thousands = ',', decimal = '.') => {
    const [whole, fraction] = amount.toFixed(decimals).split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
    return fraction ? `${grouped}${decimal}${fraction}` : grouped;
  };
  return format.replace(/\{\{\s*(\w+)\s*\}\}/, (_, key) => {
    switch (key) {
      case 'amount_no_decimals':
        return withDelimiters(value, 0);
      case 'amount_with_comma_separator':
        return withDelimiters(value, 2, '.', ',');
      case 'amount_no_decimals_with_comma_separator':
        return withDelimiters(value, 0, '.', ',');
      case 'amount_with_apostrophe_separator':
        return withDelimiters(value, 2, "'", '.');
      default:
        return withDelimiters(value, 2);
    }
  });
}
