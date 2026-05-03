(function () {
  'use strict';

  class CarouselSwiper extends HTMLElement {
    connectedCallback() {
      this._setup();
    }

    disconnectedCallback() {
      if (this._swiper && !this._swiper.destroyed) {
        this._swiper.destroy(true, true);
      }
      this._swiper = null;
    }

    _setup() {
      if (this._swiper) return;

      var configEl = this.querySelector('script[type="application/json"]');
      if (!configEl) return;

      var config;
      try {
        config = JSON.parse(configEl.textContent);
      } catch (e) {
        console.warn('[carousel-swiper] Invalid JSON config', e);
        return;
      }

      var swiperEl = this.querySelector('.swiper');
      if (!swiperEl) return;

      this._parseNumericValues(config);

      var progressSelector = config.progressBarSelector || null;
      delete config.progressBarSelector;

      if (config.navigation === true) {
        var prevEl = this._findNavButton('prev');
        var nextEl = this._findNavButton('next');
        if (prevEl && nextEl) {
          config.navigation = { prevEl: prevEl, nextEl: nextEl };
        } else {
          var nav = this._buildNavigation();
          this.appendChild(nav.wrapper);
          config.navigation = { prevEl: nav.prev, nextEl: nav.next };
        }
      }

      if (progressSelector) {
        var progressEl = document.querySelector(progressSelector);
        if (progressEl) {
          var self = this;
          var existingOn = config.on || {};
          config.on = Object.assign({}, existingOn, {
            init: function (s) {
              self._updateProgress(s, progressEl);
              if (existingOn.init) existingOn.init(s);
            },
            progress: function (s) {
              self._updateProgress(s, progressEl);
              if (existingOn.progress) existingOn.progress(s);
            },
            resize: function (s) {
              self._updateProgress(s, progressEl);
              if (existingOn.resize) existingOn.resize(s);
            }
          });
        }
      }

      this._swiper = new window.Swiper(swiperEl, config);
    }

    _parseNumericValues(config) {
      if (config.slidesPerView != null && config.slidesPerView !== 'auto') {
        var n = parseFloat(config.slidesPerView);
        if (!isNaN(n)) config.slidesPerView = n;
      }
      if (config.spaceBetween != null) {
        var sb = parseInt(config.spaceBetween, 10);
        if (!isNaN(sb)) config.spaceBetween = sb;
      }
      if (config.breakpoints) {
        Object.keys(config.breakpoints).forEach(function (bp) {
          var bpConf = config.breakpoints[bp];
          if (bpConf.slidesPerView != null && bpConf.slidesPerView !== 'auto') {
            var bpN = parseFloat(bpConf.slidesPerView);
            if (!isNaN(bpN)) bpConf.slidesPerView = bpN;
          }
          if (bpConf.spaceBetween != null) {
            var bpSb = parseInt(bpConf.spaceBetween, 10);
            if (!isNaN(bpSb)) bpConf.spaceBetween = bpSb;
          }
        });
      }
    }

    _findNavButton(dir) {
      var cls = '.carousel__nav-button--' + dir;
      var inside = this.querySelector(cls);
      if (inside) return inside;
      var parent = this.closest('[data-swiper-parent]');
      if (parent) return parent.querySelector(cls);
      return null;
    }

    _updateProgress(swiper, el) {
      var p = typeof swiper.progress === 'number' && isFinite(swiper.progress) ? swiper.progress : 0;
      el.style.transform = 'scaleX(' + (0.08 + 0.92 * p) + ')';
    }

    _buildNavigation() {
      var wrapper = document.createElement('div');
      wrapper.className = 'section-container carousel__navigation tw-flex tw-items-center tw-justify-end tw-gap-3 tw-mt-8';

      var btnClass = 'carousel__nav-button tw-w-10 tw-h-10 tw-rounded-full tw-bg-white tw-flex tw-items-center tw-justify-center tw-cursor-pointer tw-transition-all hover:tw-border-slate-400 disabled:tw-opacity-50 disabled:tw-cursor-not-allowed';

      var prev = document.createElement('button');
      prev.type = 'button';
      prev.className = btnClass + ' carousel__nav-button--prev';
      prev.setAttribute('aria-label', 'Previous slide');
      prev.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none"><g clip-path="url(#cs-nav-prev)"><path d="M47 24C47 11.2975 36.7025 1 24 1C11.2975 1 1 11.2975 1 24C1 36.7025 11.2975 47 24 47C36.7025 47 47 36.7025 47 24ZM48 24C48 37.2548 37.2548 48 24 48C10.7452 48 0 37.2548 0 24C0 10.7452 10.7452 0 24 0C37.2548 0 48 10.7452 48 24Z" fill="#092846"/><path d="M28 16L20 24L28 32" stroke="#092846" stroke-width="2"/></g><defs><clipPath id="cs-nav-prev"><rect width="48" height="48" fill="white"/></clipPath></defs></svg>';

      var next = document.createElement('button');
      next.type = 'button';
      next.className = btnClass + ' carousel__nav-button--next';
      next.setAttribute('aria-label', 'Next slide');
      next.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none"><g clip-path="url(#cs-nav-next)"><path d="M47 24C47 11.2975 36.7025 1 24 1C11.2975 1 1 11.2975 1 24C1 36.7025 11.2975 47 24 47C36.7025 47 47 36.7025 47 24ZM48 24C48 37.2548 37.2548 48 24 48C10.7452 48 0 37.2548 0 24C0 10.7452 10.7452 0 24 0C37.2548 0 48 10.7452 48 24Z" fill="#092846"/><path d="M29.4141 24L20.707 32.707L19.293 31.293L26.5859 24L19.293 16.707L20.707 15.293L29.4141 24Z" fill="#092846"/></g><defs><clipPath id="cs-nav-next"><rect width="48" height="48" fill="white"/></clipPath></defs></svg>';

      wrapper.appendChild(prev);
      wrapper.appendChild(next);
      return { wrapper: wrapper, prev: prev, next: next };
    }
  }

  if (!customElements.get('carousel-swiper')) {
    customElements.define('carousel-swiper', CarouselSwiper);
  }

  document.addEventListener('shopify:section:load', function (event) {
    event.target.querySelectorAll('carousel-swiper').forEach(function (el) {
      if (el._swiper && !el._swiper.destroyed) {
        el._swiper.destroy(true, true);
      }
      el._swiper = null;
      el._setup();
    });
  });
})();
