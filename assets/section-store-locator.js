/**
 * Store locator (sections/store-locator.liquid)
 *  - <store-locator>
 *      [data-sl-search]   search box: matches store name, address, type and services (every word must match)
 *      [data-sl-filter]   store type pills ("" = all)
 *      [data-sl-select]   store card button: selects the store (card opens, map + map card follow it)
 *      [data-sl-locate]   "Use my location": distance to each store with a latitude/longitude, list sorted
 *                         nearest first, nearest store selected
 *      [data-sl-hours]    opening hours rows (data-days / data-times): today's row is highlighted and the
 *                         card shows "Open now · Closes at 19:00" / "Closed now" (visitor's clock)
 *      [data-sl-status]   live result count; [data-sl-empty] shown when nothing matches
 *  Theme editor: selecting a store block selects that store.
 */
(() => {
  if (customElements.get('store-locator')) return;

  const DAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

  /** "Mon–Fri", "Sat, Sun", "Daily" -> Set of day numbers (0 = Sunday) */
  const parseDays = (/** @type {string} */ text) => {
    const days = new Set();
    const value = text.toLowerCase();
    if (/daily|every ?day|7 days|all week/.test(value)) {
      for (let d = 0; d < 7; d++) days.add(d);
      return days;
    }
    for (const part of value.split(/[,&/]| and /)) {
      const ends = part.split(/\s*(?:–|—|-|to)\s*/).map((w) => DAYS[w.trim().slice(0, 3)]);
      if (ends.length >= 2 && ends[0] !== undefined && ends[1] !== undefined) {
        for (let d = ends[0], guard = 0; guard < 7; d = (d + 1) % 7, guard++) {
          days.add(d);
          if (d === ends[1]) break;
        }
      } else if (ends[0] !== undefined) {
        days.add(ends[0]);
      }
    }
    return days;
  };

  /** "09:00–19:00", "9am – 7pm", "Closed" -> { open, close, closeLabel, openLabel } in minutes, or null */
  const parseTimes = (/** @type {string} */ text) => {
    if (!text || /closed/i.test(text)) return null;
    const matches = [...text.matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/gi)].slice(0, 2);
    if (matches.length < 2) return null;
    const toMinutes = (/** @type {RegExpMatchArray} */ m) => {
      let h = Number(m[1]) % 24;
      const min = Number(m[2] || 0);
      const ap = (m[3] || '').toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      return h * 60 + min;
    };
    const open = toMinutes(matches[0]);
    let close = toMinutes(matches[1]);
    if (close <= open) close += 24 * 60; // past midnight
    return { open, close, openLabel: matches[0][0].trim(), closeLabel: matches[1][0].trim() };
  };

  const distanceKm = (/** @type {number} */ lat1, /** @type {number} */ lng1, /** @type {number} */ lat2, /** @type {number} */ lng2) => {
    const rad = (/** @type {number} */ d) => (d * Math.PI) / 180;
    const a =
      Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  class StoreLocator extends HTMLElement {
    connectedCallback() {
      this.items = /** @type {HTMLElement[]} */ (Array.from(this.querySelectorAll('[data-sl-item]')));
      if (!this.items.length) return;
      this.list = this.querySelector('[data-sl-list]');
      this.search = /** @type {HTMLInputElement | null} */ (this.querySelector('[data-sl-search]'));
      this.status = this.querySelector('[data-sl-status]');
      this.empty = /** @type {HTMLElement | null} */ (this.querySelector('[data-sl-empty]'));
      this.map = /** @type {HTMLIFrameElement | null} */ (this.querySelector('[data-sl-map]'));
      this.mapWrap = this.querySelector('[data-sl-map-wrap]');
      this.locateButton = /** @type {HTMLButtonElement | null} */ (this.querySelector('[data-sl-locate]'));
      this.type = '';
      this.sorted = false;
      this.statusNote = '';

      this.items.forEach((item) => this.readHours(item));

      this.onClick = (/** @type {MouseEvent} */ event) => {
        if (!(event.target instanceof Element)) return;
        const card = event.target.closest('[data-sl-select]');
        if (card) {
          const item = /** @type {HTMLElement} */ (card.closest('[data-sl-item]'));
          this.select(item, { reveal: true });
          return;
        }
        const filter = event.target.closest('[data-sl-filter]');
        if (filter instanceof HTMLElement) {
          this.type = filter.dataset.slFilter || '';
          this.querySelectorAll('[data-sl-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === filter)));
          this.update();
          return;
        }
        if (event.target.closest('[data-sl-clear]')) {
          if (this.search) this.search.value = '';
          this.type = '';
          this.querySelectorAll('[data-sl-filter]').forEach((b) =>
            b.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (b).dataset.slFilter === ''))
          );
          this.update();
          this.search?.focus();
          return;
        }
        if (event.target.closest('[data-sl-locate]')) this.locate();
      };
      this.onInput = () => this.update();
      this.onBlockSelect = (/** @type {Event} */ event) => {
        if (!(event.target instanceof HTMLElement) || !this.contains(event.target)) return;
        const item = event.target.closest('[data-sl-item]');
        if (item instanceof HTMLElement) this.select(item, { scrollList: true });
      };

      this.addEventListener('click', this.onClick);
      this.search?.addEventListener('input', this.onInput);
      document.addEventListener('shopify:block:select', this.onBlockSelect);

      this.select(this.items[0], { keepMap: true });
      this.update();
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
      this.search?.removeEventListener('input', this.onInput);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
    }

    /** Today's opening hours -> highlighted row + open / closed label on the card */
    readHours(/** @type {HTMLElement} */ item) {
      const label = /** @type {HTMLElement | null} */ (item.querySelector('[data-sl-open]'));
      const rows = /** @type {HTMLElement[]} */ (Array.from(item.querySelectorAll('[data-sl-hours] [data-days]')));
      if (!label || !rows.length) return;
      const now = new Date();
      const today = now.getDay();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const row = rows.find((r) => parseDays(r.dataset.days || '').has(today));
      if (!row) return;
      row.classList.add('is-today');
      const times = parseTimes(row.dataset.times || row.dataset.days || '');
      let text = '';
      let open = false;
      if (times && minutes >= times.open && minutes < times.close) {
        open = true;
        text = `${this.dataset.openNow} · ${(this.dataset.closesAt || '').replace('[time]', times.closeLabel)}`;
      } else if (times && minutes < times.open) {
        text = `${this.dataset.closedNow} · ${(this.dataset.opensAt || '').replace('[time]', times.openLabel)}`;
      } else {
        text = this.dataset.closedNow || '';
      }
      label.textContent = text;
      label.classList.toggle('is-open', open);
      label.hidden = false;
    }

    /** Search + type filter -> visible cards, count, empty state */
    update() {
      const words = (this.search ? this.search.value : '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      let visible = 0;
      for (const item of this.items || []) {
        const haystack = item.dataset.search || '';
        const match = (!this.type || item.dataset.type === this.type) && words.every((w) => haystack.includes(w));
        item.hidden = !match;
        if (match) visible += 1;
      }
      if (this.empty) this.empty.hidden = visible > 0;
      if (this.list instanceof HTMLElement) this.list.hidden = visible === 0;

      if (this.status) {
        const template = visible === 1 ? this.dataset.showingOne : this.dataset.showing;
        let text = (template || '').replace('[count]', String(visible)).replace('[total]', this.dataset.total || '');
        if (this.statusNote) text += ` · ${this.statusNote}`;
        this.status.textContent = text;
      }

      // Keep a visible store selected
      if (this.active && this.active.hidden) {
        const first = this.items?.find((i) => !i.hidden);
        if (first) this.select(first);
      }
    }

    /**
     * @param {HTMLElement} item
     * @param {{ reveal?: boolean, keepMap?: boolean, scrollList?: boolean }} [options]
     */
    select(item, options = {}) {
      if (!item) return;
      this.active = item;
      for (const other of this.items || []) {
        const on = other === item;
        other.classList.toggle('is-active', on);
        other.querySelector('[data-sl-select]')?.setAttribute('aria-pressed', String(on));
      }

      if (this.map && !options.keepMap && item.dataset.map && this.map.getAttribute('src') !== item.dataset.map) {
        this.map.setAttribute('src', item.dataset.map);
      }
      if (this.map) this.map.title = (this.dataset.mapTitle || '').replace('[store]', item.dataset.name || '');
      const name = this.querySelector('[data-sl-map-name]');
      const address = this.querySelector('[data-sl-map-address]');
      const link = this.querySelector('[data-sl-map-directions]');
      if (name) name.textContent = item.dataset.name || '';
      if (address) address.textContent = item.dataset.address || '';
      if (link && item.dataset.directions) link.setAttribute('href', item.dataset.directions);

      // Desktop: the list scrolls inside the panel; bring a store picked from elsewhere (location, theme
      // editor) into view there, without moving the page
      if (options.scrollList && this.list instanceof HTMLElement && this.list.scrollHeight > this.list.clientHeight) {
        const top = item.offsetTop - this.list.offsetTop - 8;
        this.list.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }

      // Phones and tablets: the map sits above the list, bring it into view when a store is picked
      if (options.reveal && this.mapWrap && window.matchMedia('(max-width: 989px)').matches) {
        const rect = this.mapWrap.getBoundingClientRect();
        if (rect.bottom < 80 || rect.top > window.innerHeight * 0.6) {
          this.mapWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }

    /** "Use my location": distances, nearest first */
    locate() {
      const button = this.locateButton;
      if (!('geolocation' in navigator)) {
        this.note(this.dataset.locateUnsupported || '');
        return;
      }
      const label = button?.querySelector('span');
      const idle = label ? label.textContent : '';
      if (button) button.setAttribute('aria-busy', 'true');
      if (label) label.textContent = this.dataset.locating || idle;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (button) button.removeAttribute('aria-busy');
          if (label) label.textContent = idle;
          const { latitude, longitude } = position.coords;
          const unitMi = this.dataset.unit === 'mi';
          const withDistance = (this.items || []).map((item) => {
            const lat = parseFloat(item.dataset.lat || '');
            const lng = parseFloat(item.dataset.lng || '');
            let d = Infinity;
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) d = distanceKm(latitude, longitude, lat, lng) * (unitMi ? 0.621371 : 1);
            const tag = /** @type {HTMLElement | null} */ (item.querySelector('[data-sl-distance]'));
            if (tag) {
              tag.hidden = d === Infinity;
              const value = d < 10 ? d.toFixed(1) : String(Math.round(d));
              tag.textContent = (this.dataset.distance || '[distance]').replace('[distance]', value);
            }
            return { item, d, index: Number(item.dataset.index) };
          });
          withDistance.sort((a, b) => a.d - b.d || a.index - b.index).forEach(({ item }) => this.list?.appendChild(item));
          this.items = withDistance.map((entry) => entry.item);
          this.sorted = true;
          this.statusNote = this.dataset.sorted || '';
          this.update();
          const nearest = this.items.find((i) => !i.hidden);
          if (nearest) this.select(nearest, { scrollList: true });
        },
        () => {
          if (button) button.removeAttribute('aria-busy');
          if (label) label.textContent = idle;
          this.note(this.dataset.locateError || '');
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      );
    }

    /** A short message in the status line (location errors) */
    note(/** @type {string} */ message) {
      this.statusNote = message;
      this.update();
      window.clearTimeout(this.noteTimer);
      this.noteTimer = window.setTimeout(() => {
        if (this.statusNote === message) {
          this.statusNote = this.sorted ? this.dataset.sorted || '' : '';
          this.update();
        }
      }, 6000);
    }
  }

  customElements.define('store-locator', StoreLocator);
})();
