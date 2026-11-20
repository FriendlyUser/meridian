// Habits: a week of check-ins per habit, with a streak and a strength score that
// forgives the odd missed day.

import { store } from '../core/store.js';
import { esc, today, addDays, startOfWeek, parseYmd, fmtDate, WEEKDAYS } from '../core/util.js';
import { COLORS, addHabit, habitDue, toggleHabit, habitStreak, habitBestStreak, habitStrength } from '../core/model.js';
import { icon } from '../ui/icons.js';
import { viewHead, swatches, colorVar } from '../ui/parts.js';
import { openModal, toast, confirmDialog } from '../ui/overlay.js';

let week = '';
let showArchived = false;

function scheduleText(h) {
  if (h.perWeek) return `${h.perWeek}× a week`;
  if (h.days.length === 7) return 'Every day';
  if (h.days.length === 5 && [1, 2, 3, 4, 5].every((d) => h.days.includes(d))) return 'Weekdays';
  if (!h.days.length) return 'No days set';
  return [...h.days].sort().map((d) => WEEKDAYS[d].slice(0, 3)).join(', ');
}
const unit = (h, n) => (h.perWeek ? `week${n === 1 ? '' : 's'}` : `day${n === 1 ? '' : 's'}`);

function row(h, days) {
  const day = today();
  const streak = habitStreak(h);
  const strength = Math.round(habitStrength(h) * 100);
  return `
    <div class="habit-row" style="--c: ${colorVar(h.color)}">
      <button class="habit-name" data-open="${h.id}" aria-label="${esc(h.name)}: details">
        <i class="dot"></i><span>${esc(h.name) || 'Untitled'}<small>${esc(scheduleText(h))}</small></span>
      </button>
      ${days.map((d) => `
        <button class="habit-cell ${h.log[d] ? 'done' : ''} ${habitDue(h, d) ? '' : 'off'}" data-habit="${h.id}" data-day="${d}" ${d > day ? 'disabled' : ''}
          aria-label="${esc(h.name)}, ${esc(fmtDate(d))}: ${h.log[d] ? 'done' : 'not done'}" aria-pressed="${!!h.log[d]}">${icon('check', 16)}</button>`).join('')}
      <div class="habit-stat"><b>${streak} ${unit(h, streak)}</b>${strength}% strong</div>
    </div>`;
}

function html() {
  const { weekStart } = store.data.settings;
  const thisWeek = startOfWeek(today(), weekStart);
  week ||= thisWeek;
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const active = store.data.habits.filter((h) => !h.archived);
  const archived = store.data.habits.filter((h) => h.archived);
  const dueToday = active.filter((h) => habitDue(h, today()));
  const doneToday = dueToday.filter((h) => h.log[today()]).length;
  const range = `${fmtDate(days[0], { weekday: false })} – ${fmtDate(days[6], { weekday: false })}`;
  const actions = `
    <button class="icon-btn" data-week="-7" aria-label="Previous week">${icon('left')}</button>
    <button class="btn" data-week="0" ${week === thisWeek ? 'disabled' : ''}>This week</button>
    <button class="icon-btn" data-week="7" aria-label="Next week" ${week >= thisWeek ? 'disabled' : ''}>${icon('right')}</button>
    <button class="btn primary" data-new aria-label="New habit">${icon('plus', 18)}<span class="only-desktop">Habit</span></button>`;
  return `
    ${viewHead('Habits', active.length ? `${esc(range)}${week === thisWeek && dueToday.length ? ` · ${doneToday} of ${dueToday.length} done today` : ''}` : '', actions)}
    ${active.length ? `
      <div class="habit-table">
        <div class="habit-row head" aria-hidden="true">
          <span></span>
          ${days.map((d) => `<span class="${d === today() ? 'is-today' : ''}">${WEEKDAYS[parseYmd(d).getDay()].slice(0, 2)}<b>${parseYmd(d).getDate()}</b></span>`).join('')}
          <span class="habit-stat">Streak</span>
        </div>
        ${active.map((h) => row(h, days)).join('')}
      </div>
      <p class="muted" style="margin-top:14px;font-size:13px">Tap a circle to check in. Dashed circles are days off. Strength climbs with every day kept and dips a little, not to zero, when one is missed.</p>`
      : `<div class="card empty"><b>No habits yet</b>Start with one small thing you want to do most days.<br><br><button class="btn primary" data-new>${icon('plus', 18)}Add a habit</button></div>`}
    ${archived.length ? `
      <div class="group-title" style="margin-top:22px"><button class="btn small quiet" data-archived style="margin-left:-8px">${icon(showArchived ? 'down' : 'right', 14)}Archived · ${archived.length}</button></div>
      ${showArchived ? `<div class="habit-table">${archived.map((h) => row(h, days)).join('')}</div>` : ''}` : ''}`;
}

function heatmap(h) {
  const { weekStart } = store.data.settings;
  const day = today();
  const start = addDays(startOfWeek(day, weekStart), -7 * 17);
  const cells = [];
  for (let d = start; d <= addDays(startOfWeek(day, weekStart), 6); d = addDays(d, 1)) {
    const state = d > day ? 'future' : h.log[d] ? 'done' : habitDue(h, d) ? '' : 'off';
    cells.push(`<i class="${state}" data-tip-value="${h.log[d] ? 'Done' : state === 'off' ? 'Day off' : 'Missed'}" data-tip="${esc(fmtDate(d))}"></i>`);
  }
  return `<div class="heat" style="--c: ${colorVar(h.color)}" role="img" aria-label="Check-ins over the last 18 weeks">${cells.join('')}</div>`;
}

function openHabit(habit, rerender, isNew = false) {
  const modal = openModal({
    title: isNew ? 'New habit' : 'Habit',
    body: '<div class="stack" data-body></div>',
    footer: `
      ${isNew ? '' : `<button class="btn danger quiet" data-delete>${icon('trash', 18)}Delete</button>
      <button class="btn quiet" data-archive>${icon('archive', 18)}${habit.archived ? 'Restore' : 'Archive'}</button>`}
      <span class="spacer"></span><button class="btn primary" data-close>${isNew ? 'Add habit' : 'Done'}</button>`,
    onClose: () => {
      if (!habit.name.trim()) {
        if (isNew) store.data.habits = store.data.habits.filter((x) => x !== habit); else habit.name = 'Untitled';
      }
      store.commit('habits');
      rerender();
    },
  });
  const body = /** @type {HTMLElement} */ (modal.body.querySelector('[data-body]'));
  const draw = () => {
    const streak = habitStreak(habit);
    const best = Math.max(streak, habitBestStreak(habit));
    const total = Object.keys(habit.log).length;
    body.innerHTML = `
      <input type="text" data-name value="${esc(habit.name)}" placeholder="Habit name, e.g. Read 10 pages" aria-label="Habit name" style="font-weight:600;font-size:17px">
      <div class="field">Colour${swatches(habit.color, COLORS)}</div>
      <div class="field">How often
        <div class="seg" style="justify-self:start">
          <button type="button" data-kind="days" class="${habit.perWeek ? '' : 'on'}">On set days</button>
          <button type="button" data-kind="week" class="${habit.perWeek ? 'on' : ''}">Times a week</button>
        </div>
        ${habit.perWeek
          ? `<div class="row" style="flex-wrap:wrap">${[1, 2, 3, 4, 5, 6].map((n) => `<button type="button" class="chip ${habit.perWeek === n ? 'on' : ''}" data-per="${n}">${n}×</button>`).join('')}</div>`
          : `<div class="row" style="flex-wrap:wrap">${[0, 1, 2, 3, 4, 5, 6].map((i) => (i + store.data.settings.weekStart) % 7).map((d) => `<button type="button" class="chip ${habit.days.includes(d) ? 'on' : ''}" data-dow="${d}" aria-pressed="${habit.days.includes(d)}">${WEEKDAYS[d].slice(0, 3)}</button>`).join('')}</div>`}
      </div>
      ${isNew ? '' : `
        <div class="stats">
          <div class="stat"><div class="stat-label">Current streak</div><div class="stat-value">${streak}</div><div class="stat-note">${unit(habit, streak)}</div></div>
          <div class="stat"><div class="stat-label">Best streak</div><div class="stat-value">${best}</div><div class="stat-note">${unit(habit, best)}</div></div>
          <div class="stat"><div class="stat-label">Check-ins</div><div class="stat-value">${total}</div><div class="stat-note">all time</div></div>
          <div class="stat"><div class="stat-label">Strength</div><div class="stat-value">${Math.round(habitStrength(habit) * 100)}%</div><div class="meter" style="margin-top:6px"><i style="width:${Math.round(habitStrength(habit) * 100)}%"></i></div></div>
        </div>
        <div><div class="chart-title">Last 18 weeks</div><div class="chart-sub">Each square is a day; each column a week.</div>${heatmap(habit)}</div>`}`;
  };
  draw();
  body.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.matches('[data-name]')) { habit.name = el.value; store.touch(); }
  });
  body.addEventListener('click', (e) => {
    const target = /** @type {Element} */ (e.target);
    const pick = (name) => /** @type {HTMLElement|null} */ (target.closest(`[data-${name}]`));
    if (pick('color')) habit.color = pick('color').dataset.color;
    else if (pick('kind')) habit.perWeek = pick('kind').dataset.kind === 'week' ? habit.perWeek || 3 : 0;
    else if (pick('per')) habit.perWeek = Number(pick('per').dataset.per);
    else if (pick('dow')) {
      const d = Number(pick('dow').dataset.dow);
      habit.days = habit.days.includes(d) ? habit.days.filter((x) => x !== d) : [...habit.days, d];
    } else return;
    store.touch();
    draw();
  });
  modal.el.querySelector('[data-archive]')?.addEventListener('click', () => {
    habit.archived = !habit.archived;
    modal.close();
    toast(habit.archived ? 'Habit archived. Its history is kept.' : 'Habit restored.');
  });
  modal.el.querySelector('[data-delete]')?.addEventListener('click', async () => {
    const n = Object.keys(habit.log).length;
    if (!(await confirmDialog(n ? `Its ${n} check-in${n === 1 ? '' : 's'} will be deleted too. Archive it instead to keep the history.` : 'This habit has no check-ins yet.', { title: `Delete “${habit.name}”?` }))) return;
    store.data.habits = store.data.habits.filter((x) => x !== habit);
    modal.close();
  });
}

export function mount(el) {
  week = startOfWeek(today(), store.data.settings.weekStart);
  const render = () => { el.innerHTML = html(); };
  const create = () => openHabit(addHabit(), render, true);

  el.addEventListener('click', (e) => {
    const target = /** @type {Element} */ (e.target);
    const pick = (name) => /** @type {HTMLElement|null} */ (target.closest(`[data-${name}]`));
    if (pick('habit')) {
      const habit = store.data.habits.find((x) => x.id === pick('habit').dataset.habit);
      if (!habit) return;
      const day = pick('habit').dataset.day;
      toggleHabit(habit, day);
      store.commit('habits');
      render();
      /** @type {HTMLElement|null} */ (el.querySelector(`[data-habit="${habit.id}"][data-day="${day}"]`))?.focus();
      return;
    }
    if (pick('open')) {
      const habit = store.data.habits.find((x) => x.id === pick('open').dataset.open);
      if (habit) openHabit(habit, render);
      return;
    }
    if (pick('week')) {
      const step = Number(pick('week').dataset.week);
      week = step ? addDays(week, step) : startOfWeek(today(), store.data.settings.weekStart);
      render();
      return;
    }
    if (pick('archived')) { showArchived = !showArchived; render(); return; }
    if (pick('new')) create();
  });

  render();
  return { refresh: render, create };
}
