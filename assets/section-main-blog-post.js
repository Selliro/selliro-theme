/**
 * Blog post page (sections/main-blog-post.liquid)
 *  - [data-article-copy]  copy the post's link, with a short "Link copied" confirmation
 *  - <article-progress>   thin bar at the top that fills as the shopper reads the post
 */
(() => {
  if (window.__articleInit) return;
  window.__articleInit = true;

  /* -------------------------------------------------------------- copy link */
  document.addEventListener('click', async (event) => {
    const button = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest('[data-article-copy]') : null);
    if (!button) return;
    const url = button.dataset.articleCopy || location.href;
    try {
      if (navigator.share && matchMedia('(hover: none)').matches) {
        await navigator.share({ url, title: document.title });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch (error) {
      // Clipboard blocked: select the URL in a prompt so it can still be copied by hand
      window.prompt('', url);
      return;
    }
    const label = button.dataset.copiedLabel || 'Link copied';
    button.classList.add('is-copied');
    button.setAttribute('data-tooltip', label);
    clearTimeout(Number(button.dataset.timer));
    button.dataset.timer = String(
      window.setTimeout(() => {
        button.classList.remove('is-copied');
        button.removeAttribute('data-tooltip');
      }, 1800)
    );
  });

  /* -------------------------------------------------------- reading progress */
  if (!customElements.get('article-progress')) {
    class ArticleProgress extends HTMLElement {
      connectedCallback() {
        this.bar = this.querySelector('.article__progress-bar');
        this.content = document.querySelector('[data-article-content]');
        if (!this.bar || !this.content) return;
        this.update = () => {
          this.frame = 0;
          const rect = this.content.getBoundingClientRect();
          const total = rect.height - window.innerHeight * 0.6;
          const read = Math.min(1, Math.max(0, (window.innerHeight * 0.4 - rect.top) / Math.max(1, total)));
          this.bar.style.transform = `scaleX(${read})`;
          this.setAttribute('aria-valuenow', String(Math.round(read * 100)));
          this.classList.toggle('is-visible', rect.top < window.innerHeight * 0.4 && read < 1);
        };
        this.queue = () => {
          if (!this.frame) this.frame = requestAnimationFrame(this.update);
        };
        window.addEventListener('scroll', this.queue, { passive: true });
        window.addEventListener('resize', this.queue, { passive: true });
        this.update();
      }

      disconnectedCallback() {
        window.removeEventListener('scroll', this.queue);
        window.removeEventListener('resize', this.queue);
      }
    }
    customElements.define('article-progress', ArticleProgress);
  }
})();
