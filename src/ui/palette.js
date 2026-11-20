// Search everything, and do things by name: Ctrl+K (or /) on a keyboard, the
// magnifier on a phone. Typing a line and pressing Enter on the first row adds it
// as a task.

import { store } from '../core/store.js';
import { esc, matches, relDay, fmtDate } from '../core/util.js';
import { addTaskFromText, topTasks, sortTasks, listOf } from '../core/model.js';
import { icon } from './icons.js';
import { openModal, toast } from './overlay.js';
import { openTaskEditor, describeQuick } from './parts.js';

let actions = [];
/** The app tells the palette what it can do (keeps this file free of view imports). */
export function setPaletteActions(list) {
  actions = list;
}

function results(query) {
  const q = query.trim();
  const out = [];
  if (!q) {
    out.push({ group: 'Do' }, ...actions);
    return out;
  }
  const hint = describeQuick(q).join(' · ');
  out.push({ group: 'Add' }, {
    icon: 'plus', label: `Add task “${q}”`, small: hint,
    run: () => {
      const task = addTaskFromText(q);
      if (task) { store.commit('palette'); toast(`Added “${task.title}”${task.due ? ` for ${relDay(task.due)}` : ''}`); }
    },
  });

  const tasks = sortTasks(topTasks().filter((t) => matches(`${t.title} ${t.notes}`, q))).sort((a, b) => Number(a.done) - Number(b.done)).slice(0, 7);
  if (tasks.length) {
    out.push({ group: 'Tasks' }, ...tasks.map((t) => ({
      icon: t.done ? 'check' : 'tasks', label: t.title, small: [t.due ? relDay(t.due) : '', t.listId !== 'inbox' ? listOf(t.listId).name : ''].filter(Boolean).join(' · '),
      run: () => openTaskEditor(t, { onClose: () => store.commit('palette') }),
    })));
  }
  const notes = store.data.notes.filter((n) => !n.locked && matches(`${n.title} ${n.body} ${(n.items || []).map((i) => i.text).join(' ')}`, q)).slice(0, 6);
  if (notes.length) {
    out.push({ group: 'Notes' }, ...notes.map((n) => ({
      icon: 'notes', label: n.title || n.body.split('\n')[0] || 'Checklist', small: n.archived ? 'Archived' : '',
      run: () => { location.hash = `#/notes/${n.id}`; },
    })));
  }
  const events = store.data.events.filter((e) => matches(`${e.title} ${e.place} ${e.notes}`, q)).slice(0, 5);
  if (events.length) {
    out.push({ group: 'Events' }, ...events.map((e) => ({
      icon: 'calendar', label: e.title, small: fmtDate(e.date), run: () => { location.hash = `#/calendar/${e.date}`; },
    })));
  }
  const habits = store.data.habits.filter((h) => matches(h.name, q)).slice(0, 4);
  if (habits.length) out.push({ group: 'Habits' }, ...habits.map((h) => ({ icon: 'habits', label: h.name, small: h.archived ? 'Archived' : '', run: () => { location.hash = '#/habits'; } })));
  const lists = store.data.lists.filter((l) => matches(l.name, q)).slice(0, 4);
  if (lists.length) out.push({ group: 'Lists' }, ...lists.map((l) => ({ icon: 'list', label: l.name, small: 'List', run: () => { location.hash = `#/tasks/${l.id}`; } })));
  const does = actions.filter((a) => matches(a.label, q));
  if (does.length) out.push({ group: 'Do' }, ...does);
  return out;
}

export function openPalette() {
  if (document.querySelector('.palette')) return;
  const modal = openModal({
    title: 'Search',
    className: 'palette',
    body: `
      <div class="pal-input">${icon('search')}<input type="text" placeholder="Search, or type a task and press Enter" autocomplete="off" enterkeyhint="go" aria-label="Search" autofocus></div>
      <div class="pal-list" role="listbox" aria-label="Results"></div>`,
  });
  modal.el.querySelector('.modal-head').remove();
  modal.body.style.padding = '0';
  const input = /** @type {HTMLInputElement} */ (modal.body.querySelector('input'));
  const list = /** @type {HTMLElement} */ (modal.body.querySelector('.pal-list'));
  let rows = [];
  let sel = 0;

  const draw = () => {
    const all = results(input.value);
    rows = all.filter((r) => !r.group);
    sel = Math.min(sel, Math.max(0, rows.length - 1));
    let i = -1;
    list.innerHTML = all.map((r) => {
      if (r.group) return `<div class="pal-group">${esc(r.group)}</div>`;
      i++;
      return `<button class="pal-item ${i === sel ? 'sel' : ''}" data-i="${i}" role="option" aria-selected="${i === sel}">${icon(r.icon || 'right', 18)}<span>${esc(r.label)}</span>${r.small ? `<small>${esc(r.small)}</small>` : r.keys ? `<small class="kbd" style="margin-left:auto">${esc(r.keys)}</small>` : ''}</button>`;
    }).join('');
  };
  const run = (i) => {
    const row = rows[i];
    if (!row) return;
    modal.close();
    row.run();
  };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % Math.max(1, rows.length);
      draw();
      list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(sel);
    }
  });
  list.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('[data-i]'));
    if (btn) run(Number(btn.dataset.i));
  });
  draw();
  input.focus();
}
