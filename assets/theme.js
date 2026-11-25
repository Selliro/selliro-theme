/**
 * Whispo — global script (loaded on every page as a module from layout/theme.liquid).
 *
 *  - Swaps <html class="no-js"> for "js" (styles for no-JS fallbacks).
 *  - Scroll-in animation: elements with [data-animate] get .is-in once they reach the screen
 *    (styles in assets/base.css, section 12). Only when <html> has .animations-reveal, and not in the
 *    theme editor or for reduced motion. Add data-animate-order="1" … to stagger siblings.
 *  - Theme editor: newly loaded sections are animated in at once.
 */
import { prefersReducedMotion } from '@whispo/utilities';

const root = document.documentElement;
root.classList.remove('no-js');
root.classList.add('js');

const canAnimate = () =>
  root.classList.contains('animations-reveal') && !prefersReducedMotion() && !window.Shopify?.designMode;

/** @type {IntersectionObserver | null} */
let observer = null;

/** @param {ParentNode} scope */
function observeAnimations(scope = document) {
  const targets = /** @type {HTMLElement[]} */ (Array.from(scope.querySelectorAll('[data-animate]:not(.is-in)')));
  for (const el of targets) {
    if (el.dataset.animateOrder) el.style.setProperty('--animate-order', el.dataset.animateOrder);
  }
  if (!canAnimate() || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  observer ||= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer?.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 }
  );
  targets.forEach((el) => observer?.observe(el));
}

observeAnimations();

document.addEventListener('shopify:section:load', (event) => {
  if (event.target instanceof Element) {
    event.target.querySelectorAll('[data-animate]').forEach((el) => el.classList.add('is-in'));
  }
});
