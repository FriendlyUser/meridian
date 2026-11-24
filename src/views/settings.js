// Settings: appearance, reminders, the phone calendar (Android), and the data itself
// (back up, restore, erase).

import { store } from '../core/store.js';
import { esc, today, download, ago } from '../core/util.js';
import { seed } from '../core/seed.js';
import { isNative } from '../platform/Device.js';
import { shareFile } from '../platform/Native.js';
import { setReminders, remindersNote } from '../platform/Reminders.js';
import { canExportToCalendar, calendarAccess, phoneCalendars, savedCalendar, exportToCalendar, removeFromCalendar } from '../platform/CalendarExport.js';
import { icon } from '../ui/icons.js';
import { openModal, toast, confirmDialog } from '../ui/overlay.js';

const dark = () => window.matchMedia?.('(prefers-color-scheme: dark)');

/** Put the chosen theme on the page (and on the browser's own chrome). */
export function applyTheme() {
  const { theme } = store.data.settings;
  const resolved = theme === 'system' ? (dark()?.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#141310' : '#f4f1ea');
}

export function initTheme() {
  applyTheme();
  dark()?.addEventListener?.('change', applyTheme);
}

export function toggleTheme() {
  store.data.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  store.commit('settings');
}

async function exportBackup() {
  const name = `meridian-backup-${today()}.json`;
  const text = store.export();
  if (isNative()) {
    if (await shareFile(name, text)) return;
    try {
      await navigator.clipboard.writeText(text);
      toast('Sharing was not possible, so the backup was copied. Paste it somewhere safe.');
    } catch {
      toast('The backup could not be shared from this device.');
    }
    return;
  }
  if (download(name, text)) toast(`Saved ${name}`);
}

function importBackup(onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast('That file could not be read as a backup.');
      return;
    }
    const count = (k) => (Array.isArray(data?.[k]) ? data[k].length : 0);
    const ok = await confirmDialog(
      `The backup holds ${count('tasks')} tasks, ${count('notes')} notes, ${count('events')} events and ${count('habits')} habits. It will replace everything on this device.`,
      { title: 'Restore this backup?', ok: 'Replace everything', danger: true },
    );
    if (!ok) return;
    try {
      store.replace(data);
      applyTheme();
      toast('Backup restored.');
      onDone();
    } catch (e) {
      toast(e.message);
    }
  });
  input.click();
}

// ---- Phone calendar (Android app only) ----------------------------------------

let calendarBusy = false;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Where an export goes, in words: Google calendars sync on, local ones stay put. */
function calendarAccount(c) {
  if (c.accountType === 'com.google') return c.name === c.account ? 'Syncs to Google Calendar' : `${c.account} · syncs to Google Calendar`;
  if (c.accountType === 'LOCAL') return 'On this phone only';
  return c.account || '';
}

function calendarNote(saved) {
  if (!saved) return 'Copy your events, and open tasks that have a day, into a calendar on this phone. Choose one of your Google calendars and Android syncs them to Google Calendar.';
  const where = saved.account && saved.account !== saved.name ? ` (${saved.account})` : '';
  return `Copies events and open tasks to “${saved.name}”${where}. Last exported ${ago(saved.at)}. One way: changes made in that calendar are replaced the next time you export.`;
}

/** Calendar access and the calendars there are, or null once the reason has been told. */
async function calendarsOrSay() {
  if (!(await calendarAccess())) {
    toast('Calendar access is switched off for Meridian in the system settings.');
    return null;
  }
  const calendars = await phoneCalendars();
  if (!calendars.length) {
    toast('There is no calendar on this phone that Meridian can add to. Add a Google account in the phone’s settings first.');
    return null;
  }
  return calendars;
}

/** @returns {Promise<import('../platform/CalendarExport.js').PhoneCalendar|null>} */
function pickCalendar(calendars, current) {
  return new Promise((resolve) => {
    let answer = null;
    const modal = openModal({
      title: 'Export to which calendar?',
      className: 'narrow',
      body: `
        <p class="muted" style="margin-top:0;font-size:14px">Meridian adds your events, and open tasks that have a day, to this calendar and brings them up to date each time you export. Nothing else in it is changed.</p>
        <div class="cal-picks" role="list">${calendars.map((c, i) => `
          <button class="cal-pick ${current?.id === c.id ? 'on' : ''}" data-pick="${i}" role="listitem">
            <i class="dot" style="--c: ${esc(c.color)}"></i>
            <span>${esc(c.name)}<small>${esc(calendarAccount(c))}</small></span>
            ${current?.id === c.id ? `<i class="tick">${icon('check', 16)}</i>` : ''}
          </button>`).join('')}
        </div>`,
      footer: '<span class="spacer"></span><button class="btn" data-close>Cancel</button>',
      onClose: () => resolve(answer),
    });
    modal.body.addEventListener('click', (e) => {
      const btn = /** @type {HTMLElement|null} */ (/** @type {Element} */ (e.target).closest('[data-pick]'));
      if (!btn) return;
      answer = calendars[Number(btn.dataset.pick)];
      modal.close();
    });
  });
}

/** Export, choosing the calendar first if none is chosen yet (or `choose` asks to). */
async function calendarExport(choose) {
  const calendars = await calendarsOrSay();
  if (!calendars) return;
  const before = savedCalendar(calendars);
  const target = choose || !before ? await pickCalendar(calendars, before) : before;
  if (!target) return;
  // Moving to another calendar takes Meridian's events out of the old one first.
  const moved = before && before.id !== target.id ? (await removeFromCalendar(before, { forget: false })).removed : 0;
  const r = await exportToCalendar(target);
  const changes = r.added + r.changed + r.removed;
  if (moved) toast(`Moved ${plural(r.count, 'item')} from “${before.name}” to “${target.name}”.`);
  else if (!changes) toast(`“${target.name}” is up to date (${plural(r.count, 'item')}).`);
  else toast(`Exported to “${target.name}”: ${[r.added && `${r.added} added`, r.changed && `${r.changed} updated`, r.removed && `${r.removed} removed`].filter(Boolean).join(', ')}.`);
}

async function calendarRemove() {
  const calendars = await calendarsOrSay();
  if (!calendars) return;
  const cal = savedCalendar(calendars);
  if (!cal) {
    store.data.settings.calendarExport = null;
    store.commit('settings');
    return;
  }
  const ok = await confirmDialog(`Takes the events and tasks Meridian added out of “${cal.name}”. Nothing else in that calendar is touched, and nothing in Meridian changes.`, { title: 'Remove from the calendar?', ok: 'Remove' });
  if (!ok) return;
  const r = await removeFromCalendar(cal);
  toast(`Removed ${plural(r.removed, 'item')} from “${cal.name}”.`);
}

/** Run one calendar step at a time, telling the person if it fails. */
async function calendarStep(step, redraw) {
  if (calendarBusy) return;
  calendarBusy = true;
  redraw();
  try {
    await step();
  } catch (e) {
    console.warn(`Calendar: ${e?.message || e}`);
    toast(`The calendar could not be updated: ${e?.message || e}`);
  } finally {
    calendarBusy = false;
    redraw();
  }
}

const seg = (key, options, current) => `
  <div class="seg" data-setting="${key}">${options.map(([value, label]) => `<button data-value="${esc(value)}" class="${String(current) === String(value) ? 'on' : ''}">${label}</button>`).join('')}</div>`;

export function openSettings() {
  const modal = openModal({ title: 'Settings', body: '<div data-body></div>', footer: '<span class="muted" style="font-size:13px">Meridian 1.0 · no account, no server</span><span class="spacer"></span><button class="btn primary" data-close>Done</button>' });
  const body = /** @type {HTMLElement} */ (modal.body.querySelector('[data-body]'));
  const draw = () => {
    const s = store.data.settings;
    const kb = Math.max(1, Math.round(store.size() / 1024));
    body.innerHTML = `
      <div class="settings-row"><div>Theme</div>${seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], s.theme)}</div>
      <div class="settings-row"><div>Week starts on</div>${seg('weekStart', [[0, 'Sunday'], [1, 'Monday']], s.weekStart)}</div>
      <div class="settings-row"><div>Clock</div>${seg('hour12', [[true, '12-hour'], [false, '24-hour']], s.hour12)}</div>
      <div class="settings-row">
        <div>Reminders<small>${esc(remindersNote())}</small></div>
        <button class="btn ${s.reminders ? 'primary' : ''}" data-reminders aria-pressed="${!!s.reminders}">${icon('bell', 18)}${s.reminders ? 'On' : 'Turn on'}</button>
      </div>${canExportToCalendar() ? `
      <div class="settings-row">
        <div>Phone calendar<small>${esc(calendarNote(s.calendarExport))}</small></div>
        <button class="btn" data-cal-export ${calendarBusy ? 'disabled' : ''}>${icon('calendar', 18)}${s.calendarExport ? 'Export now' : 'Choose calendar'}</button>
        ${s.calendarExport ? `<button class="btn" data-cal-choose ${calendarBusy ? 'disabled' : ''}>Change</button><button class="btn" data-cal-remove ${calendarBusy ? 'disabled' : ''}>Remove</button>` : ''}
      </div>` : ''}
      <div class="settings-row">
        <div>Your data<small>Stored only on this device (about ${kb.toLocaleString()} KB). Keep a backup: clearing the browser's or the app's storage erases it.</small></div>
        <button class="btn" data-export>${icon('download', 18)}Back up</button>
        <button class="btn" data-import>${icon('upload', 18)}Restore</button>
      </div>
      <div class="settings-row">
        <div>Sample content<small>A few example tasks, notes and habits to look around with.</small></div>
        <button class="btn" data-sample>Add samples</button>
      </div>
      <div class="settings-row">
        <div>Erase everything<small>Deletes all tasks, notes, events, habits and history from this device.</small></div>
        <button class="btn danger" data-erase>${icon('trash', 18)}Erase</button>
      </div>`;
  };
  draw();
  body.addEventListener('click', async (e) => {
    const target = /** @type {Element} */ (e.target);
    const pick = (name) => /** @type {HTMLElement|null} */ (target.closest(`[data-${name}]`));
    const s = store.data.settings;
    const value = pick('value');
    if (value) {
      const key = /** @type {HTMLElement} */ (value.closest('[data-setting]')).dataset.setting;
      const raw = value.dataset.value;
      s[key] = key === 'weekStart' ? Number(raw) : key === 'hour12' ? raw === 'true' : raw;
      applyTheme();
      store.commit('settings');
      draw();
    } else if (pick('reminders')) {
      await setReminders(!s.reminders);
      draw();
    } else if (pick('cal-export')) {
      calendarStep(() => calendarExport(false), draw);
    } else if (pick('cal-choose')) {
      calendarStep(() => calendarExport(true), draw);
    } else if (pick('cal-remove')) {
      calendarStep(calendarRemove, draw);
    } else if (pick('export')) {
      exportBackup();
    } else if (pick('import')) {
      importBackup(draw);
    } else if (pick('sample')) {
      seed();
      store.commit('settings');
      toast('Sample content added.');
      draw();
    } else if (pick('erase')) {
      if (await confirmDialog('This cannot be undone. Make a backup first if there is anything you want to keep.', { title: 'Erase everything on this device?', ok: 'Erase everything' })) {
        store.reset();
        applyTheme();
        toast('Everything was erased.');
        draw();
      }
    }
  });
  return modal;
}
