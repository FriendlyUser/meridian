// The focus timer. Its state is saved with everything else and holds the moment it
// ends rather than a countdown, so it survives a reload, a closed tab or the phone
// putting the app to sleep: whenever the app next looks, the right time is left.

import { store } from './store.js';
import { addSession } from './model.js';

export const MODES = { work: 'Focus', short: 'Short break', long: 'Long break' };

const listeners = new Set();
const config = () => store.data.settings.focus;

function state() {
  const ui = store.data.ui;
  if (!ui.timer || typeof ui.timer !== 'object') ui.timer = { mode: 'work', running: false, endsAt: 0, left: 0, round: 0 };
  if (!MODES[ui.timer.mode]) ui.timer.mode = 'work';
  return ui.timer;
}

function emit(type, detail = {}) {
  for (const fn of listeners) {
    try { fn(type, detail); } catch (e) { console.error(e); }
  }
}

const total = (mode = state().mode) => Math.max(1, Math.round(Number(config()[mode]) || 1)) * 60;

function remaining() {
  const s = state();
  if (s.running) return Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
  return s.left > 0 ? Math.min(s.left, total()) : total();
}

function finish() {
  const s = state();
  const mode = s.mode;
  const endedAt = s.endsAt || Date.now();
  s.running = false;
  s.left = 0;
  s.endsAt = 0;
  let session = null;
  if (mode === 'work') {
    session = addSession(config().work, store.data.ui.focusTask || null);
    session.at = Math.min(endedAt, Date.now());
    s.round = (s.round || 0) + 1;
    s.mode = s.round % Math.max(1, config().every) === 0 ? 'long' : 'short';
  } else {
    s.mode = 'work';
  }
  store.commit('timer');
  emit('finish', { mode, session, late: Date.now() - endedAt > 5000 });
  if (config().auto) timer.start();
}

export const timer = {
  get state() { return state(); },
  remaining,
  total,
  /** 0 at the start of a session, 1 at its end. */
  progress: () => 1 - remaining() / total(),
  /** Has the current session been started (running or paused part-way)? */
  begun: () => state().running || state().left > 0,

  start() {
    const s = state();
    if (s.running) return;
    s.endsAt = Date.now() + remaining() * 1000;
    s.left = 0;
    s.running = true;
    store.touch();
    emit('start');
  },
  pause() {
    const s = state();
    if (!s.running) return;
    s.left = remaining();
    s.running = false;
    store.touch();
    emit('pause');
  },
  /** Back to the start of this session. Returns true if a focus session of a minute or more was given up. */
  reset() {
    const s = state();
    const gaveUp = s.mode === 'work' && timer.begun() && total() - remaining() >= 60;
    s.running = false;
    s.left = 0;
    s.endsAt = 0;
    store.touch();
    emit('reset');
    return gaveUp;
  },
  setMode(mode) {
    const s = state();
    if (!MODES[mode]) return;
    s.mode = mode;
    s.running = false;
    s.left = 0;
    s.endsAt = 0;
    store.touch();
    emit('mode');
  },
  /** Move on without logging anything: from focus to a break, or from a break back to focus. */
  skip() {
    timer.setMode(state().mode === 'work' ? 'short' : 'work');
  },
  /** Called a couple of times a second by the app. */
  tick() {
    const s = state();
    if (!s.running) return;
    if (Date.now() >= s.endsAt) finish(); else emit('tick');
  },
  /** @param {(type: string, detail: any) => void} fn */
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function clockText(seconds = remaining()) {
  const m = Math.floor(seconds / 60);
  return `${String(m).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
