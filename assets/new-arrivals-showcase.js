/**
 * New Arrivals Showcase — tabbed Swipers (window.Swiper from swiper-bundle.min.js).
 * Gallery scrub + indicators: new-arrivals-product-gallery (new-arrivals-components.js).
 */
(function () {
  function cartAddUrl() {
    var T = typeof window !== 'undefined' ? window.Theme : undefined;
    if (T && T.routes && T.routes.cart_add_url) return T.routes.cart_add_url;
    return '/cart/add.js';
  }

  function appendCartSections(formData) {
    var nodes = document.querySelectorAll('cart-items-component');
    var ids = [];
    for (var i = 0; i < nodes.length; i++) {
      var sid = nodes[i].dataset && nodes[i].dataset.sectionId;
      if (sid) ids.push(sid);
    }
    if (ids.length) formData.append('sections', ids.join(','));
  }

  function dispatchCartUpdate(payload) {
    document.dispatchEvent(
      new CustomEvent('cart:update', {
        bubbles: true,
        detail: {
          resource: payload.resource || {},
          sourceId: payload.sourceId || '',
          data: payload.data || {},
        },
      })
    );
  }

  function dispatchCartError(sourceId, message, description, errors) {
    document.dispatchEvent(
      new CustomEvent('cart:error', {
        bubbles: true,
        detail: {
          sourceId: sourceId || 'new-arrivals-add',
          data: { message: message || '', description: description, errors: errors },
        },
      })
    );
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-new-arrivals-add]');
    if (!btn || btn.disabled) return;
    if (!btn.closest('[data-new-arrivals-root]')) return;

    ev.preventDefault();
    ev.stopPropagation();

    var variantId = btn.getAttribute('data-variant-id');
    var productId = btn.getAttribute('data-product-id');
    var qty = parseInt(btn.getAttribute('data-quantity') || '1', 10);
    if (!variantId || !isFinite(qty) || qty < 1) qty = 1;

    var formData = new FormData();
    formData.append('id', variantId);
    formData.append('quantity', String(qty));
    appendCartSections(formData);

    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');

    fetch(cartAddUrl(), {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'text/html',
      },
      body: formData,
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (json) {
        if (json.status) {
          dispatchCartError('new-arrivals-' + variantId, json.message, json.description, json.errors);
          return;
        }
        dispatchCartUpdate({
          sourceId: String(variantId),
          data: {
            source: 'product-form-component',
            itemCount: qty,
            productId: productId ? String(productId) : undefined,
            sections: json.sections,
          },
        });
      })
      .catch(function (err) {
        console.error(err);
      })
      .finally(function () {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      });
  });

  function thumb(inst, el) {
    if (!el) return;
    var p = typeof inst.progress === 'number' && isFinite(inst.progress) ? inst.progress : 0;
    var lo = 0.08;
    el.style.transform = 'scaleX(' + (lo + (1 - lo) * p) + ')';
  }

  var initTokenSeq = 0;

  /**
   * Swiper measures slides as soon as the script runs; custom elements, image-loader,
   * and hidden tab panels can change dimensions afterward. Re-run update after layout
   * settles, when images load, and on container resize.
   */
  function bindSwiperRelayout(container, swiper, prog) {
    function layout() {
      if (!container || !container.isConnected) return;
      if (!swiper || swiper.destroyed) return;
      swiper.update();
      swiper.updateProgress();
      if (swiper.navigation) swiper.navigation.update();
      thumb(swiper, prog);
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(layout);
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('load', layout, { once: true });
    }

    var imgs = container.querySelectorAll('img');
    for (var ii = 0; ii < imgs.length; ii++) {
      var img = imgs[ii];
      if (!img.complete || img.naturalWidth === 0) {
        img.addEventListener('load', layout, { once: true });
        img.addEventListener('error', layout, { once: true });
      }
    }

    if (typeof ResizeObserver !== 'undefined') {
      if (container._naResizeObserver) {
        container._naResizeObserver.disconnect();
      }
      var roScheduled = false;
      var ro = new ResizeObserver(function () {
        if (roScheduled) return;
        roScheduled = true;
        requestAnimationFrame(function () {
          roScheduled = false;
          layout();
        });
      });
      ro.observe(container);
      container._naResizeObserver = ro;
    }
  }

  function whenNewArrivalsCustomElementsReady(done) {
    if (typeof customElements === 'undefined' || !customElements.whenDefined) {
      done();
      return;
    }
    Promise.all([
      customElements.whenDefined('new-arrivals-product-card'),
      customElements.whenDefined('new-arrivals-product-gallery'),
    ])
      .catch(function () {})
      .then(done);
  }

  function initRoot(root) {
    if (!root || root.getAttribute('data-new-arrivals-ready') === '1') return;

    var isGrid = (root.getAttribute('data-new-arrivals-layout') || 'slider') === 'grid';
    if (!isGrid) {
      var Ctor = typeof window !== 'undefined' ? window.Swiper : undefined;
      if (typeof Ctor === 'undefined') {
        var n = parseInt(root.getAttribute('data-new-arrivals-retry') || '0', 10);
        if (n < 100) {
          root.setAttribute('data-new-arrivals-retry', String(n + 1));
          setTimeout(function () {
            initRoot(root);
          }, 40);
        }
        return;
      }
    }
    root.removeAttribute('data-new-arrivals-retry');

    initTokenSeq += 1;
    var token = String(initTokenSeq);
    root.setAttribute('data-new-arrivals-init-token', token);

    var SwiperCtor = isGrid ? null : window.Swiper;
    whenNewArrivalsCustomElementsReady(function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          runSwiperInit(root, SwiperCtor, token);
        });
      });
    });
  }

  function destroyPanelSwiper(state) {
    if (!state || !state.el) return;
    if (state.el._naResizeObserver) {
      state.el._naResizeObserver.disconnect();
      state.el._naResizeObserver = null;
    }
    if (state.el.swiper) state.el.swiper.destroy(true, true);
    state.swiper = null;
  }

  /** Match grid promo block height to the first row; enable sticky only when grid has 2+ rows. */
  function syncGridPromoToCardHeight(root) {
    if (!root || !root.isConnected) return;
    if (root.getAttribute('data-new-arrivals-layout') !== 'grid') {
      root.removeAttribute('data-new-arrivals-grid-multi-row');
      return;
    }
    var panel = root.querySelector('[data-new-arrivals-panel].is-active');
    if (!panel) panel = root.querySelector('[data-new-arrivals-panel]:not([hidden])');
    if (!panel) {
      root.removeAttribute('data-new-arrivals-grid-multi-row');
      return;
    }
    var grid = panel.querySelector('.new-arrivals-showcase__grid');
    if (!grid) {
      root.removeAttribute('data-new-arrivals-grid-multi-row');
      return;
    }
    var cells = grid.querySelectorAll('.new-arrivals-showcase__grid-cell');
    if (!cells.length) {
      root.removeAttribute('data-new-arrivals-grid-multi-row');
      return;
    }

    var seenTop = {};
    var rowCount = 0;
    for (var r = 0; r < cells.length; r++) {
      var ot = cells[r].offsetTop;
      if (!seenTop[ot]) {
        seenTop[ot] = true;
        rowCount++;
      }
    }
    if (rowCount > 1) {
      root.setAttribute('data-new-arrivals-grid-multi-row', 'true');
    } else {
      root.removeAttribute('data-new-arrivals-grid-multi-row');
    }

    var rowTop = cells[0].offsetTop;
    var maxH = 0;
    for (var i = 0; i < cells.length; i++) {
      if (Math.abs(cells[i].offsetTop - rowTop) > 2) break;
      var ch = cells[i].getBoundingClientRect().height;
      if (ch > maxH) maxH = ch;
    }
    if (maxH < 48) return;
    root.style.setProperty('--new-arrivals-promo-match-height', Math.round(maxH) + 'px');
  }

  function bindGridPromoHeightSync(root, sessionOk) {
    if (!root || root.getAttribute('data-new-arrivals-layout') !== 'grid') return;
    if (root._naGridPromoRo) {
      root._naGridPromoRo.disconnect();
      root._naGridPromoRo = null;
    }
    if (root._naGridPromoOnResize) {
      window.removeEventListener('resize', root._naGridPromoOnResize);
      root._naGridPromoOnResize = null;
    }
    function sync() {
      if (sessionOk && !sessionOk()) return;
      syncGridPromoToCardHeight(root);
    }
    var resizeTimer;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sync, 80);
    }
    root._naGridPromoOnResize = onResize;
    window.addEventListener('resize', onResize);
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        sync();
      });
      var grids = root.querySelectorAll('.new-arrivals-showcase__grid');
      for (var g = 0; g < grids.length; g++) ro.observe(grids[g]);
      root._naGridPromoRo = ro;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(sync);
    });
  }

  function buildSwiperOptions(prog, prev, next, sm, sd, xm, xd) {
    return {
      slidesPerView: sm,
      spaceBetween: xm,
      watchSlidesProgress: true,
      observer: true,
      observeParents: true,
      observeSlideChildren: true,
      resizeObserver: true,
      watchOverflow: true,
      navigation: prev && next ? { prevEl: prev, nextEl: next } : undefined,
      breakpoints: {
        990: { slidesPerView: sd, spaceBetween: xd },
      },
      on: {
        progress: function (i) {
          thumb(i, prog);
        },
        init: function (i) {
          thumb(i, prog);
        },
        slideChange: function (i) {
          thumb(i, prog);
        },
        resize: function (i) {
          thumb(i, prog);
        },
      },
    };
  }

  function runSwiperInit(root, Ctor, token) {
    if (!root.isConnected) return;
    if (root.getAttribute('data-new-arrivals-init-token') !== token) return;

    /** Bumped on each init so stale rAF / load handlers from a previous mount do nothing. */
    root.setAttribute('data-new-arrivals-session', token);

    if (root._naSectionIo) {
      root._naSectionIo.disconnect();
      root._naSectionIo = null;
    }
    if (root._naGridPromoRo) {
      root._naGridPromoRo.disconnect();
      root._naGridPromoRo = null;
    }
    if (root._naGridPromoOnResize) {
      window.removeEventListener('resize', root._naGridPromoOnResize);
      root._naGridPromoOnResize = null;
    }

    var isGrid = Ctor == null;
    if (!isGrid) {
      root.removeAttribute('data-new-arrivals-grid-multi-row');
    }

    var tabs = root.querySelectorAll('[data-new-arrivals-tab]');
    var panels = root.querySelectorAll('[data-new-arrivals-panel]');
    if (!tabs.length || !panels.length) {
      root.removeAttribute('data-new-arrivals-init-token');
      return;
    }

    var sm = parseFloat(root.getAttribute('data-new-arrivals-spv-mobile') || '1.1');
    var sd = parseFloat(root.getAttribute('data-new-arrivals-spv-desktop') || '3.2');
    var xm = parseInt(root.getAttribute('data-new-arrivals-gap-mobile') || '8', 10);
    var xd = parseInt(root.getAttribute('data-new-arrivals-gap-desktop') || '10', 10);

    var sessionId = token;

    function sessionOk() {
      return root.isConnected && root.getAttribute('data-new-arrivals-session') === sessionId;
    }

    /** One entry per tab panel; Swiper is created only when the panel is visible (not display:none). */
    var swipersState = [];

    panels.forEach(function (panel, index) {
      var el = panel.querySelector('.new-arrivals-showcase__swiper');
      var prog = panel.querySelector('[data-new-arrivals-progress]');
      var prev = panel.querySelector('[data-new-arrivals-prev]');
      var next = panel.querySelector('[data-new-arrivals-next]');
      if (el) {
        destroyPanelSwiper({ el: el });
      }

      swipersState[index] = {
        panel: panel,
        el: el,
        prog: prog,
        prev: prev,
        next: next,
        swiper: null,
      };
    });

    if (isGrid) {
      bindGridPromoHeightSync(root, sessionOk);
    }

    function createSwiperForState(st, done) {
      function finish() {
        if (typeof done === 'function') done();
      }

      if (!st || !st.el) {
        finish();
        return;
      }
      if (st.swiper) {
        finish();
        return;
      }
      if (!sessionOk()) return;
      if (st.panel.hasAttribute('hidden')) return;

      var w = st.el.offsetWidth || st.el.clientWidth;
      if (w < 8) {
        st._naCreateAttempts = (st._naCreateAttempts || 0) + 1;
        if (st._naCreateAttempts < 24) {
          setTimeout(function () {
            createSwiperForState(st, done);
          }, 50);
          return;
        }
      }

      var opts = buildSwiperOptions(st.prog, st.prev, st.next, sm, sd, xm, xd);
      st.swiper = new Ctor(st.el, opts);
      bindSwiperRelayout(st.el, st.swiper, st.prog);
      finish();
    }

    function refreshSwiperIndex(ix) {
      var st = swipersState[ix];
      if (!st || !st.swiper) return;
      requestAnimationFrame(function () {
        if (!sessionOk()) return;
        st.swiper.update();
        st.swiper.updateProgress();
        if (st.swiper.navigation) st.swiper.navigation.update();
        thumb(st.swiper, st.prog);
      });
    }

    /**
     * Show tab panel, then (after layout) create Swiper if needed — hidden panels must never init early.
     */
    function activate(i, afterLayout) {
      var ix = Math.max(0, Math.min(i, tabs.length - 1));
      tabs.forEach(function (t, j) {
        var on = j === ix;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1');
        t.classList.toggle('is-active', on);
      });
      panels.forEach(function (p, j) {
        var on = j === ix;
        if (on) {
          p.removeAttribute('hidden');
          p.classList.add('is-active');
        } else {
          p.setAttribute('hidden', '');
          p.classList.remove('is-active');
        }
      });

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (!sessionOk()) return;
          createSwiperForState(swipersState[ix], function () {
            if (!sessionOk()) return;
            refreshSwiperIndex(ix);
            if (isGrid) syncGridPromoToCardHeight(root);
            if (typeof afterLayout === 'function') afterLayout();
          });
        });
      });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        activate(i);
      });
      tab.addEventListener('keydown', function (ev) {
        if (ev.key === 'ArrowRight') {
          ev.preventDefault();
          activate(i + 1);
          var nx = tabs[Math.min(i + 1, tabs.length - 1)];
          if (nx) nx.focus();
        }
        if (ev.key === 'ArrowLeft') {
          ev.preventDefault();
          activate(i - 1);
          var pv = tabs[Math.max(i - 1, 0)];
          if (pv) pv.focus();
        }
      });
    });

    if (!isGrid && typeof IntersectionObserver !== 'undefined') {
      var sectionIoScheduled = false;
      var sectionIo = new IntersectionObserver(
        function (entries) {
          var hit = false;
          for (var ei = 0; ei < entries.length; ei++) {
            if (entries[ei].isIntersecting) {
              hit = true;
              break;
            }
          }
          if (!hit || !sessionOk()) return;
          if (sectionIoScheduled) return;
          sectionIoScheduled = true;
          requestAnimationFrame(function () {
            sectionIoScheduled = false;
            if (!sessionOk()) return;
            swipersState.forEach(function (st, idx) {
              if (!st || st.panel.hasAttribute('hidden')) return;
              if (!st.swiper) {
                st._naCreateAttempts = 0;
                createSwiperForState(st, function () {
                  if (sessionOk()) refreshSwiperIndex(idx);
                });
              } else {
                refreshSwiperIndex(idx);
              }
            });
          });
        },
        { rootMargin: '120px', threshold: 0.01 }
      );
      sectionIo.observe(root);
      root._naSectionIo = sectionIo;
    }

    var s0 = 0;
    tabs.forEach(function (t, j) {
      if (t.classList.contains('is-active')) s0 = j;
    });

    activate(s0, function () {
      if (root.getAttribute('data-new-arrivals-init-token') !== token) return;
      root.removeAttribute('data-new-arrivals-init-token');
      root.setAttribute('data-new-arrivals-ready', '1');
    });
  }

  function mountAll() {
    document.querySelectorAll('[data-new-arrivals-root]').forEach(initRoot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }

  document.addEventListener('shopify:section:load', function (ev) {
    var t = ev.target;
    if (t && t.querySelectorAll) {
      t.querySelectorAll('[data-new-arrivals-root]').forEach(function (r) {
        r.removeAttribute('data-new-arrivals-ready');
        r.removeAttribute('data-new-arrivals-retry');
        r.removeAttribute('data-new-arrivals-init-token');
        r.removeAttribute('data-new-arrivals-session');
        if (r._naSectionIo) {
          r._naSectionIo.disconnect();
          r._naSectionIo = null;
        }
        if (r._naGridPromoRo) {
          r._naGridPromoRo.disconnect();
          r._naGridPromoRo = null;
        }
        if (r._naGridPromoOnResize) {
          window.removeEventListener('resize', r._naGridPromoOnResize);
          r._naGridPromoOnResize = null;
        }
        initRoot(r);
      });
    }
  });
})();
