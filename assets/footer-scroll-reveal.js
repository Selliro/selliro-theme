/**
 * Footer: scroll-into-view reveal + subtle parallax while the footer is on screen.
 * Respects prefers-reduced-motion.
 */
(function () {
  const roots = document.querySelectorAll('[data-footer-reveal]');
  if (!roots.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function setVisible(root) {
    root.classList.add('footer-reveal--visible');
  }

  function initObserver(root) {
    if (reduceMotion.matches) {
      setVisible(root);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target === root) {
            setVisible(root);
            io.unobserve(root);
          }
        }
      },
      {
        root: null,
        rootMargin: '0px 0px -12% 0px',
        threshold: [0, 0.05, 0.1],
      }
    );

    io.observe(root);

    if (root.getBoundingClientRect().top < window.innerHeight * 1.1) {
      setVisible(root);
      io.unobserve(root);
    }
  }

  function parallaxTick() {
    if (reduceMotion.matches) return;

    for (const root of roots) {
      if (!root.classList.contains('footer-reveal--visible')) continue;

      const rect = root.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.bottom < 0 || rect.top > vh) {
        root.style.setProperty('--footer-parallax-y', '0px');
        continue;
      }

      const range = vh + rect.height;
      const t = (vh - rect.top) / range;
      const clamped = Math.max(0, Math.min(1, t));
      const y = (clamped - 0.35) * 22;
      root.style.setProperty('--footer-parallax-y', `${y.toFixed(2)}px`);
    }
  }

  let raf = 0;
  function onScrollOrResize() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(parallaxTick);
  }

  for (const root of roots) {
    initObserver(root);
  }

  if (!reduceMotion.matches) {
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    parallaxTick();
  }

  function onReduceMotionChange() {
    if (reduceMotion.matches) {
      for (const root of roots) {
        setVisible(root);
        root.style.removeProperty('--footer-parallax-y');
      }
    }
  }
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener('change', onReduceMotionChange);
  } else if (reduceMotion.addListener) {
    reduceMotion.addListener(onReduceMotionChange);
  }
})();

