// Focus: a session timer tied to a task. A plant grows while the session runs, and
// every finished session leaves one in the day's garden.

import { store } from '../core/store.js';
import { esc, today, fmtDate, fmtDuration, fmtTime, pad, WEEKDAYS, parseYmd } from '../core/util.js';
import { topTasks, taskById, sortTasks, sessionsOn, focusMinutesFor, listOf } from '../core/model.js';
import { timer, MODES, clockText } from '../core/timer.js';
import { icon, plant, plantStage } from '../ui/icons.js';
import { viewHead, barChart, lastDays, colorVar } from '../ui/parts.js';
import { openModal, popMenu, toast } from '../ui/overlay.js';

const R = 92;
const C = 2 * Math.PI * R;
const growth = () => Math.min(4, Math.floor(timer.progress() * 5));

function timerCard() {
  const s = timer.state;
  const cfg = store.data.settings.focus;
  const task = store.data.ui.focusTask ? taskById(store.data.ui.focusTask) : null;
  const work = s.mode === 'work';
  const rounds = Math.max(1, cfg.every);
  const doneRounds = (s.round || 0) % rounds;
  return `
    <section class="card focus-main">
      <div class="seg" role="tablist" aria-label="Session type">
        ${Object.entries(MODES).map(([id, label]) => `<button data-mode="${id}" class="${s.mode === id ? 'on' : ''}" role="tab" aria-selected="${s.mode === id}">${label}</button>`).join('')}
      </div>
      <div class="ring-wrap ${work ? '' : 'break'}">
        <svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
          <circle class="track" cx="100" cy="100" r="${R}"/>
          <circle class="prog" data-prog cx="100" cy="100" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - timer.progress())).toFixed(2)}"/>
        </svg>
        <div class="ring-center">
          ${work ? `<div class="ring-plant" data-plant data-stage="${growth()}">${plant(growth())}</div>` : ''}
          <div class="ring-time" data-time role="timer" aria-label="Time left">${clockText()}</div>
          <div class="ring-label">${s.running ? (work ? 'Stay with it' : 'Rest') : timer.begun() ? 'Paused' : `${cfg[s.mode]} min ${work ? 'of focus' : 'break'}`}</div>
        </div>
      </div>
      <div class="rounds" role="img" aria-label="${doneRounds} of ${rounds} sessions before a long break">${Array.from({ length: rounds }, (_, i) => `<i class="${i < doneRounds ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn focus-task" data-pick-task>${icon('tasks', 18)}<span>${task && !task.done ? esc(task.title) : 'Pick a task to work on'}</span>${icon('down', 16)}</button>
      ${task && !task.done && task.est ? `<p class="muted" style="font-size:13px">${Math.floor(focusMinutesFor(task.id) / cfg.work)} of ${task.est} planned sessions done</p>` : ''}
      <div class="row">
        <button class="icon-btn" data-reset aria-label="Reset" title="Reset" ${timer.begun() ? '' : 'disabled'}>${icon('reset')}</button>
        <button class="btn primary" data-go style="min-width:136px;min-height:46px;font-size:16px">${s.running ? `${icon('pause')}Pause` : `${icon('play')}${timer.begun() ? 'Resume' : 'Start'}`}</button>
        <button class="icon-btn" data-skip aria-label="Skip to ${work ? 'a break' : 'focus'}" title="Skip to ${work ? 'a break' : 'focus'}">${icon('skip')}</button>
      </div>
    </section>`;
}

function sidePanel() {
  const { hour12, focus } = store.data.settings;
  const day = today();
  const sessions = sessionsOn(day);
  const minutes = sessions.reduce((n, s) => n + s.minutes, 0);
  const days = lastDays(7);
  const perDay = days.map((d) => sessionsOn(d).reduce((n, s) => n + s.minutes, 0));
  const weekTotal = perDay.reduce((a, b) => a + b, 0);

  // Where the last week's minutes went, by list.
  const since = parseYmd(days[0]).getTime();
  const byList = new Map();
  for (const s of store.data.sessions) {
    if (s.at < since) continue;
    const task = s.taskId ? taskById(s.taskId) : null;
    const key = task ? task.listId : '';
    byList.set(key, (byList.get(key) || 0) + s.minutes);
  }
  const rowsByList = [...byList.entries()].sort((a, b) => b[1] - a[1]);
  const top = Math.max(1, ...rowsByList.map((r) => r[1]));

  return `
    <section class="card">
      <div class="card-title">${icon('sprout', 18)} Today’s garden <span class="muted">${minutes ? `${fmtDuration(minutes)} · ${sessions.length} session${sessions.length === 1 ? '' : 's'}` : ''}</span></div>
      ${sessions.length
        ? `<div class="garden">${sessions.map((s) => {
            const at = new Date(s.at);
            return `<div class="plant" tabindex="0" data-tip-value="${s.minutes} min" data-tip="${esc(`${s.label || 'No task'} · ${fmtTime(`${pad(at.getHours())}:${pad(at.getMinutes())}`, hour12)}`)}">${plant(plantStage(s.minutes))}</div>`;
          }).join('')}</div>`
        : `<p class="muted">Nothing planted yet. Finish a ${focus.work}-minute session and something grows here; longer sessions grow bigger.</p>`}
    </section>
    <section class="card">
      <div class="chart-title">Focus this week</div>
      <div class="chart-sub">${weekTotal ? `${fmtDuration(weekTotal)} over the last 7 days` : 'Minutes per day, last 7 days'}</div>
      ${barChart(days.map((d, i) => ({ label: WEEKDAYS[parseYmd(d).getDay()].slice(0, 2), value: perDay[i], tip: fmtDate(d), today: d === day })), { name: 'Focus minutes per day', format: (v) => `${v} min` })}
    </section>
    ${rowsByList.length ? `
      <section class="card">
        <div class="chart-title">Where the time went</div>
        <div class="chart-sub">Focus minutes by list, last 7 days</div>
        <div class="hbars">${rowsByList.map(([key, mins]) => {
          const list = key ? listOf(key) : null;
          return `<div class="hbar" tabindex="0" data-tip-value="${fmtDuration(mins)}" data-tip="${esc(list ? list.name : 'No task')}">
            <span class="name">${list ? `<i class="dot" style="--c: ${colorVar(list.color)}"></i>` : ''}${esc(list ? list.name : 'No task')}</span>
            <span class="track"><i style="width:${(mins / top) * 100}%"></i></span>
            <span class="val">${fmtDuration(mins)}</span>
          </div>`;
        }).join('')}</div>
      </section>` : ''}`;
}

function openTimerSettings(rerender) {
  const cfg = store.data.settings.focus;
  const num = (key, label, min, max) => `<label class="field">${label}<input type="number" data-k="${key}" min="${min}" max="${max}" value="${Number(cfg[key])}" inputmode="numeric"></label>`;
  const toggle = (key, label, note) => `<label class="settings-row" style="cursor:pointer"><div>${label}<small>${note}</small></div><input type="checkbox" data-k="${key}" ${cfg[key] ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--accent)"></label>`;
  const modal = openModal({
    title: 'Timer settings',
    className: 'narrow',
    body: `
      <div class="stack">
        <div class="fields pair">
          ${num('work', 'Focus (minutes)', 1, 180)}
          ${num('short', 'Short break', 1, 60)}
          ${num('long', 'Long break', 1, 90)}
          ${num('every', 'Sessions before a long break', 1, 12)}
        </div>
        <div>
          ${toggle('sound', 'Chime', 'Play a sound when a session ends')}
          ${toggle('auto', 'Keep going', 'Start the next session or break by itself')}
        </div>
      </div>`,
    footer: '<span class="spacer"></span><button class="btn primary" data-close>Done</button>',
    onClose: () => { store.commit('focus'); rerender(); },
  });
  modal.body.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const key = el.dataset.k;
    if (!key) return;
    if (el.type === 'checkbox') cfg[key] = el.checked;
    else {
      const v = Math.round(Number(el.value));
      if (v >= Number(el.min) && v <= Number(el.max)) cfg[key] = v;
    }
    store.touch();
  });
}

export function mount(el) {
  const render = () => {
    el.innerHTML = `
      ${viewHead('Focus', 'One thing at a time.', `<button class="btn" data-timer-settings aria-label="Timer settings">${icon('clock', 18)}<span class="only-desktop">Timer settings</span></button>`)}
      <div class="focus-layout">${timerCard()}<div class="stack">${sidePanel()}</div></div>`;
  };

  // While the clock runs only the digits, the ring and (now and then) the plant change.
  const off = timer.on((type) => {
    if (type !== 'tick') { render(); return; }
    const time = el.querySelector('[data-time]');
    if (!time) return;
    time.textContent = clockText();
    el.querySelector('[data-prog]')?.setAttribute('stroke-dashoffset', (C * (1 - timer.progress())).toFixed(2));
    const grown = /** @type {HTMLElement|null} */ (el.querySelector('[data-plant]'));
    if (grown && Number(grown.dataset.stage) !== growth()) { grown.dataset.stage = String(growth()); grown.innerHTML = plant(growth()); }
  });

  el.addEventListener('click', (e) => {
    const target = /** @type {Element} */ (e.target);
    const pick = (name) => /** @type {HTMLElement|null} */ (target.closest(`[data-${name}]`));
    if (pick('go')) { if (timer.state.running) timer.pause(); else timer.start(); return; }
    if (pick('reset')) { if (timer.reset()) toast('Session dropped. Nothing planted this time.'); return; }
    if (pick('skip')) { timer.skip(); return; }
    if (pick('mode')) {
      if (timer.state.mode !== pick('mode').dataset.mode) timer.setMode(pick('mode').dataset.mode);
      return;
    }
    if (pick('timer-settings')) { openTimerSettings(render); return; }
    if (pick('pick-task')) {
      const day = today();
      const open = sortTasks(topTasks().filter((t) => !t.done));
      const near = open.filter((t) => (t.due && t.due <= day) || t.myDay === day);
      const rest = open.filter((t) => !near.includes(t)).slice(0, Math.max(0, 14 - near.length));
      const choose = (id) => { store.data.ui.focusTask = id; store.touch(); render(); };
      const item = (t) => ({ label: t.title, dot: listOf(t.listId).color, checked: store.data.ui.focusTask === t.id, onClick: () => choose(t.id) });
      popMenu(pick('pick-task'), [
        ...(near.length ? [{ heading: 'Today' }, ...near.slice(0, 14).map(item)] : []),
        ...(rest.length ? [{ heading: 'Other tasks' }, ...rest.map(item)] : []),
        ...(open.length ? [{ sep: true }] : [{ heading: 'No open tasks' }]),
        { label: 'No task', icon: 'x', checked: !store.data.ui.focusTask, onClick: () => choose(null) },
      ]);
    }
  });

  render();
  return { refresh: render, destroy: off, create: () => { if (!timer.state.running) timer.start(); } };
}
