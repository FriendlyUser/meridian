# Meridian on Android

The Android app is the web app inside a [Capacitor](https://capacitorjs.com/) shell:
the same `dist/` that any static host serves, packaged with a small native project in
`android/`. Package name **`io.github.friendlyuser.meridian`**, Capacitor 8, target
API 36, minimum Android 7.0.

It is set up the way Afterlight is, and released with the same signing kit:

| Where | What |
|---|---|
| `android/`, `capacitor.config.json` | The native project. Edited by hand rarely; `npx cap sync android` refreshes the web files in it |
| `.github/workflows/android.yml` | Builds the unsigned bundle and a debug APK on GitHub (copied unchanged from the kit's template) |
| `tools/android/release.sh` | Starts that build, downloads it and signs it (the kit's template) |
| `tools/android/make-icons.sh`, `tools/android/store-shots.sh`, `tools/android/art/` | Redraw the launcher icon; retake the store pictures |
| `store/android/` | The Play listing: text, icon, feature graphic, screenshots |
| `/home/david/claude_space/android-release/` | The signing kit, shared by every app (not in this repository) |
| `~/.android-release/` | **The upload key and its password.** Never in any repository |

## Before the first release

The build runs on GitHub from what has been pushed, so the project has to be a GitHub
repository first:

1. Put this folder where the other projects live (for example
   `/home/david/claude_space/meridian`) so `tools/android/release.sh` can find the kit,
   or set `ANDROID_RELEASE_KIT`.
2. `git init`, commit, create the repository on GitHub and push `main`.
3. If the web version should be public too: repository Settings → Pages → Source:
   "GitHub Actions" (`.github/workflows/pages.yml` then publishes `dist/` on every push).

The package name is fixed for good by the first bundle uploaded to Play. To rename the
app before that, change `appId` and `appName` in `capacitor.config.json`, the
`namespace` and `applicationId` in `android/app/build.gradle`, the strings in
`android/app/src/main/res/values/strings.xml`, and move
`android/app/src/main/java/io/github/friendlyuser/meridian/`.

## Build a release

```bash
tools/android/release.sh
```

It needs everything committed and pushed. It then

1. starts the **Android bundle** workflow,
2. waits about five minutes and downloads the result,
3. signs the bundle with the upload key and checks the signature.

It leaves two files in `release/android/` (not committed):

- `meridian-<version>-<code>.aab` — **upload this to Play Console.**
- `meridian-<version>-<code>-debug.apk` — the same build as an installable APK, for
  trying on a phone first.

**Version name** is `"version"` in `package.json` (or pass one:
`tools/android/release.sh 1.0.1`). **Version code** is the UTC date and hour,
`YYMMDDHH`, so every build is higher than the last.

## What has and has not been tested

Tested, in desktop Chrome at desktop and phone sizes: every screen and dialog, quick
add, repeats, locked notes, the timer, search, settings, backup. The rules have
headless tests (`npm test`).

**Not tested: anything on a real phone.** There is no Android SDK, device or emulator
on this machine, so the native project has been generated, customised and synced, but
its first compile happens on GitHub and its first launch is yours. Check, in this order:

1. The app opens with no white flash, and the tab bar clears the system navigation bar.
2. Typing: the keyboard does not cover the box being typed in (quick add, a note).
3. A task survives closing and reopening the app.
4. The back button closes a dialog, then returns to Today, then leaves the app.
5. Settings → Reminders → *Turn on* asks for notification permission; a task given a
   time a few minutes ahead produces a notification with the app closed. Reminders are
   scheduled as inexact alarms, so a minute or two late is expected.
6. Settings → *Back up* opens the share sheet with a `.json` file; *Restore* reads it back.
7. Locking a note works (it needs a secure page; the app's own `https://localhost` is one).
8. Settings → *Phone calendar* → *Choose calendar* asks for calendar access and lists the
   phone's calendars, Google ones first. Pick your Google calendar: the toast says how many
   items were added, and they appear in the Google Calendar app (and, after a sync, on
   calendar.google.com). Check a timed event, an all-day event that spans several days, a
   repeating event, and a task with and without a time. Then:
   - *Export now* again with nothing changed says the calendar is up to date.
   - Edit an event in Meridian, tick off a task, delete an event, and export: the calendar
     follows (the ticked task disappears from it).
   - An event you made yourself in that calendar is never touched.
   - *Change* to another calendar moves Meridian's items there; *Remove* takes them out.
   - Whether Google adds its default notifications to exported events (on top of Meridian's
     own reminders). If it does and that is unwanted, the plugin can write `HAS_ALARM = 0`
     explicitly or remove them after insert.

If the layout sits under the status bar or the navigation bar, the place to look is
`SystemBars` in `capacitor.config.json` together with `--safe-top` and `--safe-bottom`
at the top of `css/style.css`.

## How the app differs from the web page

- **Reminders** (`src/platform/Reminders.js`) become real notifications that arrive
  with the app closed. On the web they only show while the tab is open.
- **Back up** (`src/platform/Native.js`) writes the file to the app's cache and opens
  the share sheet, because a WebView has no downloads.
- **Back button**: closes what is open, then goes to Today, then minimises the app.
- **Phone calendar** (`src/platform/CalendarExport.js`, `src/core/calexport.js`, and the
  native `CalendarExportPlugin.java` beside `MainActivity.java`) copies events and open
  tasks that have a day into a calendar the person chooses, through Android's Calendar
  Provider. The app makes no network request for it: if the calendar belongs to a Google
  account, Android's own sync takes the events to Google Calendar. It is one way, with
  Meridian as the source. Each export adds, updates and removes entries so the calendar
  matches. Meridian recognises its own entries by the line
  `From Meridian (meridian:e:<id>)` at the end of each description, which survives
  Google's sync, so a new phone restored from a backup still finds them. The native side
  refuses to change or delete any entry without that line, so nothing the person made
  can be touched. Repeating events are written with an RRULE. Repeating tasks export only
  their current day, because Meridian adds the next one when a task is ticked off.
  Colours are not exported: Google calendars accept only their own palette.
- **Data** is in the app's own storage and is included in Android's device backup
  (`allowBackup`), which is what brings it back on a new phone.
- **Permissions**: Internet (required by the WebView; the app contacts nothing),
  notifications (asked only when reminders are turned on), calendar read and write (asked
  only when Settings → *Phone calendar* is first used), start at boot and wake lock
  (so scheduled reminders survive a restart). The exact-alarm permission the
  notifications plugin declares is removed in `AndroidManifest.xml`.

## First time on Google Play

The steps are the same as for Afterlight (`afterlight/docs/ANDROID.md`): create the
app in Play Console as an *App* in the *Productivity* category, upload the first bundle
to Internal testing and accept Play App Signing, then fill in the listing and the App
content forms. A privacy policy page is in `public/privacy.html`; it is published with
the site at `<pages url>/privacy.html`. **Read it before using it: it speaks for you,**
and its contact link assumes the repository is `FriendlyUser/meridian`.

Everything the listing needs is in `store/android/`: the text and the form answers in
[`listing.md`](../store/android/listing.md), the icon, the feature graphic, eight phone
screenshots and seven tablet ones.

## Tools

| Command | Does |
|---|---|
| `tools/android/release.sh [version]` | Build on GitHub, download, sign |
| `tools/android/make-icons.sh` | Redraw the icon (`tools/android/art/icon.html`) at every size |
| `tools/android/store-shots.sh [--preview] [name…]` | Retake the store screenshots and the feature graphic from the demo workspace (`index.html?demo`) |
| `tools/npm.sh <args>` | npm from WSL when Node is only installed on Windows |
| `npx cap sync android` | Copy a fresh `dist/` into the native project; run after adding a plugin |
