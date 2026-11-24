// What goes into the phone's calendar when you export (Android only), worked out
// with no DOM and no device so the headless tests can pin it down.
//
// Export is one way and Meridian is the source: events and open tasks with a day
// become calendar rows, and each export adds, changes and removes rows so the
// calendar matches. Meridian finds its own rows by a short reference at the end
// of each description, "From Meridian (meridian:e:<id>)". That text travels with
// the event through Google's sync, so the rows are still recognised on a new
// phone, and nothing without it is ever changed or removed.

/** The reference in a description: kind (e event, t task) and the item's id. */
const REF = /\(meridian:([et]):([\w-]{1,64})\)/;
const SAFE_ID = /^[\w-]{1,64}$/;

/** Default lengths, the same ones the Today timeline draws with. */
const EVENT_MINUTES = 60;
const TASK_MINUTES = 30;

/**
 * One row in the phone's calendar, as the native side writes it.
 * A repeating row has `rrule` and `duration` and no `dtend` (Android's rule).
 * All-day rows run from midnight UTC to midnight UTC, end exclusive.
 * @typedef {{ key: string, title: string, description: string, location: string, allDay: boolean,
 *   dtstart: number, dtend: number|null, duration: string|null, rrule: string|null, timezone: string }} CalendarRow
 */

/**
 * A row already in the calendar, as the native side reads it.
 * @typedef {{ id: number, title?: string, description?: string, location?: string, allDay?: boolean,
 *   dtstart?: number, dtend?: number|null, duration?: string|null, rrule?: string|null, timezone?: string }} ExistingRow
 */

/** The reference line for an item key such as "e:abc123". */
export const refLine = (key) => `From Meridian (meridian:${key})`;

/** The item key ("e:abc123") a calendar row's description refers to, or null if it is not Meridian's. */
export function keyOf(description) {
  const m = REF.exec(String(description || ''));
  return m ? `${m[1]}:${m[2]}` : null;
}

/** A Meridian repeat as an iCalendar RRULE (RFC 5545), the form Android's calendar stores. */
export function rrule(repeat) {
  if (!repeat) return null;
  const n = Math.max(1, Math.round(Number(repeat.n) || 1));
  const every = n > 1 ? `;INTERVAL=${n}` : '';
  switch (repeat.unit) {
    case 'day': return `FREQ=DAILY${every}`;
    case 'weekday': return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'week': return `FREQ=WEEKLY${every}`;
    case 'month': return `FREQ=MONTHLY${every}`;
    case 'year': return `FREQ=YEARLY${every}`;
    default: return null;
  }
}

/** Seconds in an RFC 5545 duration as Android stores it ("P3600S", "PT1H30M", "P2D", "P1W"). */
export function durationSeconds(text) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(text || '').trim().toUpperCase());
  if (!m) return null;
  const [, sign, w, d, hh, mm, ss] = m;
  const secs = (Number(w) || 0) * 604800 + (Number(d) || 0) * 86400 + (Number(hh) || 0) * 3600 + (Number(mm) || 0) * 60 + (Number(ss) || 0);
  return sign === '-' ? -secs : secs;
}

const parts = (day) => String(day).split('-').map(Number);
/** Midnight UTC of a day: how Android stores all-day events. */
const utcDay = (day) => { const [y, m, d] = parts(day); return Date.UTC(y, m - 1, d); };
/** A day and "HH:MM" on this device's clock. */
const localTime = (day, hm) => {
  const [y, m, d] = parts(day);
  const [hh, mm] = String(hm).split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0).getTime();
};
const DAY_MS = 864e5;
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s) => typeof s === 'string' && /^\d{1,2}:\d{2}$/.test(s);

const describe = (notes, key) => {
  const text = String(notes || '').trim();
  return text ? `${text}\n\n${refLine(key)}` : refLine(key);
};

/** Finish a row: a repeating one keeps its length as a duration instead of an end. */
function row(base, start, end, repeat) {
  const rule = rrule(repeat);
  if (!rule) return { ...base, dtstart: start, dtend: end, duration: null, rrule: null };
  const secs = Math.round((end - start) / 1000);
  const duration = base.allDay ? `P${Math.max(1, Math.round(secs / 86400))}D` : `P${Math.max(60, secs)}S`;
  return { ...base, dtstart: start, dtend: null, duration, rrule: rule };
}

function eventRow(ev, timeZone) {
  const key = `e:${ev.id}`;
  const base = { key, title: String(ev.title || '').trim() || 'Untitled event', description: describe(ev.notes, key), location: String(ev.place || '').trim() };
  const lastDay = isDay(ev.endDate) && ev.endDate > ev.date ? ev.endDate : ev.date;
  if (!isTime(ev.start)) {
    return row({ ...base, allDay: true, timezone: 'UTC' }, utcDay(ev.date), utcDay(lastDay) + DAY_MS, ev.repeat);
  }
  const start = localTime(ev.date, ev.start);
  let end = isTime(ev.end) ? localTime(lastDay, ev.end) : localTime(lastDay, ev.start) + EVENT_MINUTES * 60000;
  if (end <= start) end = start + EVENT_MINUTES * 60000;
  return row({ ...base, allDay: false, timezone: timeZone }, start, end, ev.repeat);
}

/**
 * A task becomes one row on its due day, even when it repeats: Meridian adds the
 * next one when this one is ticked off, and the next export picks that up.
 */
function taskRow(t, timeZone, listName) {
  const key = `t:${t.id}`;
  const notes = [String(t.notes || '').trim(), listName ? `List: ${listName}` : ''].filter(Boolean).join('\n\n');
  const base = { key, title: String(t.title || '').trim() || 'Untitled task', description: describe(notes, key), location: '' };
  if (!isTime(t.time)) return row({ ...base, allDay: true, timezone: 'UTC' }, utcDay(t.due), utcDay(t.due) + DAY_MS, null);
  const start = localTime(t.due, t.time);
  const minutes = Number(t.duration) > 0 ? Number(t.duration) : TASK_MINUTES;
  return row({ ...base, allDay: false, timezone: timeZone }, start, start + minutes * 60000, null);
}

/**
 * Every row the calendar should hold: all events, and every open top-level task
 * that has a due day. Finished tasks, steps, habits and notes stay in Meridian.
 * @param {{ events?: any[], tasks?: any[], lists?: any[] }} data
 * @param {{ timeZone?: string }} [options] the device's IANA time zone, for timed rows
 * @returns {CalendarRow[]}
 */
export function exportRows(data, { timeZone = 'UTC' } = {}) {
  const lists = new Map((data.lists || []).map((l) => [l.id, l.name]));
  const out = [];
  for (const ev of data.events || []) {
    if (!ev || !SAFE_ID.test(String(ev.id)) || !isDay(ev.date)) continue;
    out.push(eventRow(ev, timeZone));
  }
  for (const t of data.tasks || []) {
    if (!t || !SAFE_ID.test(String(t.id)) || t.done || t.parentId || !isDay(t.due)) continue;
    out.push(taskRow(t, timeZone, t.listId === 'inbox' ? '' : lists.get(t.listId)));
  }
  return out;
}

/** Does a calendar row already say what this one says? */
export function sameRow(want, have) {
  const text = (s) => String(s ?? '').trim();
  if (text(want.title) !== text(have.title)) return false;
  if (text(want.description) !== text(have.description)) return false;
  if (text(want.location) !== text(have.location)) return false;
  if (!!want.allDay !== !!have.allDay) return false;
  if (Number(want.dtstart) !== Number(have.dtstart)) return false;
  if (text(want.rrule) !== text(have.rrule)) return false;
  if (!want.allDay && text(want.timezone) !== text(have.timezone)) return false;
  if (want.rrule) return durationSeconds(want.duration) === durationSeconds(have.duration);
  return Number(want.dtend) === Number(have.dtend);
}

/**
 * What to do so the calendar matches `wanted`. Only rows that carry Meridian's
 * reference are considered; if two carry the same one, the oldest is kept and the
 * others removed.
 * @param {CalendarRow[]} wanted
 * @param {ExistingRow[]} existing
 * @returns {{ add: CalendarRow[], change: Array<{ id: number, row: CalendarRow }>, remove: number[] }}
 */
export function planExport(wanted, existing) {
  const mine = new Map();
  const remove = [];
  for (const have of [...existing].sort((a, b) => Number(a.id) - Number(b.id))) {
    const key = keyOf(have.description);
    if (!key) continue;
    if (mine.has(key)) remove.push(have.id); else mine.set(key, have);
  }
  const add = [];
  const change = [];
  const seen = new Set();
  for (const want of wanted) {
    if (seen.has(want.key)) continue;
    seen.add(want.key);
    const have = mine.get(want.key);
    if (!have) add.push(want);
    else if (!sameRow(want, have)) change.push({ id: have.id, row: want });
  }
  for (const [key, have] of mine) if (!seen.has(key)) remove.push(have.id);
  return { add, change, remove };
}
