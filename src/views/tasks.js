// Tasks: every list, seen three ways. A plain list grouped by when things are due,
// a board (to do / in progress / done), and a priority matrix (urgent x important).

import { store } from '../core/store.js';
import { esc, today, addDays, ymd } from '../core/util.js';
import {
  COLORS, addTaskFromText, topTasks, taskById, sortTasks, quadrant, setTaskDone, addList, deleteList, listOf, isOverdue,
} from '../core/model.js';
import { icon } from '../ui/icons.js';
import { viewHead, taskRow, bindTasks, quickAdd, bindQuickAdd, openTaskEditor, colorVar, toggleTask } from '../ui/parts.js';
import { popMenu, promptDialog, confirmDialog, toast } from '../ui/overlay.js';

const SMART = [
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'upcoming', label: 'Next 7 days', icon: 'calendar' },
  { id: 'all', label: 'All tasks', icon: 'list' },
];
const MODES = [
  { id: 'list', label: 'List', icon: 'list' },
  { id: 'board', label: 'Board', icon: 'board' },
  { id: 'matrix', label: 'Matrix', icon: 'matrix' },
];
const COLUMNS = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' },
];
const QUADS = [
  { title: 'Do first', note: 'Important and due by tomorrow', color: 'var(--danger)' },
  { title: 'Schedule', note: 'Important, not pressing yet', color: 'var(--c-blue)' },
  { title: 'Fit in', note: 'Due by tomorrow, lower priority', color: 'var(--c-gold)' },
  { title: 'Later', note: 'Neither urgent nor important', color: 'var(--line-2)' },
];

function ui() {
  const u = store.data.ui;
  if (!u.tasks || typeof u.tasks !== 'object') u.tasks = { scope: 'inbox', mode: 'list', showDone: false };
  const known = SMART.some((s) => s.id === u.tasks.scope) || store.data.lists.some((l) => l.id === u.tasks.scope);
  if (!known) u.tasks.scope = 'inbox';
  if (!MODES.some((m) => m.id === u.tasks.mode)) u.tasks.mode = 'list';
  return u.tasks;
}

function inScope(scope) {
  const day = today();
  const all = topTasks();
  switch (scope) {
    case 'inbox': return all.filter((t) => t.listId === 'inbox');
    case 'today': return all.filter((t) => (t.done ? t.due === day || (t.doneAt && ymd(new Date(t.doneAt)) === day) : (t.due && t.due <= day) || t.myDay === day));
    case 'upcoming': return all.filter((t) => t.due && t.due <= addDays(day, 7) && (!t.done || t.due >= day));
    case 'all': return all;
    default: return all.filter((t) => t.listId === scope);
  }
}

const scopeTitle = (scope) => SMART.find((s) => s.id === scope)?.label || listOf(scope).name;

function scopesPanel(state) {
  const count = (scope) => inScope(scope).filter((t) => !t.done).length;
  const lists = store.data.lists.filter((l) => l.id !== 'inbox');
  return `
    <nav class="scopes" aria-label="Lists">
      ${SMART.map((s) => `<button class="scope ${state.scope === s.id ? 'on' : ''}" data-scope="${s.id}">${icon(s.icon, 18)}<span>${s.label}</span><span class="count">${count(s.id) || ''}</span></button>`).join('')}
      <div class="scope-label">Lists</div>
      ${lists.map((l) => `<button class="scope ${state.scope === l.id ? 'on' : ''}" data-scope="${esc(l.id)}"><i class="dot" style="--c: ${colorVar(l.color)}"></i><span>${esc(l.name)}</span><span class="count">${count(l.id) || ''}</span></button>`).join('')}
      <button class="scope" data-new-list>${icon('plus', 18)}<span>New list</span></button>
    </nav>`;
}

function listMode(tasks, state) {
  const day = today();
  const open = sortTasks(tasks.filter((t) => !t.done));
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const bucket = (t) => {
    if (t.due && t.due < day) return 0;
    if (t.due === day || t.myDay === day) return 1;
    if (t.due === addDays(day, 1)) return 2;
    if (t.due && t.due <= addDays(day, 7)) return 3;
    return t.due ? 4 : 5;
  };
  const names = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No date'];
  const groups = names.map(() => []);
  for (const t of open) groups[bucket(t)].push(t);
  const used = groups.filter((g) => g.length).length;
  const showList = !store.data.lists.some((l) => l.id === state.scope);

  let body = groups.map((g, i) => (g.length ? `
    ${used === 1 && i === 5 ? '' : `<div class="group-title ${i === 0 ? 'overdue' : ''}">${names[i]} · ${g.length}</div>`}
    ${g.map((t) => taskRow(t, { showList })).join('')}` : '')).join('');
  if (!open.length) {
    body = `<div class="empty"><b>${done.length ? 'All done here' : 'Nothing here yet'}</b>${done.length ? 'Everything in this view is ticked off.' : 'Type a task above. Dates, #lists and !priorities are picked up as you type.'}</div>`;
  }
  if (done.length) {
    body += `
      <div class="group-title"><button class="btn small quiet" data-toggle-done style="margin-left:-8px">${icon(state.showDone ? 'down' : 'right', 14)}Completed · ${done.length}</button></div>
      ${state.showDone ? done.slice(0, 50).map((t) => taskRow(t, { showList })).join('') : ''}`;
  }
  return `<section class="card">${body}</section>`;
}

function boardMode(tasks) {
  const by = { todo: [], doing: [], done: [] };
  for (const t of tasks) by[t.done ? 'done' : t.status === 'doing' ? 'doing' : 'todo'].push(t);
  by.todo = sortTasks(by.todo);
  by.doing = sortTasks(by.doing);
  by.done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const priorityColor = ['var(--danger)', 'var(--c-orange)', 'var(--c-blue)', 'var(--line-2)'];
  return `
    <div class="board">
      ${COLUMNS.map((col) => `
        <section class="board-col" data-col="${col.id}" aria-label="${col.label}">
          <h3>${col.label} <span>${by[col.id].length}</span></h3>
          ${by[col.id].slice(0, col.id === 'done' ? 20 : 200).map((t) => `
            <div class="board-card ${t.done ? 'done' : ''}" draggable="true" data-card="${t.id}" style="--pc: ${priorityColor[t.priority - 1]}">
              <div class="row" style="align-items:flex-start;gap:6px">
                <div class="grow" data-open-card role="button" tabindex="0">
                  <div class="task-title">${esc(t.title)}</div>
                  ${t.due ? `<div class="task-meta"><span class="meta ${isOverdue(t) ? 'overdue' : ''}">${icon('calendar', 12)}${esc(t.due === today() ? 'Today' : t.due.slice(5).replace('-', '/'))}</span></div>` : ''}
                </div>
                <button class="icon-btn" data-move aria-label="Move: ${esc(t.title)}" style="width:28px;height:28px">${icon('more', 16)}</button>
              </div>
            </div>`).join('') || '<p class="muted" style="padding:6px;font-size:13px">Drop a card here</p>'}
        </section>`).join('')}
    </div>`;
}

function matrixMode(tasks) {
  const quads = [[], [], [], []];
  for (const t of sortTasks(tasks.filter((x) => !x.done))) quads[quadrant(t)].push(t);
  return `
    <div class="matrix">
      ${QUADS.map((q, i) => `
        <section class="quad" style="--qc: ${q.color}">
          <h3>${q.title} <span class="muted" style="font-weight:400">· ${quads[i].length}</span></h3>
          <p>${q.note}</p>
          ${quads[i].map((t) => taskRow(t)).join('') || '<p class="muted" style="padding:8px;font-size:13px">Nothing here.</p>'}
        </section>`).join('')}
    </div>
    <p class="muted" style="margin-top:12px;font-size:13px">Priority decides the row (urgent or high is “important”); the due date decides the column.</p>`;
}

function html() {
  const state = ui();
  const tasks = inScope(state.scope);
  const isList = store.data.lists.some((l) => l.id === state.scope && l.id !== 'inbox');
  const actions = `
    <div class="seg" role="tablist" aria-label="View">${MODES.map((m) => `<button data-mode="${m.id}" class="${state.mode === m.id ? 'on' : ''}" role="tab" aria-selected="${state.mode === m.id}">${icon(m.icon, 16)}${m.label}</button>`).join('')}</div>
    ${isList ? `<button class="icon-btn" data-list-menu aria-label="List options">${icon('more')}</button>` : ''}`;
  const where = state.scope === 'today' ? ' for today' : isList ? ` to ${listOf(state.scope).name}` : '';
  return `
    ${viewHead('Tasks', '', actions)}
    <div class="tasks-layout">
      ${scopesPanel(state)}
      <div>
        <h2 style="font:600 20px/1.2 var(--display);margin-bottom:12px">${esc(scopeTitle(state.scope))}</h2>
        ${quickAdd(`Add a task${where} — “Pay rent friday #home !2”`)}
        ${state.mode === 'board' ? boardMode(tasks) : state.mode === 'matrix' ? matrixMode(tasks) : listMode(tasks, state)}
      </div>
    </div>`;
}

export function mount(el, param) {
  if (param && (SMART.some((s) => s.id === param) || store.data.lists.some((l) => l.id === param))) ui().scope = param;
  const render = () => { el.innerHTML = html(); };
  const commit = () => { store.commit('tasks'); render(); };

  bindTasks(el, 'tasks', render);
  bindQuickAdd(el, (text) => {
    const { scope } = ui();
    const defaults = {};
    if (store.data.lists.some((l) => l.id === scope)) defaults.listId = scope;
    const task = addTaskFromText(text, defaults);
    if (task && scope === 'today' && !task.due) task.due = today();
    commit();
  });

  const moveTo = (task, col) => {
    if (col === 'done') { if (!task.done) toggleTask(task, 'tasks', render); return; }
    if (task.done) setTaskDone(task, false);
    task.status = col;
    commit();
  };

  el.addEventListener('click', async (e) => {
    const target = /** @type {Element} */ (e.target);
    const pick = (name) => /** @type {HTMLElement|null} */ (target.closest(`[data-${name}]`));
    const state = ui();
    if (pick('scope')) { state.scope = pick('scope').dataset.scope; store.touch(); render(); return; }
    if (pick('mode')) { state.mode = pick('mode').dataset.mode; store.touch(); render(); return; }
    if (pick('toggle-done')) { state.showDone = !state.showDone; store.touch(); render(); return; }
    if (pick('new-list')) {
      const name = await promptDialog('New list', { placeholder: 'Name, e.g. Work', ok: 'Create' });
      if (name?.trim()) { state.scope = addList(name).id; commit(); }
      return;
    }
    if (pick('list-menu')) {
      const list = listOf(state.scope);
      popMenu(pick('list-menu'), [
        { label: 'Rename list', icon: 'note', onClick: async () => {
          const name = await promptDialog('Rename list', { value: list.name });
          if (name?.trim()) { list.name = name.trim(); commit(); }
        } },
        { heading: 'Colour' },
        ...COLORS.map((c) => ({ label: c[0].toUpperCase() + c.slice(1), dot: c, checked: list.color === c, onClick: () => { list.color = c; commit(); } })),
        { sep: true },
        { label: 'Delete list', icon: 'trash', danger: true, onClick: async () => {
          const n = topTasks().filter((t) => t.listId === list.id).length;
          if (await confirmDialog(n ? `Its ${n} task${n === 1 ? '' : 's'} will move to the Inbox.` : 'The list is empty.', { title: `Delete “${list.name}”?` })) {
            deleteList(list.id);
            state.scope = 'inbox';
            commit();
            toast('List deleted');
          }
        } },
      ]);
      return;
    }
    if (pick('move')) {
      const task = taskById(/** @type {HTMLElement} */ (target.closest('[data-card]')).dataset.card);
      if (!task) return;
      const here = task.done ? 'done' : task.status === 'doing' ? 'doing' : 'todo';
      popMenu(pick('move'), [
        { heading: 'Move to' },
        ...COLUMNS.map((c) => ({ label: c.label, checked: c.id === here, onClick: () => { if (c.id !== here) moveTo(task, c.id); } })),
      ]);
      return;
    }
    if (pick('open-card')) {
      const task = taskById(/** @type {HTMLElement} */ (target.closest('[data-card]')).dataset.card);
      if (task) openTaskEditor(task, { onClose: render });
    }
  });
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && /** @type {Element} */ (e.target).matches('[data-open-card]')) {
      e.preventDefault();
      /** @type {HTMLElement} */ (e.target).click();
    }
  });

  // Dragging cards between board columns (a mouse thing; the card menu does the same by touch).
  let dragged = null;
  el.addEventListener('dragstart', (e) => {
    const card = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest?.('[data-card]'));
    if (!card) return;
    dragged = card.dataset.card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragged);
  });
  el.addEventListener('dragend', () => { dragged = null; el.querySelectorAll('.dragging, .over').forEach((n) => n.classList.remove('dragging', 'over')); });
  el.addEventListener('dragover', (e) => {
    const col = /** @type {Element} */ (e.target).closest?.('[data-col]');
    if (!col || !dragged) return;
    e.preventDefault();
    el.querySelectorAll('.board-col.over').forEach((n) => { if (n !== col) n.classList.remove('over'); });
    col.classList.add('over');
  });
  el.addEventListener('drop', (e) => {
    const col = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest?.('[data-col]'));
    const task = dragged && taskById(dragged);
    if (!col || !task) return;
    e.preventDefault();
    moveTo(task, col.dataset.col);
  });

  render();
  return { refresh: render, create: () => /** @type {HTMLElement|null} */ (el.querySelector('[data-quick] input'))?.focus() };
}
