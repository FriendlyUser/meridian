// The frame around every screen: the navigation (a sidebar on wide screens, a tab
// bar on phones) and the router. Screens live at #/today, #/tasks, #/calendar…

import { store } from '../core/store.js';
import { today } from '../core/util.js';
import { topTasks, levelInfo } from '../core/model.js';
import { timer, MODES, clockText } from '../core/timer.js';
import { icon } from './icons.js';

import * as todayView from '../views/today.js';
import * as tasksView from '../views/tasks.js';
import * as calendarView from '../views/calendar.js';
import * as notesView from '../views/notes.js';
import * as habitsView from '../views/habits.js';
import * as focusView from '../views/focus.js';
import * as progressView from '../views/progress.js';

export const VIEWS = [
  { id: 'today', label: 'Today', icon: 'today', key: 't', view: todayView },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', key: 'k', view: tasksView },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', key: 'c', view: calendarView },
  { id: 'notes', label: 'Notes', icon: 'notes', key: 'n', view: notesView },
  { id: 'habits', label: 'Habits', icon: 'habits', key: 'h', view: habitsView },
  { id: 'focus', label: 'Focus', icon: 'focus', key: 'f', view: focusView },
  { id: 'progress', label: 'Progress', icon: 'progress', key: 'p', view: progressView, wideOnly: true },
];

let active = null; // { id, api }

function parseHash() {
  const [, id = '', ...rest] = location.hash.split('/');
  return { id, param: rest.length ? decodeURIComponent(rest.join('/')) : '' };
}

export const go = (id, param = '') => { location.hash = `#/${id}${param ? `/${encodeURIComponent(param)}` : ''}`; };
export const currentView = () => active;

function drawNav() {
  const nav = document.getElementById('nav');
  const day = today();
  const due = topTasks().filter((t) => !t.done && ((t.due && t.due <= day) || t.myDay === day)).length;
  const lv = levelInfo();
  const s = timer.state;
  nav.innerHTML = `
    <div class="brand"><span class="brand-mark">${icon('today', 18)}</span>Meridian</div>
    ${VIEWS.map((v) => `
      <a class="nav-link ${active?.id === v.id ? 'active' : ''} ${v.wideOnly ? 'only-desktop' : ''}" href="#/${v.id}" ${active?.id === v.id ? 'aria-current="page"' : ''}>
        ${icon(v.icon, 22)}<span>${v.label}</span>${v.id === 'tasks' && due ? `<span class="count">${due}</span>` : ''}${v.id === 'progress' ? `<span class="count">Lv ${lv.level}</span>` : ''}
      </a>`).join('')}
    <div class="nav-spacer"></div>
    ${timer.begun() ? `<a class="nav-timer only-desktop" href="#/focus" title="${MODES[s.mode]}">${icon(s.running ? 'focus' : 'pause', 18)}<b data-nav-clock>${clockText()}</b><small>${MODES[s.mode]}</small></a>` : ''}
    <button class="nav-link only-desktop" data-act="search">${icon('search', 22)}<span>Search</span><span class="kbd">Ctrl K</span></button>
    <button class="nav-link only-desktop" data-act="settings">${icon('settings', 22)}<span>Settings</span></button>`;
}

function show() {
  const { id, param } = parseHash();
  const def = VIEWS.find((v) => v.id === id);
  if (!def) { history.replaceState(null, '', '#/today'); show(); return; }
  active?.api?.destroy?.();
  const host = document.getElementById('view');
  const el = document.createElement('div');
  host.replaceChildren(el);
  document.getElementById('main').scrollTop = 0;
  active = { id: def.id, api: null };
  active.api = def.view.mount(el, param) || {};
  document.title = `${def.label} · Meridian`;
  drawNav();
}

export function initShell() {
  window.addEventListener('hashchange', show);
  // A change made somewhere else (search, a dialog, the timer, a restore) redraws
  // the screen that is showing; a screen's own changes it has already drawn.
  store.on((source) => {
    if (source !== active?.id) active?.api?.refresh?.();
    drawNav();
  });
  timer.on((type) => {
    if (type === 'tick') {
      const clock = document.querySelector('[data-nav-clock]');
      if (clock) clock.textContent = clockText();
    } else drawNav();
  });
  show();
}
