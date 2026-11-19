/**
 * Slide product → New Arrivals scroll flight (blocks/_slide.liquid, "Fly into New Arrivals while scrolling").
 *
 * The product image on a slide is tied to the scroll position: scrolling down lifts it off the slide, carries it
 * down and across the page (tilting slightly on the way) and lands it on the image of the first product card in
 * New Arrivals, where it cross-fades into that card. Scrolling up reverses the flight.
 *
 * Smoothness
 * - The flight follows the scroll through a short inertia (≈160 ms), so mouse-wheel steps glide instead of jump.
 * - The flyer lives in page space (position: absolute), so the browser scrolls it together with the page on
 *   its compositor thread; JS only moves it along the flight path. (A position: fixed flyer moved by JS trails
 *   the page by a frame on every scroll step, which reads as jitter.)
 * - Only transform / opacity change per frame (no layout work); the flyer's size is set once.
 * - Take-off starts from the image exactly where it is drawn (including its floating motion), and the slide's
 *   copy is swapped for the flyer in the same frame, so there is never a double image or a jump.
 *
 * Several slides
 * - Each slide's image belongs to its own slide. How much of that slide is in view (measured live, also
 *   mid-swipe) sets how visible its flyer is: going to another slide fades the product out, coming back fades
 *   it in. It never hangs over a slide it doesn't belong to.
 * - If several slides fly a product, the one most in view flies.
 * - The landing card shows its own image whenever no product is on its way to it.
 * - While a product is in the air the slideshow holds its slide (autoplay resumes back at the top).
 *
 * Off for reduced motion, when the slide image is hidden (e.g. on mobile) or with no New Arrivals below.
 */
(() => {
  if (window.__slideProductFly) return;
  window.__slideProductFly = true;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => 0.5 - Math.cos(Math.PI * t) / 2; // gentle: never more than ~1.6× average speed
  const LAND = 0.86; // the last part of the flight cross-fades into the card
  const INERTIA = 0.16; // seconds

  let flyer = null;
  let flyerImg = null;
  let source = null; // the slide <img> currently flying
  let target = null; // .new-arrivals-card__media it lands on
  let progress = null; // smoothed flight progress (null = not started yet)
  let lastTime = 0;
  let frame = 0;
  let held = null; // slideshow whose autoplay is suspended
  let base = { w: 0, h: 0 };

  const queue = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

  /* ------------------------------------------------------------ helpers */
  const makeFlyer = () => {
    flyer = document.createElement('div');
    flyer.className = 'slide-product-flyer';
    flyer.setAttribute('aria-hidden', 'true');
    flyer.style.cssText =
      'position:absolute;left:0;top:0;z-index:7;pointer-events:none;visibility:hidden;opacity:0;will-change:transform,opacity;transform-origin:50% 50%;contain:layout style;';
    flyerImg = document.createElement('img');
    flyerImg.alt = '';
    flyerImg.decoding = 'async';
    flyerImg.style.cssText =
      'display:block;width:100%;height:100%;object-fit:cover;filter:drop-shadow(0 26px 30px rgb(0 0 0 / 0.26));';
    flyer.append(flyerImg);
    document.body.append(flyer);
  };

  const setStyle = (el, prop, value) => {
    if (el && el.style[prop] !== value) el.style[prop] = value;
  };
  const setFlying = (img, on) => {
    const inner = img?.closest('[data-fly-source]');
    if (inner && inner.classList.contains('is-flying') !== on) inner.classList.toggle('is-flying', on);
  };
  const stackOf = (media) => media?.querySelector('.new-arrivals-card__media-stack');

  /** How much of a slide is inside the slideshow's viewport right now (0–1), live during swipes */
  const slideVisibility = (img) => {
    const slide = img.closest('slideshow-slide');
    const viewport = slide?.parentElement;
    if (!slide || !viewport) return 1;
    const s = slide.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();
    if (!v.width) return 0;
    return clamp((Math.min(s.right, v.right) - Math.max(s.left, v.left)) / v.width);
  };

  /** Where the image is drawn on its own slide (floating motion included), even while another slide shows */
  const restingRect = (img) => {
    const r = img.getBoundingClientRect();
    const slide = img.closest('slideshow-slide');
    const viewport = slide?.parentElement;
    if (!slide || !viewport) return r;
    const s = slide.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();
    return { left: r.left - s.left + v.left, top: r.top - s.top + v.top, width: r.width, height: r.height };
  };

  /** The flying image of the slide most in view, and how much of that slide is in view */
  const pickSource = () => {
    let best = null;
    let bestVis = 0;
    for (const wrap of document.querySelectorAll('[data-fly-product]')) {
      const img = wrap.querySelector('[data-fly-source] img');
      if (!img || !img.offsetWidth) continue; // hidden (e.g. "Show on mobile" off)
      const vis = slideVisibility(img);
      if (vis > bestVis + 0.001) {
        best = img;
        bestVis = vis;
      }
    }
    // Keep the current one through a tie (mid-swipe between two product slides)
    if (source && best !== source && source.isConnected && source.offsetWidth) {
      const keep = slideVisibility(source);
      if (keep >= bestVis - 0.001) return { img: source, vis: keep };
    }
    return { img: best, vis: bestVis };
  };

  /** First product card of the visible New Arrivals tab, below the slideshow */
  const findTarget = (from) => {
    for (const panel of document.querySelectorAll('.new-arrivals-showcase__panel:not([hidden])')) {
      if (!(from.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const media = panel.querySelector('.new-arrivals-card__media');
      if (media && media.offsetWidth) return media;
    }
    return null;
  };

  /** Hold the slideshow on its slide while the product is in the air; let it play again afterwards */
  const hold = (show) => {
    if (show === held) {
      show?.suspend?.();
      return;
    }
    if (held) {
      held.removeEventListener('mouseleave', queue);
      held.resume?.();
    }
    held = show;
    if (held) {
      held.suspend?.();
      held.addEventListener('mouseleave', queue); // its own mouseleave would restart autoplay mid-flight
    }
  };

  const hideFlyer = () => {
    setStyle(flyer, 'visibility', 'hidden');
    setStyle(flyer, 'opacity', '0');
  };

  const release = () => {
    hideFlyer();
    setFlying(source, false);
    setStyle(stackOf(target), 'opacity', '');
  };

  /* ------------------------------------------------------------ frame */
  function tick(now) {
    frame = 0;
    const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;

    const { img, vis } = reducedMotion.matches ? { img: null, vis: 0 } : pickSource();
    const nextTarget = img ? findTarget(img) : null;
    if (img !== source || nextTarget !== target) {
      release();
      source = img;
      target = nextTarget;
    }
    if (!source || !target) {
      hold(null);
      lastTime = 0;
      return;
    }

    const vh = window.innerHeight;
    const y = window.scrollY;
    const s = restingRect(source);
    const t = target.getBoundingClientRect();
    if (!s.width || !t.width) return release();
    const sTop = s.top + y;
    const tTop = t.top + y;
    if (tTop <= sTop) return release();

    // Take off once the product passes the middle of the screen; land with the card a little above the middle
    const start = Math.max(0, sTop + s.height / 2 - vh / 2);
    const end = Math.max(tTop + t.height / 2 - vh * 0.55, start + 240);
    const goal = clamp((y - start) / (end - start));

    // Inertia: glide toward the scroll position (jump straight there on the first frame, e.g. after a reload)
    if (progress === null) progress = goal;
    progress += (goal - progress) * (1 - Math.exp(-dt / INERTIA));
    if (Math.abs(goal - progress) < 0.0008) progress = goal;
    const p = progress;
    const moving = p !== goal;

    const stack = stackOf(target);
    const inAir = p > 0 && p < 1;
    hold(inAir && vis > 0 ? source.closest('slideshow-component') : null);

    if (!inAir || vis <= 0) {
      hideFlyer();
      setFlying(source, p > 0);
      // Before take-off the card waits for the product only while the product's slide is showing
      setStyle(stack, 'opacity', p >= 1 || vis <= 0 ? '' : String((1 - vis).toFixed(3)));
      if (moving) queue();
      else lastTime = 0;
      return;
    }

    if (!flyer) makeFlyer();
    const src = source.currentSrc || source.src;
    if (src && flyerImg.getAttribute('src') !== src) flyerImg.src = src;

    // One fixed box — the larger of the two sizes, so it only ever scales down and stays sharp
    const w = Math.max(s.width, t.width);
    const h = w * (s.height / s.width);
    if (Math.abs(base.w - w) > 0.5 || Math.abs(base.h - h) > 0.5) {
      base = { w, h };
      flyer.style.width = `${w}px`;
      flyer.style.height = `${h}px`;
    }

    // Sideways movement eases in and out; downward movement follows the scroll → a gentle curve
    const e = easeInOut(p);
    const width = lerp(s.width, t.width, e);
    const cx = lerp(s.left + s.width / 2, t.left + t.width / 2, e);
    // Page coordinates, relative to the flyer's containing block (the body if it is positioned)
    const origin = document.body.getBoundingClientRect();
    const bodyPositioned = getComputedStyle(document.body).position !== 'static';
    const ox = bodyPositioned ? origin.left : -window.scrollX;
    const oy = bodyPositioned ? origin.top + y : 0;
    const cy = lerp(sTop + s.height / 2, tTop + t.height / 2, p) - oy;
    const arc = Math.sin(p * Math.PI);
    const scale = (width / w) * (1 + 0.05 * arc);
    const landing = clamp((p - LAND) / (1 - LAND));

    flyer.style.transform = `translate3d(${(cx - ox - w / 2).toFixed(2)}px, ${(cy - h / 2).toFixed(2)}px, 0) rotate(${(-11 * arc).toFixed(2)}deg) scale(${scale.toFixed(4)})`;
    setStyle(flyer, 'visibility', 'visible');
    setStyle(flyer, 'opacity', ((1 - landing) * vis).toFixed(3));
    setFlying(source, true);
    // Card image: hidden while the product is on its way; fades in as it lands, or if its slide is swiped away
    setStyle(stack, 'opacity', clamp(1 - vis * (1 - landing)).toFixed(3));

    if (moving) queue();
  }

  /* ------------------------------------------------------------ triggers */
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue, { passive: true });
  window.addEventListener('load', queue);
  reducedMotion.addEventListener?.('change', queue);

  // Slides move by scrolling their own track: follow every swipe / arrow / autoplay step live
  const watchSlides = () => {
    document.querySelectorAll('[data-fly-product]').forEach((wrap) => {
      const track = wrap.closest('slideshow-slide')?.parentElement;
      if (track && !track.__flyWatched) {
        track.__flyWatched = true;
        track.addEventListener('scroll', queue, { passive: true });
        track.addEventListener('scrollend', queue, { passive: true });
      }
    });
  };
  watchSlides();

  // Slide changes, New Arrivals tab changes and editor reloads change what flies / where it lands
  new MutationObserver(queue).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-hidden', 'hidden'],
  });
  document.addEventListener('shopify:section:load', () => {
    watchSlides();
    queue();
  });
  document.addEventListener('shopify:section:unload', () => {
    release();
    source = null;
    target = null;
    queue();
  });
  queue();
})();
