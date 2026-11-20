// What the app's things are and how they behave: tasks and their repeats, events,
// habits and their streaks, focus sessions, and the points they earn. No DOM here,
// so the same rules run in the headless tests.

import { store } from './store.js';
import { uid, today, ymd, addDays, addMonths, parseYmd, diffDays, startOfWeek } from './util.js';
import { parseQuick } from './quickadd.js';

/** The six identity colours a list, event or habit can wear (css: --c-<name>). */
export const COLORS = ['blue', 'orange', 'mint', 'gold', 'pink', 'violet'];
/** Note papers (css: --tint-<name>). */
export const TINTS = ['none', 'sand', 'peach', 'rose', 'lilac', 'sky', 'mint', 'lemon'];

export const PRIORITIES = [
  { value: 1, label: 'Urgent' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'None' },
];

export const REPEATS = [
  { key: '', label: 'Does not repeat', value: null },
  { key: 'day1', label: 'Every day', value: { unit: 'day', n: 1 } },
  { key: 'weekday1', label: 'Every weekday', value: { unit: 'weekday', n: 1 } },
  { key: 'week1', label: 'Every week', value: { unit: 'week', n: 1 } },
  { key: 'week2', label: 'Every 2 weeks', value: { unit: 'week', n: 2 } },
  { key: 'month1', label: 'Every month', value: { unit: 'month', n: 1 } },
  { key: 'year1', label: 'Every year', value: { unit: 'year', n: 1 } },
];
export const repeatKey = (r) => (r ? `${r.unit}${r.n}` : '');
export function repeatLabel(r) {
  if (!r) return '';
  const known = REPEATS.find((x) => x.key === repeatKey(r));
  return known ? known.label : `Every ${r.n} ${r.unit}s`;
}
/** The same in a word or two, for the small labels on a task. */
export function repeatShort(r) {
  if (!r) return '';
  const one = { day: 'Daily', weekday: 'Weekdays', week: 'Weekly', month: 'Monthly', year: 'Yearly' };
  return r.n === 1 || r.unit === 'weekday' ? one[r.unit] || '' : `Every ${r.n} ${r.unit}s`;
}
export const repeatFromKey = (key) => {
  const known = REPEATS.find((x) => x.key === key);
  if (known) return known.value ? { ...known.value } : null;
  const m = /^(day|weekday|week|month|year)(\d+)$/.exec(key);
  return m ? { unit: m[1], n: Number(m[2]) } : null;
};

// ---- Points and levels -------------------------------------------------------

export const XP = { task: 10, urgent: 5, high: 3, subtask: 2, habit: 5, focusMinute: 1 };

export function award(n) {
  const p = store.data.profile;
  p.xp = Math.max(0, Math.round((p.xp || 0) + n));
}

/** Level L starts at 50·L·(L−1) points: 0, 100, 300, 600, 1000… */
export function levelInfo(xp = store.data.profile.xp || 0) {
  const level = Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2);
  const floor = 50 * level * (level - 1);
  const span = 100 * level;
  return { level, xp, into: xp - floor, span, toNext: floor + span - xp, pct: (xp - floor) / span };
}

// ---- Lists -------------------------------------------------------------------

export const listOf = (id) => store.data.lists.find((l) => l.id === id) || store.data.lists[0];

export function addList(name, color) {
  const list = { id: uid(), name: name.trim() || 'New list', color: color || COLORS[store.data.lists.length % COLORS.length] };
  store.data.lists.push(list);
  return list;
}

/** The list a typed #tag means: one whose name starts with it, else a new one. */
export function listByToken(token) {
  const want = token.toLowerCase().replace(/[-_]/g, ' ');
  const squash = (s) => s.toLowerCase().replace(/[-_\s]+/g, ' ').trim();
  const hit = store.data.lists.find((l) => squash(l.name) === want) || store.data.lists.find((l) => squash(l.name).startsWith(want));
  return hit || addList(token.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase()));
}

export function deleteList(id) {
  if (id === 'inbox') return;
  for (const t of store.data.tasks) if (t.listId === id) t.listId = 'inbox';
  store.data.lists = store.data.lists.filter((l) => l.id !== id);
}

// ---- Tasks -------------------------------------------------------------------

export function addTask(fields = {}) {
  const task = {
    id: uid(), listId: 'inbox', title: '', notes: '', due: null, time: null, duration: null, priority: 4,
    done: false, doneAt: null, parentId: null, order: Date.now(), repeat: null, est: 0, status: 'todo',
    myDay: null, created: Date.now(), ...fields,
  };
  store.data.tasks.push(task);
  return task;
}

/** Add a task from a typed line, reading its day, time, repeat, #list and priority. */
export function addTaskFromText(text, defaults = {}) {
  const q = parseQuick(text);
  const title = q.title || String(text).trim();
  if (!title) return null;
  /** @type {Record<string, any>} */
  const fields = { ...defaults, title };
  if (q.date) fields.due = q.date;
  if (q.time) fields.time = q.time;
  if (q.duration) fields.duration = q.duration;
  if (q.priority) fields.priority = q.priority;
  if (q.repeat) fields.repeat = q.repeat;
  if (q.list) fields.listId = listByToken(q.list).id;
  if (fields.repeat && !fields.due) fields.due = today();
  return addTask(fields);
}

export const taskById = (id) => store.data.tasks.find((t) => t.id === id);
export const subtasksOf = (id) => store.data.tasks.filter((t) => t.parentId === id).sort((a, b) => a.order - b.order);
export const topTasks = () => store.data.tasks.filter((t) => !t.parentId);
export const isOverdue = (t, day = today()) => !t.done && !!t.due && t.due < day;

export function deleteTask(id) {
  store.data.tasks = store.data.tasks.filter((t) => t.id !== id && t.parentId !== id);
}

/** The next day a repeating task falls due, always after `from`. */
export function nextDue(due, repeat, from = today()) {
  const step = (s) => {
    switch (repeat.unit) {
      case 'day': return addDays(s, repeat.n);
      case 'weekday': {
        let d = addDays(s, 1);
        while ([0, 6].includes(parseYmd(d).getDay())) d = addDays(d, 1);
        return d;
      }
      case 'week': return addDays(s, 7 * repeat.n);
      case 'month': return addMonths(s, repeat.n);
      default: return addMonths(s, 12 * repeat.n);
    }
  };
  let d = due || from;
  let guard = 0;
  do { d = step(d); } while (d <= from && ++guard < 5000);
  return d;
}

const taskPoints = (t) => (t.parentId ? XP.subtask : XP.task + (t.priority === 1 ? XP.urgent : t.priority === 2 ? XP.high : 0));

/**
 * Tick or untick a task. Finishing a repeating task leaves it in the history and
 * returns the next one, which has just been added.
 */
export function setTaskDone(task, done) {
  if (!!task.done === done) return null;
  task.done = done;
  task.doneAt = done ? Date.now() : null;
  if (done) task.status = 'done';
  else if (task.status === 'done') task.status = 'todo';
  award(done ? taskPoints(task) : -taskPoints(task));
  if (!done || task.parentId) return null;

  let next = null;
  if (task.repeat) {
    const { id, done: _d, doneAt: _a, created: _c, order: _o, status: _s, myDay: _m, ...rest } = task;
    next = addTask({ ...rest, repeat: { ...task.repeat }, due: nextDue(task.due, task.repeat) });
    for (const s of subtasksOf(task.id)) addTask({ title: s.title, parentId: next.id, listId: s.listId, order: s.order });
    task.repeat = null; // the finished one is history now
  }
  for (const s of subtasksOf(task.id)) {
    if (!s.done) { s.done = true; s.doneAt = Date.now(); s.status = 'done'; }
  }
  return next;
}

const NEVER = '9999-12-31';
/** By day, then time, then priority, then the order they were added. */
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) =>
    (a.due || NEVER).localeCompare(b.due || NEVER)
    || (a.time || '99:99').localeCompare(b.time || '99:99')
    || a.priority - b.priority
    || a.order - b.order);
}

/** Eisenhower quadrant: 0 do first, 1 schedule, 2 quick wins, 3 later. */
export function quadrant(t, day = today()) {
  const important = t.priority <= 2;
  const urgent = !!t.due && diffDays(t.due, day) <= 1;
  return important ? (urgent ? 0 : 1) : urgent ? 2 : 3;
}

/** Tasks that belong to a day's plan: due then, or picked for it. */
export const tasksOn = (day) => topTasks().filter((t) => t.due === day || t.myDay === day);

// ---- Events ------------------------------------------------------------------

export function addEvent(fields = {}) {
  const event = {
    id: uid(), title: '', date: today(), endDate: null, start: null, end: null, color: 'blue',
    notes: '', place: '', repeat: null, ...fields,
  };
  store.data.events.push(event);
  return event;
}

function startsOn(ev, day) {
  if (day === ev.date) return true;
  if (!ev.repeat || day < ev.date) return false;
  const a = parseYmd(ev.date);
  const b = parseYmd(day);
  const n = ev.repeat.n || 1;
  const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  switch (ev.repeat.unit) {
    case 'day': return diffDays(day, ev.date) % n === 0;
    case 'weekday': return b.getDay() >= 1 && b.getDay() <= 5;
    case 'week': return diffDays(day, ev.date) % (7 * n) === 0;
    case 'month': return a.getDate() === b.getDate() && months % n === 0;
    case 'year': return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && (months / 12) % n === 0;
    default: return false;
  }
}

/** Does this event (or one of its repeats) cover the day? */
export function occursOn(ev, day) {
  const span = ev.endDate && ev.endDate > ev.date ? diffDays(ev.endDate, ev.date) : 0;
  for (let k = 0; k <= span; k++) if (startsOn(ev, addDays(day, -k))) return true;
  return false;
}

export const eventsOn = (day) =>
  store.data.events.filter((e) => occursOn(e, day)).sort((a, b) => (a.start || '').localeCompare(b.start || '') || a.title.localeCompare(b.title));

// ---- Notes -------------------------------------------------------------------

export function addNote(fields = {}) {
  const note = {
    id: uid(), title: '', body: '', items: null, color: 'none', pinned: false, archived: false,
    date: null, locked: null, created: Date.now(), updated: Date.now(), ...fields,
  };
  store.data.notes.unshift(note);
  return note;
}

export const noteIsEmpty = (n) => !n.locked && !n.title.trim() && !n.body.trim() && !(n.items || []).some((i) => i.text.trim());

// ---- Habits ------------------------------------------------------------------

export function addHabit(fields = {}) {
  const habit = {
    id: uid(), name: '', color: COLORS[store.data.habits.length % COLORS.length], days: [0, 1, 2, 3, 4, 5, 6],
    perWeek: 0, log: {}, archived: false, created: Date.now(), ...fields,
  };
  store.data.habits.push(habit);
  return habit;
}

const dow = (day) => parseYmd(day).getDay();
/** Is the habit meant for this day? "3 times a week" habits can be done on any day. */
export const habitDue = (h, day) => (h.perWeek ? true : h.days.includes(dow(day)));

export function toggleHabit(h, day) {
  if (h.log[day]) { delete h.log[day]; award(-XP.habit); } else { h.log[day] = 1; award(XP.habit); }
  return !!h.log[day];
}

const weekCount = (h, weekStart) => {
  let n = 0;
  for (let i = 0; i < 7; i++) if (h.log[addDays(weekStart, i)]) n++;
  return n;
};

/**
 * The current streak: days in a row for a scheduled habit, weeks in a row for an
 * "N times a week" one. Today (or this week) not being done yet does not break it.
 */
export function habitStreak(h, upTo = today(), weekStart = store.data.settings.weekStart) {
  if (h.perWeek) {
    let wk = startOfWeek(upTo, weekStart);
    let streak = weekCount(h, wk) >= h.perWeek ? 1 : 0;
    for (let i = 0; i < 520; i++) {
      wk = addDays(wk, -7);
      if (weekCount(h, wk) >= h.perWeek) streak++; else break;
    }
    return streak;
  }
  let streak = 0;
  let d = h.log[upTo] ? upTo : addDays(upTo, -1);
  for (let i = 0; i < 3660; i++, d = addDays(d, -1)) {
    if (!h.days.includes(dow(d))) continue;
    if (!h.log[d]) break;
    streak++;
  }
  return streak;
}

export function habitBestStreak(h, upTo = today()) {
  const days = Object.keys(h.log).sort();
  if (!days.length || h.perWeek) return h.perWeek ? habitStreak(h, upTo) : 0;
  let best = 0;
  let run = 0;
  for (let d = days[0]; d <= upTo; d = addDays(d, 1)) {
    if (!h.days.includes(dow(d))) continue;
    if (h.log[d]) { run++; best = Math.max(best, run); } else if (d !== upTo) run = 0;
  }
  return best;
}

/**
 * How established a habit is, 0 to 1. Every scheduled day done pulls it a tenth of
 * the way to 1 and every one missed a tenth of the way to 0, so one slip after a
 * long run costs a little rather than everything.
 */
export function habitStrength(h, upTo = today(), weekStart = store.data.settings.weekStart) {
  const first = Object.keys(h.log).sort()[0] || ymd(new Date(h.created));
  const from = [first, ymd(new Date(h.created))].sort()[0];
  let score = 0;
  if (h.perWeek) {
    const thisWeek = startOfWeek(upTo, weekStart);
    for (let wk = startOfWeek(from, weekStart); wk <= thisWeek; wk = addDays(wk, 7)) {
      const ratio = Math.min(1, weekCount(h, wk) / h.perWeek);
      if (wk === thisWeek && ratio < 1) break; // the week is not over
      score = score * 0.6 + ratio * 0.4;
    }
    return score;
  }
  const start = diffDays(upTo, from) > 400 ? addDays(upTo, -400) : from;
  for (let d = start; d <= upTo; d = addDays(d, 1)) {
    if (!h.days.includes(dow(d))) continue;
    if (d === upTo && !h.log[d]) break; // today is not over
    score = score * 0.9 + (h.log[d] ? 0.1 : 0);
  }
  return score;
}

// ---- Focus sessions and daily totals ----------------------------------------------

export function addSession(minutes, taskId = null) {
  const task = taskId ? taskById(taskId) : null;
  const session = { id: uid(), at: Date.now(), minutes: Math.round(minutes), taskId: task?.id || null, label: task?.title || '' };
  store.data.sessions.push(session);
  award(session.minutes * XP.focusMinute);
  return session;
}

export const sessionsOn = (day) => store.data.sessions.filter((s) => ymd(new Date(s.at)) === day);
export const focusMinutesFor = (taskId) => store.data.sessions.filter((s) => s.taskId === taskId).reduce((n, s) => n + s.minutes, 0);

/** What got done on a day: tasks finished, minutes focused, habits kept. */
export function dayStats(day) {
  const tasks = store.data.tasks.filter((t) => !t.parentId && t.doneAt && ymd(new Date(t.doneAt)) === day).length;
  const focus = sessionsOn(day).reduce((n, s) => n + s.minutes, 0);
  const habits = store.data.habits.filter((h) => h.log[day]).length;
  return { day, tasks, focus, habits };
}

/** Days in a row with something done; today not being started yet does not break it. */
export function dayStreak(upTo = today()) {
  const active = (d) => { const s = dayStats(d); return s.tasks + s.focus + s.habits > 0; };
  let d = active(upTo) ? upTo : addDays(upTo, -1);
  let streak = 0;
  for (; streak < 3660 && active(d); d = addDays(d, -1)) streak++;
  return streak;
}

// ---- Reminders ---------------------------------------------------------------------

/** Timed things in the next `days` days, soonest first: tasks at their time, events ten minutes before. */
export function upcomingReminders(now = new Date(), days = 14, limit = 40) {
  const out = [];
  const at = (day, hm, minus = 0) => {
    const d = parseYmd(day);
    const [hh, mm] = hm.split(':').map(Number);
    d.setHours(hh, mm - minus, 0, 0);
    return d;
  };
  for (const t of store.data.tasks) {
    if (t.done || !t.due || !t.time) continue;
    const when = at(t.due, t.time);
    if (when > now) out.push({ key: `t:${t.id}:${t.due}`, title: t.title, body: 'Task due now', at: when });
  }
  const first = ymd(now);
  for (let i = 0; i <= days; i++) {
    const day = addDays(first, i);
    for (const e of eventsOn(day)) {
      if (!e.start || !startsOn(e, day)) continue;
      const when = at(day, e.start, 10);
      if (when > now) out.push({ key: `e:${e.id}:${day}`, title: e.title || 'Event', body: `Starts at ${e.start}${e.place ? ` · ${e.place}` : ''}`, at: when });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, limit);
}
