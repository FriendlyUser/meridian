// Pieces more than one screen uses: the page header, task rows, quick add,
// the task and event editors, and the small bar chart.

import { store } from '../core/store.js';
import { esc, h, relDay, fmtTime, fmtDuration, today, addDays, toMinutes, fromMinutes } from '../core/util.js';
import { parseQuick } from '../core/quickadd.js';
import {
  COLORS, PRIORITIES, REPEATS, repeatKey, repeatFromKey, repeatLabel, repeatShort, listOf, taskById, subtasksOf, isOverdue,
  setTaskDone, deleteTask, addTask, focusMinutesFor, addEvent,
} from '../core/model.js';
import { icon } from './icons.js';
import { openModal, toast, confirmDialog } from './overlay.js';

const settings = () => store.data.settings;

/** The title row every screen starts with. On phones it also carries search and settings. */
export function viewHead(title, sub = '', actions = '') {
  return `
    <header class="view-head">
      <div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
      <div class="head-actions">${actions}
        <button class="icon-btn only-mobile" data-act="search" aria-label="Search">${icon('search')}</button>
        <button class="icon-btn only-mobile" data-act="settings" aria-label="Settings">${icon('settings')}</button>
      </div>
    </header>`;
}

export const colorVar = (name) => `var(--c-${COLORS.includes(name) ? name : 'blue'})`;

export function swatches(selected, names = COLORS, prefix = 'c') {
  return `<div class="swatches" role="radiogroup" aria-label="Colour">${names.map((n) =>
    `<button type="button" class="swatch ${n === selected ? 'on' : ''}" data-color="${n}" style="--c: var(--${prefix}-${n})" role="radio" aria-checked="${n === selected}" aria-label="${n}"></button>`).join('')}</div>`;
}

// ---- Task rows ------------------------------------------------------------------

function metaChips(t, { showList = true, showDue = true } = {}) {
  const out = [];
  const time = t.time ? fmtTime(t.time, settings().hour12) : '';
  if (t.due && showDue) out.push(`<span class="meta ${isOverdue(t) ? 'overdue' : ''}">${icon('calendar', 12)}${esc(relDay(t.due))}${time ? ` · ${time}` : ''}</span>`);
  else if (time) out.push(`<span class="meta">${icon('clock', 12)}${time}</span>`);
  if (t.duration) out.push(`<span class="meta">${fmtDuration(t.duration)}</span>`);
  if (t.repeat) out.push(`<span class="meta" title="${esc(repeatLabel(t.repeat))}">${icon('repeat', 12)}${esc(repeatShort(t.repeat))}</span>`);
  const subs = subtasksOf(t.id);
  if (subs.length) out.push(`<span class="meta">${icon('checklist', 12)}${subs.filter((s) => s.done).length}/${subs.length}</span>`);
  if (t.est) out.push(`<span class="meta" title="Focus sessions done / planned">${icon('focus', 12)}${Math.floor(focusMinutesFor(t.id) / settings().focus.work)}/${t.est}</span>`);
  if (showList && t.listId !== 'inbox') {
    const list = listOf(t.listId);
    out.push(`<span class="meta"><i class="dot" style="--c: ${colorVar(list.color)}"></i>${esc(list.name)}</span>`);
  }
  if (t.notes) out.push(`<span class="meta" title="Has notes">${icon('note', 12)}</span>`);
  return out.join('');
}

/** @param {any} t @param {{showList?: boolean, showDue?: boolean}} [opts] */
export function taskRow(t, opts = {}) {
  return `
    <div class="task p${t.priority} ${t.done ? 'done' : ''}" data-task="${t.id}">
      <button class="check" data-toggle aria-label="${t.done ? 'Mark as not done' : 'Mark as done'}: ${esc(t.title)}">${icon('check', 14)}</button>
      <div class="task-main" data-open role="button" tabindex="0">
        <div class="task-title">${esc(t.title) || '<span class="muted">Untitled</span>'}</div>
        <div class="task-meta">${metaChips(t, opts)}</div>
      </div>
      ${t.done ? '' : `<button class="icon-btn" data-focus title="Focus on this" aria-label="Focus on: ${esc(t.title)}">${icon('focus', 18)}</button>`}
    </div>`;
}

/** Tick or untick a task, with a toast that can take it back. */
export function toggleTask(task, source, rerender) {
  const done = !task.done;
  const repeat = task.repeat;
  const next = setTaskDone(task, done);
  store.commit(source);
  rerender();
  if (!done) return;
  toast(next ? `Done. Next one: ${relDay(next.due)}` : 'Task completed', {
    action: 'Undo',
    onAction: () => {
      setTaskDone(task, false);
      if (next) { deleteTask(next.id); task.repeat = repeat; }
      store.commit(source);
      rerender();
    },
  });
}

/**
 * Wire every task row inside `container` (now and after re-renders): tick, open, focus.
 * Call once per mount.
 */
export function bindTasks(container, source, rerender) {
  const act = (e) => {
    const target = /** @type {Element} */ (e.target);
    const row = /** @type {HTMLElement|null} */ (target.closest('[data-task]'));
    if (!row) return;
    const task = taskById(row.dataset.task);
    if (!task) return;
    if (target.closest('[data-toggle]')) toggleTask(task, source, rerender);
    else if (target.closest('[data-focus]')) {
      store.data.ui.focusTask = task.id;
      store.touch();
      location.hash = '#/focus';
    } else if (target.closest('[data-open]')) openTaskEditor(task, { onClose: rerender });
  };
  container.addEventListener('click', act);
  container.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && /** @type {Element} */ (e.target).matches('[data-open]')) { e.preventDefault(); act(e); }
  });
}

// ---- Quick add --------------------------------------------------------------------

export function quickAdd(placeholder) {
  return `
    <form class="quick" data-quick>
      ${icon('plus')}
      <input type="text" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="done" aria-label="Add a task">
      <div class="quick-hint" aria-live="polite"></div>
    </form>`;
}

/** What quick add understood from a line, as short labels. */
export function describeQuick(text) {
  const q = parseQuick(text);
  const out = [];
  if (q.date) out.push(`${relDay(q.date)}${q.time ? `, ${fmtTime(q.time, settings().hour12)}` : ''}${q.endTime ? ` – ${fmtTime(q.endTime, settings().hour12)}` : ''}`);
  if (q.repeat) out.push(repeatLabel(q.repeat));
  if (q.duration && !q.endTime) out.push(fmtDuration(q.duration));
  if (q.list) out.push(`#${q.list}`);
  if (q.priority) out.push(`${PRIORITIES[q.priority - 1].label} priority`);
  return out;
}

/** Call once per mount. `onAdd(text)` adds the thing and re-renders. */
export function bindQuickAdd(container, onAdd) {
  container.addEventListener('input', (e) => {
    const form = /** @type {Element} */ (e.target).closest('[data-quick]');
    if (!form) return;
    const text = /** @type {HTMLInputElement} */ (form.querySelector('input')).value;
    form.querySelector('.quick-hint').innerHTML = describeQuick(text).map((s) => `<span class="meta">${esc(s)}</span>`).join('');
  });
  container.addEventListener('submit', (e) => {
    const form = /** @type {Element} */ (e.target).closest('[data-quick]');
    if (!form) return;
    e.preventDefault();
    const text = /** @type {HTMLInputElement} */ (form.querySelector('input')).value.trim();
    if (!text) return;
    onAdd(text);
    /** @type {HTMLInputElement|null} */ (container.querySelector('[data-quick] input'))?.focus();
  });
}

// ---- Task editor ------------------------------------------------------------------

const DURATIONS = [0, 15, 30, 45, 60, 90, 120, 180, 240];
const option = (value, label, selected) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;

/** @param {any} task @param {{ onClose?: () => void }} [options] */
export function openTaskEditor(task, { onClose } = {}) {
  const lists = store.data.lists;
  const durations = DURATIONS.includes(task.duration || 0) ? DURATIONS : [...DURATIONS, task.duration].sort((a, b) => a - b);
  const repeats = REPEATS.some((r) => r.key === repeatKey(task.repeat)) ? REPEATS : [...REPEATS, { key: repeatKey(task.repeat), label: repeatLabel(task.repeat) }];

  const modal = openModal({
    title: task.done ? 'Completed task' : 'Task',
    body: `
      <div class="stack">
        <input type="text" data-f="title" value="${esc(task.title)}" placeholder="Task name" aria-label="Task name" style="font-weight:600;font-size:17px">
        <div class="field">Priority
          <div class="seg" data-priority>${PRIORITIES.map((p) => `<button type="button" data-p="${p.value}" class="${task.priority === p.value ? 'on' : ''}">${p.value < 4 ? icon('flag', 14) : ''}${p.label}</button>`).join('')}</div>
        </div>
        <div class="fields pair">
          <label class="field">Day<input type="date" data-f="due" value="${esc(task.due || '')}"></label>
          <label class="field">Time<input type="time" data-f="time" value="${esc(task.time || '')}"></label>
          <label class="field">Length<select data-f="duration">${durations.map((d) => option(d, d ? fmtDuration(d) : 'Not set', (task.duration || 0) === d)).join('')}</select></label>
          <label class="field">Repeat<select data-f="repeat">${repeats.map((r) => option(r.key, r.label, r.key === repeatKey(task.repeat))).join('')}</select></label>
          <label class="field">List<select data-f="listId">${lists.map((l) => option(l.id, l.name, l.id === task.listId)).join('')}</select></label>
          <label class="field">Focus sessions planned<input type="number" data-f="est" min="0" max="20" value="${Number(task.est) || 0}" inputmode="numeric"></label>
        </div>
        <label class="field">Notes<textarea data-f="notes" placeholder="Details, links, anything">${esc(task.notes)}</textarea></label>
        <div class="field">Steps
          <div data-subs></div>
          <input type="text" data-newsub placeholder="Add a step and press Enter" enterkeyhint="done" aria-label="Add a step">
        </div>
      </div>`,
    footer: `
      <button class="btn danger quiet" data-delete>${icon('trash', 18)}Delete</button>
      <span class="spacer"></span>
      <button class="btn" data-done>${task.done ? 'Mark not done' : `${icon('check', 18)}Complete`}</button>
      <button class="btn primary" data-close>Done</button>`,
    onClose: () => {
      if (!task.title.trim() && store.data.tasks.includes(task)) task.title = 'Untitled';
      store.commit('editor');
      onClose?.();
    },
  });

  const subsEl = modal.body.querySelector('[data-subs]');
  const drawSubs = () => {
    subsEl.innerHTML = subtasksOf(task.id).map((s) => `
      <div class="item-row ${s.done ? 'done' : ''}" data-sub="${s.id}">
        <input type="checkbox" ${s.done ? 'checked' : ''} aria-label="Done">
        <input type="text" value="${esc(s.title)}" aria-label="Step">
        <button type="button" class="icon-btn" data-remove aria-label="Remove step">${icon('x', 16)}</button>
      </div>`).join('');
  };
  drawSubs();

  modal.body.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const f = el.dataset.f;
    if (f === 'title' || f === 'notes') task[f] = el.value;
    else if (f === 'due') { task.due = el.value || null; if (task.due) task.myDay = null; }
    else if (f === 'time') task.time = el.value || null;
    else if (f === 'duration') task.duration = Number(el.value) || null;
    else if (f === 'repeat') { task.repeat = repeatFromKey(el.value); if (task.repeat && !task.due) { task.due = today(); /** @type {HTMLInputElement} */ (modal.body.querySelector('[data-f="due"]')).value = task.due; } }
    else if (f === 'listId') task.listId = el.value;
    else if (f === 'est') task.est = Math.max(0, Math.min(20, Math.round(Number(el.value) || 0)));
    else {
      const row = /** @type {HTMLElement|null} */ (el.closest('[data-sub]'));
      const sub = row && taskById(row.dataset.sub);
      if (!sub) return;
      if (el.type === 'checkbox') { setTaskDone(sub, el.checked); row.classList.toggle('done', el.checked); } else sub.title = el.value;
    }
    store.touch();
  });
  modal.body.addEventListener('click', (e) => {
    const target = /** @type {Element} */ (e.target);
    const p = /** @type {HTMLElement|null} */ (target.closest('[data-p]'));
    if (p) {
      task.priority = Number(p.dataset.p);
      modal.body.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('on', b === p));
      store.touch();
    }
    const remove = target.closest('[data-remove]');
    if (remove) {
      deleteTask(/** @type {HTMLElement} */ (remove.closest('[data-sub]')).dataset.sub);
      store.touch();
      drawSubs();
    }
  });
  const newSub = /** @type {HTMLInputElement} */ (modal.body.querySelector('[data-newsub]'));
  newSub.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const title = newSub.value.trim();
    if (!title) return;
    addTask({ title, parentId: task.id, listId: task.listId });
    store.touch();
    newSub.value = '';
    drawSubs();
  });
  modal.el.querySelector('[data-delete]').addEventListener('click', async () => {
    const steps = subtasksOf(task.id).length;
    if (steps && !(await confirmDialog(`"${task.title}" and its ${steps} step${steps === 1 ? '' : 's'} will be deleted.`, { title: 'Delete this task?' }))) return;
    const kept = store.data.tasks.filter((t) => t.id === task.id || t.parentId === task.id);
    deleteTask(task.id);
    modal.close();
    toast('Task deleted', { action: 'Undo', onAction: () => { store.data.tasks.push(...kept); store.commit('editor'); onClose?.(); } });
  });
  modal.el.querySelector('[data-done]').addEventListener('click', () => {
    modal.close();
    toggleTask(task, 'editor', () => onClose?.());
  });
  return modal;
}

// ---- Event editor -----------------------------------------------------------------

/**
 * Edit an event, or make one: pass `null` and the starting values.
 * @param {any} event
 * @param {{ defaults?: Record<string, any>, onClose?: () => void }} [options]
 */
export function openEventEditor(event, { defaults = {}, onClose } = {}) {
  const isNew = !event;
  const ev = event ? { ...event } : { title: '', date: today(), endDate: null, start: null, end: null, color: 'blue', notes: '', place: '', repeat: null, ...defaults };
  const allDay = !ev.start;
  const modal = openModal({
    title: isNew ? 'New event' : 'Event',
    body: `
      <form class="stack" data-form>
        <input type="text" name="title" value="${esc(ev.title)}" placeholder="Event name" aria-label="Event name" style="font-weight:600;font-size:17px" autofocus>
        <label class="row" style="gap:8px"><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent)"> All day</label>
        <div class="fields pair">
          <label class="field">Day<input type="date" name="date" value="${esc(ev.date)}" required></label>
          <label class="field" data-when="allday">Until<input type="date" name="endDate" value="${esc(ev.endDate || '')}"></label>
          <label class="field" data-when="timed">Starts<input type="time" name="start" value="${esc(ev.start || '09:00')}"></label>
          <label class="field" data-when="timed">Ends<input type="time" name="end" value="${esc(ev.end || '10:00')}"></label>
          <label class="field">Repeat<select name="repeat">${REPEATS.map((r) => option(r.key, r.label, r.key === repeatKey(ev.repeat))).join('')}</select></label>
          <label class="field">Place<input type="text" name="place" value="${esc(ev.place)}" placeholder="Optional"></label>
        </div>
        <div class="field">Colour${swatches(ev.color)}</div>
        <label class="field">Notes<textarea name="notes" placeholder="Optional">${esc(ev.notes)}</textarea></label>
      </form>`,
    footer: `
      ${isNew ? '' : `<button class="btn danger quiet" data-delete>${icon('trash', 18)}Delete</button>`}
      <span class="spacer"></span>
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" data-save>${isNew ? 'Add event' : 'Save'}</button>`,
  });
  const form = /** @type {HTMLFormElement} */ (modal.body.querySelector('[data-form]'));
  const field = (name) => /** @type {HTMLInputElement} */ (form.elements.namedItem(name));
  const sync = () => {
    const all = field('allDay').checked;
    form.querySelectorAll('[data-when]').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = (/** @type {HTMLElement} */ (el).dataset.when === 'allday') !== all; });
  };
  sync();
  field('allDay').addEventListener('change', sync);
  field('start').addEventListener('change', () => {
    // Keep the end an hour after the start unless it was already later.
    if (toMinutes(field('end').value || '00:00') <= toMinutes(field('start').value)) field('end').value = fromMinutes(toMinutes(field('start').value) + 60);
  });
  let color = ev.color;
  form.addEventListener('click', (e) => {
    const sw = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('[data-color]'));
    if (!sw) return;
    color = sw.dataset.color;
    form.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b === sw));
  });
  const save = (e) => {
    e?.preventDefault();
    if (!field('date').value) { field('date').focus(); return; }
    const all = field('allDay').checked;
    const values = {
      title: field('title').value.trim() || 'Untitled event',
      date: field('date').value,
      endDate: all && field('endDate').value > field('date').value ? field('endDate').value : null,
      start: all ? null : field('start').value || '09:00',
      end: all ? null : field('end').value || null,
      repeat: repeatFromKey(field('repeat').value),
      place: field('place').value.trim(),
      notes: field('notes').value,
      color,
    };
    if (values.start && values.end && values.end <= values.start) values.end = null;
    if (isNew) addEvent(values); else Object.assign(event, values);
    store.commit('editor');
    modal.close();
    onClose?.();
  };
  form.addEventListener('submit', save);
  modal.el.querySelector('[data-save]').addEventListener('click', save);
  modal.el.querySelector('[data-delete]')?.addEventListener('click', () => {
    store.data.events = store.data.events.filter((x) => x !== event);
    store.commit('editor');
    modal.close();
    onClose?.();
    toast('Event deleted', { action: 'Undo', onAction: () => { store.data.events.push(event); store.commit('editor'); onClose?.(); } });
  });
  return modal;
}

// ---- Bar chart --------------------------------------------------------------------

function niceMax(v) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 4, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

/**
 * One series of columns. Every column can be hovered or tabbed to for its value,
 * so nothing is readable only by eye.
 * @param {Array<{label: string, value: number, tip: string, today?: boolean}>} points
 * @param {{ name: string, format?: (v: number) => string }} options
 */
export function barChart(points, { name, format = String }) {
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  return `
    <div class="chart" role="group" aria-label="${esc(name)}">
      <span class="chart-max" aria-hidden="true">${esc(format(max))}</span>
      <div class="bars">${points.map((p) => `
        <button type="button" class="bar-col ${p.value ? '' : 'zero'}" data-tip-value="${esc(format(p.value))}" data-tip="${esc(p.tip)}" aria-label="${esc(p.tip)}: ${esc(format(p.value))}">
          <i class="bar" style="height:${Math.min(100, (p.value / max) * 100)}%"></i>
        </button>`).join('')}
      </div>
      <div class="bar-x" aria-hidden="true">${points.map((p) => `<span class="${p.today ? 'is-today' : ''}">${esc(p.label)}</span>`).join('')}</div>
    </div>`;
}

/** The last `n` days ending today, oldest first. */
export const lastDays = (n) => Array.from({ length: n }, (_, i) => addDays(today(), i - n + 1));

export { h };
