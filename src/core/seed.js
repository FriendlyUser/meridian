// Example content for a first look around: a few tasks, notes, events and habits
// placed around today. "Erase everything" in Settings clears it.

import { store } from './store.js';
import { today, addDays, uid } from './util.js';
import { addTask, addEvent, addNote, addHabit, addList } from './model.js';

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
