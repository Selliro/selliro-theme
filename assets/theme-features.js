/**
 * Theme features — <theme-features> (sections/theme-features.liquid)
 * Category chips and a live search filter the feature cards; the result count and the empty state follow.
 * The chosen category is kept in the URL (#features=<category>) so a filtered view can be shared or linked.
 */
(() => {
  if (customElements.get('theme-features')) return;

  class ThemeFeatures extends HTMLElement {
    connectedCallback() {
      this.cards = Array.from(this.querySelectorAll('[data-tf-card]'));
      this.chips = Array.from(this.querySelectorAll('[data-tf-filter]'));
      this.search = this.querySelector('[data-tf-search]');
      this.count = this.querySelector('[data-tf-count]');
      this.empty = this.querySelector('[data-tf-empty]');
      this.filter = 'all';
      this.query = '';

      this.chips.forEach((chip) => chip.addEventListener('click', () => this.setFilter(chip.dataset.tfFilter, true)));
      this.search?.addEventListener('input', () => {
        this.query = this.search.value.trim().toLowerCase();
        this.apply();
      });

      const fromHash = (location.hash.match(/features=([a-z0-9-]+)/) || [])[1];
      if (fromHash && this.chips.some((c) => c.dataset.tfFilter === fromHash)) this.setFilter(fromHash, false);
      else this.apply(true);
    }

    setFilter(value, updateUrl) {
      this.filter = value;
      this.chips.forEach((chip) => {
        const on = chip.dataset.tfFilter === value;
        chip.classList.toggle('is-active', on);
        chip.setAttribute('aria-pressed', String(on));
        if (on) chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
      if (updateUrl) history.replaceState(null, '', value === 'all' ? location.pathname + location.search : `#features=${value}`);
      this.apply();
    }

    apply(initial = false) {
      const words = this.query.split(/\s+/).filter(Boolean);
      let shown = 0;
      this.cards.forEach((card) => {
        const inCategory = this.filter === 'all' || card.dataset.category === this.filter;
        const text = card.dataset.search || '';
        const matches = words.every((w) => text.includes(w));
        const visible = inCategory && matches;
        const wasHidden = card.hidden;
        card.hidden = !visible;
        if (visible) {
          shown += 1;
          if (wasHidden && !initial) {
            card.classList.remove('is-entering');
            void card.offsetWidth; // restart the entrance animation
            card.classList.add('is-entering');
          }
        }
      });
      if (this.count) {
        this.count.textContent = (this.dataset.countText || '[count] / [total]')
          .replace('[count]', String(shown))
          .replace('[total]', String(this.cards.length));
      }
      if (this.empty) {
        this.empty.hidden = shown > 0 || !this.cards.length;
        this.empty.textContent = this.dataset.emptyText || '';
      }
    }
  }

  customElements.define('theme-features', ThemeFeatures);
})();
