// Copy events and open tasks into a calendar on the phone (Android app only).
//
// Which rows go in, and what each export adds, changes and removes, is worked out in
// core/calexport.js. The native CalendarExport plugin
// (android/app/src/main/java/io/github/friendlyuser/meridian/CalendarExportPlugin.java)
// lists the phone's calendars and writes the rows through Android's Calendar Provider.
// If the chosen calendar belongs to a Google account, Android's own sync takes the
// events to Google Calendar; the app itself still contacts nothing. Nothing here runs
// in a browser tab, and the plugin is only looked up inside the app.

import { isNative } from './Device.js';
import { store } from '../core/store.js';
import { exportRows, planExport } from '../core/calexport.js';

/**
 * @typedef {{ id: number, name: string, account: string, accountType: string, color: string, primary: boolean, visible: boolean }} PhoneCalendar
 * @typedef {{ added: number, changed: number, removed: number, skipped: number }} Applied
 */

/** @type {any} */
let plugin = null;
/**
 * The native plugin, inside an object. A Capacitor plugin answers to any property
 * name, `then` included, so a promise must never resolve to the plugin itself:
 * awaiting it would wait forever.
 */
async function loaded() {
  if (!plugin) {
    const { registerPlugin } = await import('@capacitor/core');
    plugin = registerPlugin('CalendarExport');
  }
  return { p: plugin };
}

/** Only the Android app can write to the phone's calendar. */
export const canExportToCalendar = () => isNative();

/** Ask for calendar access the first time it is needed. Returns whether it is granted. */
export async function calendarAccess() {
  const { p } = await loaded();
  let status = await p.checkPermissions();
  if (status.calendar !== 'granted') status = await p.requestPermissions();
  return status.calendar === 'granted';
}

/** The phone's calendars Meridian may add to: Google ones first, each account's own calendar first. */
export async function phoneCalendars() {
  /** @type {PhoneCalendar[]} */
  const calendars = (await (await loaded()).p.calendars()).calendars || [];
  const rank = (c) => (c.accountType === 'com.google' ? 0 : 1);
  return calendars.sort((a, b) => rank(a) - rank(b)
    || String(a.account).localeCompare(String(b.account))
    || Number(b.primary) - Number(a.primary)
    || String(a.name).localeCompare(String(b.name)));
}

/**
 * The calendar last exported to, if it is still on this phone. It is matched by name
 * and account as well as id, because a backup restored on another phone carries ids
 * that mean something else there.
 * @param {PhoneCalendar[]} calendars
 */
export function savedCalendar(calendars) {
  const saved = store.data.settings.calendarExport;
  if (!saved) return null;
  return calendars.find((c) => c.id === saved.id && c.name === saved.name && c.account === saved.account) || null;
}

const CHUNK = 100; // operations per call, well inside Android's limit for one transaction
const chunks = (items, n) => Array.from({ length: Math.ceil(items.length / n) }, (_, i) => items.slice(i * n, i * n + n));

/** Make the calendar's Meridian rows match `rows`. @returns {Promise<Applied>} */
async function bringInLine(calendar, rows) {
  const { p } = await loaded();
  const { events } = await p.exported({ calendarId: calendar.id });
  const plan = planExport(rows, events || []);
  const steps = [
    ...chunks(plan.remove, CHUNK).map((remove) => ({ remove })),
    ...chunks(plan.change, CHUNK).map((change) => ({ change })),
    ...chunks(plan.add, CHUNK).map((add) => ({ add })),
  ];
  const done = { added: 0, changed: 0, removed: 0, skipped: 0 };
  for (const step of steps) {
    const r = await p.apply({ calendarId: calendar.id, add: [], change: [], remove: [], ...step });
    for (const k of Object.keys(done)) done[k] += Number(r?.[k]) || 0;
  }
  return done;
}

/**
 * Export: afterwards the calendar holds every event and every open task with a day,
 * as they are in Meridian now. Remembers the calendar for next time.
 * @param {PhoneCalendar} calendar
 */
export async function exportToCalendar(calendar) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const rows = exportRows(store.data, { timeZone });
  const result = await bringInLine(calendar, rows);
  store.data.settings.calendarExport = { id: calendar.id, name: calendar.name, account: calendar.account, at: Date.now(), count: rows.length };
  store.commit('settings');
  return { ...result, count: rows.length };
}

/**
 * Take everything Meridian added back out of a calendar. Nothing else in it is touched.
 * @param {PhoneCalendar} calendar
 * @param {{ forget?: boolean }} [options] also stop remembering it as the export calendar
 */
export async function removeFromCalendar(calendar, { forget = true } = {}) {
  const result = await bringInLine(calendar, []);
  if (forget) {
    store.data.settings.calendarExport = null;
    store.commit('settings');
  }
  return result;
}
