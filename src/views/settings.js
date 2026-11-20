// Settings: appearance, reminders, and the data itself (back up, restore, erase).

import { store } from '../core/store.js';
import { esc, today, download } from '../core/util.js';
import { seed } from '../core/seed.js';
import { isNative } from '../platform/Device.js';
import { shareFile } from '../platform/Native.js';
import { setReminders, remindersNote } from '../platform/Reminders.js';
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

const seg = (key, options, current) => `
  <div class="seg" data-setting="${key}">${options.map(([value, label]) => `<button data-value="${esc(value)}" class="${String(current) === String(value) ? 'on' : ''}">${label}</button>`).join('')}</div>`;

export function openSettings() {
  const modal = openModal({ title: 'Settings', body: '<div data-body></div>', footer: '<span class="muted" style="font-size:13px">Meridian 1.0 · nothing leaves this device</span><span class="spacer"></span><button class="btn primary" data-close>Done</button>' });
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
      </div>
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
