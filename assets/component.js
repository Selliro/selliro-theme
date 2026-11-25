/**
 * Whispo component base (import from '@whispo/component').
 *
 * Every interactive piece of the theme is a custom element that extends Component:
 *
 *   import { Component } from '@whispo/component';
 *
 *   class QuantityInput extends Component {
 *     setup() {                                  // runs when the element connects
 *       this.on('click', '[data-step]', (event, button) => this.step(Number(button.dataset.step)));
 *     }
 *     step(by) { this.refs.input.stepUp(by); }   // child with data-ref="input"
 *   }
 *   Component.define('quantity-input', QuantityInput);
 *
 * What it gives you
 *   this.refs         children marked data-ref="name" (data-ref="item[]" collects an array).
 *                     Refs inside a nested component belong to that component, not this one.
 *   this.on(...)      event listeners (optionally delegated to a selector) that are removed
 *                     automatically when the element disconnects.
 *   this.signal       an AbortSignal that aborts on disconnect: pass it to fetch / addEventListener.
 *   setup()/teardown() lifecycle hooks; setup() runs again after the theme editor re-renders the element.
 */

export class Component extends HTMLElement {
  /** @type {AbortController | null} */
  #controller = null;

  /** @type {Record<string, any> | null} */
  #refs = null;

  connectedCallback() {
    this.#controller = new AbortController();
    this.#refs = null;
    // Marks the element as a component, so an outer component skips the refs inside it
    this.toggleAttribute('data-component', true);
    this.setup();
  }

  disconnectedCallback() {
    this.#controller?.abort();
    this.#controller = null;
    this.teardown();
  }

  /** Override: called when the element is connected. */
  setup() {}

  /** Override: called when the element is disconnected (listeners from this.on are already removed). */
  teardown() {}

  /** Aborts when the element disconnects. */
  get signal() {
    if (!this.#controller) this.#controller = new AbortController();
    return this.#controller.signal;
  }

  /**
   * Children marked with data-ref, read lazily and cached until refresh() is called.
   * @returns {Record<string, any>}
   */
  get refs() {
    if (this.#refs) return this.#refs;
    /** @type {Record<string, any>} */
    const refs = {};
    for (const node of this.querySelectorAll('[data-ref]')) {
      // Skip refs that belong to a nested component
      const owner = node.parentElement?.closest('[data-component]');
      if (owner && owner !== this && this.contains(owner)) continue;
      const name = node.getAttribute('data-ref') || '';
      if (name.endsWith('[]')) {
        const key = name.slice(0, -2);
        (refs[key] ||= []).push(node);
      } else {
        refs[name] = node;
      }
    }
    this.#refs = refs;
    return refs;
  }

  /** Re-read refs after the markup inside the element changed. */
  refresh() {
    this.#refs = null;
  }

  /**
   * Add an event listener that is removed on disconnect.
   *   this.on('click', handler)                       listener on the element itself
   *   this.on('click', '[data-close]', handler)       delegated: handler(event, matchedElement)
   *   this.on('resize', handler, { target: window })  listener on another target
   * @param {string} type
   * @param {string | ((event: any, target?: Element) => void)} selectorOrHandler
   * @param {((event: any, target: Element) => void) | AddEventListenerOptions & { target?: EventTarget }} [handlerOrOptions]
   * @param {AddEventListenerOptions & { target?: EventTarget }} [maybeOptions]
   */
  on(type, selectorOrHandler, handlerOrOptions, maybeOptions) {
    const delegated = typeof selectorOrHandler === 'string';
    const handler = /** @type {Function} */ (delegated ? handlerOrOptions : selectorOrHandler);
    const options = /** @type {AddEventListenerOptions & { target?: EventTarget }} */ (
      (delegated ? maybeOptions : handlerOrOptions) || {}
    );
    const { target = this, ...listenerOptions } = options;
    const listener = delegated
      ? (/** @type {Event} */ event) => {
          const origin = event.target instanceof Element ? event.target : null;
          const match = origin?.closest(/** @type {string} */ (selectorOrHandler));
          if (match && this.contains(match)) handler.call(this, event, match);
        }
      : (/** @type {Event} */ event) => handler.call(this, event);
    target.addEventListener(type, listener, { ...listenerOptions, signal: this.signal });
  }

  /**
   * Dispatch a bubbling custom event from this element.
   * @param {string} type
   * @param {any} [detail]
   */
  emit(type, detail) {
    return this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }

  /**
   * Register a component once (safe when the script loads twice, e.g. in the theme editor).
   * @param {string} name
   * @param {CustomElementConstructor} constructor
   */
  static define(name, constructor) {
    if (!customElements.get(name)) customElements.define(name, constructor);
  }
}
