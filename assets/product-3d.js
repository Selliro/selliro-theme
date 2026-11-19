/**
 * 3D product — <product-3d> (sections/product-3d.liquid)
 *
 * Loads Shopify's own model-viewer (Shopify.loadFeatures) only when the stage comes near the viewport,
 * or when the visitor taps "View in 3D". The poster stays underneath until the model has loaded, so a
 * slow network or a device without WebGL still shows the product.
 *
 * - Feature callouts / hotspots / camera view buttons turn the model to a stored camera angle
 *   (and pause auto-rotation); "Reset view" restores the starting angle and auto-rotation.
 * - The angle readout follows the camera; the drag hint hides after the first interaction.
 * - No model: the product photo tilts toward the pointer and can be dragged to turn it.
 * - Theme editor: selecting a feature block turns the model to it; clicking the model copies the
 *   hotspot position (position / normal) to paste into a feature block.
 */
(() => {
  if (customElements.get('product-3d')) return;

  // [angle around the product, camera angle from straight above] in degrees
  const VIEWS = {
    front: [0, 75],
    side: [90, 75],
    back: [180, 75],
    top: [0, 14],
  };
  const RAD = Math.PI / 180;
  const TURN = Math.PI * 2;

  let viewerPromise;
  const loadViewer = () => {
    viewerPromise ||= new Promise((resolve) => {
      if (customElements.get('model-viewer')) return resolve(true);
      if (!window.Shopify?.loadFeatures) return resolve(false);
      window.Shopify.loadFeatures([
        {
          name: 'model-viewer',
          version: '1.12',
          onLoad: (errors) => {
            if (errors) return resolve(false);
            customElements.whenDefined('model-viewer').then(() => resolve(true));
          },
        },
      ]);
    });
    return viewerPromise;
  };

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toDegrees = (rad) => ((Math.round(rad / RAD) % 360) + 360) % 360;

  class Product3D extends HTMLElement {
    connectedCallback() {
      this.section = this.closest('.p3d') || this;
      this.features = Array.from(this.section.querySelectorAll('[data-p3d-feature]'));
      this.viewButtons = Array.from(this.querySelectorAll('[data-p3d-view]'));
      this.template = this.querySelector('template[data-p3d-template]');
      this.readout = this.querySelector('[data-p3d-readout]');
      this.toast = this.querySelector('[data-p3d-toast]');
      this.designMode = Boolean(window.Shopify?.designMode);
      this.startAngle = Number(this.dataset.startAngle) || 0;
      this.startPhi = Number(this.dataset.startPhi) || 75;
      // Narrow stages crop a tall product, so pull the camera back a little on phones
      const radius = parseFloat(this.dataset.radius) || 125;
      this.radius = `${Math.round(window.matchMedia('(max-width: 749px)').matches ? radius * 1.2 : radius)}%`;

      this.features.forEach((feature, i) => {
        feature.querySelector('button')?.addEventListener('click', () => this.select(i));
      });
      this.viewButtons.forEach((button) => button.addEventListener('click', () => this.view(button.dataset.p3dView)));

      if (this.template) {
        const startButton = this.querySelector('[data-p3d-start]');
        if (this.dataset.load === 'click' && startButton && !this.designMode) {
          startButton.addEventListener('click', () => this.start(), { once: true });
        } else {
          this.io = new IntersectionObserver(
            (entries) => {
              if (!entries.some((entry) => entry.isIntersecting)) return;
              this.io.disconnect();
              this.start();
            },
            { rootMargin: '300px 0px' }
          );
          this.io.observe(this);
        }
      } else {
        this.setupTilt();
      }

      this.onBlockSelect = (event) => {
        const feature = event.target.closest?.('[data-p3d-feature]');
        if (!feature || !this.section.contains(feature)) return;
        this.select(this.features.indexOf(feature));
      };
      document.addEventListener('shopify:block:select', this.onBlockSelect);
    }

    disconnectedCallback() {
      this.io?.disconnect();
      this.visibility?.disconnect();
      clearInterval(this.ticker);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      this.removeEventListener('pointermove', this.onTilt);
      this.removeEventListener('pointerleave', this.onTiltEnd);
      clearTimeout(this.toastTimer);
    }

    /* ------------------------------------------------------------ viewer */
    async start() {
      if (this.started) return;
      this.started = true;
      this.classList.add('is-loading');

      const ok = await loadViewer();
      if (!ok) return this.classList.remove('is-loading');

      const fragment = this.template.content.cloneNode(true);
      const viewer = fragment.querySelector('model-viewer');
      if (!viewer) return;
      this.viewer = viewer;
      if (reducedMotion()) viewer.removeAttribute('auto-rotate');
      this.autoRotate = viewer.hasAttribute('auto-rotate');
      viewer.setAttribute('camera-orbit', `${this.startAngle}deg ${this.startPhi}deg ${this.radius}`);

      viewer.addEventListener('progress', (event) => {
        this.style.setProperty('--p3d-progress', String(event.detail?.totalProgress ?? 0));
      });
      viewer.addEventListener('load', () => {
        this.classList.remove('is-loading');
        this.classList.add('is-ready');
        this.updateReadout();
        this.trackTurntable();
      });
      viewer.addEventListener('error', () => this.classList.remove('is-loading'));
      viewer.addEventListener('camera-change', (event) => {
        if (event.detail?.source === 'user-interaction') this.onUserMove();
        this.queueReadout();
      });

      viewer.querySelectorAll('[data-p3d-hotspot]').forEach((hotspot) => {
        hotspot.addEventListener('click', (event) => {
          event.stopPropagation();
          this.select(Number(hotspot.dataset.p3dHotspot));
        });
      });

      if (this.designMode) viewer.addEventListener('click', (event) => this.pickPosition(event));

      this.querySelector('[data-p3d-slot]')?.append(fragment);
      if (this.pending != null) this.select(this.pending);
    }

    onUserMove() {
      this.classList.add('has-interacted');
      this.setActiveView(null);
    }

    queueReadout() {
      if (!this.readout || this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.updateReadout();
      });
    }

    // Auto-rotate spins the model (turntable), not the camera, and fires no camera-change:
    // refresh the readout a few times a second while it spins on screen.
    trackTurntable() {
      if (!this.readout || !this.autoRotate) return;
      this.visibility = new IntersectionObserver(([entry]) => {
        clearInterval(this.ticker);
        if (entry.isIntersecting) this.ticker = setInterval(() => this.updateReadout(), 150);
      });
      this.visibility.observe(this);
    }

    /** The angle the visitor sees the product from: camera angle minus the model's own spin */
    updateReadout() {
      if (!this.readout || !this.viewer?.getCameraOrbit) return;
      const theta = this.viewer.getCameraOrbit().theta - (this.viewer.turntableRotation || 0);
      this.readout.textContent = String(toDegrees(theta)).padStart(3, '0');
    }

    /** Orbit the camera to a view of the product, taking the shortest way round */
    goTo(angle, phi, keepRotating = false) {
      const viewer = this.viewer;
      if (!viewer || !Number.isFinite(angle)) return;
      if (!keepRotating) viewer.removeAttribute('auto-rotate');
      const current = viewer.getCameraOrbit().theta;
      let theta = angle * RAD + (viewer.turntableRotation || 0);
      theta -= Math.round((theta - current) / TURN) * TURN;
      viewer.cameraOrbit = `${theta.toFixed(4)}rad ${Number.isFinite(phi) ? phi : this.startPhi}deg ${this.radius}`;
      viewer.fieldOfView = 'auto';
      if (!keepRotating) this.classList.add('has-interacted');
    }

    setActiveView(name) {
      this.viewButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.p3dView === name));
    }

    /** Feature callout / hotspot / editor block selected */
    select(index) {
      if (index < 0 || index >= this.features.length) return;
      this.features.forEach((feature, i) => {
        feature.classList.toggle('is-active', i === index);
        feature.querySelector('button')?.setAttribute('aria-pressed', String(i === index));
      });
      this.viewer?.querySelectorAll('[data-p3d-hotspot]').forEach((hotspot) => {
        hotspot.classList.toggle('is-active', Number(hotspot.dataset.p3dHotspot) === index);
      });
      this.setActiveView(null);

      if (!this.viewer) {
        this.pending = index; // applied once the viewer exists
        return;
      }
      this.pending = null;
      const { angle, phi } = this.features[index].dataset;
      if (angle != null) this.goTo(Number(angle), Number(phi));
    }

    /** Camera view buttons */
    view(name) {
      if (!this.viewer) return;
      this.features.forEach((feature) => {
        feature.classList.remove('is-active');
        feature.querySelector('button')?.setAttribute('aria-pressed', 'false');
      });
      this.viewer.querySelectorAll('[data-p3d-hotspot]').forEach((hotspot) => hotspot.classList.remove('is-active'));

      if (name === 'reset') {
        this.goTo(this.startAngle, this.startPhi, true);
        if (this.autoRotate) this.viewer.setAttribute('auto-rotate', '');
        this.setActiveView(null);
        return;
      }
      if (!VIEWS[name]) return;
      this.goTo(...VIEWS[name]);
      this.setActiveView(name);
    }

    /** Theme editor helper: click the model to get a hotspot position for a feature block */
    pickPosition(event) {
      const hit = this.viewer.positionAndNormalFromPoint?.(event.clientX, event.clientY);
      if (!hit) return;
      const fmt = (v) => `${v.x.toFixed(3)}m ${v.y.toFixed(3)}m ${v.z.toFixed(3)}m`;
      const value = `${fmt(hit.position)} / ${fmt(hit.normal)}`;
      navigator.clipboard?.writeText(value).catch(() => {});
      if (!this.toast) return;
      this.toast.textContent = value;
      this.toast.hidden = false;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => (this.toast.hidden = true), 6000);
    }

    /* ------------------------------------------------------------ fallback: product photo */
    // Hover tilts the photo toward the pointer; dragging (mouse or touch) turns it further and it
    // springs back on release, so the stage still feels three-dimensional without a model.
    setupTilt() {
      if (reducedMotion()) return;
      const set = (rx, ry) => {
        this.style.setProperty('--tilt-x', `${rx.toFixed(2)}deg`);
        this.style.setProperty('--tilt-y', `${ry.toFixed(2)}deg`);
      };
      const hover = window.matchMedia('(hover: hover)').matches;

      this.onTilt = (event) => {
        const rect = this.getBoundingClientRect();
        if (this.drag) {
          const dx = (event.clientX - this.drag.x) / rect.width;
          set(this.drag.rx, Math.max(-38, Math.min(38, this.drag.ry + dx * 80)));
          return;
        }
        if (!hover || event.pointerType !== 'mouse') return;
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        set(-y * 12, x * 16);
      };
      this.onTiltEnd = () => {
        this.drag = null;
        this.classList.remove('is-dragging');
        this.style.removeProperty('--tilt-x');
        this.style.removeProperty('--tilt-y');
      };
      // Stop the browser's own image drag from cancelling the gesture
      this.addEventListener('dragstart', (event) => event.preventDefault());
      this.addEventListener('pointerdown', (event) => {
        const style = getComputedStyle(this);
        this.drag = {
          x: event.clientX,
          rx: parseFloat(style.getPropertyValue('--tilt-x')) || 0,
          ry: parseFloat(style.getPropertyValue('--tilt-y')) || 0,
        };
        this.classList.add('is-dragging');
      });
      this.addEventListener('pointermove', this.onTilt);
      this.addEventListener('pointerleave', this.onTiltEnd);
      this.addEventListener('pointerup', this.onTiltEnd);
      this.addEventListener('pointercancel', this.onTiltEnd);
    }
  }

  customElements.define('product-3d', Product3D);
})();
