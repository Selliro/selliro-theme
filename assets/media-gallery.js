/**
 * Whispo product media gallery (snippets/media-gallery.liquid → <media-gallery>).
 *
 * The slides are a horizontal scroll-snap track, so swiping, trackpads and keyboards scroll natively; this
 * script keeps the rest in step with it:
 *   - the visible slide is tracked (IntersectionObserver) → [data-active] slide, aria-current thumbnail,
 *     dots and the "2 / 5" counter; videos and 3D models on other slides are paused;
 *   - thumbnails, arrows and showMedia(id) (variant change) scroll the track to a slide;
 *   - layout "grid" on desktop shows every slide stacked; a variant change then moves its image first;
 *   - zoom: a click on an image opens the full-screen viewer (<dialog>) at that image;
 *   - 3D models: loads Shopify's model viewer UI and XR ("View in your space") when the product has models.
 */
import { Component } from '@whispo/component';
import { openDialog } from '@whispo/dialog';
import { prefersReducedMotion } from '@whispo/utilities';

const DESKTOP = window.matchMedia('(min-width: 990px)');

class MediaGallery extends Component {
  #index = 0;

  /** @type {IntersectionObserver | null} */
  #observer = null;

  setup() {
    const { track, previous, next, viewer } = this.refs;
    if (!track) return;

    this.#observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting && entry.intersectionRatio > 0.6);
        if (!visible.length) return;
        const slide = /** @type {HTMLElement} */ (visible[0].target);
        this.#setActive(this.#slides().indexOf(slide));
      },
      { root: track, threshold: [0.6, 0.9] }
    );
    this.#slides().forEach((slide) => this.#observer?.observe(slide));

    if (previous) this.on('click', () => this.go(this.#index - 1), { target: previous });
    if (next) this.on('click', () => this.go(this.#index + 1), { target: next });
    this.on('click', '[data-ref="thumb[]"]', (_event, thumb) => this.go(Number(/** @type {HTMLElement} */ (thumb).dataset.index)));

    if (viewer) {
      this.on('click', '[data-zoom-index]', (_event, button) => this.#openViewer(Number(/** @type {HTMLElement} */ (button).dataset.zoomIndex)));
    }

    this.#setupModels();
  }

  teardown() {
    this.#observer?.disconnect();
  }

  /** @returns {HTMLElement[]} */
  #slides() {
    return this.refs.slide || [];
  }

  get #isGrid() {
    return this.dataset.layout === 'grid' && DESKTOP.matches;
  }

  /**
   * Scroll to a slide.
   * @param {number} index
   * @param {boolean} [instant]
   */
  go(index, instant = false) {
    const slides = this.#slides();
    if (!slides.length) return;
    const target = (index + slides.length) % slides.length;
    const slide = slides[target];
    if (this.#isGrid) {
      this.#setActive(target);
      return;
    }
    const { track } = this.refs;
    track.scrollTo({
      left: slide.offsetLeft - track.offsetLeft,
      behavior: instant || prefersReducedMotion() ? 'auto' : 'smooth',
    });
    this.#setActive(target);
  }

  /**
   * Show a media item (used when the variant changes).
   * @param {string | number} mediaId
   */
  showMedia(mediaId) {
    const slides = this.#slides();
    const index = slides.findIndex((slide) => slide.dataset.mediaId === String(mediaId));
    if (index < 0) return;
    if (this.#isGrid && index > 0) {
      // Grid: move the variant's media to the top, as on page load
      const slide = slides[index];
      this.refs.track.prepend(slide);
      this.refresh();
      this.#setActive(0);
      return;
    }
    this.go(index, true);
  }

  /** @param {number} index */
  #setActive(index) {
    if (index < 0) return;
    this.#index = index;
    const slides = this.#slides();
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.toggleAttribute('data-active', active);
      if (!active) this.#pause(slide);
    });
    (this.refs.thumb || []).forEach((/** @type {HTMLElement} */ thumb, /** @type {number} */ i) => {
      if (i === index) {
        thumb.setAttribute('aria-current', 'true');
        thumb.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } else {
        thumb.removeAttribute('aria-current');
      }
    });
    this.querySelectorAll('.media-gallery__dot').forEach((dot, i) => dot.toggleAttribute('data-active', i === index));
    if (this.refs.current) this.refs.current.textContent = String(index + 1);
  }

  /** @param {HTMLElement} slide */
  #pause(slide) {
    slide.querySelectorAll('video').forEach((video) => video.pause());
    slide.querySelectorAll('iframe').forEach((iframe) => {
      // YouTube and Vimeo both accept these messages
      iframe.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      iframe.contentWindow?.postMessage('{"method":"pause"}', '*');
    });
    slide.querySelectorAll('model-viewer').forEach((model) => /** @type {any} */ (model).pause?.());
  }

  /** @param {number} index slide index of the clicked image */
  #openViewer(index) {
    const { viewer } = this.refs;
    openDialog(viewer);
    const item = viewer.querySelector(`[data-viewer-index="${index}"]`);
    window.requestAnimationFrame(() => item?.scrollIntoView({ block: 'start' }));
  }

  #setupModels() {
    const data = this.parentElement?.querySelector('[data-product-models]') || this.querySelector('[data-product-models]');
    if (!data || !window.Shopify?.loadFeatures) return;
    const models = JSON.parse(data.textContent || '[]');
    window.Shopify.loadFeatures([
      {
        name: 'shopify-xr',
        version: '1.0',
        onLoad: (error) => {
          if (error || !window.ShopifyXR) return;
          window.ShopifyXR.addModels(models);
          window.ShopifyXR.setupXRElements();
        },
      },
      {
        name: 'model-viewer-ui',
        version: '1.0',
        onLoad: (error) => {
          if (error || !window.Shopify?.ModelViewerUI) return;
          this.querySelectorAll('model-viewer').forEach((element) => new window.Shopify.ModelViewerUI(element));
        },
      },
    ]);
  }
}

Component.define('media-gallery', MediaGallery);
