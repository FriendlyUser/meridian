// Headless tests for exporting to the phone's calendar: what becomes a calendar
// row, how repeats and all-day spans are written, and what each export adds,
// changes and removes. The device side (src/platform/CalendarExport.js and the
// Android plugin) only carries these rows to and from Android's calendar.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { exportRows, planExport, rrule, durationSeconds, keyOf, refLine, sameRow } from '../src/core/calexport.js';

const DAY = 864e5;
const local = (y, m, d, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm).getTime();
const one = (data) => {
  const rows = exportRows(data, { timeZone: 'America/Edmonton' });
  assert.equal(rows.length, 1);
  return rows[0];
};

test('calendar export: repeats become RRULEs', () => {
  assert.equal(rrule(null), null);
  assert.equal(rrule({ unit: 'day', n: 1 }), 'FREQ=DAILY');
  assert.equal(rrule({ unit: 'day', n: 3 }), 'FREQ=DAILY;INTERVAL=3');
  assert.equal(rrule({ unit: 'weekday', n: 1 }), 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  assert.equal(rrule({ unit: 'week', n: 2 }), 'FREQ=WEEKLY;INTERVAL=2');
  assert.equal(rrule({ unit: 'month', n: 1 }), 'FREQ=MONTHLY');
  assert.equal(rrule({ unit: 'year', n: 1 }), 'FREQ=YEARLY');
  assert.equal(rrule({ unit: 'fortnight', n: 1 }), null);
});

test('calendar export: durations as Android writes them', () => {
  assert.equal(durationSeconds('P3600S'), 3600);
  assert.equal(durationSeconds('PT1H30M'), 5400);
  assert.equal(durationSeconds('P2D'), 2 * 86400);
  assert.equal(durationSeconds('P1W'), 604800);
  assert.equal(durationSeconds('nonsense'), null);
  assert.equal(durationSeconds(null), null);
});

test('calendar export: the reference line is how rows are recognised', () => {
  assert.equal(keyOf(`Bring the slides\n\n${refLine('e:abc123')}`), 'e:abc123');
  assert.equal(keyOf(refLine('t:lp3k9x2-q_1')), 't:lp3k9x2-q_1');
  // Google can turn a description into HTML when it is edited on the web.
  assert.equal(keyOf('Notes<br><br>From Meridian (meridian:e:abc123)'), 'e:abc123');
  assert.equal(keyOf('Dentist'), null);
  assert.equal(keyOf('meridian:e:abc123'), null);
  assert.equal(keyOf(null), null);
});

test('calendar export: a timed event', () => {
  const r = one({ events: [{ id: 'ev1', title: 'Standup', date: '2026-11-19', start: '09:30', end: '09:45', place: ' Room 4 ', notes: 'Bring numbers' }] });
  assert.equal(r.key, 'e:ev1');
  assert.equal(r.title, 'Standup');
  assert.equal(r.location, 'Room 4');
  assert.equal(r.description, `Bring numbers\n\n${refLine('e:ev1')}`);
  assert.equal(r.allDay, false);
  assert.equal(r.timezone, 'America/Edmonton');
  assert.equal(r.dtstart, local(2026, 11, 19, 9, 30));
  assert.equal(r.dtend, local(2026, 11, 19, 9, 45));
  assert.equal(r.rrule, null);
  assert.equal(r.duration, null);
});

test('calendar export: an event with no end lasts an hour', () => {
  const r = one({ events: [{ id: 'ev1', title: 'Call', date: '2026-11-19', start: '14:00', end: null }] });
  assert.equal(r.dtend - r.dtstart, 3600000);
  const bad = one({ events: [{ id: 'ev2', title: 'Call', date: '2026-11-19', start: '14:00', end: '13:00' }] });
  assert.equal(bad.dtend - bad.dtstart, 3600000);
});

test('calendar export: all-day events run midnight to midnight UTC, end exclusive', () => {
  const r = one({ events: [{ id: 'trip', title: 'Lisbon', date: '2026-12-03', endDate: '2026-12-06', start: null }] });
  assert.equal(r.allDay, true);
  assert.equal(r.timezone, 'UTC');
  assert.equal(r.dtstart, Date.UTC(2026, 11, 3));
  assert.equal(r.dtend, Date.UTC(2026, 11, 7));
  const single = one({ events: [{ id: 'bday', title: 'Birthday', date: '2026-11-30', endDate: null, start: null }] });
  assert.equal(single.dtend - single.dtstart, DAY);
});

test('calendar export: a repeating event keeps a duration instead of an end', () => {
  const timed = one({ events: [{ id: 'gym', title: 'Gym', date: '2026-11-17', start: '18:00', end: '19:30', repeat: { unit: 'week', n: 1 } }] });
  assert.equal(timed.rrule, 'FREQ=WEEKLY');
  assert.equal(timed.dtend, null);
  assert.equal(timed.duration, 'P5400S');
  const allDay = one({ events: [{ id: 'bin', title: 'Bins out', date: '2026-11-18', start: null, repeat: { unit: 'week', n: 2 } }] });
  assert.equal(allDay.rrule, 'FREQ=WEEKLY;INTERVAL=2');
  assert.equal(allDay.dtend, null);
  assert.equal(allDay.duration, 'P1D');
});

test('calendar export: open tasks with a day, timed and untimed', () => {
  const data = {
    lists: [{ id: 'inbox', name: 'Inbox' }, { id: 'w', name: 'Work' }],
    tasks: [
      { id: 't1', title: 'Submit report', due: '2026-11-20', time: '16:00', duration: 45, listId: 'w', notes: '' },
      { id: 't2', title: 'Water plants', due: '2026-11-21', time: null, listId: 'inbox', notes: 'Kitchen too' },
    ],
  };
  const [timed, allDay] = exportRows(data, { timeZone: 'Europe/Lisbon' });
  assert.equal(timed.key, 't:t1');
  assert.equal(timed.dtstart, local(2026, 11, 20, 16, 0));
  assert.equal(timed.dtend - timed.dtstart, 45 * 60000);
  assert.equal(timed.timezone, 'Europe/Lisbon');
  assert.equal(timed.description, `List: Work\n\n${refLine('t:t1')}`);
  assert.equal(allDay.allDay, true);
  assert.equal(allDay.dtstart, Date.UTC(2026, 10, 21));
  assert.equal(allDay.description, `Kitchen too\n\n${refLine('t:t2')}`);

  const noLength = one({ tasks: [{ id: 't3', title: 'Call', due: '2026-11-20', time: '10:00', duration: null, listId: 'inbox' }] });
  assert.equal(noLength.dtend - noLength.dtstart, 30 * 60000);
});

test('calendar export: a repeating task exports only its current day', () => {
  const r = one({ tasks: [{ id: 't1', title: 'Timesheet', due: '2026-11-20', time: null, repeat: { unit: 'week', n: 1 }, listId: 'inbox' }] });
  assert.equal(r.rrule, null);
  assert.equal(r.dtend - r.dtstart, DAY);
});

test('calendar export: what stays out', () => {
  const rows = exportRows({
    events: [
      { id: 'ok', title: 'Kept', date: '2026-11-19' },
      { id: 'no date', title: 'Bad id', date: '2026-11-19' },
      { id: 'x1', title: 'No day', date: null },
    ],
    tasks: [
      { id: 'done', title: 'Done', due: '2026-11-19', done: true },
      { id: 'step', title: 'A step', due: '2026-11-19', parentId: 'ok' },
      { id: 'someday', title: 'No due day', due: null },
      { id: 'bad]id', title: 'Odd id', due: '2026-11-19' },
    ],
  });
  assert.deepEqual(rows.map((r) => r.key), ['e:ok']);
});

test('calendar export: planning adds, changes, removes and leaves other events alone', () => {
  const wanted = exportRows({
    events: [
      { id: 'same', title: 'Same', date: '2026-11-19', start: '09:00', end: '10:00' },
      { id: 'moved', title: 'Moved', date: '2026-11-20', start: '09:00', end: '10:00' },
      { id: 'new', title: 'New', date: '2026-11-21' },
    ],
  }, { timeZone: 'UTC' });
  const [same, moved] = wanted;
  const existing = [
    { id: 10, ...same },
    { id: 11, ...moved, dtstart: moved.dtstart - 3600000 },
    { id: 12, title: 'Gone from Meridian', description: refLine('e:deleted'), dtstart: 0, dtend: DAY, allDay: true },
    { id: 13, title: 'The user’s own event', description: 'Dentist', dtstart: 0, dtend: DAY, allDay: true },
    { id: 14, title: 'A copy', ...same, description: same.description },
  ];
  const plan = planExport(wanted, existing);
  assert.deepEqual(plan.add.map((r) => r.key), ['e:new']);
  assert.deepEqual(plan.change.map((c) => [c.id, c.row.key]), [[11, 'e:moved']]);
  assert.deepEqual(plan.remove.sort(), [12, 14]);
});

test('calendar export: a second export of the same data does nothing', () => {
  const data = {
    events: [
      { id: 'a', title: 'Gym', date: '2026-11-17', start: '18:00', end: '19:30', repeat: { unit: 'week', n: 1 } },
      { id: 'b', title: 'Trip', date: '2026-12-03', endDate: '2026-12-06' },
    ],
    tasks: [{ id: 'c', title: 'Report', due: '2026-11-20', time: '16:00', listId: 'inbox' }],
  };
  const wanted = exportRows(data, { timeZone: 'UTC' });
  // As Android hands them back: ids, and a duration it may have rewritten.
  const existing = wanted.map((r, i) => ({ ...r, id: i + 1, duration: r.duration === 'P5400S' ? 'PT1H30M' : r.duration }));
  assert.deepEqual(planExport(wanted, existing), { add: [], change: [], remove: [] });
  assert.equal(sameRow(wanted[0], { ...existing[0], timezone: 'Asia/Tokyo' }), false);
});

test('calendar export: removing everything Meridian added', () => {
  const existing = [
    { id: 1, description: refLine('e:a') },
    { id: 2, description: 'Not ours' },
    { id: 3, description: `Notes\n\n${refLine('t:b')}` },
  ];
  assert.deepEqual(planExport([], existing), { add: [], change: [], remove: [1, 3] });
});
