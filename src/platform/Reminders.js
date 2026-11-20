// Reminders for timed tasks and events, with no server involved.
//
// In the Android app they are handed to the system as local notifications, so they
// arrive even when the app is closed. Every change simply replaces the whole set
// with the next few dozen that are due, so there is nothing to keep in step.
// In a browser tab there is no way to wake a closed page: reminders show only
// while the tab is open, as a toast and (if allowed) a browser notification.

import { isNative } from './Device.js';
import { store } from '../core/store.js';
import { upcomingReminders } from '../core/model.js';
import { debounce } from '../core/util.js';
import { toast } from '../ui/overlay.js';

const enabled = () => !!store.data.settings.reminders;

/** A stable whole number for a reminder: Android identifies notifications by int. */
function idOf(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(hash) % 2000000000 + 1;
}

async function plugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return LocalNotifications;
}

const syncNative = debounce(async () => {
  try {
    const notifications = await plugin();
    const pending = await notifications.getPending();
    if (pending.notifications.length) await notifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!enabled()) return;
    const next = upcomingReminders(new Date(), 14, 40);
    if (!next.length) return;
    await notifications.schedule({
      notifications: next.map((r) => ({
        id: idOf(r.key),
        title: r.title,
        body: r.body,
        // Inexact on purpose: exact alarms need a special permission, and a reminder
        // that is a minute or two late is fine.
        isExactNotification: false,
        schedule: { at: r.at, allowWhileIdle: true },
      })),
    });
  } catch (e) {
    console.warn(`Reminders: ${e?.message || e}`);
  }
}, 1500);

// ---- Browser tab: check twice a minute while the page is open ----
const shown = new Set();
function checkWeb() {
  if (!enabled()) return;
  const now = Date.now();
  // Look a minute back so nothing slips between two checks.
  for (const r of upcomingReminders(new Date(now - 60000), 1, 40)) {
    if (r.at.getTime() > now || shown.has(r.key)) continue;
    shown.add(r.key);
    toast(`${r.title} · ${r.body}`, { ms: 9000 });
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(r.title, { body: r.body });
    } catch { /* some browsers only allow notifications from a service worker */ }
  }
}

/**
 * Turn reminders on or off, asking for permission the first time.
 * Returns whether they are now on.
 */
export async function setReminders(on) {
  if (on) {
    try {
      if (isNative()) {
        const notifications = await plugin();
        let status = await notifications.checkPermissions();
        if (status.display !== 'granted') status = await notifications.requestPermissions();
        if (status.display !== 'granted') { toast('Notifications are switched off for this app in the system settings.'); on = false; }
      } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch (e) {
      console.warn(`Reminders: ${e?.message || e}`);
    }
  }
  store.data.settings.reminders = !!on;
  store.commit('settings');
  if (isNative()) syncNative();
  return !!on;
}

/** What turning reminders on will do here, in words for the settings screen. */
export function remindersNote() {
  if (isNative()) return 'A notification when a timed task is due, and ten minutes before an event.';
  return 'Shown while this tab is open. A web page cannot wake itself, so for reminders that arrive any time use the Android app.';
}

export function initReminders() {
  if (isNative()) {
    store.on(() => syncNative());
    syncNative();
  } else {
    setInterval(checkWeb, 30000);
  }
}
