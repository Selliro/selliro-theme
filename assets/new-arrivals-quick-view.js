/**
 * New Arrivals quick view drawer.
 *
 * Fetches the product page, clones its product grid (media + details) into the drawer, trimmed to the
 * essentials (see KEEP_IN_DETAILS) with the images in one simple column (see simplifyGallery).
 * - Opens immediately with a skeleton, prefetches on hover/focus, caches per URL.
 * - Focus is trapped inside the dialog and restored to the trigger on close.
 * - Variant changes inside the drawer never rewrite the current page URL.
 * - Falls back to the product page if the content cannot be loaded.
 * - Closes itself when an item is added and the cart drawer auto-opens.
 */
(function () {
  if (window.__naQuickViewInit) return;
  window.__naQuickViewInit = true;

  var FOCUSABLE =
    'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

  /** @type {Map<string, Promise<Element>>} */
  var cache = new Map();
  /** @type {HTMLElement | null} */
  var activeDrawer = null;
  /** @type {HTMLElement | null} */
  var previousActiveElement = null;
  /** @type {HTMLElement | null} */
  var cursorClose = null;
  var requestToken = 0;
  var supportsHoverCursor = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  /** @type {WeakMap<Element, { move: (ev: MouseEvent) => void, leave: () => void }>} */
  var drawerCursorHandlers = new WeakMap();
  /** @type {WeakMap<Element, number>} */
  var drawerCloseTimers = new WeakMap();

  /* ---------------------------------------------------------------- cursor */

  function ensureCursorClose() {
    if (cursorClose) return cursorClose;
    var el = document.createElement('span');
    el.className = 'na-qv-cursor-close';
    el.setAttribute('aria-hidden', 'true');
    var closeSvgMarkup = '';
    if (activeDrawer) {
      var closeSvg = activeDrawer.querySelector('.na-qv-drawer__close .svg-wrapper');
      if (closeSvg instanceof HTMLElement) closeSvgMarkup = closeSvg.innerHTML;
    }
    el.innerHTML =
      '<span class="na-qv-cursor-close__icon svg-wrapper" aria-hidden="true">' +
      (closeSvgMarkup || '<span class="na-qv-cursor-close__fallback">x</span>') +
      '</span>';
    document.body.appendChild(el);
    cursorClose = el;
    return el;
  }

  /**
   * @param {MouseEvent} ev
   * @param {Element} drawer
   */
  function onCursorMove(ev, drawer) {
    if (!supportsHoverCursor || !activeDrawer || activeDrawer !== drawer) return;
    var panel = drawer.querySelector('.na-qv-drawer__panel');
    var overPanel = panel instanceof Element && ev.target instanceof Element && panel.contains(ev.target);
    drawer.classList.toggle('na-qv-drawer--outside-hover', !overPanel);
    var cursor = ensureCursorClose();
    cursor.classList.toggle('is-visible', !overPanel);
    cursor.style.left = ev.clientX + 'px';
    cursor.style.top = ev.clientY + 'px';
  }

  /** @param {Element} drawer */
  function setupCursorClose(drawer) {
    if (!supportsHoverCursor) return;
    var onMove = function (/** @type {MouseEvent} */ ev) {
      onCursorMove(ev, drawer);
    };
    var onLeave = function () {
      drawer.classList.remove('na-qv-drawer--outside-hover');
      if (cursorClose) cursorClose.classList.remove('is-visible');
    };
    drawerCursorHandlers.set(drawer, { move: onMove, leave: onLeave });
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
  }

  /** @param {Element} drawer */
  function teardownCursorClose(drawer) {
    var handlers = drawerCursorHandlers.get(drawer);
    if (handlers) {
      document.removeEventListener('mousemove', handlers.move);
      document.removeEventListener('mouseleave', handlers.leave);
      drawerCursorHandlers.delete(drawer);
    }
    drawer.classList.remove('na-qv-drawer--outside-hover');
    if (cursorClose) cursorClose.classList.remove('is-visible');
  }

  /* ----------------------------------------------------------- scroll lock */

  function lockBody() {
    // Compensate for the scrollbar disappearing so the page does not jump sideways.
    var scrollbar = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbar > 0) document.body.style.paddingRight = scrollbar + 'px';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }

  function unlockBody() {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  }

  /* ------------------------------------------------------------ focus trap */

  /** @param {KeyboardEvent} ev */
  function onKeydown(ev) {
    if (!activeDrawer) return;

    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeDrawer(activeDrawer);
      return;
    }

    if (ev.key !== 'Tab') return;
    var panel = activeDrawer.querySelector('.na-qv-drawer__panel');
    if (!(panel instanceof HTMLElement)) return;

    var focusables = Array.prototype.filter.call(panel.querySelectorAll(FOCUSABLE), function (el) {
      return el instanceof HTMLElement && el.offsetParent !== null && !el.closest('[inert]');
    });
    if (!focusables.length) {
      ev.preventDefault();
      panel.focus();
      return;
    }

    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    var current = document.activeElement;

    if (ev.shiftKey && (current === first || current === panel || !panel.contains(current))) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && (current === last || !panel.contains(current))) {
      ev.preventDefault();
      first.focus();
    }
  }

  /* ---------------------------------------------------------- open / close */

  /** @param {HTMLElement | null} drawer */
  function closeDrawer(drawer) {
    if (!drawer) return;
    requestToken++;
    var existingTimer = drawerCloseTimers.get(drawer);
    if (existingTimer) window.clearTimeout(existingTimer);

    teardownCursorClose(drawer);
    drawer.classList.add('is-closing');
    drawer.classList.remove('is-open');
    unlockBody();
    document.removeEventListener('keydown', onKeydown);

    if (previousActiveElement && document.contains(previousActiveElement)) {
      previousActiveElement.focus({ preventScroll: true });
    }
    previousActiveElement = null;
    activeDrawer = null;

    var timer = window.setTimeout(function () {
      drawer.classList.remove('is-closing');
      drawer.setAttribute('aria-hidden', 'true');
      drawerCloseTimers.delete(drawer);
    }, 360);
    drawerCloseTimers.set(drawer, timer);
  }

  /**
   * @param {HTMLElement} drawer
   * @param {HTMLElement | null} trigger
   */
  function openDrawer(drawer, trigger) {
    if (activeDrawer === drawer) return;
    if (activeDrawer) closeDrawer(activeDrawer);

    var existingTimer = drawerCloseTimers.get(drawer);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      drawerCloseTimers.delete(drawer);
    }

    // The footer reveal makes #MainContent a stacking context (z-index 1), so inside it the drawer sits
    // under the site header. Move it to <body> the first time it opens, inside a .shopify-section wrapper:
    // Horizon's product form, price and stock listen for variant changes on their closest section.
    if (!drawer.closest('[data-na-qv-portal]')) {
      var portal = document.createElement('div');
      portal.className = 'shopify-section na-qv-portal';
      portal.setAttribute('data-na-qv-portal', '');
      document.body.appendChild(portal);
      portal.appendChild(drawer);
    }

    previousActiveElement =
      trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    activeDrawer = drawer;
    drawer.classList.remove('is-closing');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.classList.add('is-open');
    lockBody();
    document.addEventListener('keydown', onKeydown);

    var panel = drawer.querySelector('.na-qv-drawer__panel');
    if (panel instanceof HTMLElement) panel.focus({ preventScroll: true });

    setupCursorClose(drawer);
  }

  /* ----------------------------------------------------------------- fetch */

  /** @param {string} url */
  function resolveProductUrl(url) {
    return new URL(url, window.location.origin).toString();
  }

  /** @param {Element} grid */
  function normalizeGridLayout(grid) {
    var media = grid.querySelector('.product-information__media');
    var details = grid.querySelector('.product-details');
    if (media && details && media.parentElement === grid && details.parentElement === grid) {
      grid.insertBefore(media, details);
    }
  }

  /**
   * @param {string} url
   * @returns {Promise<Element>}
   */
  function loadGrid(url) {
    var pending = cache.get(url);
    if (!pending) {
      pending = fetch(url, { credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('Quick view fetch failed: ' + r.status);
          return r.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var grid = doc.querySelector('[data-product-grid-content]');
          if (!grid) throw new Error('Quick view content missing');
          normalizeGridLayout(grid);
          return grid;
        });
      // Drop failed requests from the cache so a later click can retry.
      pending.catch(function () {
        cache.delete(url);
      });
      cache.set(url, pending);
    }
    return pending.then(function (grid) {
      return /** @type {Element} */ (grid.cloneNode(true));
    });
  }

  /**
   * Make the cloned product page markup behave correctly outside the product page.
   * @param {Element} grid
   * @param {HTMLElement} drawer
   * @param {string} productUrl
   */
  function prepareContent(grid, drawer, productUrl) {
    // The variant picker was rendered on the product template, so it believes it is on the
    // product page and would rewrite this page's URL (or morph <main>) on every change.
    grid.querySelectorAll('[data-template-product-match]').forEach(function (el) {
      el.setAttribute('data-template-product-match', 'false');
    });

    trimDetails(grid);
    simplifyGallery(grid);

    // "View full details" link, like every major theme's quick view.
    var label = drawer.getAttribute('data-label-view-details');
    var details = grid.querySelector('.product-details');
    if (label && details && !grid.querySelector('[data-na-qv-view-details]')) {
      var link = document.createElement('a');
      link.className = 'na-qv-view-details';
      link.setAttribute('data-na-qv-view-details', '');
      link.href = productUrl;
      link.textContent = label;
      var buyButtons = details.querySelector('.buy-buttons-block');
      if (buyButtons && buyButtons.parentElement) {
        buyButtons.parentElement.insertBefore(link, buyButtons.nextSibling);
      } else {
        details.appendChild(link);
      }
    }
  }

  /*
   * The quick view shows the essentials only: vendor, title, rating, price, a 2-line description,
   * variants, stock ("Hurry! Only 6 left"), quantity + Add to cart + Buy it now, and View full details.
   * Everything else on the product page (benefits, tags, badges, Pair it with, How to use / Ingredients
   * accordions, promos, payment icons, sticky bar…) stays on the product page.
   */
  var KEEP_IN_DETAILS = [
    '.view-product-title',
    'rte-formatter.text-block', // eyebrow / vendor line
    '.text-block[class*="__title"]',
    '.text-block:is(.h1, .h2, .h3, .h4, .h5, .h6)', // product title, whatever the block is called
    '.pdp-rating',
    'product-price',
    'pdp-read-more',
    '.text-block[class*="__description"]',
    'variant-picker',
    'swatches-variant-picker-component',
    '.buy-buttons-block',
    'product-inventory', // hidden: its text feeds the stock line above the buttons
    '[data-na-qv-view-details]',
  ].join(',');

  /** @param {Element} grid */
  function trimDetails(grid) {
    var details = grid.querySelector('.product-details');
    if (!details) return;
    var content = details.querySelector('.group-block-content') || details;
    Array.prototype.slice.call(content.children).forEach(function (el) {
      if (/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName)) return;
      if (!el.matches(KEEP_IN_DETAILS)) el.remove();
    });
    // Anything of the above that sat inside a kept group
    details.querySelectorAll('pdp-sticky-bar, .pdp-pair, pdp-pair-carousel, .accordion, .pdp-promos, .pdp-badges, .payment-icons, local-pickup').forEach(function (el) {
      el.remove();
    });
  }

  /*
   * One column of images, no thumbnails or slideshow: every product image, stacked (a swipe row on phones).
   * Videos / 3D models have no image here and are left out; if there is no image at all the gallery stays as is.
   */
  /** @param {Element} grid */
  function simplifyGallery(grid) {
    var media = grid.querySelector('.product-information__media');
    if (!media) return;
    var seen = {};
    var images = [];
    media.querySelectorAll('img.product-media__image, .product-media img').forEach(function (img) {
      if (!(img instanceof HTMLImageElement) || img.closest('slideshow-controls')) return;
      var key = (img.getAttribute('src') || '').split('?')[0].replace(/_\d+x\d*(?=\.)/, '');
      if (!key || seen[key]) return;
      seen[key] = true;
      images.push(img);
    });
    if (!images.length) return;

    var gallery = document.createElement('div');
    gallery.className = 'na-qv-gallery';
    gallery.setAttribute('data-na-qv-gallery', '');
    images.forEach(function (img, index) {
      var item = document.createElement('figure');
      item.className = 'na-qv-gallery__item';
      var copy = /** @type {HTMLImageElement} */ (img.cloneNode(false));
      copy.className = 'na-qv-gallery__image';
      copy.removeAttribute('style');
      copy.setAttribute('sizes', '(min-width: 768px) 340px, 82vw');
      copy.setAttribute('loading', index < 2 ? 'eager' : 'lazy');
      if (!copy.getAttribute('alt')) copy.setAttribute('alt', '');
      item.appendChild(copy);
      gallery.appendChild(item);
    });
    media.replaceChildren(gallery);
    media.classList.add('na-qv-media--simple');
  }

  /**
   * @param {Element} content
   * @param {string | null} variantId
   */
  function syncVariant(content, variantId) {
    if (!variantId) return;
    var radios = content.querySelectorAll('input[type="radio"][data-variant-id]');
    for (var i = 0; i < radios.length; i++) {
      var input = radios[i];
      if (input instanceof HTMLInputElement && input.dataset.variantId === String(variantId) && !input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  }

  /** @param {Element} content */
  function renderInlineStock(content) {
    var existing = content.querySelector('[data-na-qv-inline-stock]');
    if (existing) existing.remove();

    var buyButtonsBlock = content.querySelector('.buy-buttons-block');
    if (!(buyButtonsBlock instanceof Element)) return;

    var productInventory = content.querySelector('product-inventory');
    if (!(productInventory instanceof HTMLElement)) return;

    var inventoryTextEl = productInventory.querySelector('.product-inventory__text');
    var inventoryText = (
      (inventoryTextEl instanceof HTMLElement ? inventoryTextEl.textContent : productInventory.textContent) || ''
    )
      .replace(/\s+/g, ' ')
      .trim();
    var hasOutOfStockIcon = !!productInventory.querySelector('.product-inventory__icon-out_of_stock');
    if (!inventoryText || hasOutOfStockIcon) return;

    var anchor = buyButtonsBlock.querySelector('.product-form-buttons');
    var stock = document.createElement('div');
    stock.className = 'na-qv-inline-stock';
    stock.setAttribute('data-na-qv-inline-stock', '');
    stock.innerHTML =
      '<div class="na-qv-inline-stock__text-wrap">' +
      '<span class="na-qv-inline-stock__icon" aria-hidden="true">✓</span>' +
      '<span class="na-qv-inline-stock__text"></span>' +
      '</div>' +
      '<span class="na-qv-inline-stock__line" aria-hidden="true"></span>';
    var textNode = stock.querySelector('.na-qv-inline-stock__text');
    if (textNode) textNode.textContent = inventoryText;

    // The buttons sit inside the product form, not directly in the block: insert next to them
    if (anchor instanceof Element && anchor.parentNode) anchor.parentNode.insertBefore(stock, anchor);
    else buyButtonsBlock.prepend(stock);
  }

  /** @param {HTMLElement} drawer */
  function showSkeleton(drawer, content) {
    var tpl = drawer.querySelector('template[data-na-qv-skeleton]');
    content.replaceChildren();
    if (tpl instanceof HTMLTemplateElement) content.appendChild(tpl.content.cloneNode(true));
    content.setAttribute('aria-busy', 'true');
  }

  /* ------------------------------------------------------------------ main */

  /** @param {HTMLElement} trigger */
  function getContext(trigger) {
    var root = trigger.closest('[data-new-arrivals-root]');
    if (!root) return null;
    var drawerId = root.getAttribute('data-new-arrivals-qv-id');
    var productUrl = trigger.getAttribute('data-na-quick-view-url');
    if (!drawerId || !productUrl) return null;
    var drawer = document.getElementById(drawerId);
    if (!drawer) return null;
    var content = drawer.querySelector('[data-na-qv-content]');
    if (!(content instanceof HTMLElement)) return null;
    return { drawer: drawer, content: content, url: resolveProductUrl(productUrl) };
  }

  /** @param {HTMLElement} trigger */
  function openQuickView(trigger) {
    var ctx = getContext(trigger);
    if (!ctx) return;
    var drawer = ctx.drawer;
    var content = ctx.content;
    var url = ctx.url;
    var variantId = trigger.getAttribute('data-na-variant-id');
    var title = trigger.getAttribute('data-product-title');
    var token = ++requestToken;

    var panel = drawer.querySelector('.na-qv-drawer__panel');
    if (panel) {
      var base = drawer.getAttribute('data-label-dialog') || '';
      panel.setAttribute('aria-label', title ? base + ': ' + title : base);
    }

    showSkeleton(drawer, content);
    trigger.setAttribute('aria-busy', 'true');
    openDrawer(drawer, trigger);
    // openDrawer() bumps nothing, but closing a previous drawer does; re-read the token.
    token = requestToken;

    loadGrid(url)
      .then(function (grid) {
        if (token !== requestToken || activeDrawer !== drawer) return; // closed or superseded
        prepareContent(grid, drawer, url);
        content.replaceChildren(grid);
        content.removeAttribute('aria-busy');
        content.scrollTop = 0;
        // Extras only: if one of them fails, keep the quick view open rather than leaving the page
        try {
          syncVariant(content, variantId);
          renderInlineStock(content);
        } catch (error) {
          console.warn('Quick view:', error);
        }
      })
      .catch(function () {
        if (token !== requestToken) return;
        // Could not build the quick view: take the shopper to the product page instead.
        window.location.href = url;
      })
      .finally(function () {
        trigger.removeAttribute('aria-busy');
      });
  }

  /** @param {EventTarget | null} target */
  function prefetchFrom(target) {
    if (!(target instanceof Element)) return;
    var trigger = target.closest('[data-new-arrivals-quick-view]');
    if (!(trigger instanceof HTMLElement)) return;
    var url = trigger.getAttribute('data-na-quick-view-url');
    if (!url) return;
    var resolved = resolveProductUrl(url);
    if (!cache.has(resolved)) loadGrid(resolved).catch(function () {});
  }

  document.addEventListener('click', function (ev) {
    var target = ev.target;
    if (!(target instanceof Element)) return;

    var closeTrigger = target.closest('[data-na-qv-close]');
    if (closeTrigger) {
      var drawerToClose = closeTrigger.closest('[data-na-qv-drawer]');
      if (drawerToClose instanceof HTMLElement) closeDrawer(drawerToClose);
      return;
    }

    var trigger = target.closest('[data-new-arrivals-quick-view]');
    if (!(trigger instanceof HTMLElement)) return;

    ev.preventDefault();
    ev.stopPropagation();
    openQuickView(trigger);
  });

  // Start loading as soon as the shopper shows intent.
  document.addEventListener('pointerover', function (ev) {
    if (ev.pointerType === 'mouse') prefetchFrom(ev.target);
  });
  document.addEventListener('focusin', function (ev) {
    prefetchFrom(ev.target);
  });

  document.addEventListener('variant:update', function (ev) {
    if (!activeDrawer) return;
    var target = ev.target;
    if (!(target instanceof Element) || !activeDrawer.contains(target)) return;
    var content = activeDrawer.querySelector('[data-na-qv-content]');
    if (!(content instanceof Element)) return;
    window.setTimeout(function () {
      renderInlineStock(content);
    }, 0);
  });

  // After a successful add, hand over to the cart drawer instead of stacking two drawers.
  document.addEventListener('cart:update', function (ev) {
    if (!activeDrawer) return;
    var target = ev.target;
    if (!(target instanceof Element) || !activeDrawer.contains(target)) return;
    var detail = /** @type {any} */ (ev).detail;
    if (detail && detail.data && detail.data.didError) return;
    if (activeDrawer.getAttribute('data-close-on-add') !== 'true') return;
    closeDrawer(activeDrawer);
  });

  // Theme editor: never leave the page scroll-locked when the section is re-rendered or removed.
  // The drawer may have been moved to <body>, so match it by its section id as well.
  document.addEventListener('shopify:section:unload', function (ev) {
    var detail = /** @type {any} */ (ev).detail;
    var sectionId = detail && detail.sectionId;
    if (!(ev.target instanceof Element)) return;
    var section = ev.target;
    document.querySelectorAll('[data-na-qv-drawer]').forEach(function (drawer) {
      var belongs = section.contains(drawer) || (sectionId && drawer.getAttribute('data-section-id') === sectionId);
      if (!belongs) return;
      if (activeDrawer === drawer) closeDrawer(drawer);
      // A moved drawer is left behind when its section re-renders: the new render brings its own
      var portal = drawer.closest('[data-na-qv-portal]');
      if (portal) portal.remove();
    });
  });
})();
