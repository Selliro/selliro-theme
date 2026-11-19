/**
 * Add to cart animation: a small dot (or the product's image) pops out of the button that was pressed, circles
 * once, sweeps along an arc into the cart icon with a short comet trail, and the cart icon bounces and ripples.
 *
 * Works for every add to cart in the theme (product form, quick add, New Arrivals, bundles, routine builder,
 * wholesale…) because it listens for the shared `cart:update` event and remembers which button was pressed last.
 * Settings: Theme settings › Cards › Add to cart animation (on/off) and Cart › Add to cart animation (dot/image).
 *
 * The flight runs in a manual popover so it stays above open dialogs (quick view). While it is in the air,
 * window.WhispoCartFly.pending holds a promise the cart drawer waits for before auto-opening.
 */
(() => {
  if (window.WhispoCartFly) return;
  const config = window.Theme?.cartFly || {};
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  const api = { pending: /** @type {Promise<void> | null} */ (null) };
  window.WhispoCartFly = api;
  if (config.enabled === false) return;

  const STYLE = `
.cart-fly-layer{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;z-index:2147483646}
.cart-fly-layer::backdrop{display:none}
.cart-fly-dot{position:fixed;left:0;top:0;width:var(--s,20px);height:var(--s,20px);margin:calc(var(--s,20px)/-2) 0 0 calc(var(--s,20px)/-2);border-radius:50%;background:var(--fly-color,#121212);box-shadow:0 0 0 3px rgb(255 255 255/.85),0 8px 22px -6px var(--fly-glow,rgb(0 0 0/.45));will-change:transform,opacity;transform:translate3d(-100px,-100px,0) scale(0)}
.cart-fly-dot--image{--s:46px;background:#fff center/cover no-repeat;box-shadow:0 0 0 3px #fff,0 12px 28px -8px rgb(0 0 0/.45)}
.cart-fly-trail{position:fixed;left:0;top:0;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--fly-color,#121212);will-change:transform,opacity;opacity:0}
.cart-fly-ring{position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid var(--fly-color,#121212);opacity:0;pointer-events:none;animation:cart-fly-ring .6s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes cart-fly-ring{0%{opacity:.9;transform:var(--at) scale(.35)}100%{opacity:0;transform:var(--at) scale(1.6)}}
.cart-fly-bump{animation:cart-fly-bump .62s cubic-bezier(.3,1.6,.5,1)}
@keyframes cart-fly-bump{0%{transform:scale(1)}30%{transform:scale(1.28) rotate(-8deg)}55%{transform:scale(.9) rotate(4deg)}78%{transform:scale(1.06)}100%{transform:scale(1)}}
.cart-fly-pop{animation:cart-fly-pop .5s cubic-bezier(.3,1.8,.5,1)}
@keyframes cart-fly-pop{0%{transform:scale(.4)}60%{transform:scale(1.3)}100%{transform:scale(1)}}
@media (prefers-reduced-motion: reduce){.cart-fly-bump,.cart-fly-pop{animation:none}}`;

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  // Buttons that add to the cart: the dot starts on the click and circles until the cart confirms the add
  const ADD_BUTTONS = [
    'add-to-cart-component button',
    'button[name="add"]',
    'form[action*="/cart/add"] [type="submit"]',
    '[data-new-arrivals-add]',
    '[data-bb-cta]',
    '[data-rb-add-all]',
    '[data-b2b-add]',
    '[data-pdp-add]',
    '.shop-the-look__bundle-btn',
    '[data-add-to-cart]',
  ].join(',');

  /** @type {{ el: Element, x: number, y: number, t: number } | null} */
  let press = null;
  /** @type {ReturnType<typeof createFlight> | null} */
  let waiting = null;

  const remember = (/** @type {MouseEvent} */ event) => {
    const target = /** @type {Element} */ (event.target);
    const el = target?.closest?.('button, [type="submit"], [role="button"], a');
    if (!el) return;
    press = { el, x: event.clientX, y: event.clientY, t: performance.now() };
  };
  document.addEventListener('pointerdown', remember, true);

  document.addEventListener(
    'click',
    (event) => {
      remember(event);
      const el = press?.el;
      if (!el || !el.matches(ADD_BUTTONS) || el.closest('.cart-drawer__dialog')) return;
      if (el instanceof HTMLButtonElement && el.disabled) return;
      const form = el.closest('form');
      if (form && !form.checkValidity()) return;
      waiting?.cancel();
      waiting = createFlight(/** @type {any} */ (press));
    },
    true
  );

  document.addEventListener('cart:update', (event) => {
    const data = /** @type {CustomEvent} */ (event).detail?.data || {};
    if (data.source === 'cart-items-component') return;
    if (data.didError) {
      waiting?.cancel();
      waiting = null;
      return;
    }
    if (waiting) {
      waiting.go();
      waiting = null;
      press = null;
      return;
    }
    // An add from a button we don't know: fly now from the last pressed element
    const last = press;
    press = null;
    if (!last || performance.now() - last.t > 10000) return;
    if (last.el.closest('.cart-drawer__dialog')) return; // adds inside the drawer get the row highlight instead
    createFlight(last).go();
  });

  document.addEventListener('cart:error', () => {
    waiting?.cancel();
    waiting = null;
  });

  /* ---------------------------------------------------------------- helpers */
  const isVisible = (/** @type {Element} */ el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };

  const cartIcon = () => {
    const candidates = document.querySelectorAll(
      '.header-actions__cart-icon, cart-icon, [data-testid="cart-drawer-trigger"], .action__cart'
    );
    for (const el of candidates) if (isVisible(el)) return el;
    return null;
  };

  /** Picks the product photo next to the pressed button (card, quick view, product page). */
  const productImage = (/** @type {Element} */ el) => {
    let node = el.parentElement;
    for (let depth = 0; node && depth < 9; depth++, node = node.parentElement) {
      const imgs = node.querySelectorAll('img');
      for (const img of imgs) {
        const r = img.getBoundingClientRect();
        if (r.width >= 60 && r.height >= 60) return img.currentSrc || img.src;
      }
      if (node.matches('.shopify-section, dialog, main')) break;
    }
    return '';
  };

  /** A colour that stays visible: the button's colour when it is dark, otherwise its text colour. */
  const colorOf = (/** @type {Element} */ el) => {
    const parse = (/** @type {string} */ c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a, css: `rgb(${r} ${g} ${b})` };
    };
    const luminance = (/** @type {{r:number,g:number,b:number}} */ c) => (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    const cs = getComputedStyle(el);
    const bg = parse(cs.backgroundColor);
    const fg = parse(cs.color);
    if (bg && bg.a > 0.5 && luminance(bg) < 0.45) return bg.css;
    if (fg && luminance(fg) < 0.45) return fg.css;
    return '#141414';
  };

  const ease = (/** @type {number} */ t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const bezier = (t, a, b, c, d) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  };

  /** @type {HTMLElement | null} */
  let layer = null;
  const getLayer = () => {
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'cart-fly-layer';
      if ('popover' in HTMLElement.prototype) layer.setAttribute('popover', 'manual');
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    if (layer.hasAttribute('popover')) {
      // Re-show so the layer moves to the top of the top layer (above any dialog opened since)
      try {
        if (layer.matches(':popover-open')) layer.hidePopover();
        layer.showPopover();
      } catch (error) {
        /* not supported: stays a fixed element */
      }
    }
    return layer;
  };

  const bump = (/** @type {Element} */ icon) => {
    const target = icon.querySelector('svg')?.parentElement || icon;
    target.classList.remove('cart-fly-bump');
    void (/** @type {HTMLElement} */ (target).offsetWidth);
    target.classList.add('cart-fly-bump');
    setTimeout(() => target.classList.remove('cart-fly-bump'), 700);
    // The count bubble re-renders a moment later; pop whichever bubble is there then
    setTimeout(() => {
      const bubble = icon.querySelector('.cart-bubble') || document.querySelector('.header-actions .cart-bubble');
      if (!bubble) return;
      bubble.classList.remove('cart-fly-pop');
      void (/** @type {HTMLElement} */ (bubble).offsetWidth);
      bubble.classList.add('cart-fly-pop');
      setTimeout(() => bubble.classList.remove('cart-fly-pop'), 600);
    }, 60);
  };

  /* ----------------------------------------------------------------- flight */
  /**
   * Pops a dot out of the pressed button and keeps it circling there; go() sends it to the cart,
   * cancel() fades it out (failed add). Gives up by itself after 8 seconds.
   * @param {{ el: Element, x: number, y: number }} from
   */
  function createFlight(from) {
    const noop = { go() {}, cancel() {} };
    const rect = from.el.isConnected ? from.el.getBoundingClientRect() : null;
    const sx = rect && rect.width ? rect.left + rect.width / 2 : from.x;
    const sy = rect && rect.height ? rect.top + rect.height / 2 : from.y;
    if (!sx && !sy) return noop;

    if (reduced.matches) {
      return {
        go() {
          const icon = cartIcon();
          if (icon) bump(icon);
        },
        cancel() {},
      };
    }

    const color = colorOf(from.el);
    const image = config.style === 'image' ? productImage(from.el) : '';
    const root = getLayer();
    const head = document.createElement('span');
    head.className = `cart-fly-dot${image ? ' cart-fly-dot--image' : ''}`;
    head.style.setProperty('--fly-color', color);
    head.style.setProperty('--fly-glow', color);
    if (image) head.style.backgroundImage = `url("${image}")`;

    const TRAIL = 7;
    const trail = Array.from({ length: TRAIL }, () => {
      const dot = document.createElement('span');
      dot.className = 'cart-fly-trail';
      dot.style.setProperty('--fly-color', color);
      root.appendChild(dot);
      return dot;
    });
    root.appendChild(head);

    const POP = 220; // pop out of the button
    const LOOP = 620; // one circle around the button while the cart is being updated
    const MIN_ORBIT = 420; // circle at least this long before leaving, so the move reads
    const radius = image ? 22 : 18;
    const history = [];
    const begin = performance.now();

    /** @type {number | null} */
    let goAt = null;
    /** @type {number | null} */
    let cancelAt = null;
    /** @type {null | { x: number, y: number, ex: number, ey: number, c1x: number, c1y: number, c2x: number, c2y: number, duration: number, icon: Element | null }} */
    let path = null;
    let finished = false;
    let done = () => {};
    api.pending = new Promise((resolve) => (done = resolve));

    const cleanup = () => {
      finished = true;
      head.remove();
      trail.forEach((dot) => dot.remove());
      hideLayerWhenIdle(root);
      api.pending = null;
      done();
    };

    const planPath = (/** @type {number} */ x, /** @type {number} */ y) => {
      const icon = cartIcon();
      const end = icon ? icon.getBoundingClientRect() : null;
      const ex = end ? end.left + end.width / 2 : innerWidth - 36;
      const ey = end ? end.top + end.height / 2 : 32;
      const dx = ex - x;
      const dist = Math.hypot(dx, ey - y);
      const lift = Math.min(260, Math.max(90, dist * 0.42));
      return {
        x,
        y,
        ex,
        ey,
        icon,
        // Rise up and slightly away from the cart first, then sweep in from above
        c1x: x - Math.sign(dx || 1) * Math.min(120, dist * 0.18),
        c1y: y - lift,
        c2x: ex - dx * 0.25,
        c2y: Math.min(y, ey) - lift * 0.55,
        duration: Math.min(1000, Math.max(600, 500 + dist * 0.3)),
      };
    };

    const frame = (/** @type {number} */ now) => {
      if (finished) return;
      const t = now - begin;
      let x = sx;
      let y = sy;
      let scale = 1;
      let opacity = 1;

      if (cancelAt !== null) {
        const p = Math.min(1, (now - cancelAt) / 260);
        scale = 1 - p;
        opacity = 1 - p;
        if (p >= 1) return cleanup();
      } else if (t > 8000 && goAt === null) {
        cancelAt = now;
      }

      if (path) {
        const p = Math.min(1, (now - /** @type {number} */ (goAt)) / path.duration);
        const e = ease(p);
        x = bezier(e, path.x, path.c1x, path.c2x, path.ex);
        y = bezier(e, path.y, path.c1y, path.c2y, path.ey);
        scale = 1 - 0.55 * e * e;
        if (p > 0.88) opacity = 1 - (p - 0.88) / 0.12;
        if (p >= 1) return land(path);
      } else if (t < POP) {
        const p = t / POP;
        scale = 1.35 * Math.sin((p * Math.PI) / 2) - 0.35 * p; // overshoot, then settle at 1
      } else {
        // Circle around the button: the circle opens out from the button's centre and keeps going
        const o = t - POP;
        const a = (o / LOOP) * Math.PI * 2 - Math.PI / 2;
        const r = radius * Math.min(1, o / (LOOP * 0.35));
        x = sx + Math.cos(a) * r;
        y = sy + Math.sin(a) * r;
        if (goAt !== null && o >= MIN_ORBIT) {
          path = planPath(x, y);
          goAt = now;
        }
      }

      if (cancelAt !== null && !path) {
        const p = Math.min(1, (now - cancelAt) / 260);
        scale *= 1 - p;
        opacity *= 1 - p;
      }

      head.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${Math.max(0, scale)})`;
      head.style.opacity = String(Math.max(0, opacity));

      history.unshift({ x, y });
      if (history.length > TRAIL * 2 + 2) history.pop();
      trail.forEach((dot, i) => {
        const point = history[(i + 1) * 2];
        if (!point || t < POP) {
          dot.style.opacity = '0';
          return;
        }
        const k = 1 - (i + 1) / (TRAIL + 1);
        dot.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) scale(${0.25 + 0.75 * k})`;
        dot.style.opacity = String((path ? 0.55 : 0.3) * k * Math.max(0, opacity));
      });

      requestAnimationFrame(frame);
    };

    const land = (/** @type {NonNullable<typeof path>} */ target) => {
      const ring = document.createElement('span');
      ring.className = 'cart-fly-ring';
      ring.style.setProperty('--fly-color', color);
      ring.style.setProperty('--at', `translate3d(${target.ex}px, ${target.ey}px, 0)`);
      ring.style.transform = `translate3d(${target.ex}px, ${target.ey}px, 0)`;
      root.appendChild(ring);
      setTimeout(() => {
        ring.remove();
        hideLayerWhenIdle(root);
      }, 650);
      if (target.icon) bump(target.icon);
      cleanup();
    };

    requestAnimationFrame(frame);

    return {
      go() {
        if (goAt === null && cancelAt === null) goAt = performance.now();
      },
      cancel() {
        if (cancelAt === null && !path) cancelAt = performance.now();
      },
    };
  }

  const hideLayerWhenIdle = (/** @type {HTMLElement} */ root) => {
    if (root.childElementCount > 0 || !root.hasAttribute('popover')) return;
    try {
      root.hidePopover();
    } catch (error) {
      /* already hidden */
    }
  };
})();
