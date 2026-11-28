/**
 * Whispo footer reveal (sections/footer.liquid → <footer-component data-reveal>).
 *
 * body[data-footer-reveal] = mode, chosen from the footer and screen heights (re-checked on resize):
 *   "pin"   the footer fits the screen. It is sticky to the bottom, behind <main>; as the page lifts off it,
 *           the card and the bottom bar rise into place at RISE x the scroll speed (a slow parallax),
 *           fully in place at the end of the page. Scrolling back plays it in reverse.
 *   "rise"  taller than the screen: the footer stays in the flow and its parts slide up a short distance
 *           as it comes into view.
 *   (none)  theme editor, reduced motion or no <main>: a normal footer.
 * body[data-footer-zone] is set while the footer is uncovered, so the sticky header slides away and the
 * footer gets the whole screen. Nothing moves on its own: every change follows the shopper's scroll.
 * Back to top scrolls smoothly (instantly for reduced motion) and moves focus to <main>.
 */
import { Component } from '@whispo/component';
import { prefersReducedMotion } from '@whispo/utilities';

/** Share of the footer height the parts travel while it is uncovered (0 = still, 1 = with the page) */
const RISE = 0.45;
/** Slide distance in "rise" mode */
const RISE_DISTANCE = 64;

class FooterComponent extends Component {
  #frame = 0;

  #inZone = false;

  /** @type {HTMLElement | null} */
  #main = null;

  setup() {
    this.#main = document.getElementById('MainContent');
    const { top } = this.refs;
    if (top) {
      this.on('click', (event) => {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        this.#main?.focus({ preventScroll: true });
      }, { target: top });
    }

    if (!this.hasAttribute('data-reveal') || window.Shopify?.designMode || prefersReducedMotion() || !this.#main) {
      this.#reset();
      return;
    }

    const request = () => {
      if (this.#frame) return;
      this.#frame = window.requestAnimationFrame(() => {
        this.#frame = 0;
        this.#update();
      });
    };
    this.on('scroll', request, { target: window, passive: true });
    this.on('resize', () => {
      this.#chooseMode();
      request();
    }, { target: window });
    new ResizeObserver(() => {
      this.#chooseMode();
      request();
    }).observe(this);

    this.#chooseMode();
    this.#update();
  }

  teardown() {
    window.cancelAnimationFrame(this.#frame);
    this.#reset();
  }

  #chooseMode() {
    const fits = this.offsetHeight <= window.innerHeight - 24;
    document.body.dataset.footerReveal = fits ? 'pin' : 'rise';
  }

  #reset() {
    delete document.body.dataset.footerReveal;
    document.body.removeAttribute('data-footer-zone');
    this.#parts().forEach((part) => (part.style.transform = ''));
  }

  /** @returns {HTMLElement[]} */
  #parts() {
    return [this.refs.main, this.refs.bottom].filter(Boolean);
  }

  #update() {
    const main = this.#main;
    if (!main) return;
    const viewport = window.innerHeight;
    const uncovered = viewport - main.getBoundingClientRect().bottom;
    const height = this.offsetHeight;
    let offset = 0;

    if (document.body.dataset.footerReveal === 'pin') {
      const shown = Math.max(0, Math.min(height, uncovered));
      offset = (height - shown) * RISE;
    } else {
      const top = this.getBoundingClientRect().top;
      const progress = Math.max(0, Math.min(1, (viewport - top) / Math.min(viewport * 0.6, height)));
      offset = (1 - progress) * RISE_DISTANCE;
    }
    const transform = offset > 0.5 ? `translate3d(0, ${offset.toFixed(1)}px, 0)` : '';
    this.#parts().forEach((part) => (part.style.transform = transform));

    // Only once the shopper has scrolled (short pages show the footer from the start), and with a little
    // hysteresis so the header doesn't flicker at the edge
    const scrolled = window.scrollY > 120;
    const zone = scrolled && (this.#inZone ? uncovered > 8 : uncovered > 24);
    if (zone !== this.#inZone) {
      this.#inZone = zone;
      document.body.toggleAttribute('data-footer-zone', zone);
    }
  }
}

Component.define('footer-component', FooterComponent);
