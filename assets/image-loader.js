/**
 * Wraps an <img> with a lightweight loading state (skeleton) until the image finishes loading.
 */
(function () {
  class ImageLoader extends HTMLElement {
    connectedCallback() {
      if (this.hasAttribute('data-image-loader-ready')) return;
      this.setAttribute('data-image-loader-ready', '1');
      this.classList.add('image-loader');

      var self = this;
      function bind() {
        var img = self.querySelector('img');
        if (!img) {
          self.setAttribute('data-loaded', '');
          return;
        }

        function finish() {
          self.setAttribute('data-loaded', '');
        }

        if (img.complete && img.naturalWidth > 0) {
          finish();
          return;
        }

        img.addEventListener('load', finish, { once: true });
        img.addEventListener(
          'error',
          function () {
            self.setAttribute('data-error', '');
            finish();
          },
          { once: true }
        );
      }

      if (self.querySelector('img')) {
        bind();
      } else {
        requestAnimationFrame(bind);
      }
    }
  }

  if (!customElements.get('image-loader')) {
    customElements.define('image-loader', ImageLoader);
  }
})();
