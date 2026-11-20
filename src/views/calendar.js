// Calendar: a month of events and due tasks, with the chosen day opened beside it.
// Each day can also hold a journal note.

import { store } from '../core/store.js';
import { esc, today, addDays, addMonths, startOfWeek, parseYmd, fmtDate, fmtTime, relDay, debounce, WEEKDAYS, MONTHS } from '../core/util.js';
import { eventsOn, tasksOn, sortTasks, addTaskFromText, addNote, habitDue } from '../core/model.js';
import { icon } from '../ui/icons.js';
import { viewHead, taskRow, bindTasks, openEventEditor, colorVar } from '../ui/parts.js';
import { promptDialog } from '../ui/overlay.js';

let sel = today();
let cursor = `${today().slice(0, 7)}-01`;

const journalFor = (day) => store.data.notes.find((n) => n.journal && n.date === day && !n.locked);

function monthGrid() {
  const { weekStart } = store.data.settings;
  const first = parseYmd(cursor);
  const start = startOfWeek(cursor, weekStart);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((offset + daysInMonth) / 7);
  const day = today();

  const cells = Array.from({ length: rows * 7 }, (_, i) => {
    const d = addDays(start, i);
    const events = eventsOn(d);
    const tasks = sortTasks(tasksOn(d)).sort((a, b) => Number(a.done) - Number(b.done));
    const chips = [
      ...events.map((e) => `<span class="cal-chip" style="--c: ${colorVar(e.color)}">${esc(e.title)}</span>`),
      ...tasks.map((t) => `<span class="cal-chip task ${t.done ? 'done' : ''}">${esc(t.title)}</span>`),
    ];
    const shown = chips.length > 3 ? chips.slice(0, 2) : chips;
    const count = events.length + tasks.length;
    return `
      <button class="cal-cell ${d.slice(0, 7) === cursor.slice(0, 7) ? '' : 'out'} ${d === day ? 'today' : ''} ${d === sel ? 'sel' : ''}" data-date="${d}"
        aria-label="${esc(fmtDate(d, { long: true }))}${count ? `, ${count} item${count === 1 ? '' : 's'}` : ''}" aria-pressed="${d === sel}">
        <span class="cal-top"><span class="cal-num">${parseYmd(d).getDate()}</span>${journalFor(d) ? `<span class="cal-marks" title="Journal note">${icon('note', 13)}</span>` : ''}</span>
        ${shown.join('')}
        ${chips.length > shown.length ? `<span class="cal-more">+${chips.length - shown.length} more</span>` : ''}
      </button>`;
  });

  return `
    <div class="cal">
      <div class="cal-week">${Array.from({ length: 7 }, (_, i) => `<span>${WEEKDAYS[(i + weekStart) % 7].slice(0, 3)}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
    </div>`;
}

function dayPanel() {
  const { hour12 } = store.data.settings;
  const events = eventsOn(sel);
  const tasks = sortTasks(tasksOn(sel)).sort((a, b) => Number(a.done) - Number(b.done));
  const habits = store.data.habits.filter((h) => !h.archived && habitDue(h, sel));
  const kept = habits.filter((h) => h.log[sel]).length;
  const journal = journalFor(sel);
  const when = (e) => (e.start ? `${fmtTime(e.start, hour12)}${e.end ? ` – ${fmtTime(e.end, hour12)}` : ''}` : e.endDate ? `Until ${fmtDate(e.endDate, { weekday: false })}` : 'All day');
  return `
    <aside class="day-panel card" aria-label="Selected day">
      <h2>${esc(fmtDate(sel, { long: true }))}</h2>
      <p class="muted">${esc(relDay(sel))}${habits.length && sel <= today() ? ` · ${kept} of ${habits.length} habits kept` : ''}</p>
      <section>
        <h3>Events <button class="btn small" data-new-event>${icon('plus', 14)}Event</button></h3>
        ${events.map((e) => `
          <div class="ev-row" data-ev="${e.id}" style="--c: ${colorVar(e.color)}" role="button" tabindex="0">
            <div class="grow"><b>${esc(e.title)}</b><small>${esc(when(e))}${e.place ? ` · ${esc(e.place)}` : ''}${e.repeat ? ' · repeats' : ''}</small></div>
          </div>`).join('') || '<p class="muted" style="font-size:13px">No events.</p>'}
      </section>
      <section>
        <h3>Tasks <button class="btn small" data-new-task>${icon('plus', 14)}Task</button></h3>
        ${tasks.map((t) => taskRow(t, { showDue: false })).join('') || '<p class="muted" style="font-size:13px">Nothing due.</p>'}
      </section>
      <section>
        <h3>Journal</h3>
        <textarea data-journal placeholder="A few lines about this day…" aria-label="Journal for this day">${esc(journal?.body || '')}</textarea>
      </section>
    </aside>`;
}

function html() {
  const first = parseYmd(cursor);
  const actions = `
    <button class="icon-btn" data-month="-1" aria-label="Previous month">${icon('left')}</button>
    <button class="btn" data-goto-today>Today</button>
    <button class="icon-btn" data-month="1" aria-label="Next month">${icon('right')}</button>
    <button class="btn primary" data-new-event aria-label="New event">${icon('plus', 18)}<span class="only-desktop">Event</span></button>`;
  return `
    ${viewHead(`${MONTHS[first.getMonth()]} ${first.getFullYear()}`, '', actions)}
    <div class="cal-layout">${monthGrid()}${dayPanel()}</div>`;
}

export function mount(el, param) {
  sel = /^\d{4}-\d{2}-\d{2}$/.test(param || '') ? param : today();
  cursor = `${sel.slice(0, 7)}-01`;
  const render = () => { el.innerHTML = html(); };
  bindTasks(el, 'calendar', render);

  const newEvent = (day = sel) => openEventEditor(null, { defaults: { date: day, start: '09:00', end: '10:00' }, onClose: render });

  // The journal saves as you type; an emptied one is removed rather than kept blank.
  const saveJournal = debounce((day, text) => {
    let note = journalFor(day);
    if (!text.trim()) {
      if (note) store.data.notes = store.data.notes.filter((n) => n !== note);
    } else {
      note ||= addNote({ title: fmtDate(day, { long: true }), date: day, journal: true, color: 'sand' });
      note.body = text;
      note.updated = Date.now();
    }
    store.commit('calendar');
  }, 400);

  const act = async (e) => {
    const target = /** @type {Element} */ (e.target);
    const pick = (name) => /** @type {HTMLElement|null} */ (target.closest(`[data-${name}]`));
    if (pick('date')) {
      sel = pick('date').dataset.date;
      if (sel.slice(0, 7) !== cursor.slice(0, 7)) cursor = `${sel.slice(0, 7)}-01`;
      saveJournal.flush();
      render();
      /** @type {HTMLElement|null} */ (el.querySelector(`[data-date="${sel}"]`))?.focus({ preventScroll: true });
      return;
    }
    if (pick('month')) { saveJournal.flush(); cursor = addMonths(cursor, Number(pick('month').dataset.month)); render(); return; }
    if (pick('goto-today')) { saveJournal.flush(); sel = today(); cursor = `${sel.slice(0, 7)}-01`; render(); return; }
    if (pick('new-event')) { newEvent(); return; }
    if (pick('ev')) {
      const ev = store.data.events.find((x) => x.id === pick('ev').dataset.ev);
      if (ev) openEventEditor(ev, { onClose: render });
      return;
    }
    if (pick('new-task')) {
      const text = await promptDialog(`Task for ${fmtDate(sel, { weekday: false })}`, { placeholder: 'What needs doing?', ok: 'Add' });
      if (text?.trim()) {
        const task = addTaskFromText(text);
        if (task && !task.due) task.due = sel;
        store.commit('calendar');
        render();
      }
    }
  };
  el.addEventListener('click', act);
  el.addEventListener('dblclick', (e) => {
    const cell = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('[data-date]'));
    if (cell) newEvent(cell.dataset.date);
  });
  el.addEventListener('keydown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if ((e.key === 'Enter' || e.key === ' ') && target.matches('[data-ev]')) { e.preventDefault(); act(e); return; }
    // Arrow keys walk the month.
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step && target.matches('[data-date]')) {
      e.preventDefault();
      sel = addDays(target.dataset.date, step);
      cursor = `${sel.slice(0, 7)}-01`;
      render();
      /** @type {HTMLElement|null} */ (el.querySelector(`[data-date="${sel}"]`))?.focus();
    }
  });
  el.addEventListener('input', (e) => {
    const area = /** @type {HTMLTextAreaElement} */ (e.target);
    if (area.matches('[data-journal]')) saveJournal(sel, area.value);
  });

  render();
  return {
    // Redrawing would throw away the journal box mid-sentence, so leave it be while it has the cursor.
    refresh: () => { if (!/** @type {Element|null} */ (document.activeElement)?.matches?.('[data-journal]')) render(); },
    destroy: () => saveJournal.flush(),
    create: () => newEvent(),
  };
}
