// The Android app (Capacitor): what the web app needs from the shell around it.
// Nothing here runs in a browser tab, and the Capacitor packages are only imported
// inside the app, so the web build never loads them.

import { isNative } from './Device.js';
import { store } from '../core/store.js';
import { timer } from '../core/timer.js';
import { closeTop } from '../ui/overlay.js';

/** Wire the device's back button and the app coming back from the background. */
export async function initNative() {
  if (!isNative()) return;
  document.documentElement.classList.add('native');
  try {
    const { App } = await import('@capacitor/app');
    // Back closes whatever is open, then walks back to Today, then leaves the app.
    App.addListener('backButton', () => {
      if (closeTop()) return;
      if (location.hash && location.hash !== '#/today') location.hash = '#/today';
      else App.minimizeApp();
    });
    App.addListener('pause', () => store.flush());
    // Timers sleep with the app; on return, let the focus timer catch up at once.
    App.addListener('resume', () => timer.tick());
  } catch (e) {
    console.warn(`Native shell: ${e?.message || e}`);
  }
}

/**
 * Hand a file to the system share sheet (Drive, Files, mail…): a WebView has no
 * downloads of its own. Returns false if sharing is not possible.
 */
export async function shareFile(filename, text) {
  if (!isNative()) return false;
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: filename, files: [uri] });
    return true;
  } catch (e) {
    // Closing the share sheet without choosing anything also lands here; that is not a failure.
    if (/cancel/i.test(String(e?.message || e))) return true;
    console.warn(`Share: ${e?.message || e}`);
    return false;
  }
}
