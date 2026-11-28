/**
 * Whispo quantity input (snippets/quantity-input.liquid → <quantity-input>).
 *
 * Minus / plus buttons step the number field by its step (quantity rules: min, max and increment come from
 * the variant), the buttons disable at the limits, and typed values are snapped to a valid step on change.
 * A bubbling "change" event fires from the input after every change, so forms and the cart can react.
 * Refs: input, minus, plus.
 */
import { Component } from '@whispo/component';

class QuantityInput extends Component {
  setup() {
    const { input, minus, plus } = this.refs;
    if (!input) return;
    if (minus) this.on('click', () => this.step(-1), { target: minus });
    if (plus) this.on('click', () => this.step(1), { target: plus });
    this.on('change', () => {
      this.#snap();
      this.#sync();
    }, { target: input });
    this.#sync();
  }

  get #min() {
    return Number(this.refs.input.min) || 0;
  }

  get #max() {
    return this.refs.input.max ? Number(this.refs.input.max) : Infinity;
  }

  get #step() {
    return Number(this.refs.input.step) || 1;
  }

  /** @param {number} direction */
  step(direction) {
    const { input } = this.refs;
    const before = input.value;
    const next = Math.min(this.#max, Math.max(this.#min, (Number(input.value) || 0) + direction * this.#step));
    input.value = String(next);
    this.#sync();
    if (input.value !== before) input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  #snap() {
    const { input } = this.refs;
    let value = Math.round(Number(input.value));
    if (!Number.isFinite(value)) value = this.#min;
    const offset = (value - this.#min) % this.#step;
    if (offset) value -= offset;
    input.value = String(Math.min(this.#max, Math.max(this.#min, value)));
  }

  #sync() {
    const { input, minus, plus } = this.refs;
    const value = Number(input.value);
    if (minus) minus.disabled = value <= this.#min;
    if (plus) plus.disabled = value >= this.#max;
  }
}

Component.define('quantity-input', QuantityInput);
