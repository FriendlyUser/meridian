// Everything the app knows lives in one object, kept in this device's localStorage.
// There is no server: nothing here is ever sent anywhere.
//
// Views change `store.data` directly and then call `store.commit(source)`, which
// schedules a save and tells listeners who made the change (so a view does not
// redraw itself in the middle of its own edit).

import { debounce } from './util.js';

const KEY = 'meridian.v1';

const prefers12h = () => {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 !== false;
  } catch {
    return true;
  }
};

/** A new, empty workspace. */
export function blank() {
  return {
    version: 1,
    settings: {
      theme: 'system', // 'system' | 'light' | 'dark'
      weekStart: 0, // 0 Sunday, 1 Monday
      hour12: prefers12h(),
      reminders: false,
      focus: { work: 25, short: 5, long: 15, every: 4, sound: true, auto: false },
      vault: null, // {salt, check}: set once a passcode locks a note
    },
    profile: { xp: 0 },
    lists: [{ id: 'inbox', name: 'Inbox', color: 'blue' }],
    // {id, listId, title, notes, due, time, duration, priority 1-4, done, doneAt, parentId,
    //  order, repeat {unit, n}, est, status 'todo'|'doing'|'done', myDay, created}
    tasks: [],
    events: [], // {id, title, date, endDate, start, end, color, notes, place, repeat {unit, n}}
    notes: [], // {id, title, body, items|null, color, pinned, archived, date, locked|null, created, updated}
    habits: [], // {id, name, color, days[0-6], perWeek, log{date: 1}, archived, created}
    sessions: [], // focus sessions: {id, at, minutes, taskId, label}
    ui: {}, // where each view was left
    seeded: false,
  };
}

const COLLECTIONS = ['lists', 'tasks', 'events', 'notes', 'habits', 'sessions'];

/** Fill in anything a saved or imported workspace lacks, without trusting its shape. */
function normalize(raw) {
  const base = blank();
  if (!raw || typeof raw !== 'object') return base;
  const data = { ...base };
  for (const key of Object.keys(base)) if (raw[key] !== undefined) data[key] = raw[key];
  data.settings = { ...base.settings, ...(raw.settings && typeof raw.settings === 'object' ? raw.settings : {}) };
  data.settings.focus = { ...base.settings.focus, ...(raw.settings?.focus || {}) };
  data.profile = { xp: Math.max(0, Number(raw.profile?.xp) || 0) };
  for (const key of COLLECTIONS) {
    if (!Array.isArray(data[key])) data[key] = base[key];
    data[key] = data[key].filter((x) => x && typeof x === 'object' && x.id != null);
  }
  if (!data.lists.some((l) => l.id === 'inbox')) data.lists.unshift(base.lists[0]);
  for (const h of data.habits) {
    if (!h.log || typeof h.log !== 'object') h.log = {};
    if (!Array.isArray(h.days)) h.days = [0, 1, 2, 3, 4, 5, 6];
  }
  if (!data.ui || typeof data.ui !== 'object' || Array.isArray(data.ui)) data.ui = {};
  return data;
}

const listeners = new Set();
let failed = false;

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store.data));
    if (failed) { failed = false; emit('storage-ok'); }
  } catch (e) {
    // Out of space, or storage is switched off (private windows in some browsers).
    if (!failed) { failed = true; emit('storage-failed'); }
    console.warn(`Could not save: ${e?.message || e}`);
  }
}

const saveSoon = debounce(write, 250);

function emit(source) {
  for (const fn of listeners) {
    try { fn(source); } catch (e) { console.error(e); }
  }
}

export const store = {
  /** @type {ReturnType<typeof blank>} */
  data: blank(),

  load() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (e) {
      console.warn(`Saved data could not be read: ${e?.message || e}`);
    }
    this.data = normalize(raw);
    return raw !== null;
  },

  /** Call after changing `data`. `source` names who did it. */
  commit(source = '') {
    saveSoon();
    emit(source);
  },

  /** Save without telling anyone: for remembering scroll positions, open tabs and the like. */
  touch() {
    saveSoon();
  },

  flush() {
    saveSoon.flush();
  },

  /** @param {(source: string) => void} fn */
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Replace everything (import, reset). Throws if `raw` is not a workspace. */
  replace(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('That file is not a Meridian backup.');
    const known = ['notes', 'tasks', 'events', 'habits'].some((k) => Array.isArray(raw[k]));
    if (!known) throw new Error('That file is not a Meridian backup.');
    this.data = normalize(raw);
    write();
    emit('replace');
  },

  reset() {
    this.data = blank();
    this.data.seeded = true;
    write();
    emit('replace');
  },

  export() {
    return JSON.stringify({ app: 'meridian', exported: new Date().toISOString(), ...this.data }, null, 2);
  },

  /** Rough size of what is stored, in bytes. */
  size() {
    try {
      return (localStorage.getItem(KEY) || '').length;
    } catch {
      return 0;
    }
  },
};

// A tab being closed or an app being put away must not lose the last quarter second.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => store.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) store.flush(); });
}
