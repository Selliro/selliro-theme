(function () {
  /** @type {Map<string, Element>} */
  var cache = new Map();
  /** @type {Element | null} */
  var activeDrawer = null;
  /** @type {Element | null} */
  var previousActiveElement = null;
  /** @type {HTMLElement | null} */
  var cursorClose = null;
  var supportsHoverCursor = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  /** @type {WeakMap<Element, { move: (ev: MouseEvent) => void, leave: () => void }>} */
  var drawerCursorHandlers = new WeakMap();
  /** @type {WeakMap<Element, number>} */
  var drawerCloseTimers = new WeakMap();

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
   * @param {Element | null} drawer
   */
  function onCursorMove(ev, drawer) {
    if (!supportsHoverCursor || !drawer || !activeDrawer || activeDrawer !== drawer) return;
    var panel = drawer.querySelector('.na-qv-drawer__panel');
    var overPanel = panel instanceof Element && ev.target instanceof Element && panel.contains(ev.target);
    drawer.classList.toggle('na-qv-drawer--outside-hover', !overPanel);
    var cursor = ensureCursorClose();
    cursor.classList.toggle('is-visible', !overPanel);
    cursor.style.left = ev.clientX + 'px';
    cursor.style.top = ev.clientY + 'px';
  }

  /** @param {Element | null} drawer */
  function teardownCursorClose(drawer) {
    if (!drawer) return;
    var handlers = drawerCursorHandlers.get(drawer);
    if (handlers) {
      document.removeEventListener('mousemove', handlers.move);
      document.removeEventListener('mouseleave', handlers.leave);
      drawerCursorHandlers.delete(drawer);
    }
    drawer.classList.remove('na-qv-drawer--outside-hover');
    if (cursorClose) cursorClose.classList.remove('is-visible');
  }

  function lockBody() {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }

  function unlockBody() {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }

  /** @param {Element | null} drawer */
  function closeDrawer(drawer) {
    if (!drawer) return;
    var existingTimer = drawerCloseTimers.get(drawer);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      drawerCloseTimers.delete(drawer);
    }
    teardownCursorClose(drawer);
    drawer.classList.add('is-closing');
    drawer.classList.remove('is-open');
    unlockBody();
    document.removeEventListener('keydown', onEsc);
    if (previousActiveElement instanceof HTMLElement) previousActiveElement.focus();
    previousActiveElement = null;
    activeDrawer = null;
    var timer = window.setTimeout(function () {
      drawer.classList.remove('is-closing');
      drawer.setAttribute('aria-hidden', 'true');
      drawerCloseTimers.delete(drawer);
    }, 360);
    drawerCloseTimers.set(drawer, timer);
  }

  /** @param {KeyboardEvent} ev */
  function onEsc(ev) {
    if (ev.key === 'Escape' && activeDrawer) closeDrawer(activeDrawer);
  }

  /** @param {Element | null} drawer */
  function openDrawer(drawer) {
    if (!drawer) return;
    if (activeDrawer && activeDrawer !== drawer) closeDrawer(activeDrawer);
    var existingTimer = drawerCloseTimers.get(drawer);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      drawerCloseTimers.delete(drawer);
    }
    drawer.classList.remove('is-closing');
    previousActiveElement = document.activeElement;
    activeDrawer = drawer;
    drawer.setAttribute('aria-hidden', 'false');
    drawer.classList.add('is-open');
    lockBody();
    document.addEventListener('keydown', onEsc);
    var panel = drawer.querySelector('.na-qv-drawer__panel');
    if (panel instanceof HTMLElement) panel.focus();
    if (supportsHoverCursor && drawer instanceof HTMLElement) {
      var onMove = function (/** @type {MouseEvent} */ ev) {
        onCursorMove(ev, drawer);
      };
      var onLeave = function () {
        drawer.classList.remove('na-qv-drawer--outside-hover');
        if (cursorClose) cursorClose.classList.remove('is-visible');
      };
      drawerCursorHandlers.set(drawer, { move: onMove, leave: onLeave });
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseleave', onLeave);
    }
  }

  /** @param {string} url */
  function resolveProductUrl(url) {
    var u = new URL(url, window.location.origin);
    return u.toString();
  }

  /** @param {Document} doc */
  function cloneGridFromDocument(doc) {
    var grid = doc.querySelector('[data-product-grid-content]');
    if (!grid) return null;
    var clone = /** @type {Element} */ (grid.cloneNode(true));
    normalizeGridLayout(clone);
    return clone;
  }

  /** @param {Element} grid */
  function normalizeGridLayout(grid) {
    var media = grid.querySelector('.product-information__media');
    var details = grid.querySelector('.product-details');
    if (media && details && media.parentElement === grid && details.parentElement === grid) {
      grid.insertBefore(media, details);
    }
  }

  /** @param {string} url */
  function fetchGrid(url) {
    if (cache.has(url)) {
      var cached = cache.get(url);
      if (cached) return Promise.resolve(cached.cloneNode(true));
    }
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('Quick view fetch failed: ' + r.status);
        return r.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var grid = cloneGridFromDocument(doc);
        if (!grid) throw new Error('Quick view content missing');
        cache.set(url, /** @type {Element} */ (grid.cloneNode(true)));
        return grid;
      });
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
    var inventoryText = '';
    if (inventoryTextEl instanceof HTMLElement) {
      inventoryText = (inventoryTextEl.textContent || '').replace(/\s+/g, ' ').trim();
    } else {
      inventoryText = (productInventory.textContent || '').replace(/\s+/g, ' ').trim();
    }
    var hasOutOfStockIcon = !!productInventory.querySelector('.product-inventory__icon-out_of_stock');
    var isUnavailable = /out of stock|sold out|unavailable/i.test(inventoryText);
    if (!inventoryText || hasOutOfStockIcon || isUnavailable) return;

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

    if (anchor instanceof Element) {
      buyButtonsBlock.insertBefore(stock, anchor);
    } else {
      buyButtonsBlock.prepend(stock);
    }
  }

  document.addEventListener('click', function (ev) {
    var target = ev.target;
    if (!(target instanceof Element)) return;

    var closeTrigger = target.closest('[data-na-qv-close]');
    if (closeTrigger) {
      var drawerToClose = closeTrigger.closest('[data-na-qv-drawer]');
      closeDrawer(drawerToClose);
      return;
    }

    var trigger = target.closest('[data-new-arrivals-quick-view]');
    if (!trigger) return;

    var root = trigger.closest('[data-new-arrivals-root]');
    if (!root) return;

    if (trigger.getAttribute('data-na-qv-fetching') === 'true') return;

    ev.preventDefault();
    ev.stopPropagation();

    var drawerId = root.getAttribute('data-new-arrivals-qv-id');
    var productUrl = trigger.getAttribute('data-na-quick-view-url');
    var variantId = trigger.getAttribute('data-na-variant-id');
    if (!drawerId || !productUrl) return;

    var drawer = document.getElementById(drawerId);
    if (!drawer) return;

    var content = drawer.querySelector('[data-na-qv-content]');
    if (!(content instanceof Element)) return;

    var resolvedUrl = resolveProductUrl(productUrl);
    var showIconLoader = !cache.has(resolvedUrl);

    trigger.setAttribute('data-na-qv-fetching', 'true');
    if (showIconLoader) {
      trigger.setAttribute('aria-busy', 'true');
    }

    fetchGrid(resolvedUrl)
      .then(function (grid) {
        if (!(content instanceof Element)) return;
        content.replaceChildren(grid);
        syncVariant(content, variantId);
        renderInlineStock(content);
        openDrawer(drawer);
      })
      .catch(function (error) {
        console.error(error);
      })
      .finally(function () {
        if (!(trigger instanceof HTMLElement)) return;
        trigger.removeAttribute('data-na-qv-fetching');
        trigger.removeAttribute('aria-busy');
      });
  });

  document.addEventListener('variant:update', function (ev) {
    if (!activeDrawer) return;
    var target = ev.target;
    if (!(target instanceof Element)) return;
    if (!activeDrawer.contains(target)) return;
    var content = activeDrawer.querySelector('[data-na-qv-content]');
    if (!(content instanceof Element)) return;
    window.setTimeout(function () {
      if (!(content instanceof Element)) return;
      renderInlineStock(content);
    }, 0);
  });
})();
