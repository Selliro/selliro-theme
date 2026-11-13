/**
 * Product finder quiz — <product-quiz>
 *
 * Steps: intro → question 1..n → (analyzing) → results.
 * Each answer input carries data-products="id,id". On finish, products are scored by how many
 * selected answers recommend them; the top N are moved from the hidden pool into the results list,
 * topped up from the fallback collection.
 * Extras: answer summary with "edit" jumps, add-all-to-cart, number-key shortcuts,
 * remembered result, theme editor block selection.
 */
(() => {
  if (customElements.get('product-quiz')) return;

  const STORAGE_PREFIX = 'product-quiz:';
  const AUTO_ADVANCE_DELAY = 380;
  const ANALYZING_DURATION = 1300;

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const storage = {
    get(key) {
      try {
        return JSON.parse(window.localStorage.getItem(key) || 'null');
      } catch (e) {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* storage unavailable — ignore */
      }
    },
  };

  function cartAddUrl() {
    const routes = window.Theme && window.Theme.routes;
    return (routes && routes.cart_add_url) || '/cart/add.js';
  }

  function cartSectionIds() {
    return Array.from(document.querySelectorAll('cart-items-component'))
      .map((n) => n.dataset && n.dataset.sectionId)
      .filter(Boolean);
  }

  class ProductQuiz extends HTMLElement {
    connectedCallback() {
      this.steps = Array.from(this.querySelectorAll('[data-pq-step]'));
      this.questions = this.steps.filter((s) => s.dataset.pqStep === 'question');
      this.analyzingStep = this.querySelector('[data-pq-step="analyzing"]');
      this.resultsStep = this.querySelector('[data-pq-step="results"]');
      this.resultsList = this.querySelector('[data-pq-results]');
      this.pool = this.querySelector('[data-pq-pool]');
      this.segments = Array.from(this.querySelectorAll('[data-pq-seg]'));
      this.stepLabel = this.querySelector('[data-pq-step-label]');
      this.live = this.querySelector('[data-pq-live]');
      this.emptyMsg = this.querySelector('[data-pq-empty]');
      this.lastBtn = this.querySelector('[data-pq-last]');
      this.addAllBtn = this.querySelector('[data-pq-add-all]');
      this.summaryWrap = this.querySelector('[data-pq-summary-wrap]');
      this.summaryList = this.querySelector('[data-pq-summary]');

      this.autoAdvance = this.dataset.autoAdvance === 'true';
      this.remember = this.dataset.remember === 'true';
      this.useAnalyzing = this.dataset.analyzing === 'true';
      this.maxResults = parseInt(this.dataset.maxResults || '4', 10);
      this.storageKey = STORAGE_PREFIX + (this.dataset.sectionId || '');
      this.current = this.steps.findIndex((s) => s.dataset.pqStep === 'intro');
      this.timer = null;

      this.onClick = this.onClick.bind(this);
      this.onChange = this.onChange.bind(this);
      this.onKeydown = this.onKeydown.bind(this);
      this.onBlockSelect = this.onBlockSelect.bind(this);
      this.onSectionSelect = this.onSectionSelect.bind(this);

      this.addEventListener('click', this.onClick);
      this.addEventListener('change', this.onChange);
      this.addEventListener('keydown', this.onKeydown);
      document.addEventListener('shopify:block:select', this.onBlockSelect);
      document.addEventListener('shopify:section:select', this.onSectionSelect);

      if (this.remember && this.lastBtn && storage.get(this.storageKey)) this.lastBtn.hidden = false;

      this.questions.forEach((q) => this.updateNextState(q));
      this.floats = document.getElementById(`PqFloats-${this.dataset.sectionId}`);
      this.show(this.current, { focus: false, animate: false });
      this.initParallax();
    }

    /* ------------------------------------------------------------ floating images */

    initParallax() {
      if (!this.floats) return;
      this.floatEls = Array.from(this.floats.querySelectorAll('[data-pq-float]'));
      const strength = parseFloat(this.floats.dataset.strength || '0');
      this.parallaxDistance = strength * 70; // total travel in px (strength 6 → ~420px across the scroll)
      this.parallaxRotate = parseFloat(this.floats.dataset.rotate || '0');
      if (!this.floatEls.length || reducedMotion() || (!this.parallaxDistance && !this.parallaxRotate)) {
        this.floats.classList.add('is-static');
        return;
      }

      this.onParallaxScroll = () => {
        if (this.parallaxFrame) return;
        this.parallaxFrame = requestAnimationFrame(() => {
          this.parallaxFrame = null;
          this.updateParallax();
        });
      };

      this.parallaxObserver = new IntersectionObserver((entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) {
          window.addEventListener('scroll', this.onParallaxScroll, { passive: true });
          window.addEventListener('resize', this.onParallaxScroll, { passive: true });
          this.updateParallax();
        } else {
          window.removeEventListener('scroll', this.onParallaxScroll);
          window.removeEventListener('resize', this.onParallaxScroll);
        }
      });
      this.parallaxObserver.observe(this.floats);
      this.updateParallax();
    }

    updateParallax() {
      const rect = this.floats.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 0 when the section top enters at the bottom of the screen, 1 when its bottom leaves the top.
      const progress = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height)));
      const centered = 0.5 - progress; // +0.5 → -0.5
      this.floatEls.forEach((el, i) => {
        // Each image moves at a slightly different speed for depth.
        const speed = i === 0 ? 1 : 1.35;
        el.style.setProperty('--py', `${(centered * this.parallaxDistance * speed).toFixed(1)}px`);
        el.style.setProperty('--pr', `${(centered * this.parallaxRotate).toFixed(2)}deg`);
      });
    }

    disconnectedCallback() {
      if (this.onParallaxScroll) {
        window.removeEventListener('scroll', this.onParallaxScroll);
        window.removeEventListener('resize', this.onParallaxScroll);
      }
      this.parallaxObserver?.disconnect();
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      document.removeEventListener('shopify:section:select', this.onSectionSelect);
      clearTimeout(this.timer);
    }

    /* ------------------------------------------------------------ helpers */

    stepIndexOf(el) {
      return this.steps.indexOf(el);
    }

    questionNumber(step) {
      return this.questions.indexOf(step) + 1;
    }

    /* ------------------------------------------------------------ events */

    onClick(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (target.closest('[data-pq-start]')) return this.goToQuestion(0);
      if (target.closest('[data-pq-back]')) return this.back();
      if (target.closest('[data-pq-next]') || target.closest('[data-pq-skip]')) return this.next();
      if (target.closest('[data-pq-restart]')) return this.restart();
      if (target.closest('[data-pq-add-all]')) return this.addAllToCart();
      if (target.closest('[data-pq-scroll-hint]')) return this.goToQuestion(0);

      const edit = target.closest('[data-pq-edit]');
      if (edit) return this.goToQuestion(Number(edit.dataset.pqEdit));

      if (target.closest('[data-pq-last]')) {
        const saved = storage.get(this.storageKey);
        if (saved && Array.isArray(saved.ids)) {
          this.renderResults(saved.ids, saved.summary || []);
          this.show(this.stepIndexOf(this.resultsStep));
        }
      }
    }

    onChange(event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains('pq__answer-input')) return;
      const question = input.closest('[data-pq-step="question"]');
      if (!question) return;

      this.updateNextState(question);

      if (question.dataset.pqMultiple !== 'true' && this.autoAdvance && input.checked) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.next(), AUTO_ADVANCE_DELAY);
      }
    }

    onKeydown(event) {
      const step = this.steps[this.current];
      if (!step || step.dataset.pqStep !== 'question') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.matches('input[type="text"], textarea')) return;

      const n = parseInt(event.key, 10);
      if (n >= 1 && n <= 9) {
        const input = step.querySelectorAll('.pq__answer-input')[n - 1];
        if (!input) return;
        event.preventDefault();
        input.checked = input.type === 'checkbox' ? !input.checked : true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus({ preventScroll: true });
      } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
        const next = step.querySelector('[data-pq-next]');
        if (next && !next.disabled) {
          event.preventDefault();
          this.next();
        }
      }
    }

    onBlockSelect(event) {
      if (!this.contains(event.target)) return;
      const step = event.target.closest('[data-pq-step]');
      const index = this.stepIndexOf(step);
      if (index > -1) this.show(index, { focus: false });
    }

    onSectionSelect(event) {
      if (event.target.contains(this)) this.show(0, { focus: false });
    }

    /* ------------------------------------------------------------ flow */

    goToQuestion(qIndex) {
      const step = this.questions[qIndex];
      if (step) this.show(this.stepIndexOf(step));
    }

    back() {
      clearTimeout(this.timer);
      const step = this.steps[this.current];
      if (step === this.resultsStep) return this.goToQuestion(this.questions.length - 1);
      const qi = this.questions.indexOf(step);
      if (qi > 0) this.goToQuestion(qi - 1);
      else this.show(0);
    }

    next() {
      clearTimeout(this.timer);
      const qi = this.questions.indexOf(this.steps[this.current]);
      if (qi === -1) return;
      if (qi === this.questions.length - 1) this.finish();
      else this.goToQuestion(qi + 1);
    }

    restart() {
      this.questions.forEach((q) => {
        q.querySelectorAll('input').forEach((i) => (i.checked = false));
        this.updateNextState(q);
      });
      this.returnResultsToPool();
      this.goToQuestion(0);
    }

    finish() {
      const scores = new Map();
      const order = this.poolOrder();
      const summary = [];

      this.questions.forEach((q, qi) => {
        const picked = Array.from(q.querySelectorAll('.pq__answer-input:checked'));
        if (picked.length) summary.push({ q: qi, labels: picked.map((i) => i.dataset.label || '') });
        picked.forEach((input) => {
          (input.dataset.products || '')
            .split(',')
            .filter(Boolean)
            .forEach((id) => scores.set(id, (scores.get(id) || 0) + 1));
        });
      });

      const available = (id) => {
        const li = this.findItem(id);
        return !li || li.dataset.available !== 'false';
      };
      // Highest score first; sold-out products sink below available ones; then pool order.
      const ids = Array.from(scores.keys()).sort(
        (a, b) =>
          Number(available(b)) - Number(available(a)) ||
          scores.get(b) - scores.get(a) ||
          order.indexOf(a) - order.indexOf(b)
      );

      // Top up with the fallback collection so the results row is never half empty.
      Array.from(this.pool.querySelectorAll('[data-fallback]'))
        .sort((a, b) => Number(a.dataset.fallback) - Number(b.dataset.fallback))
        .forEach((li) => {
          const id = li.dataset.productId;
          if (ids.length < this.maxResults && !ids.includes(id) && available(id)) ids.push(id);
        });

      const finalIds = ids.slice(0, this.maxResults);
      this.renderResults(finalIds, summary);

      if (this.remember && finalIds.length) {
        storage.set(this.storageKey, { ids: finalIds, summary, at: Date.now() });
        if (this.lastBtn) this.lastBtn.hidden = false;
      }

      const resultsIndex = this.stepIndexOf(this.resultsStep);
      if (this.useAnalyzing && this.analyzingStep && !reducedMotion()) {
        this.show(this.stepIndexOf(this.analyzingStep), { focus: false });
        this.timer = setTimeout(() => this.show(resultsIndex), ANALYZING_DURATION);
      } else {
        this.show(resultsIndex);
      }
    }

    /* ------------------------------------------------------------ results */

    poolOrder() {
      return Array.from(this.pool.querySelectorAll('.pq__result:not([data-duplicate])')).map(
        (li) => li.dataset.productId
      );
    }

    findItem(id) {
      const sel = `.pq__result[data-product-id="${CSS.escape(id)}"]:not([data-duplicate])`;
      return this.pool.querySelector(sel) || this.resultsList.querySelector(sel);
    }

    returnResultsToPool() {
      Array.from(this.resultsList.children).forEach((li) => {
        li.classList.remove('pq__result--best', 'is-revealed');
        li.style.removeProperty('--pq-i');
        this.pool.appendChild(li);
      });
    }

    renderResults(ids, summary) {
      this.returnResultsToPool();
      let count = 0;
      ids.forEach((id) => {
        const li = this.findItem(id);
        if (!li) return;
        li.style.setProperty('--pq-i', String(count));
        if (count === 0 && li.dataset.bestLabel) li.classList.add('pq__result--best');
        this.resultsList.appendChild(li);
        count++;
      });

      if (this.emptyMsg) this.emptyMsg.hidden = count > 0;
      if (this.addAllBtn) {
        this.addAllBtn.hidden = this.resultVariantIds().length < 2;
        this.addAllBtn.removeAttribute('data-done');
      }
      this.renderSummary(summary || []);
    }

    renderSummary(summary) {
      if (!this.summaryList || !this.summaryWrap) return;
      this.summaryList.replaceChildren();
      summary.forEach(({ q, labels }) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pq__summary-chip button-unstyled';
        btn.dataset.pqEdit = String(q);
        btn.textContent = labels.join(', ');
        const q_el = this.questions[q] && this.questions[q].querySelector('.pq__question-text');
        if (q_el) btn.setAttribute('aria-label', `${q_el.textContent.trim()}: ${btn.textContent}`);
        const pen = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        pen.setAttribute('viewBox', '0 0 16 16');
        pen.setAttribute('aria-hidden', 'true');
        pen.innerHTML = '<path d="M10.5 3.5l2 2L6 12H4v-2l6.5-6.5Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>';
        btn.appendChild(pen);
        li.appendChild(btn);
        this.summaryList.appendChild(li);
      });
      this.summaryWrap.hidden = summary.length === 0;
    }

    resultVariantIds() {
      return Array.from(this.resultsList.querySelectorAll('[data-new-arrivals-add]:not([disabled])'))
        .map((btn) => ({ id: btn.getAttribute('data-variant-id'), quantity: parseInt(btn.getAttribute('data-quantity') || '1', 10) || 1 }))
        .filter((item) => item.id);
    }

    async addAllToCart() {
      const btn = this.addAllBtn;
      const items = this.resultVariantIds();
      if (!btn || !items.length || btn.getAttribute('aria-busy') === 'true') return;

      const formData = new FormData();
      items.forEach((item, i) => {
        formData.append(`items[${i}][id]`, item.id);
        formData.append(`items[${i}][quantity]`, String(item.quantity));
      });
      const sections = cartSectionIds();
      if (sections.length) formData.append('sections', sections.join(','));

      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
      try {
        const response = await fetch(cartAddUrl(), {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
          body: formData,
        });
        const json = await response.json();
        if (json.status) {
          document.dispatchEvent(
            new CustomEvent('cart:error', {
              bubbles: true,
              detail: { sourceId: 'product-quiz', data: { message: json.message, description: json.description, errors: json.errors } },
            })
          );
          return;
        }
        document.dispatchEvent(
          new CustomEvent('cart:update', {
            bubbles: true,
            detail: {
              resource: {},
              sourceId: 'product-quiz',
              data: {
                source: 'product-form-component',
                itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
                sections: json.sections,
              },
            },
          })
        );
        btn.setAttribute('data-done', '');
      } catch (error) {
        console.error(error);
      } finally {
        btn.removeAttribute('aria-busy');
        btn.disabled = false;
      }
    }

    /* ------------------------------------------------------------ rendering */

    updateNextState(question) {
      const next = question.querySelector('[data-pq-next]');
      if (next) next.disabled = !question.querySelector('.pq__answer-input:checked');
    }

    show(index, { focus = true, animate = true } = {}) {
      const step = this.steps[index];
      if (!step) return;
      clearTimeout(this.timer);

      this.dataset.direction = index >= this.current ? 'forward' : 'back';
      this.toggleAttribute('data-animate', animate);
      this.current = index;

      this.steps.forEach((s, i) => {
        const active = i === index;
        s.classList.toggle('is-active', active);
        s.toggleAttribute('inert', !active);
        s.setAttribute('aria-hidden', String(!active));
      });

      const kind = step.dataset.pqStep;
      this.dataset.state = kind;
      if (this.floats) this.floats.dataset.state = kind;
      const total = this.questions.length;
      const qNum = kind === 'question' ? this.questionNumber(step) : kind === 'intro' ? 0 : total;

      this.segments.forEach((seg, i) => {
        seg.classList.toggle('is-done', i + 1 < qNum || (kind !== 'question' && kind !== 'intro'));
        seg.classList.toggle('is-current', kind === 'question' && i + 1 === qNum);
      });

      if (this.stepLabel) {
        const tpl = this.dataset.stepTemplate || '[current] / [total]';
        this.stepLabel.textContent =
          kind === 'question' ? tpl.replace('[current]', String(qNum)).replace('[total]', String(total)) : '';
      }

      const blockId = step.dataset.pqBlockId;
      const hasOwnMedia = kind === 'question' && blockId && this.querySelector(`[data-pq-media="${blockId}"]`);
      const mediaKey = hasOwnMedia ? blockId : 'intro';
      this.querySelectorAll('[data-pq-media]').forEach((m) => m.classList.toggle('is-active', m.dataset.pqMedia === mediaKey));

      if (kind === 'results') {
        requestAnimationFrame(() => {
          Array.from(this.resultsList.children).forEach((li) => li.classList.add('is-revealed'));
        });
      }

      if (focus) {
        const heading = step.querySelector('.pq__question-text, .pq__heading, .pq__analyzing-text');
        if (heading && heading.hasAttribute('tabindex')) heading.focus({ preventScroll: true });
        const rect = this.getBoundingClientRect();
        if (rect.top < -40 || rect.top > window.innerHeight * 0.5) {
          this.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
        }
      }

      if (this.live) {
        if (kind === 'question') this.live.textContent = this.stepLabel ? this.stepLabel.textContent : '';
        else {
          const text = step.querySelector('.pq__heading, .pq__analyzing-text');
          this.live.textContent = text ? text.textContent.trim() : '';
        }
      }
    }
  }

  customElements.define('product-quiz', ProductQuiz);
})();
