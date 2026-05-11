(function () {
  if (!window.matchMedia('(pointer: fine)').matches) return;

  var outer = document.querySelector('.cursor-outer');
  var inner = document.querySelector('.cursor-inner');
  if (!outer || !inner) return;

  var mouseX = 0;
  var mouseY = 0;
  var innerX = 0;
  var innerY = 0;
  var outerX = 0;
  var outerY = 0;
  var visible = false;
  var rafId = null;

  function show() {
    if (!visible) {
      outer.style.visibility = 'visible';
      inner.style.visibility = 'visible';
      visible = true;
    }
  }

  function hide() {
    outer.style.visibility = 'hidden';
    inner.style.visibility = 'hidden';
    visible = false;
  }

  function loop() {
    innerX += (mouseX - innerX) * 0.38;
    innerY += (mouseY - innerY) * 0.38;
    outerX += (mouseX - outerX) * 0.18;
    outerY += (mouseY - outerY) * 0.18;

    inner.style.transform = 'translate(' + innerX + 'px,' + innerY + 'px)';
    outer.style.transform = 'translate(' + outerX + 'px,' + outerY + 'px)';

    requestAnimationFrame(loop);
  }

  document.addEventListener('mousemove', function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
    show();
  });

  document.addEventListener('mouseleave', hide);
  document.addEventListener('mouseenter', show);

  document.addEventListener('mousedown', function () {
    outer.classList.add('is-click');
    inner.classList.add('is-click');
  });

  document.addEventListener('mouseup', function () {
    outer.classList.remove('is-click');
    inner.classList.remove('is-click');
  });

  var interactiveSelectors = 'a, button, input, textarea, select, label, [role="button"], [tabindex]:not([tabindex="-1"])';

  document.addEventListener('mouseover', function (e) {
    if (e.target.closest(interactiveSelectors)) {
      outer.classList.add('is-hover');
      inner.classList.add('is-hover');
    }
  });

  document.addEventListener('mouseout', function (e) {
    if (e.target.closest(interactiveSelectors)) {
      outer.classList.remove('is-hover');
      inner.classList.remove('is-hover');
    }
  });

  loop();
})();
