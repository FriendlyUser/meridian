// Meridian: notes, tasks, calendar, habits and a focus timer in one place, kept
// entirely on this device. This file starts everything and owns the keyboard.

import { store } from './core/store.js';
import { seed } from './core/seed.js';
import { timer, MODES, clockText } from './core/timer.js';
import { fmtDuration } from './core/util.js';
import { addNote } from './core/model.js';
import { initShell, go, currentView, VIEWS } from './ui/shell.js';
import { installTooltips, closeTop, hasOverlay, toast, openModal } from './ui/overlay.js';
import { openPalette, setPaletteActions } from './ui/palette.js';
import { openEventEditor } from './ui/parts.js';
import { openSettings, initTheme, toggleTheme } from './views/settings.js';
import { initNative } from './platform/Native.js';
import { initReminders } from './platform/Reminders.js';

const SHORTCUTS = [
  ['Ctrl K  or  /', 'Search everything, or add a task'],
  ['N', 'New item on the current screen'],
  ['G then T', 'Go to Today'],
  ['G then K', 'Go to Tasks'],
  ['G then C', 'Go to Calendar'],
  ['G then N', 'Go to Notes'],
  ['G then H', 'Go to Habits'],
  ['G then F', 'Go to Focus'],
  ['G then P', 'Go to Progress'],
  ['Space', 'Start or pause the timer (on Focus)'],
  ['Esc', 'Close what is open'],
  ['?', 'This list'],
];

function openHelp() {
  openModal({
    title: 'Keyboard shortcuts',
    className: 'narrow',
    body: `<div class="help-keys">${SHORTCUTS.map(([keys, what]) => `<span class="kbd">${keys}</span><span>${what}</span>`).join('')}</div>`,
  });
}

/** A short two-note chime, made on the spot so there is no sound file to ship. */
function chime() {
  try {
    const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    const ctx = new Ctx();
    [[660, 0], [880, 0.18]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.55);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch { /* no audio here; the toast still says it */ }
}

function boot() {
  const hadData = store.load();
  const firstRun = !hadData && !store.data.seeded;
  if (firstRun) {
    seed();
    store.commit('boot');
  }
  initTheme();
  installTooltips();

  setPaletteActions([
    ...VIEWS.map((v) => ({ icon: v.icon, label: `Go to ${v.label}`, keys: `G ${v.key.toUpperCase()}`, run: () => go(v.id) })),
    { icon: 'notes', label: 'New note', run: () => { const n = addNote(); store.commit('palette'); go('notes', n.id); } },
    { icon: 'calendar', label: 'New event', run: () => openEventEditor(null, {}) },
    { icon: 'play', label: 'Start a focus session', run: () => { go('focus'); timer.start(); } },
    { icon: 'moon', label: 'Switch between light and dark', run: toggleTheme },
    { icon: 'settings', label: 'Settings and backup', run: openSettings },
    { icon: 'help', label: 'Keyboard shortcuts', keys: '?', run: openHelp },
  ]);

  initShell();
  if (firstRun) {
    toast('A few sample items were added to look around with.', { action: 'Start empty', onAction: () => store.reset(), ms: 12000 });
  }

  // Buttons any screen can carry: search and settings.
  document.addEventListener('click', (e) => {
    const act = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest?.('[data-act]'))?.dataset.act;
    if (act === 'search') openPalette();
    else if (act === 'settings') openSettings();
  });

  // ---- Keyboard ----
  let awaitingGo = 0;
  document.addEventListener('keydown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const typing = target.matches?.('input, textarea, select, [contenteditable="true"]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape') { if (closeTop()) e.preventDefault(); else if (typing) target.blur(); return; }
    if (typing || hasOverlay() || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (awaitingGo && Date.now() - awaitingGo < 1500) {
      awaitingGo = 0;
      const view = VIEWS.find((v) => v.key === key);
      if (view) { e.preventDefault(); go(view.id); }
      return;
    }
    if (key === 'g') { awaitingGo = Date.now(); return; }
    if (key === '/') { e.preventDefault(); openPalette(); return; }
    if (e.key === '?') { openHelp(); return; }
    if (key === 'n') { e.preventDefault(); currentView()?.api?.create?.(); return; }
    if (key === ' ' && currentView()?.id === 'focus' && !target.matches?.('button, a')) {
      e.preventDefault();
      if (timer.state.running) timer.pause(); else timer.start();
    }
  });

  // ---- Focus timer: tick, announce, and show the countdown in the tab title ----
  setInterval(() => timer.tick(), 500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) timer.tick(); });
  let baseTitle = document.title;
  timer.on((type, detail) => {
    if (type === 'tick') {
      if (!/^\d\d:\d\d/.test(document.title)) baseTitle = document.title;
      document.title = `${clockText()} · ${MODES[timer.state.mode]}`;
    } else if (/^\d\d:\d\d/.test(document.title)) document.title = baseTitle;
    if (type !== 'finish') return;
    if (store.data.settings.focus.sound && !detail.late) chime();
    const minutes = store.data.settings.focus.work;
    const text = detail.mode === 'work'
      ? `${fmtDuration(minutes)} of focus done${detail.session?.label ? ` on “${detail.session.label}”` : ''}. Time for a break.`
      : 'Break over. Ready for the next one?';
    toast(text, { ms: 7000 });
    try {
      if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Meridian', { body: text });
    } catch { /* not available here */ }
  });
  window.addEventListener('hashchange', () => { baseTitle = document.title; });

  store.on((source) => {
    if (source === 'storage-failed') toast('Could not save: this device’s storage is full or switched off. Back up from Settings.', { ms: 9000 });
  });

  initNative();
  initReminders();
}

boot();
