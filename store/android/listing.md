# Google Play listing — Meridian

Text to paste into Play Console → **Grow users → Store presence → Main store listing**,
and the answers for the forms under **Policy → App content**. Character limits are
Google's; the counts here were checked when this was written.

## App name (30 characters max)

```
Meridian: Tasks, Habits, Focus
```

30 characters. **Not just "Meridian":** it is a common name and other apps already use
it, so the subtitle says what this one is and makes it findable. If you would rather
have a name of your own, this is the moment to pick it, before anything is published.

## Short description (80 characters max)

```
Tasks, habits, notes, calendar and a focus timer. Offline, private, no account.
```

79 characters.

## Full description (4,000 characters max)

```
Meridian is one calm place for your day: a task list, a day planner, a calendar, notes, a habit tracker and a focus timer that all know about each other. It works offline, needs no account, and keeps everything on your phone.

PLAN THE DAY
• Today shows your day as a timeline: events, timed tasks and the free time between them.
• Overdue tasks and suggestions sit beside it, one tap from today's plan.
• A week strip moves the whole view to any other day.
• Copy your events and tasks into your phone's calendar, including Google Calendar.

TASKS THE WAY YOU THINK
• Type "Submit report every friday 4pm #work !1" and the date, time, repeat, list and priority are filled in for you.
• Lists, steps, priorities, repeating tasks and planned focus sessions.
• See any list three ways: a plain list, a board, or an urgent/important matrix.

NOTES THAT STAY PUT
• Coloured notes and checklists you can pin, archive and search.
• Link notes with [[double brackets]], and tie a note to a day as a journal.
• Lock a note with a passcode. Locked notes are encrypted on your device.

HABITS THAT FORGIVE
• Daily habits, set days, or "three times a week".
• Streaks, plus a strength score that dips a little when you miss a day instead of resetting to zero.
• An 18-week history for every habit.

FOCUS, ONE THING AT A TIME
• A session timer tied to the task you are working on.
• A plant grows while you focus and joins the day's garden when you finish.
• Short and long breaks, and a record of where your focus time went.

SEE IT ADD UP
• Points and levels for finished tasks, habits kept and time focused.
• Simple charts of the last 7, 14 or 30 days.

YOURS, AND ONLY YOURS
• Works fully offline. No account, no ads, no tracking, no purchases.
• Nothing leaves your phone unless you choose: back up to a file and restore it anywhere, or copy your plans into your phone's calendar.
• Reminders for timed tasks and events are scheduled on the device itself.
• Light and dark themes.
```

About 1,800 characters.

## Graphics (all in `store/android/`)

| Play Console slot | File | Size |
|---|---|---|
| App icon | `icon-512.png` | 512 × 512, 32-bit PNG |
| Feature graphic | `feature-graphic.jpg` | 1024 × 500 JPEG |
| Phone screenshots (2–8) | `screenshots/01-…08-….jpg` | 1080 × 1920 JPEG, 9:16 |
| 7-inch tablet screenshots (optional) | `tablet/*.jpg` | 1920 × 1080 JPEG, 16:9 |
| 10-inch tablet screenshots (optional) | the same seven files | |

Retake them any time with `tools/android/store-shots.sh` (and the icon with
`tools/android/make-icons.sh`). Every picture shows the app's made-up demo workspace
(`index.html?demo`), never real data.

## Categorization

- **App or game:** App
- **Category:** Productivity
- **Tags:** To-do list, Planner, Habit tracker (pick from the list Play offers)
- **Contact email:** yours (it is shown publicly on the listing)
- **Website:** https://friendlyuser.github.io/meridian/
- **Privacy policy:** https://friendlyuser.github.io/meridian/privacy.html

## App content forms (Policy → App content)

These are declarations you make to Google, so read each answer before you submit it.

| Form | Answer | Why |
|---|---|---|
| Privacy policy | the URL above | Required for every app |
| App access | All functionality is available without special access | No login |
| Ads | No, the app does not contain ads | |
| Content rating | Fill in the questionnaire (IARC) as a utility/productivity app: no violence, sexual content, language, drugs or gambling; no user-to-user communication; does not share location | Expect Everyone / PEGI 3; the questionnaire decides |
| Target audience | 13 and over | Choosing under-13 brings the Families policy into scope |
| Data safety | No data collected, no data shared | Everything stays on the device; no analytics, ads or accounts. Calendar export writes to a calendar on the phone and the app sends nothing itself; any syncing is Android's. **Re-read this answer before submitting the release that adds calendar export**: Google's definition of "collected" is data the app transmits off the device, and that is not the case here, but the decision is yours |
| Sensitive permissions | Calendar (`READ_CALENDAR`, `WRITE_CALENDAR`) | Not a restricted permission, so no declaration form. Asked for only when the person uses Settings → Phone calendar, and described in the privacy policy |
| Government apps, financial features, health | No | |
| Advertising ID | The app does not use an advertising ID | No ad or analytics SDKs |

## Release notes for version 1.0.0

```
The first release of Meridian: tasks, a day planner, calendar, notes, habits and a focus timer, all offline.
```
