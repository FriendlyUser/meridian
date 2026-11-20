// Quick add: pull a day, a time and a few tags out of a typed line.
//
//   parseQuick('Submit report every friday 4pm #work !1')
//     -> { title: 'Submit report', date: '2026-11-20', time: '16:00', endTime: null,
//          repeat: { unit: 'week', n: 1 }, priority: 1, list: 'work', duration: null }
//
// It understands today / tonight / tomorrow, weekday names (with "next"), "in 3 days",
// "next week", "nov 25", "25 nov", 11/25, 2026-11-25; times such as 3pm, 3:30 pm,
// 15:30, "at 3", noon, and ranges like 3-4pm or 9:00-10:30; repeats such as daily,
// "every 2 weeks" or "every monday"; a #list, a priority (!1 to !4, or p1 to p4) and
// a length ("for 45m"). Anything it does not recognise stays in the title.

import { ymd, addDays, addMonths, fromMinutes } from './util.js';

const WEEKDAY = {
  sunday: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const MONTH = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3, may: 4, june: 5, jun: 5,
  july: 6, jul: 6, august: 7, aug: 7, september: 8, sept: 8, sep: 8, october: 9, oct: 9,
  november: 10, nov: 10, december: 11, dec: 11,
};
const COUNT = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

const END = String.raw`(?=[\s,.;!?]|$)`;
const LEAD = String.raw`(?:(?:due|on|by|before|until|at)\s+)*`;
const AP = String.raw`(a\.?m\.?|p\.?m\.?)`;
const MONTH_NAMES = Object.keys(MONTH).sort((a, b) => b.length - a.length).join('|');
const WEEKDAY_NAMES = Object.keys(WEEKDAY).sort((a, b) => b.length - a.length).join('|');

/** Minutes after midnight, or null when it is not a time. */
function clock(h, m, ap) {
  h = Number(h);
  m = Number(m || 0);
  if (m > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    return (h % 12) * 60 + m + (/^p/i.test(ap) ? 720 : 0);
  }
  return h > 23 ? null : h * 60 + m;
}

/** A bare "3" most likely means the afternoon; "9" the morning. */
const guess = (h) => (h >= 1 && h <= 7 ? h + 12 : h);

function validDay(y, m, d) {
  const date = new Date(y, m, d);
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d ? ymd(date) : null;
}

/**
 * @param {string} input
 * @param {Date} [now]
 * @returns {{ title: string, date: string|null, time: string|null, endTime: string|null,
 *   repeat: {unit: string, n: number}|null, priority: number|null, list: string|null, duration: number|null }}
 */
export function parseQuick(input, now = new Date()) {
  let text = ` ${String(input || '').replace(/\s+/g, ' ').trim()} `;
  const todayStr = ymd(now);
  /** @type {string|null} */ let date = null;
  /** @type {string|null} */ let time = null;
  /** @type {string|null} */ let endTime = null;
  let evening = false;
  /** @type {{unit: string, n: number}|null} */ let repeat = null;
  /** @type {number|null} */ let priority = null;
  /** @type {string|null} */ let list = null;
  /** @type {number|null} */ let duration = null;

  /** Try a pattern; `use` returns false to leave the text alone. */
  const take = (pattern, use) => {
    const m = new RegExp(pattern, 'iu').exec(text);
    if (!m || use(m) === false) return false;
    text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
    return true;
  };

  // ---- Tags: #list, !1 or p1, "for 45m" ----
  take(String.raw`\s#([\p{L}\p{N}_-]{1,30})${END}`, (m) => { list = m[1]; });
  take(String.raw`\s(?:!|p)([1-4])${END}`, (m) => { priority = Number(m[1]); });
  take(String.raw`\sfor\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hr|hrs|hours?)${END}`, (m) => {
    const n = Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1);
    if (!(n >= 5 && n <= 720)) return false;
    duration = Math.round(n);
  });

  // ---- Repeats (before the plain weekday names, so "every friday" is read whole) ----
  take(String.raw`\severy\s+(?:(\d{1,2}|other)\s+)?(day|week|month|year)s?${END}`, (m) => {
    const n = !m[1] ? 1 : m[1].toLowerCase() === 'other' ? 2 : Number(m[1]);
    if (n < 1) return false;
    repeat = { unit: m[2].toLowerCase(), n };
  });
  if (!repeat) take(String.raw`\s(?:every\s+weekday|on\s+weekdays|weekdays)${END}`, () => { repeat = { unit: 'weekday', n: 1 }; });
  if (!repeat) {
    take(String.raw`\severy\s+(${WEEKDAY_NAMES})${END}`, (m) => {
      repeat = { unit: 'week', n: 1 };
      date = addDays(todayStr, (WEEKDAY[m[1].toLowerCase()] - now.getDay() + 7) % 7);
    });
  }
  if (!repeat) {
    take(String.raw`\s(daily|weekly|monthly|yearly|annually)${END}`, (m) => {
      const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year', annually: 'year' }[m[1].toLowerCase()];
      repeat = { unit, n: 1 };
    });
  }

  // ---- Times ----
  // A range: 3-4pm, 3pm-4:30pm, from 9:00 to 10:30
  take(String.raw`\s(?:from\s+|at\s+)?(\d{1,2})(?::(\d{2}))?\s*${AP}?\s*(?:-|–|—|\bto\b|\buntil\b|\btill\b)\s*(\d{1,2})(?::(\d{2}))?\s*${AP}?${END}`, (m) => {
    const [, h1, m1, ap1, h2, m2, ap2] = m;
    if (!ap1 && !ap2 && m1 === undefined && m2 === undefined) return false; // "3-4" could be anything
    let end = clock(ap2 ? h2 : guess(Number(h2)), m2, ap2);
    let start;
    if (ap1) start = clock(h1, m1, ap1);
    else if (ap2) {
      // "11-1pm" starts in the morning; "3-4pm" in the afternoon.
      start = clock(h1, m1, ap2);
      if (start !== null && end !== null && start >= end) start = clock(h1, m1, /^p/i.test(ap2) ? 'am' : 'pm');
    } else {
      start = clock(guess(Number(h1)), m1, '');
      if (Number(h1) > 12 || Number(h2) > 12) { start = clock(h1, m1, ''); end = clock(h2, m2, ''); }
    }
    if (start === null || end === null || end <= start) return false;
    time = fromMinutes(start);
    endTime = fromMinutes(end);
  });
  if (!time) {
    // 3pm, 3:30 pm, at 3pm
    take(String.raw`\s(?:at\s+|@\s*|by\s+)?(\d{1,2})(?::(\d{2}))?\s*${AP}${END}`, (m) => {
      const t = clock(m[1], m[2], m[3]);
      if (t === null) return false;
      time = fromMinutes(t);
    });
  }
  if (!time) {
    // 15:30, at 9:15
    take(String.raw`\s(?:at\s+|@\s*|by\s+)?(\d{1,2}):(\d{2})${END}`, (m) => {
      const h = Number(m[1]);
      const t = clock(h > 12 ? h : guess(h), m[2], '');
      if (t === null) return false;
      time = fromMinutes(t);
    });
  }
  if (!time) {
    // at 3
    take(String.raw`\s(?:at|@)\s*(\d{1,2})${END}`, (m) => {
      const h = Number(m[1]);
      if (h < 1 || h > 23) return false;
      time = fromMinutes(guess(h) * 60);
    });
  }
  if (!time) take(String.raw`\s(?:at\s+)?noon${END}`, () => { time = '12:00'; });
  if (!time) take(String.raw`\s(?:at\s+)?midnight${END}`, () => { time = '00:00'; });

  // ---- Days ----
  const setDate = (d) => { if (!d) return false; date = d; };
  const pastToNextYear = (y, m, d) => {
    let day = validDay(y, m, d);
    if (day && day < todayStr) day = validDay(y + 1, m, d);
    return day;
  };

  take(String.raw`\s${LEAD}(\d{4})-(\d{1,2})-(\d{1,2})${END}`, (m) => setDate(validDay(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
  if (!date) {
    take(String.raw`\s${LEAD}(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?${END}`, (m) => {
      let mo = Number(m[1]);
      let d = Number(m[2]);
      if (mo > 12 && d <= 12) [mo, d] = [d, mo]; // 25/11
      if (m[3]) return setDate(validDay(Number(m[3].length === 2 ? `20${m[3]}` : m[3]), mo - 1, d));
      return setDate(pastToNextYear(now.getFullYear(), mo - 1, d));
    });
  }
  if (!date) {
    // nov 25, November 25th, 2027
    take(String.raw`\s${LEAD}(${MONTH_NAMES})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?${END}`, (m) => {
      const mo = MONTH[m[1].toLowerCase()];
      return setDate(m[3] ? validDay(Number(m[3]), mo, Number(m[2])) : pastToNextYear(now.getFullYear(), mo, Number(m[2])));
    });
  }
  if (!date) {
    // 25 nov, the 25th of November
    take(String.raw`\s${LEAD}(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(${MONTH_NAMES})\.?(?:,?\s+(\d{4}))?${END}`, (m) => {
      const mo = MONTH[m[2].toLowerCase()];
      return setDate(m[3] ? validDay(Number(m[3]), mo, Number(m[1])) : pastToNextYear(now.getFullYear(), mo, Number(m[1])));
    });
  }
  if (!date) take(String.raw`\s${LEAD}(?:the\s+)?day\s+after\s+tomorrow${END}`, () => setDate(addDays(todayStr, 2)));
  if (!date) take(String.raw`\s${LEAD}(?:tomorrow|tmrw|tmr)${END}`, () => setDate(addDays(todayStr, 1)));
  if (!date) take(String.raw`\s${LEAD}today${END}`, () => setDate(todayStr));
  if (!date) take(String.raw`\s${LEAD}tonight${END}`, () => { evening = true; return setDate(todayStr); });
  if (!date) {
    take(String.raw`\sin\s+(\d{1,3}|${Object.keys(COUNT).join('|')})\s+(day|week|month)s?${END}`, (m) => {
      const n = COUNT[m[1].toLowerCase()] ?? Number(m[1]);
      const unit = m[2].toLowerCase();
      return setDate(unit === 'month' ? addMonths(todayStr, n) : addDays(todayStr, unit === 'week' ? n * 7 : n));
    });
  }
  if (!date) take(String.raw`\s${LEAD}next\s+week${END}`, () => setDate(addDays(todayStr, 7)));
  if (!date) take(String.raw`\s${LEAD}next\s+month${END}`, () => setDate(addMonths(todayStr, 1)));
  if (!date) {
    take(String.raw`\s${LEAD}(?:(this|next)\s+)?(${WEEKDAY_NAMES})${END}`, (m) => {
      let delta = (WEEKDAY[m[2].toLowerCase()] - now.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      else if ((m[1] || '').toLowerCase() === 'next') delta += 7;
      return setDate(addDays(todayStr, delta));
    });
  }

  if (evening && !time) time = '19:00';
  if (time && !date) {
    // A time on its own means the next time the clock shows it.
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const [hh, mm] = time.split(':').map(Number);
    date = hh * 60 + mm > nowMinutes ? todayStr : addDays(todayStr, 1);
  }

  if (time && endTime && !duration) {
    const [h1, m1] = time.split(':').map(Number);
    const [h2, m2] = endTime.split(':').map(Number);
    duration = h2 * 60 + m2 - (h1 * 60 + m1);
  }

  let title = text.replace(/\s+/g, ' ').trim();
  for (let before = null; before !== title;) {
    before = title;
    title = title.replace(/[\s,]+(?:at|on|by|due|from|until|before|@|-|–)$/i, '').replace(/[\s,;-]+$/, '').trim();
  }
  return { title, date, time, endTime, repeat, priority, list, duration };
}
