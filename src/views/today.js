// Today: the day as a timeline, what is left to do, and what could be pulled in.
// The week strip moves it to any other day.

import { store } from '../core/store.js';
import { esc, today, addDays, startOfWeek, fmtDate, fmtTime, fmtDuration, relDay, parseYmd, toMinutes, WEEKDAYS } from '../core/util.js';
import {
  addTaskFromText, tasksOn, topTasks, taskById, isOverdue, sortTasks, eventsOn, habitDue, toggleHabit,
  levelInfo, sessionsOn, listOf,
} from '../core/model.js';
import { icon } from '../ui/icons.js';
import { viewHead, taskRow, bindTasks, quickAdd, bindQuickAdd, openEventEditor, colorVar } from '../ui/parts.js';
import { hasOverlay } from '../ui/overlay.js';

let sel = today();

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Still up' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

function weekStrip() {
  const start = startOfWeek(sel, store.data.settings.weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return `
    <div class="week-strip">
      <button class="icon-btn" data-shift="-7" aria-label="Previous week">${icon('left')}</button>
      ${days.map((d) => {
        const count = eventsOn(d).length + tasksOn(d).filter((t) => !t.done).length;
        const date = parseYmd(d);
        return `<button class="day ${d === sel ? 'sel' : ''} ${d === today() ? 'today' : ''}" data-day="${d}" aria-label="${esc(fmtDate(d, { long: true }))}, ${count} item${count === 1 ? '' : 's'}" aria-pressed="${d === sel}">
          <small>${WEEKDAYS[date.getDay()].slice(0, 3)}</small><b>${date.getDate()}</b>
          <span class="pips">${[0, 1, 2].map((i) => `<i class="${i < count ? 'has' : ''}"></i>`).join('')}</span>
        </button>`;
      }).join('')}
      <button class="icon-btn" data-shift="7" aria-label="Next week">${icon('right')}</button>
    </div>`;
}

function timeline() {
  const { hour12 } = store.data.settings;
  const events = eventsOn(sel);
  const allDay = events.filter((e) => !e.start);
  const blocks = [
    ...events.filter((e) => e.start).map((e) => ({
      kind: 'event', id: e.id, title: e.title, start: toMinutes(e.start),
      end: e.end ? toMinutes(e.end) : toMinutes(e.start) + 60, color: colorVar(e.color), sub: e.place, done: false, priority: 4,
    })),
    ...tasksOn(sel).filter((t) => t.time).map((t) => ({
      kind: 'task', id: t.id, title: t.title, start: toMinutes(t.time), end: toMinutes(t.time) + (t.duration || 30),
      color: colorVar(listOf(t.listId).color), sub: t.listId === 'inbox' ? '' : listOf(t.listId).name, done: t.done, priority: t.priority,
    })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = sel === today();
  let nowDrawn = !showNow;
  const nowLine = () => { nowDrawn = true; return `<div class="tl-now">Now · ${fmtTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, hour12)}</div>`; };

  const rows = [];
  let cursor = null;
  for (const b of blocks) {
    if (!nowDrawn && b.start > nowMin) rows.push(nowLine());
    if (cursor !== null && b.start - cursor >= 30) rows.push(`<div class="tl-gap">${fmtDuration(b.start - cursor)} free</div>`);
    const hm = `${String(Math.floor(b.start / 60)).padStart(2, '0')}:${String(b.start % 60).padStart(2, '0')}`;
    rows.push(`
      <div class="tl-item" style="--c: ${b.color}">
        <div class="tl-time">${fmtTime(hm, hour12)}<small>${fmtDuration(Math.max(5, b.end - b.start))}</small></div>
        <div class="tl-rail"><i></i></div>
        ${b.kind === 'task'
          ? `<div class="tl-card ${b.done ? 'done' : ''} p${b.priority}" data-task="${b.id}">
              <button class="check" data-toggle aria-label="${b.done ? 'Mark as not done' : 'Mark as done'}: ${esc(b.title)}">${icon('check', 14)}</button>
              <div class="grow" data-open role="button" tabindex="0"><div class="tl-title">${esc(b.title)}</div>${b.sub ? `<div class="tl-sub">${esc(b.sub)}</div>` : ''}</div>
            </div>`
          : `<div class="tl-card" data-ev="${b.id}" role="button" tabindex="0">
              <div class="grow"><div class="tl-title">${esc(b.title)}</div>${b.sub ? `<div class="tl-sub">${icon('place', 12)} ${esc(b.sub)}</div>` : ''}</div>
            </div>`}
      </div>`);
    cursor = Math.max(cursor ?? 0, b.end);
  }
  if (!nowDrawn && blocks.length) rows.push(nowLine());

  return `
    <section class="card">
      <div class="card-title">${icon('clock', 18)} Timeline
        <button class="btn small" data-new-event>${icon('plus', 16)}Event</button>
      </div>
      ${allDay.length ? `<div class="allday">${allDay.map((e) => `<span class="meta" data-ev="${e.id}" style="--c: ${colorVar(e.color)}" role="button" tabindex="0">${esc(e.title)}</span>`).join('')}</div>` : ''}
      ${rows.length
        ? `<div class="timeline">${rows.join('')}</div>`
        : `<div class="empty"><b>Nothing on the clock</b>Give a task a time, or add an event, and it lands here.</div>`}
    </section>`;
}

function sidePanel() {
  const day = today();
  const isToday = sel === day;
  const mine = sortTasks(tasksOn(sel).filter((t) => !t.time));
  const open = mine.filter((t) => !t.done);
  const done = mine.filter((t) => t.done);
  const overdue = isToday ? sortTasks(topTasks().filter((t) => isOverdue(t, day) && t.myDay !== day)) : [];
  const suggestions = isToday
    ? sortTasks(topTasks().filter((t) => !t.done && t.myDay !== day && (!t.due || t.due > day)
        && (t.priority <= 2 || (t.due && t.due <= addDays(day, 3))))).slice(0, 4)
    : [];
  const habits = store.data.habits.filter((h) => !h.archived && habitDue(h, sel));
  const sessions = sessionsOn(sel);
  const minutes = sessions.reduce((n, s) => n + s.minutes, 0);

  return `
    ${overdue.length ? `
      <section class="card">
        <div class="group-title overdue">Overdue · ${overdue.length}<button class="btn small" data-reschedule>Move all to today</button></div>
        ${overdue.map((t) => taskRow(t)).join('')}
      </section>` : ''}
    <section class="card">
      <div class="card-title">${icon('tasks', 18)} ${isToday ? 'To do today' : `To do ${esc(relDay(sel))}`} <span class="muted">${open.length ? `${open.length} left` : ''}</span></div>
      ${mine.length
        ? open.map((t) => taskRow(t, { showDue: false })).join('') + done.map((t) => taskRow(t, { showDue: false })).join('')
        : `<div class="empty"><b>${isToday ? 'A clear day' : 'Nothing planned'}</b>Add a task above${isToday ? ', or pick one from the suggestions.' : '.'}</div>`}
    </section>
    ${suggestions.length ? `
      <section class="card">
        <div class="card-title">${icon('bolt', 18)} Suggestions <span class="muted">due soon or important</span></div>
        ${suggestions.map((t) => `
          <div class="row" style="gap:4px">
            <div class="grow">${taskRow(t)}</div>
            <button class="btn small" data-myday="${t.id}" aria-label="Add to today: ${esc(t.title)}">${icon('plus', 14)}Today</button>
          </div>`).join('')}
      </section>` : ''}
    ${habits.length ? `
      <section class="card">
        <div class="card-title">${icon('habits', 18)} Habits <a class="btn small quiet" href="#/habits">All habits</a></div>
        <div class="habit-chips">${habits.map((h) => `
          <button class="habit-chip ${h.log[sel] ? 'done' : ''}" data-habit="${h.id}" style="--c: ${colorVar(h.color)}" aria-pressed="${!!h.log[sel]}" ${sel > day ? 'disabled' : ''}>
            <i>${icon('check', 12)}</i>${esc(h.name)}
          </button>`).join('')}</div>
      </section>` : ''}
    <section class="card">
      <div class="card-title">${icon('focus', 18)} Focus <a class="btn small" href="#/focus">${icon('play', 14)}Start</a></div>
      <p class="muted">${minutes ? `<b style="color:var(--ink)">${fmtDuration(minutes)}</b> focused in ${sessions.length} session${sessions.length === 1 ? '' : 's'}.` : isToday ? 'No focus sessions yet today.' : 'No focus sessions this day.'}</p>
    </section>`;
}

function html() {
  const isToday = sel === today();
  const lv = levelInfo();
  const level = `
    <a class="level-chip" href="#/progress" title="${lv.toNext} points to level ${lv.level + 1}">
      <b>Level ${lv.level}</b>
      <span class="meter" style="width:64px" role="img" aria-label="${Math.round(lv.pct * 100)}% of the way to level ${lv.level + 1}"><i style="width:${Math.round(lv.pct * 100)}%"></i></span>
      <small>${lv.xp} pts</small>
    </a>`;
  return `
    ${viewHead(isToday ? greeting() : fmtDate(sel, { long: true }), isToday ? esc(fmtDate(sel, { long: true })) : `${esc(relDay(sel))} · <a href="#/today" data-day="${today()}">Back to today</a>`, level)}
    ${weekStrip()}
    ${quickAdd(`Add a task for ${isToday ? 'today' : relDay(sel)} — try “Call Sam 3pm #work !1”`)}
    <div class="today-grid">
      ${timeline()}
      <div class="stack">${sidePanel()}</div>
    </div>`;
}

export function mount(el) {
  sel = today();
  const render = () => { el.innerHTML = html(); };

  bindTasks(el, 'today', render);
  bindQuickAdd(el, (text) => {
    const task = addTaskFromText(text);
    if (task && !task.due) task.due = sel;
    store.commit('today');
    render();
  });

  const open = (e) => {
    const target = /** @type {Element} */ (e.target);
    const pick = (name) => /** @type {HTMLElement|null} */ (target.closest(`[data-${name}]`));
    if (pick('day')) { e.preventDefault(); sel = pick('day').dataset.day; render(); return; }
    if (pick('shift')) { sel = addDays(sel, Number(pick('shift').dataset.shift)); render(); return; }
    if (pick('ev')) {
      const ev = store.data.events.find((x) => x.id === pick('ev').dataset.ev);
      if (ev) openEventEditor(ev, { onClose: render });
      return;
    }
    if (pick('new-event')) { openEventEditor(null, { defaults: { date: sel, start: '09:00', end: '10:00' }, onClose: render }); return; }
    if (pick('habit')) {
      const habit = store.data.habits.find((x) => x.id === pick('habit').dataset.habit);
      if (habit) { toggleHabit(habit, sel); store.commit('today'); render(); }
      return;
    }
    if (pick('myday')) {
      const task = taskById(pick('myday').dataset.myday);
      if (task) { task.myDay = today(); store.commit('today'); render(); }
      return;
    }
    if (pick('reschedule')) {
      for (const t of topTasks()) if (isOverdue(t)) t.due = today();
      store.commit('today');
      render();
    }
  };
  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && /** @type {Element} */ (e.target).matches('[data-ev]')) { e.preventDefault(); open(e); }
  });

  render();
  // Keep the "now" line honest, but never redraw under someone's typing.
  const clock = setInterval(() => { if (!hasOverlay() && !el.contains(document.activeElement)) render(); }, 60000);
  return {
    refresh: render,
    destroy: () => clearInterval(clock),
    create: () => /** @type {HTMLElement|null} */ (el.querySelector('[data-quick] input'))?.focus(),
  };
}
