(function () {
  var wrap = document.getElementById('progress-wrap');
  if (!wrap) return;

  var path = wrap.querySelector('.progress-circle path');
  if (!path) return;

  var totalLength = 307.919;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ticking = false;
  var isActive = false;

  path.style.strokeDasharray = totalLength + ' ' + totalLength;
  path.style.strokeDashoffset = totalLength;

  function update() {
    ticking = false;

    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var progress = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;

    path.style.strokeDashoffset = totalLength * (1 - progress);

    var shouldBeActive = scrollTop > 100;
    if (shouldBeActive !== isActive) {
      isActive = shouldBeActive;
      wrap.classList.toggle('active-progress', isActive);
      // Only reachable by keyboard while it is visible.
      wrap.tabIndex = isActive ? 0 : -1;
    }
  }

  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
  update();

  wrap.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });

    // Move focus to the top of the page so keyboard users continue from there.
    var target = document.getElementById('MainContent') || document.body;
    if (target && typeof target.focus === 'function') {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  });
})();
