// Progress: the level earned so far, the current run of active days, and what each
// recent day held. One range control scopes every chart on the page.

import { store } from '../core/store.js';
import { today, parseYmd, fmtDate, fmtDuration, WEEKDAYS } from '../core/util.js';
import { levelInfo, dayStats, dayStreak, XP } from '../core/model.js';
import { viewHead, barChart, lastDays } from '../ui/parts.js';

const RANGES = [7, 14, 30];

function html() {
  const u = store.data.ui;
  const range = RANGES.includes(u.progressRange) ? u.progressRange : 14;
  const lv = levelInfo();
  const days = lastDays(range).map(dayStats);
  const sum = (key) => days.reduce((n, d) => n + d[key], 0);
  const streak = dayStreak();
  const allTasks = store.data.tasks.filter((t) => t.done && !t.parentId).length;
  const allFocus = store.data.sessions.reduce((n, s) => n + s.minutes, 0);
  const allHabits = store.data.habits.reduce((n, h) => n + Object.keys(h.log).length, 0);

  const label = (d, i) => {
    const date = parseYmd(d.day);
    if (range <= 7) return WEEKDAYS[date.getDay()].slice(0, 2);
    // On longer ranges, name every few days so the labels have room.
    return (range - 1 - i) % (range > 14 ? 5 : 2) === 0 ? String(date.getDate()) : '';
  };
  const chart = (key, name, format) => barChart(
    days.map((d, i) => ({ label: label(d, i), value: d[key], tip: fmtDate(d.day), today: d.day === today() })),
    { name, format },
  );
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return `
    ${viewHead('Progress', 'What you have got done, all on this device.')}
    <div class="stats" style="margin-bottom:20px">
      <div class="stat hero" style="grid-column: span 2">
        <div class="stat-label">Level</div>
        <div class="stat-value">${lv.level}</div>
        <div class="meter" style="margin:8px 0 6px" role="img" aria-label="${Math.round(lv.pct * 100)}% of the way to level ${lv.level + 1}"><i style="width:${Math.round(lv.pct * 100)}%"></i></div>
        <div class="stat-note">${lv.xp.toLocaleString()} points · ${lv.toNext.toLocaleString()} to level ${lv.level + 1}</div>
      </div>
      <div class="stat"><div class="stat-label">Active days in a row</div><div class="stat-value">${streak}</div><div class="stat-note">${streak ? 'Keep it going' : 'Starts with one thing today'}</div></div>
      <div class="stat"><div class="stat-label">Tasks completed</div><div class="stat-value">${allTasks.toLocaleString()}</div><div class="stat-note">all time</div></div>
      <div class="stat"><div class="stat-label">Time focused</div><div class="stat-value">${fmtDuration(allFocus)}</div><div class="stat-note">all time</div></div>
      <div class="stat"><div class="stat-label">Habit check-ins</div><div class="stat-value">${allHabits.toLocaleString()}</div><div class="stat-note">all time</div></div>
    </div>
    <div class="row" style="margin-bottom:14px">
      <div class="seg" role="tablist" aria-label="Range">${RANGES.map((r) => `<button data-range="${r}" class="${r === range ? 'on' : ''}" role="tab" aria-selected="${r === range}">Last ${r} days</button>`).join('')}</div>
    </div>
    <div class="stack">
      <section class="card">
        <div class="chart-title">Tasks completed</div>
        <div class="chart-sub">${plural(sum('tasks'), 'task')} in the last ${range} days</div>
        ${chart('tasks', 'Tasks completed per day', (v) => plural(v, 'task'))}
      </section>
      <section class="card">
        <div class="chart-title">Focus time</div>
        <div class="chart-sub">${fmtDuration(sum('focus'))} in the last ${range} days</div>
        ${chart('focus', 'Focus minutes per day', (v) => `${v} min`)}
      </section>
      <section class="card">
        <div class="chart-title">Habits kept</div>
        <div class="chart-sub">${plural(sum('habits'), 'check-in')} in the last ${range} days</div>
        ${chart('habits', 'Habit check-ins per day', (v) => plural(v, 'check-in'))}
      </section>
    </div>
    <p class="muted" style="margin-top:16px;font-size:13px">Points: ${XP.task} for a task (${XP.task + XP.urgent} if urgent, ${XP.task + XP.high} if high priority), ${XP.subtask} for a step, ${XP.habit} for a habit check-in, ${XP.focusMinute} for each minute of a finished focus session.</p>`;
}

export function mount(el) {
  const render = () => { el.innerHTML = html(); };
  el.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('[data-range]'));
    if (!btn) return;
    store.data.ui.progressRange = Number(btn.dataset.range);
    store.touch();
    render();
  });
  render();
  return { refresh: render };
}
