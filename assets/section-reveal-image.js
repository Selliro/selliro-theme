class RevealImage extends HTMLElement {
  connectedCallback() {
    this._pin     = /** @type {HTMLElement|null} */ (this.querySelector('.reveal-image__pin'));
    this._frame   = /** @type {HTMLElement|null} */ (this.querySelector('.reveal-image__frame'));
    this._content = /** @type {HTMLElement|null} */ (this.querySelector('.reveal-image__content'));
    this._mq      = window.matchMedia('(prefers-reduced-motion: reduce)');

    this._sd  = parseInt(this.dataset.scrollDist   || '', 10) || 1000;
    this._vs  = parseFloat(this.dataset.vStart     || '') || 35;
    this._hs  = parseFloat(this.dataset.hStart     || '') || 25;
    this._rs  = parseFloat(this.dataset.radiusStart || '') || 16;
    this._re  = parseFloat(this.dataset.radiusEnd   || '') || 0;
    this._state = '';
    this._raf   = 0;

    this._setHeight();

    if (this._mq.matches) {
      if (this._frame)   this._frame.style.clipPath = 'none';
      if (this._content) this._content.style.opacity = '1';
      return;
    }

    if (this._frame) {
      this._frame.style.clipPath =
        'inset(' + this._vs + '% ' + this._hs + '% round ' + this._rs + 'px)';
    }
    if (this._content) this._content.style.opacity = '0';

    this._onScroll = () => {
      if (!this._raf) {
        this._raf = requestAnimationFrame(() => { this._raf = 0; this._update(); });
      }
    };
    this._onResize = () => { this._setHeight(); this._state = ''; this._update(); };
    this._onLoad   = (/** @type {Event} */ e) => {
      if (/** @type {HTMLElement} */ (e.target).contains(this)) {
        this._setHeight();
        this._state = '';
        this._update();
      }
    };

    window.addEventListener('scroll',                 this._onScroll, { passive: true });
    window.addEventListener('resize',                 this._onResize, { passive: true });
    document.addEventListener('shopify:section:load', this._onLoad);

    this._update();
  }

  disconnectedCallback() {
    if (this._onScroll) window.removeEventListener('scroll',                 this._onScroll);
    if (this._onResize) window.removeEventListener('resize',                 this._onResize);
    if (this._onLoad)   document.removeEventListener('shopify:section:load', this._onLoad);
    if (this._raf)      cancelAnimationFrame(this._raf);
  }

  _setHeight() {
    this.style.height = (window.innerHeight + this._sd) + 'px';
  }

  _ease(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  _apply(p) {
    var ep = this._ease(p);

    if (this._frame) {
      var v = (this._vs * (1 - ep)).toFixed(3);
      var h = (this._hs * (1 - ep)).toFixed(3);
      var r = (this._rs + (this._re - this._rs) * ep).toFixed(1);
      this._frame.style.clipPath = 'inset(' + v + '% ' + h + '% round ' + r + 'px)';
    }

    if (this._content) {
      var cp = (p - 0.50) / 0.40;
      cp = cp < 0 ? 0 : cp > 1 ? 1 : cp;
      this._content.style.opacity = cp.toFixed(4);
    }
  }

  _pinTo(position, top, bottom) {
    if (!this._pin) return;
    this._pin.style.position = position;
    this._pin.style.top      = top;
    this._pin.style.bottom   = bottom;
    this._pin.style.left     = '0';
    this._pin.style.width    = '100%';
  }

  _update() {
    if (!this._pin) return;
    var top = this.getBoundingClientRect().top;
    var vh  = window.innerHeight;
    var sd  = this._sd;

    if (top >= vh) {
      /* ── Not yet visible ─── collapsed, waiting */
      if (this._state !== 'before') {
        this._pinTo('absolute', '0', 'auto');
        this._state = 'before';
      }
      this._apply(0);

    } else if (top >= 0) {
      /* ── Entering from bottom ─── absolute, animates as it scrolls in */
      if (this._state !== 'entering') {
        this._pinTo('absolute', '0', 'auto');
        this._state = 'entering';
      }
      this._apply((vh - top) / (vh + sd));

    } else if (top > -sd) {
      /* ── Sticky zone ─── fixed to viewport, animation continues */
      if (this._state !== 'fixed') {
        this._pinTo('fixed', '0', 'auto');
        this._state = 'fixed';
      }
      this._apply((vh - top) / (vh + sd));

    } else {
      /* ── Past animation ─── anchored to section bottom, fully expanded */
      if (this._state !== 'after') {
        this._pinTo('absolute', 'auto', '0');
        this._state = 'after';
      }
      this._apply(1);
    }
  }
}

if (!customElements.get('reveal-image-section')) {
  customElements.define('reveal-image-section', RevealImage);
}
