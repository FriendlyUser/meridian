// Headless tests for the parts with rules worth pinning down: quick add, repeats,
// events, habits and levels. Run with `npm test` (Node's built-in runner, no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseQuick } from '../src/core/quickadd.js';
import { store, blank } from '../src/core/store.js';
import { addDays, ymd, today } from '../src/core/util.js';
import {
  addTask, addTaskFromText, setTaskDone, nextDue, occursOn, addHabit, toggleHabit, habitStreak,
  habitBestStreak, habitStrength, levelInfo, quadrant, sortTasks, listByToken, deleteList,
  addSession, dayStats, dayStreak, upcomingReminders, addEvent, subtasksOf,
} from '../src/core/model.js';

// Thursday 19 November 2026, 10:00.
const NOW = new Date(2026, 10, 19, 10, 0);
const q = (s) => parseQuick(s, NOW);
const fresh = () => { store.data = blank(); };

test('quick add: relative days and times', () => {
  assert.deepEqual(q('Dinner with Ana tomorrow 7pm'), {
    title: 'Dinner with Ana', date: '2026-11-20', time: '19:00', endTime: null, repeat: null, priority: null, list: null, duration: null,
  });
  assert.equal(q('Call mom today').date, '2026-11-19');
  assert.deepEqual([q('Movie tonight').date, q('Movie tonight').time], ['2026-11-19', '19:00']);
  assert.equal(q('Plan trip day after tomorrow').date, '2026-11-21');
  assert.equal(q('Review in 3 days').date, '2026-11-22');
  assert.equal(q('Review in two weeks').date, '2026-12-03');
  assert.equal(q('Sync next week').date, '2026-11-26');
});

test('quick add: weekdays', () => {
  assert.equal(q('Gym friday').date, '2026-11-20');
  assert.equal(q('Gym on monday').date, '2026-11-23');
  assert.equal(q('Gym thursday').date, '2026-11-26'); // today is Thursday: the next one
  assert.equal(q('Gym next friday').date, '2026-11-27');
  assert.equal(q('Gym on monday').title, 'Gym');
  assert.equal(q('Buy sun screen').date, null); // "sun" alone is not a day
});

test('quick add: calendar dates', () => {
  assert.equal(q('Rent nov 25').date, '2026-11-25');
  assert.equal(q('Rent November 25th, 2027').date, '2027-11-25');
  assert.equal(q('Taxes 25 nov').date, '2026-11-25');
  assert.equal(q('Party jan 5').date, '2027-01-05'); // already past this year
  assert.equal(q('Dentist 11/25').date, '2026-11-25');
  assert.equal(q('Dentist 25/11').date, '2026-11-25');
  assert.equal(q('Launch 2026-12-01').date, '2026-12-01');
  assert.equal(q('Nonsense feb 31').date, null);
  assert.equal(q('I may go').date, null);
});

test('quick add: times', () => {
  assert.equal(q('Standup 9:15').time, '09:15');
  assert.equal(q('Call at 3').time, '15:00');
  assert.equal(q('Lunch noon').time, '12:00');
  assert.equal(q('Flight 15:30').time, '15:30');
  assert.equal(q('Wake up 6am').time, '06:00');
  assert.equal(q('Late 12am').time, '00:00');
  // A time alone means the next time the clock shows it.
  assert.equal(q('Standup 9am').date, '2026-11-20');
  assert.equal(q('Standup 11am').date, '2026-11-19');
  const r = q('Workshop 3-4:30pm friday');
  assert.deepEqual([r.title, r.date, r.time, r.endTime, r.duration], ['Workshop', '2026-11-20', '15:00', '16:30', 90]);
  assert.deepEqual([q('Brunch 11-1pm').time, q('Brunch 11-1pm').endTime], ['11:00', '13:00']);
  assert.deepEqual([q('Block 9:00-10:30').time, q('Block 9:00-10:30').endTime], ['09:00', '10:30']);
  assert.equal(q('Read pages 3-4').time, null);
});

test('quick add: repeats, lists, priority, length', () => {
  const r = q('Submit report every friday 4pm #work !1');
  assert.deepEqual(r, {
    title: 'Submit report', date: '2026-11-20', time: '16:00', endTime: null,
    repeat: { unit: 'week', n: 1 }, priority: 1, list: 'work', duration: null,
  });
  assert.deepEqual(q('Water plants every 3 days').repeat, { unit: 'day', n: 3 });
  assert.deepEqual(q('Journal daily').repeat, { unit: 'day', n: 1 });
  assert.deepEqual(q('Standup every weekday 9am').repeat, { unit: 'weekday', n: 1 });
  assert.deepEqual(q('Pay rent monthly').repeat, { unit: 'month', n: 1 });
  assert.deepEqual(q('Review every other week').repeat, { unit: 'week', n: 2 });
  assert.equal(q('Every thursday bins every thursday').date, '2026-11-19'); // today counts for a repeat
  assert.equal(q('Deep work tomorrow 9am for 90m').duration, 90);
  assert.equal(q('Deep work for 1.5h').duration, 90);
  assert.equal(q('Fix bug p2').priority, 2);
  assert.equal(q('Fix bug p2').title, 'Fix bug');
});

test('quick add leaves ordinary text alone', () => {
  for (const s of ['Buy milk', 'Read chapter 4', 'Email Sam about the 3 options', 'Top 10 ideas']) {
    const r = q(s);
    assert.equal(r.title, s);
    assert.equal(r.date, null);
    assert.equal(r.time, null);
  }
});

test('next due date of a repeating task', () => {
  const from = '2026-11-19';
  assert.equal(nextDue('2026-11-19', { unit: 'day', n: 1 }, from), '2026-11-20');
  assert.equal(nextDue('2026-11-10', { unit: 'day', n: 1 }, from), '2026-11-20'); // overdue: skip to after today
  assert.equal(nextDue('2026-11-20', { unit: 'weekday', n: 1 }, from), '2026-11-23'); // Friday -> Monday
  assert.equal(nextDue('2026-11-12', { unit: 'week', n: 1 }, from), '2026-11-26');
  assert.equal(nextDue('2026-01-31', { unit: 'month', n: 1 }, '2026-01-31'), '2026-02-28');
  assert.equal(nextDue('2026-11-19', { unit: 'year', n: 1 }, from), '2027-11-19');
});

test('finishing a repeating task adds the next one and keeps the history', () => {
  fresh();
  const t = addTask({ title: 'Water plants', due: today(), repeat: { unit: 'day', n: 2 }, priority: 1 });
  addTask({ title: 'Fill can', parentId: t.id });
  const next = setTaskDone(t, true);
  assert.equal(t.done, true);
  assert.equal(t.repeat, null);
  assert.equal(next.due, addDays(today(), 2));
  assert.deepEqual(next.repeat, { unit: 'day', n: 2 });
  assert.equal(next.done, false);
  assert.equal(subtasksOf(next.id).length, 1);
  assert.equal(subtasksOf(t.id)[0].done, true);
  assert.equal(store.data.profile.xp, 15); // 10 + 5 for urgent
  setTaskDone(t, false);
  assert.equal(store.data.profile.xp, 0);
});

test('typed tasks land in the right list', () => {
  fresh();
  const work = listByToken('work');
  assert.equal(work.name, 'Work');
  const t = addTaskFromText('Ship it tomorrow #wo !2');
  assert.equal(t.listId, work.id);
  assert.equal(t.priority, 2);
  assert.equal(t.due, addDays(today(), 1));
  assert.equal(store.data.lists.length, 2);
  deleteList(work.id);
  assert.equal(t.listId, 'inbox');
  assert.equal(addTaskFromText('   '), null);
});

test('sorting and the priority matrix', () => {
  fresh();
  const day = '2026-11-19';
  const a = addTask({ title: 'a', due: '2026-11-25', priority: 1 });
  const b = addTask({ title: 'b', due: day, priority: 4 });
  const c = addTask({ title: 'c', priority: 2 });
  const d = addTask({ title: 'd', due: day, time: '09:00', priority: 2 });
  assert.deepEqual(sortTasks([a, b, c, d]).map((t) => t.title), ['d', 'b', 'a', 'c']);
  assert.deepEqual([a, b, c, d].map((t) => quadrant(t, day)), [1, 2, 1, 0]);
});

test('events repeat and span days', () => {
  const weekly = { date: '2026-11-19', endDate: null, repeat: { unit: 'week', n: 1 } };
  assert.equal(occursOn(weekly, '2026-11-26'), true);
  assert.equal(occursOn(weekly, '2026-11-25'), false);
  assert.equal(occursOn(weekly, '2026-11-12'), false); // before it began
  const trip = { date: '2026-11-19', endDate: '2026-11-21', repeat: null };
  assert.deepEqual(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map((d) => occursOn(trip, d)), [false, true, true, true, false]);
  const monthly = { date: '2026-01-31', endDate: null, repeat: { unit: 'month', n: 1 } };
  assert.equal(occursOn(monthly, '2026-03-31'), true);
  assert.equal(occursOn(monthly, '2026-02-28'), false);
  const fortnight = { date: '2026-11-19', endDate: null, repeat: { unit: 'week', n: 2 } };
  assert.deepEqual([occursOn(fortnight, '2026-11-26'), occursOn(fortnight, '2026-12-03')], [false, true]);
  const birthday = { date: '2020-11-19', endDate: null, repeat: { unit: 'year', n: 1 } };
  assert.equal(occursOn(birthday, '2026-11-19'), true);
});

test('habit streaks, best streak and strength', () => {
  fresh();
  const day = '2026-11-19'; // Thursday
  const h = addHabit({ name: 'Read', created: new Date(2026, 10, 1).getTime() });
  for (let i = 1; i <= 5; i++) toggleHabit(h, addDays(day, -i));
  assert.equal(habitStreak(h, day), 5); // today not done yet: still 5
  toggleHabit(h, day);
  assert.equal(habitStreak(h, day), 6);
  assert.equal(store.data.profile.xp, 30);
  toggleHabit(h, addDays(day, -3)); // a gap
  assert.equal(habitStreak(h, day), 3);
  assert.equal(habitBestStreak(h, day), 3);
  const strong = habitStrength(h, day);
  assert.ok(strong > 0.3 && strong < 0.6, `strength ${strong}`);

  const weekdays = addHabit({ name: 'Stretch', days: [1, 2, 3, 4, 5], created: new Date(2026, 10, 1).getTime() });
  for (const d of ['2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18']) toggleHabit(weekdays, d);
  assert.equal(habitStreak(weekdays, day), 4); // the weekend between does not break it

  const gym = addHabit({ name: 'Gym', perWeek: 3, created: new Date(2026, 10, 1).getTime() });
  for (const d of ['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16']) toggleHabit(gym, d);
  assert.equal(habitStreak(gym, day, 0), 1); // last week met; this week still open
  assert.ok(habitStrength(gym, day, 0) > 0);
});

test('levels', () => {
  assert.deepEqual([0, 99, 100, 299, 300, 600, 1000].map((x) => levelInfo(x).level), [1, 1, 2, 2, 3, 4, 5]);
  const info = levelInfo(150);
  assert.deepEqual([info.into, info.span, info.toNext], [50, 200, 150]);
});

test('daily totals, day streak and reminders', () => {
  fresh();
  const t = addTask({ title: 'Write', due: today() });
  setTaskDone(t, true);
  addSession(25, t.id);
  const stats = dayStats(today());
  assert.deepEqual([stats.tasks, stats.focus], [1, 25]);
  assert.equal(dayStreak(), 1);
  assert.equal(store.data.profile.xp, 35);

  const now = new Date(2026, 10, 19, 10, 0);
  addTask({ title: 'Call', due: '2026-11-19', time: '15:00' });
  addTask({ title: 'Past', due: '2026-11-19', time: '09:00' });
  addEvent({ title: 'Standup', date: '2026-11-16', start: '09:30', repeat: { unit: 'weekday', n: 1 } });
  const r = upcomingReminders(now, 4);
  assert.deepEqual(r.map((x) => x.title), ['Call', 'Standup', 'Standup']);
  assert.equal(ymd(r[1].at), '2026-11-20');
  assert.equal(r[1].at.getMinutes(), 20); // ten minutes before 9:30
});
