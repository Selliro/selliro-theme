/**
 * Product finder quiz — <product-quiz>
 *
 * Steps: intro → question 1..n → results.
 * Each answer input carries data-products="id,id". On finish, products are scored by how many
 * selected answers recommend them; the top N are moved from the hidden pool into the results list.
 * Theme editor: selecting a Question block jumps to that question.
 */
(() => {
  if (customElements.get('product-quiz')) return;

  const STORAGE_PREFIX = 'product-quiz:';
  const AUTO_ADVANCE_DELAY = 420;

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
        /* storage unavailable (private mode) — ignore */
      }
    },
  };

  class ProductQuiz extends HTMLElement {
    connectedCallback() {
      this.steps = Array.from(this.querySelectorAll('[data-pq-step]'));
      this.questions = this.steps.filter((s) => s.dataset.pqStep === 'question');
      this.resultsStep = this.querySelector('[data-pq-step="results"]');
      this.resultsList = this.querySelector('[data-pq-results]');
      this.pool = this.querySelector('[data-pq-pool]');
      this.toolbar = this.querySelector('[data-pq-toolbar]');
      this.progress = this.querySelector('[data-pq-progress]');
      this.progressBar = this.querySelector('[data-pq-progress-bar]');
      this.stepLabel = this.querySelector('[data-pq-step-label]');
      this.live = this.querySelector('[data-pq-live]');
      this.emptyMsg = this.querySelector('[data-pq-empty]');
      this.lastBtn = this.querySelector('[data-pq-last]');

      this.autoAdvance = this.dataset.autoAdvance === 'true';
      this.remember = this.dataset.remember === 'true';
      this.maxResults = parseInt(this.dataset.maxResults || '4', 10);
      this.storageKey = STORAGE_PREFIX + (this.dataset.sectionId || '');
      this.current = 0;
      this.timer = null;

      this.onClick = this.onClick.bind(this);
      this.onChange = this.onChange.bind(this);
      this.onBlockSelect = this.onBlockSelect.bind(this);
      this.onSectionSelect = this.onSectionSelect.bind(this);

      this.addEventListener('click', this.onClick);
      this.addEventListener('change', this.onChange);
      document.addEventListener('shopify:block:select', this.onBlockSelect);
      document.addEventListener('shopify:section:select', this.onSectionSelect);

      if (this.remember && this.lastBtn && storage.get(this.storageKey)) this.lastBtn.hidden = false;

      this.questions.forEach((q) => this.updateNextState(q));
      this.show(0, { focus: false });
    }

    disconnectedCallback() {
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      document.removeEventListener('shopify:section:select', this.onSectionSelect);
      clearTimeout(this.timer);
    }

    /* ------------------------------------------------------------ events */

    onClick(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      if (target.closest('[data-pq-start]')) return this.show(1);
      if (target.closest('[data-pq-back]')) return this.show(Math.max(0, this.current - 1));
      if (target.closest('[data-pq-next]') || target.closest('[data-pq-skip]')) return this.next();
      if (target.closest('[data-pq-restart]')) return this.restart();
      if (target.closest('[data-pq-last]')) {
        const saved = storage.get(this.storageKey);
        if (saved && Array.isArray(saved.ids)) {
          this.renderResults(saved.ids);
          this.show(this.steps.length - 1);
        }
      }
    }

    onChange(event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains('pq__answer-input')) return;
      const question = input.closest('[data-pq-step="question"]');
      if (!question) return;

      this.updateNextState(question);

      const multiple = question.dataset.pqMultiple === 'true';
      if (!multiple && this.autoAdvance && input.checked) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.next(), AUTO_ADVANCE_DELAY);
      }
    }

    onBlockSelect(event) {
      if (!this.contains(event.target)) return;
      const index = this.steps.indexOf(event.target.closest('[data-pq-step]'));
      if (index > -1) this.show(index, { focus: false });
    }

    onSectionSelect(event) {
      if (event.target.contains(this)) this.show(0, { focus: false });
    }

    /* ------------------------------------------------------------ flow */

    next() {
      clearTimeout(this.timer);
      const isLastQuestion = this.current === this.questions.length;
      if (isLastQuestion) {
        this.finish();
      } else {
        this.show(this.current + 1);
      }
    }

    restart() {
      this.questions.forEach((q) => {
        q.querySelectorAll('input').forEach((i) => (i.checked = false));
        this.updateNextState(q);
      });
      this.returnResultsToPool();
      this.show(1);
    }

    finish() {
      const scores = new Map();
      const order = this.poolOrder();

      this.questions.forEach((q) => {
        q.querySelectorAll('.pq__answer-input:checked').forEach((input) => {
          (input.dataset.products || '')
            .split(',')
            .filter(Boolean)
            .forEach((id) => scores.set(id, (scores.get(id) || 0) + 1));
        });
      });

      let ids = Array.from(scores.keys()).sort(
        (a, b) => scores.get(b) - scores.get(a) || order.indexOf(a) - order.indexOf(b)
      );

      // Top up with the fallback collection so the results row is never half empty.
      const fallback = Array.from(this.pool.querySelectorAll('[data-fallback]'))
        .sort((a, b) => Number(a.dataset.fallback) - Number(b.dataset.fallback))
        .map((li) => li.dataset.productId);
      fallback.forEach((id) => {
        if (ids.length < this.maxResults && !ids.includes(id)) ids.push(id);
      });

      ids = ids.slice(0, this.maxResults);
      this.renderResults(ids);
      if (this.remember && ids.length) {
        storage.set(this.storageKey, { ids, at: Date.now() });
        if (this.lastBtn) this.lastBtn.hidden = false;
      }
      this.show(this.steps.length - 1);
    }

    /* ------------------------------------------------------------ results */

    poolOrder() {
      return Array.from(this.pool.querySelectorAll('.pq__result:not([data-duplicate])')).map(
        (li) => li.dataset.productId
      );
    }

    findPoolItem(id) {
      return (
        this.pool.querySelector(`.pq__result[data-product-id="${CSS.escape(id)}"]:not([data-duplicate])`) || null
      );
    }

    returnResultsToPool() {
      Array.from(this.resultsList.children).forEach((li) => {
        li.classList.remove('pq__result--best', 'is-revealed');
        li.style.removeProperty('--pq-i');
        this.pool.appendChild(li);
      });
    }

    renderResults(ids) {
      this.returnResultsToPool();
      let count = 0;
      ids.forEach((id) => {
        const li = this.findPoolItem(id);
        if (!li) return;
        li.style.setProperty('--pq-i', String(count));
        if (count === 0 && li.dataset.bestLabel) li.classList.add('pq__result--best');
        this.resultsList.appendChild(li);
        count++;
      });
      if (this.emptyMsg) this.emptyMsg.hidden = count > 0;
      // Trigger staggered reveal on next frame.
      requestAnimationFrame(() => {
        Array.from(this.resultsList.children).forEach((li) => li.classList.add('is-revealed'));
      });
    }

    /* ------------------------------------------------------------ rendering */

    updateNextState(question) {
      const next = question.querySelector('[data-pq-next]');
      if (next) next.disabled = !question.querySelector('.pq__answer-input:checked');
    }

    show(index, { focus = true } = {}) {
      const total = this.questions.length;
      const step = this.steps[index];
      if (!step) return;
      const direction = index >= this.current ? 'forward' : 'back';
      this.current = index;
      this.dataset.direction = direction;

      this.steps.forEach((s, i) => {
        const active = i === index;
        s.classList.toggle('is-active', active);
        s.toggleAttribute('inert', !active);
        s.setAttribute('aria-hidden', String(!active));
      });

      const kind = step.dataset.pqStep;
      this.dataset.state = kind;
      const inQuiz = kind === 'question';
      if (this.toolbar) this.toolbar.hidden = kind === 'intro';
      if (this.progress) this.progress.hidden = kind === 'intro';

      const pct = total ? ((kind === 'results' ? total : index) / total) * 100 : 0;
      if (this.progressBar) this.progressBar.style.transform = `scaleX(${Math.min(1, pct / 100)})`;

      if (this.stepLabel) {
        if (inQuiz) {
          const tpl = this.dataset.stepTemplate || '[current] / [total]';
          this.stepLabel.textContent = tpl.replace('[current]', String(index)).replace('[total]', String(total));
        } else {
          this.stepLabel.textContent = '';
        }
      }

      // Side media: question image if set, otherwise the intro image.
      const mediaKey = inQuiz && this.querySelector(`[data-pq-media="${step.dataset.pqBlockId}"]`) ? step.dataset.pqBlockId : 'intro';
      this.querySelectorAll('[data-pq-media]').forEach((m) => m.classList.toggle('is-active', m.dataset.pqMedia === mediaKey));

      if (focus) {
        const heading = step.querySelector('.pq__question-text, .pq__heading');
        if (heading) heading.focus({ preventScroll: true });
        const rect = this.getBoundingClientRect();
        if (rect.top < 0 || rect.top > window.innerHeight * 0.6) {
          this.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      if (this.live && this.stepLabel && inQuiz) this.live.textContent = this.stepLabel.textContent;
      if (this.live && kind === 'results') {
        const heading = step.querySelector('.pq__heading');
        this.live.textContent = heading ? heading.textContent.trim() : '';
      }
    }
  }

  customElements.define('product-quiz', ProductQuiz);
})();
