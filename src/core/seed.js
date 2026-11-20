// Example content for a first look around: a few tasks, notes, events and habits
// placed around today. "Erase everything" in Settings clears it.

import { store } from './store.js';
import { today, addDays, uid, parseYmd, fmtDate } from './util.js';
import { addTask, addEvent, addNote, addHabit, addList } from './model.js';

/**
 * A lived-in workspace for the store pictures and for showing the app around: a few
 * weeks of history, a level, notes of every kind. main.js calls it for index.html?demo
 * after store.startDemo(), so none of it is saved. Options ride in the address:
 *   ?demo&tasks=matrix     the Tasks screen opens on that view (list, board, matrix)
 *   ?demo&timer=run        a focus session is under way
 *   ?demo&theme=dark       dark theme
 * @param {URLSearchParams} [params]
 */
export function demo(params = new URLSearchParams()) {
  const day = today();
  const d = store.data;
  const now = Date.now();
  /** A moment `ago` days back at hh:mm, never in the future. */
  const at = (ago, hh, mm = 0) => {
    const t = parseYmd(addDays(day, -ago));
    t.setHours(hh, mm, 0, 0);
    return Math.min(t.getTime(), now - 60000);
  };
  d.settings.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  d.settings.hour12 = true;
  d.profile.xp = 1840;

  const work = addList('Work', 'violet');
  const home = addList('Home', 'orange');
  const side = addList('Side project', 'mint');
  const finished = (fields, ago, hh, mm = 0) => addTask({ ...fields, done: true, doneAt: at(ago, hh, mm), status: 'done' });

  // ---- Today ----
  finished({ title: 'Plan the week', due: day, time: '09:00', duration: 30, priority: 2, listId: work.id }, 0, 9, 25);
  const update = addTask({ title: 'Write the project update', due: day, time: '15:00', duration: 90, priority: 1, listId: work.id, est: 3, notes: 'One page. Lead with the numbers.' });
  for (const [title, done] of [['Pull last month’s numbers', true], ['Draft the summary', true], ['Ask Priya to review', false]]) {
    addTask({ title, parentId: update.id, listId: work.id, done, doneAt: done ? at(0, 11) : null, status: done ? 'done' : 'todo' });
  }
  addTask({ title: 'Book flights for December', due: day, priority: 2, listId: home.id });
  addTask({ title: 'Reply to Sam about Friday', due: day, priority: 3 });
  addTask({ title: 'Water the plants', due: day, repeat: { unit: 'day', n: 3 }, listId: home.id });
  finished({ title: 'Send the invoice', due: day, listId: work.id, priority: 2 }, 0, 10, 40);
  addTask({ title: 'Book the dentist', due: addDays(day, -1), priority: 3, listId: home.id });

  // ---- Coming up, and someday ----
  addTask({ title: 'Draft the launch notes', due: addDays(day, 1), time: '11:00', duration: 60, priority: 1, listId: work.id, est: 2 });
  addTask({ title: 'Call the landlord', due: addDays(day, 1), listId: home.id });
  addTask({ title: 'Pay the electricity bill', due: addDays(day, 2), repeat: { unit: 'month', n: 1 }, priority: 2, listId: home.id });
  const slides = addTask({ title: 'Prepare slides for the review', due: addDays(day, 4), priority: 2, listId: work.id, est: 3, status: 'doing' });
  addTask({ title: 'Renew passport', due: addDays(day, 9), priority: 3, listId: home.id });
  const sketch = addTask({ title: 'Sketch the onboarding flow', priority: 2, listId: side.id, est: 2, status: 'doing' });
  addTask({ title: 'Write the README', listId: side.id });
  addTask({ title: 'Read “Deep Work”, chapter 3' });
  addTask({ title: 'Look into standing desks', listId: home.id });

  // ---- Two weeks of history: finished tasks and focus sessions ----
  const titles = ['Clear the inbox', 'Review pull requests', 'Tidy the desk', 'Weekly shop', 'Fix the login bug', 'Call the bank', 'Update the roadmap', 'Laundry', 'Write test cases', 'Send meeting notes'];
  const lists = [work.id, work.id, home.id, home.id, side.id, home.id, work.id, home.id, side.id, work.id];
  [3, 4, 2, 5, 1, 0, 4, 3, 5, 2, 4, 1, 3].forEach((count, i) => {
    for (let k = 0; k < count; k++) {
      const n = (i * 3 + k) % titles.length;
      finished({ title: titles[n], listId: lists[n], due: addDays(day, -(i + 1)) }, i + 1, 9 + k * 2, 15);
    }
  });
  const focusOn = [
    finished({ title: 'Quarterly report', listId: work.id, priority: 2 }, 2, 16),
    finished({ title: 'Landing page copy', listId: side.id }, 5, 15),
    finished({ title: 'Sort the tax papers', listId: home.id }, 8, 11),
  ];
  [2, 3, 1, 4, 0, 2, 3, 3, 2, 4, 1, 0, 3].forEach((count, i) => {
    for (let k = 0; k < count; k++) {
      const task = focusOn[(i + k) % focusOn.length];
      d.sessions.push({ id: uid(), at: at(i + 1, 9 + k * 2, 30), minutes: 25, taskId: task.id, label: task.title });
    }
  });
  const todays = [
    { hh: 9, mm: 55, minutes: 25, task: sketch },
    { hh: 11, mm: 20, minutes: 50, task: update },
    { hh: 14, mm: 5, minutes: 25, task: slides },
    { hh: 16, mm: 10, minutes: 15, task: update },
  ];
  for (const s of todays) d.sessions.push({ id: uid(), at: at(0, s.hh, s.mm), minutes: s.minutes, taskId: s.task.id, label: s.task.title });
  d.sessions.sort((a, b) => a.at - b.at);

  // ---- Calendar ----
  addEvent({ title: 'Team stand-up', date: addDays(day, -14), start: '10:00', end: '10:30', color: 'violet', repeat: { unit: 'weekday', n: 1 } });
  addEvent({ title: 'Lunch with Ana', date: day, start: '12:30', end: '13:30', color: 'orange', place: 'Corner café' });
  addEvent({ title: 'Gym', date: day, start: '18:30', end: '19:30', color: 'mint' });
  addEvent({ title: 'Yoga', date: addDays(day, -12), start: '07:30', end: '08:15', color: 'mint', repeat: { unit: 'week', n: 1 } });
  addEvent({ title: 'Dentist', date: addDays(day, 3), start: '14:00', end: '14:45', color: 'blue' });
  addEvent({ title: 'Quarterly review', date: addDays(day, 4), start: '15:00', end: '16:30', color: 'violet', place: 'Room 4' });
  addEvent({ title: 'Mum’s birthday', date: addDays(day, 6), color: 'pink', repeat: { unit: 'year', n: 1 } });
  addEvent({ title: 'Weekend away', date: addDays(day, 8), endDate: addDays(day, 9), color: 'gold' });
  addEvent({ title: 'Rent due', date: `${day.slice(0, 8)}01`, color: 'orange', repeat: { unit: 'month', n: 1 } });
  addEvent({ title: 'Dinner at Leo’s', date: addDays(day, -3), start: '19:00', end: '21:00', color: 'pink' });

  // ---- Notes ----
  const list = (items, doneCount = 0) => items.map((text, i) => ({ id: uid(), text, done: i < doneCount }));
  addNote({ title: 'Quote', body: '“You do not rise to the level of your goals. You fall to the level of your systems.”', updated: at(6, 20) });
  addNote({ title: 'Gift ideas', color: 'peach', body: 'Mum: the blue teapot\nLeo: a film camera strap\nAna: tickets for the spring concert', updated: at(4, 21) });
  addNote({ color: 'rose', locked: { iv: 'demo', ct: 'demo' }, updated: at(3, 8) });
  addNote({ title: 'Books to read', color: 'lilac', items: list(['Deep Work', 'The Pragmatic Programmer', 'Four Thousand Weeks', 'Atomic Habits', 'A Philosophy of Software Design'], 2), updated: at(2, 22) });
  addNote({ title: fmtDate(day, { long: true }), color: 'sand', date: day, journal: true, body: 'Slow start, good afternoon. The update is nearly there; the numbers were better than I feared.', updated: at(0, 13) });
  addNote({ title: 'Groceries', color: 'lemon', items: list(['Oat milk', 'Eggs', 'Spinach', 'Coffee beans', 'Lemons', 'Rice'], 2), updated: at(0, 8) });
  addNote({ title: 'Project Lantern', color: 'sky', pinned: true, body: 'Goal: ship the first version by the end of the month.\n\nOpen questions are in [[Ideas]]. Launch checklist is under Work.', updated: at(1, 17) });
  addNote({ title: 'Ideas', color: 'mint', pinned: true, body: 'A weekly review every Friday at four.\nPut the phone in the other room for the first focus session.\nOne page per project, no more.', updated: at(0, 12) });

  // ---- Habits ----
  const kept = (span, missed) => Object.fromEntries(Array.from({ length: span }, (_, i) => i).filter((n) => !missed.includes(n)).map((n) => [addDays(day, -n), 1]));
  const since = now - 40 * 864e5;
  addHabit({ name: 'Read 20 pages', color: 'blue', log: kept(34, [9, 21]), created: since });
  addHabit({ name: 'Stretch', color: 'mint', days: [1, 2, 3, 4, 5], log: kept(30, [4, 11, 12, 20]), created: since });
  addHabit({ name: 'Gym', color: 'orange', perWeek: 3, log: kept(30, [0, 1, 3, 5, 6, 8, 10, 12, 13, 15, 17, 19, 20, 22, 24, 26, 27, 29]), created: since });
  addHabit({ name: 'Meditate', color: 'violet', log: kept(12, [2, 7]), created: now - 14 * 864e5 });
  addHabit({ name: 'No phone after ten', color: 'gold', log: kept(20, [0, 1, 6, 13, 14]), created: now - 21 * 864e5 });

  // ---- Where each screen opens ----
  d.ui.tasks = { scope: params.get('scope') || 'all', mode: params.get('tasks') || 'list', showDone: false };
  d.ui.focusTask = update.id;
  if (params.get('timer') === 'run') d.ui.timer = { mode: 'work', running: true, endsAt: now + (14 * 60 + 12) * 1000, left: 0, round: 2 };
}

export function seed() {
  const day = today();
  const d = store.data;
  const find = (name) => d.lists.find((l) => l.name === name);
  const work = find('Work') || addList('Work', 'violet');
  const home = find('Home') || addList('Home', 'orange');

  const plan = addTask({ title: 'Plan the week', due: day, time: '09:00', duration: 30, priority: 2, listId: work.id, est: 1 });
  addTask({ title: 'Review open tasks', parentId: plan.id, listId: work.id });
  addTask({ title: 'Pick three priorities', parentId: plan.id, listId: work.id });
  addTask({ title: 'Draft the project update', due: day, priority: 1, listId: work.id, est: 2, notes: 'Keep it to one page.' });
  addTask({ title: 'Reply to Sam about Friday', due: day, priority: 3 });
  addTask({ title: 'Water the plants', due: day, repeat: { unit: 'day', n: 3 }, listId: home.id });
  addTask({ title: 'Book the dentist', due: addDays(day, -1), priority: 3, listId: home.id });
  addTask({ title: 'Pay the electricity bill', due: addDays(day, 2), repeat: { unit: 'month', n: 1 }, priority: 2, listId: home.id });
  addTask({ title: 'Prepare slides for the review', due: addDays(day, 4), priority: 2, listId: work.id, est: 3, status: 'doing' });
  addTask({ title: 'Read “Deep Work”, chapter 3', priority: 4 });
  addTask({ title: 'Look into standing desks', priority: 4, listId: home.id });

  addEvent({ title: 'Team stand-up', date: day, start: '10:00', end: '10:30', color: 'violet', repeat: { unit: 'weekday', n: 1 } });
  addEvent({ title: 'Lunch with Ana', date: day, start: '12:30', end: '13:30', color: 'orange', place: 'Corner café' });
  addEvent({ title: 'Gym', date: addDays(day, 1), start: '18:00', end: '19:00', color: 'mint' });
  addEvent({ title: 'Weekend away', date: addDays(day, 5), endDate: addDays(day, 6), color: 'gold' });

  addNote({
    title: 'Welcome to Meridian', pinned: true, color: 'mint',
    body: 'Everything here is stored on this device only.\n\n• Type in any “add” box: “Call Sam tomorrow 3pm #work !1” becomes a dated, prioritised task.\n• Press Ctrl+K (or tap the magnifier) to search everything.\n• Lock a note with a passcode from its toolbar.\n• Link notes by writing [[Ideas]].',
  });
  addNote({ title: 'Groceries', color: 'lemon', items: ['Oat milk', 'Eggs', 'Spinach', 'Coffee beans'].map((text, i) => ({ id: uid(), text, done: i === 0 })) });
  addNote({ title: 'Ideas', color: 'lilac', body: 'A place for half-formed thoughts.\n\nSee also [[Welcome to Meridian]].' });

  const log = (days) => Object.fromEntries(days.map((n) => [addDays(day, -n), 1]));
  addHabit({ name: 'Read 10 pages', color: 'blue', log: log([1, 2, 3, 4, 6, 7, 8, 10]), created: Date.now() - 12 * 864e5 });
  addHabit({ name: 'Stretch', color: 'mint', days: [1, 2, 3, 4, 5], log: log([1, 2, 5, 6, 7]), created: Date.now() - 12 * 864e5 });
  addHabit({ name: 'Gym', color: 'orange', perWeek: 3, log: log([2, 4, 7, 9, 11]), created: Date.now() - 12 * 864e5 });

  d.seeded = true;
}
