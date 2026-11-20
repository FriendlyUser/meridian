// Things that sit above the page: dialogs, menus, toasts and chart tooltips.
// Open ones are kept in a stack so Escape (and the phone's back button) closes
// the top one first.

import { h, esc, clamp } from '../core/util.js';
import { icon } from './icons.js';

const root = () => document.getElementById('overlays');
const stack = [];

/**
 * @param {{ title?: string, body?: string|Node, footer?: string, className?: string, onClose?: () => void }} options
 * @returns {{ el: HTMLElement, body: HTMLElement, close: () => void }}
 */
export function openModal({ title = '', body = '', footer = '', className = '', onClose } = {}) {
  const el = h(`
    <div class="overlay">
      <div class="modal ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></header>
        <div class="modal-body"></div>
        ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
      </div>
    </div>`);
  const bodyEl = /** @type {HTMLElement} */ (el.querySelector('.modal-body'));
  if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.append(body);

  const previous = /** @type {HTMLElement|null} */ (document.activeElement);
  let pressedBackdrop = false;
  const entry = { close };
  function close() {
    const i = stack.indexOf(entry);
    if (i < 0) return;
    stack.splice(i, 1);
    el.remove();
    onClose?.();
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  }
  // Only a press that both starts and ends on the backdrop closes: dragging a
  // selection out of a text box must not.
  el.addEventListener('pointerdown', (e) => { pressedBackdrop = e.target === el; });
  el.addEventListener('click', (e) => {
    if (e.target === el && pressedBackdrop) close();
    else if (/** @type {Element} */ (e.target).closest('[data-close]')) close();
  });
  root().append(el);
  stack.push(entry);
  const first = /** @type {HTMLElement|null} */ (el.querySelector('[autofocus]') || el.querySelector('.modal-body input, .modal-body textarea, .modal-body select, .modal-foot .primary'));
  first?.focus({ preventScroll: true });
  return { el, body: bodyEl, close };
}

/** Close whatever is on top. Returns false when nothing was open. */
export function closeTop() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}
export const hasOverlay = () => stack.length > 0;
export function closeAll() {
  while (stack.length) stack[stack.length - 1].close();
}

/**
 * A small menu beside the element that opened it.
 * @param {Element} anchor
 * @param {Array<{label?: string, icon?: string, dot?: string, onClick?: () => void, danger?: boolean, checked?: boolean, sep?: boolean, heading?: string}>} items
 */
export function popMenu(anchor, items) {
  const backdrop = h('<div class="menu-backdrop"></div>');
  const menu = h('<div class="menu" role="menu"></div>');
  for (const item of items) {
    if (item.sep) { menu.append(h('<div class="menu-sep"></div>')); continue; }
    if (item.heading) { menu.append(h(`<div class="menu-label">${esc(item.heading)}</div>`)); continue; }
    const btn = h(`<button class="menu-item ${item.danger ? 'danger' : ''}" role="menuitem">
      ${item.dot ? `<i class="dot" style="--c: var(--c-${esc(item.dot)})"></i>` : item.icon ? icon(item.icon, 18) : ''}
      <span>${esc(item.label)}</span>${item.checked ? `<i class="tick">${icon('check', 16)}</i>` : ''}</button>`);
    btn.addEventListener('click', () => { entry.close(); item.onClick?.(); });
    menu.append(btn);
  }
  const entry = {
    close() {
      const i = stack.indexOf(entry);
      if (i < 0) return;
      stack.splice(i, 1);
      backdrop.remove();
      menu.remove();
    },
  };
  backdrop.addEventListener('pointerdown', (e) => { e.preventDefault(); entry.close(); });
  root().append(backdrop, menu);
  const a = anchor.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const below = a.bottom + 6 + m.height <= window.innerHeight - 8;
  menu.style.left = `${clamp(a.right - m.width < 8 ? a.left : a.right - m.width, 8, window.innerWidth - m.width - 8)}px`;
  menu.style.top = `${below ? a.bottom + 6 : Math.max(8, a.top - m.height - 6)}px`;
  stack.push(entry);
  /** @type {HTMLElement|null} */ (menu.querySelector('.menu-item'))?.focus();
  return entry;
}

/** @param {string} message @param {{ action?: string, onAction?: () => void, ms?: number }} [options] */
export function toast(message, { action = '', onAction, ms = 3600 } = {}) {
  const host = document.getElementById('toasts');
  const el = h(`<div class="toast" role="status"><span>${esc(message)}</span>${action ? `<button>${esc(action)}</button>` : ''}</div>`);
  const remove = () => el.remove();
  el.querySelector('button')?.addEventListener('click', () => { remove(); onAction?.(); });
  while (host.children.length >= 2) host.firstElementChild.remove();
  host.append(el);
  setTimeout(remove, action ? Math.max(ms, 5200) : ms);
}

/** @returns {Promise<boolean>} */
export function confirmDialog(message, { title = 'Are you sure?', ok = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const modal = openModal({
      title,
      className: 'narrow',
      body: `<p>${esc(message)}</p>`,
      footer: `<span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>`,
      onClose: () => resolve(answer),
    });
    modal.el.querySelector('[data-ok]').addEventListener('click', () => { answer = true; modal.close(); });
  });
}

/** Ask for one line of text. Resolves null when dismissed. @returns {Promise<string|null>} */
export function promptDialog(title, { value = '', placeholder = '', ok = 'Save', type = 'text', note = '' } = {}) {
  return new Promise((resolve) => {
    let answer = null;
    const modal = openModal({
      title,
      className: 'narrow',
      body: `<form><input type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" autofocus>${note ? `<p class="muted" style="margin-top:10px;font-size:13px">${esc(note)}</p>` : ''}</form>`,
      footer: '<span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>' + esc(ok) + '</button>',
      onClose: () => resolve(answer),
    });
    const input = /** @type {HTMLInputElement} */ (modal.body.querySelector('input'));
    const submit = (e) => { e?.preventDefault(); answer = input.value; modal.close(); };
    modal.body.querySelector('form').addEventListener('submit', submit);
    modal.el.querySelector('[data-ok]').addEventListener('click', submit);
    input.select();
  });
}

// ---- Chart tooltips: one floating label, shown on hover and on keyboard focus ----

let tip = null;
function showTip(target) {
  tip ||= h('<div class="tip" role="tooltip" hidden></div>');
  if (!tip.isConnected) document.body.append(tip);
  // The value leads and the label follows; both arrive as text, never as markup.
  tip.replaceChildren();
  const value = document.createElement('b');
  value.textContent = target.dataset.tipValue || '';
  tip.append(value, document.createTextNode(target.dataset.tip ? `  ${target.dataset.tip}` : ''));
  tip.hidden = false;
  const r = target.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  tip.style.left = `${clamp(r.left + r.width / 2 - t.width / 2, 6, window.innerWidth - t.width - 6)}px`;
  tip.style.top = `${r.top - t.height - 8 < 6 ? r.bottom + 8 : r.top - t.height - 8}px`;
}
const hideTip = () => { if (tip) tip.hidden = true; };

/** Call once: any element with data-tip-value gets a tooltip. */
export function installTooltips() {
  const find = (e) => /** @type {HTMLElement|null} */ (e.target instanceof Element ? e.target.closest('[data-tip-value]') : null);
  document.addEventListener('pointerover', (e) => { const t = find(e); if (t) showTip(t); });
  document.addEventListener('pointerout', (e) => { if (find(e)) hideTip(); });
  document.addEventListener('focusin', (e) => { const t = find(e); if (t) showTip(t); });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('scroll', hideTip, true);
}
