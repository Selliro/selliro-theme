/**
 * Whispo dialogs: drawers and modals (import from '@whispo/dialog'; loaded on every page by assets/theme.js).
 *
 * Markup — no script needed per dialog:
 *
 *   <button type="button" aria-controls="MenuDrawer" aria-expanded="false" data-dialog-open>Menu</button>
 *   <dialog id="MenuDrawer" class="dialog drawer drawer--left" aria-labelledby="MenuDrawerHeading">
 *     <div class="dialog__panel"> … <button type="button" data-dialog-close aria-label="Close">…</button> </div>
 *   </dialog>
 *
 * Behaviour
 *   - Native modal <dialog>: focus stays inside it and the page behind is inert while it is open.
 *   - Opens from any [data-dialog-open][aria-controls] button; closes on [data-dialog-close], Escape (unless a
 *     component inside called preventDefault on it) and a click on the backdrop. Closing plays the exit animation first ([data-closing], styles in assets/base.css §13).
 *   - Locks page scroll (html.has-dialog), keeps the opener's aria-expanded in sync and returns focus to it.
 *   - Publishes EVENTS.DIALOG_OPENED / EVENTS.DIALOG_CLOSED with { id }.
 *
 *   import { openDialog, closeDialog } from '@whispo/dialog';
 *   openDialog(document.getElementById('SearchModal'), button);
 */
import { EVENTS, publish } from '@whispo/events';
import { prefersReducedMotion } from '@whispo/utilities';

/** @type {WeakMap<HTMLDialogElement, Element | null>} */
const openers = new WeakMap();

/** @param {HTMLDialogElement} dialog @param {boolean} expanded */
function syncOpeners(dialog, expanded) {
  if (!dialog.id) return;
  document.querySelectorAll(`[data-dialog-open][aria-controls="${CSS.escape(dialog.id)}"]`).forEach((button) => {
    button.setAttribute('aria-expanded', String(expanded));
  });
}

/**
 * @param {Element | null} dialog
 * @param {Element | null} [opener] element that gets focus back on close
 */
export function openDialog(dialog, opener = document.activeElement) {
  if (!(dialog instanceof HTMLDialogElement) || dialog.open) return;
  openers.set(dialog, opener);
  dialog.removeAttribute('data-closing');
  dialog.showModal();
  document.documentElement.classList.add('has-dialog');
  syncOpeners(dialog, true);
  publish(EVENTS.DIALOG_OPENED, { id: dialog.id });
}

/** @param {Element | null} dialog */
export function closeDialog(dialog) {
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open || dialog.hasAttribute('data-closing')) return;
  const panel = dialog.querySelector('.dialog__panel');
  const finish = () => {
    dialog.removeAttribute('data-closing');
    dialog.close();
  };
  if (!panel || prefersReducedMotion()) return finish();

  dialog.setAttribute('data-closing', '');
  const names = getComputedStyle(panel).animationName;
  if (!names || names === 'none') return finish();
  const fallback = window.setTimeout(finish, 450);
  panel.addEventListener(
    'animationend',
    () => {
      window.clearTimeout(fallback);
      finish();
    },
    { once: true }
  );
}

/* Clean-up whenever a dialog closes, however it was closed */
document.addEventListener(
  'close',
  (event) => {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.classList.contains('dialog')) return;
    if (!document.querySelector('dialog.dialog[open]')) document.documentElement.classList.remove('has-dialog');
    syncOpeners(dialog, false);
    const opener = openers.get(dialog);
    openers.delete(dialog);
    if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
    publish(EVENTS.DIALOG_CLOSED, { id: dialog.id });
  },
  true
);

/*
 * Escape closes the top dialog, unless something inside it used the key first (an open list or the
 * search results call preventDefault). Handled here rather than through the browser's own close request,
 * which ignores an Escape that follows a cancelled one.
 */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const open = Array.from(document.querySelectorAll('dialog.dialog[open]')).pop();
  if (!open) return;
  event.preventDefault();
  closeDialog(open);
});

/* Other close requests (for example the Android back gesture): animate out instead of closing at once */
document.addEventListener(
  'cancel',
  (event) => {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.classList.contains('dialog')) return;
    event.preventDefault();
    closeDialog(dialog);
  },
  true
);

/* A click counts as a backdrop click only when it both started and ended outside the panel */
/** @type {EventTarget | null} */
let pressTarget = null;
document.addEventListener('pointerdown', (event) => {
  pressTarget = event.target;
});

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const opener = target.closest('[data-dialog-open][aria-controls]');
  if (opener) {
    event.preventDefault();
    openDialog(document.getElementById(opener.getAttribute('aria-controls') || ''), opener);
    return;
  }

  const closer = target.closest('[data-dialog-close]');
  if (closer) {
    closeDialog(closer.closest('dialog'));
    return;
  }

  if (target instanceof HTMLDialogElement && target.classList.contains('dialog') && pressTarget === target) {
    closeDialog(target);
  }
});

/* Theme editor: a dialog inside a re-rendered section must not leave the page locked */
document.addEventListener('shopify:section:unload', () => {
  window.requestAnimationFrame(() => {
    if (!document.querySelector('dialog.dialog[open]')) document.documentElement.classList.remove('has-dialog');
  });
});
