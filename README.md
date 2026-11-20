# Meridian

Tasks, a day planner, a calendar, notes, habits and a focus timer in one app.
Everything is stored on the device it runs on. There is no account, no server
and no network request: the same build runs as a web page and as an Android app.

## What is in it

The feature set came from reading the Google Play productivity charts (November 2026)
and keeping the ideas that work with no backend:

| Screen | What it does | Borrowed from the idea in |
|---|---|---|
| **Today** | The day as a timeline of events and timed tasks with the free time between them, what is left to do, overdue items, and suggestions to pull in | Structured, Microsoft To Do's My Day |
| **Tasks** | Lists, steps, priorities, repeats and planned focus sessions; seen as a list, a board, or an urgent/important matrix | Todoist, TickTick, Trello |
| **Quick add** | Type `Submit report every friday 4pm #work !1` and the date, time, repeat, list and priority are read from the line | Todoist |
| **Calendar** | A month of events and due tasks, with a journal note per day | Google Calendar, ColorNote |
| **Notes** | Coloured notes and checklists, pinned and archived, linked with `[[Title]]`, and lockable with a passcode (AES-GCM, key from PBKDF2) | ColorNote, Google Keep |
| **Habits** | Daily, set-day and N-times-a-week habits with streaks, a strength score that forgives a missed day, and an 18-week history | Loop Habit Tracker |
| **Focus** | A session timer tied to a task; a plant grows as it runs and joins the day's garden when it ends | Focus To-Do, Forest |
| **Progress** | Points and levels for finished tasks, habits and focus time, with daily charts | Habitica |

Also: search and commands on `Ctrl K`, keyboard shortcuts (`?` lists them), light and
dark themes, reminders, and a backup file you can save and restore from Settings.

Left out on purpose because they need a server or belong to another kind of app:
sync, sharing, AI assistants, cloud storage, document scanning and office file editing.

## Run it

```bash
npm install
npm run dev        # http://localhost:8770
npm test           # headless tests for quick add, repeats, habits, levels
npm run typecheck  # tsc over the plain JavaScript (JSDoc types, nothing emitted)
npm run build      # bundle into dist/ for any static host
```

The app is plain ES modules with no framework. Vite serves them in development and
bundles them for release; that is the whole toolchain.

```
index.html, css/style.css
src/main.js            start-up and the keyboard
src/core/              data and rules, no DOM: store, model, quickadd, timer, vault, seed
src/ui/                shell and router, dialogs, shared parts, search, icons
src/views/             one file per screen
src/platform/          what differs inside the Android app: back button, sharing, reminders
tests/                 node --test
android/               the Capacitor project
tools/android/         release and icon scripts
```

## Where the data lives

One JSON document in the browser's (or the app's) `localStorage`, key `meridian.v1`.
Settings → *Back up* writes it to a file and *Restore* reads one back. Clearing the
site's data, or the app's storage, erases it, so keep a backup.

Locked notes are stored only in sealed form. The passcode is never stored and cannot
be recovered.

## Android

The same build runs as an Android app (Capacitor). One command builds the Google Play
bundle on GitHub Actions and signs it locally with the shared upload key:

```bash
tools/android/release.sh
```

How that works, what a first release needs, and what has and has not been tested is in
[docs/ANDROID.md](docs/ANDROID.md).
