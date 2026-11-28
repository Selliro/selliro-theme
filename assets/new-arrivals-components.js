/**
 * New Arrivals Showcase — product card shell + image gallery scrub (horizontal hover / touch).
 */
(function () {
  class NewArrivalsProductCard extends HTMLElement {
    connectedCallback() {
      if (this.hasAttribute('data-new-arrivals-card-ready')) return;
      this.setAttribute('data-new-arrivals-card-ready', '1');
    }
  }

  class NewArrivalsProductGallery extends HTMLElement {
    connectedCallback() {
      if (this.hasAttribute('data-new-arrivals-gallery-ready')) return;

      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      var imgs = this.querySelectorAll('.new-arrivals-card__gallery-img');
      if (imgs.length < 2) {
        var bar = this.querySelector('.new-arrivals-card__gallery-bar');
        if (bar) bar.setAttribute('hidden', '');
        return;
      }

      this.setAttribute('data-new-arrivals-gallery-ready', '1');

      var link = this.closest('.new-arrivals-card__media-link');
      if (!link) return;

      var segs = this.querySelectorAll('.new-arrivals-card__gallery-bar-seg');

      function setActive(i) {
        var n = imgs.length;
        var ix = Math.max(0, Math.min(i, n - 1));
        for (var j = 0; j < n; j++) {
          imgs[j].classList.toggle('is-active', j === ix);
          if (segs[j]) segs[j].classList.toggle('is-active', j === ix);
        }
      }

      function pickIndex(clientX) {
        var rect = link.getBoundingClientRect();
        var w = rect.width;
        if (w < 2) return 0;
        var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / w));
        return Math.min(imgs.length - 1, Math.floor(ratio * imgs.length));
      }

      link.addEventListener('mousemove', function (e) {
        setActive(pickIndex(e.clientX));
      });
      link.addEventListener('mouseleave', function () {
        setActive(0);
      });
      link.addEventListener(
        'touchmove',
        function (e) {
          if (e.touches && e.touches[0]) setActive(pickIndex(e.touches[0].clientX));
        },
        { passive: true }
      );
      link.addEventListener('touchend', function () {
        setActive(0);
      });
      link.addEventListener('touchcancel', function () {
        setActive(0);
      });
    }
  }

  if (!customElements.get('new-arrivals-product-card')) {
    customElements.define('new-arrivals-product-card', NewArrivalsProductCard);
  }
  if (!customElements.get('new-arrivals-product-gallery')) {
    customElements.define('new-arrivals-product-gallery', NewArrivalsProductGallery);
  }
})();
