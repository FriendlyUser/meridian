// Small helpers shared by every part of the app: DOM, ids, and dates.
// Dates are local calendar days written 'YYYY-MM-DD'; times are 'HH:MM' (24 hour).

export const $ = (sel, root = document) => /** @type {HTMLElement} */ (root.querySelector(sel));
export const $$ = (sel, root = document) => /** @type {HTMLElement[]} */ ([...root.querySelectorAll(sel)]);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape text for use inside HTML. Everything a person typed goes through this. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Build one element from an HTML string. */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return /** @type {HTMLElement} */ (t.content.firstElementChild);
}

/** Run `fn` once things go quiet for `ms`; flush() runs a waiting call now, with its last arguments. */
export function debounce(fn, ms) {
  let timer = 0;
  let last = [];
  const run = (...args) => {
    last = args;
    clearTimeout(timer);
    timer = Number(setTimeout(() => { timer = 0; fn(...last); }, ms));
  };
  run.flush = () => { if (timer) { clearTimeout(timer); timer = 0; fn(...last); } };
  run.cancel = () => { clearTimeout(timer); timer = 0; };
  return run;
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const pad = (n) => String(n).padStart(2, '0');

// ---- Dates ----------------------------------------------------------------

export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd();

export function parseYmd(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export function addMonths(s, n) {
  const d = parseYmd(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return ymd(d);
}

/** Whole days from b to a (positive when a is later). */
export const diffDays = (a, b) => Math.round((parseYmd(a).getTime() - parseYmd(b).getTime()) / 864e5);

/** The first day of the week that holds `s`; weekStart is 0 (Sunday) or 1 (Monday). */
export function startOfWeek(s, weekStart = 0) {
  const d = parseYmd(s);
  return addDays(s, -((d.getDay() - weekStart + 7) % 7));
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 'Mon, Nov 23' (and the year when it is not this year). */
export function fmtDate(s, { weekday = true, long = false } = {}) {
  const d = parseYmd(s);
  const wd = WEEKDAYS[d.getDay()];
  const mo = MONTHS[d.getMonth()];
  const year = d.getFullYear() === new Date().getFullYear() ? '' : `, ${d.getFullYear()}`;
  const day = long ? `${mo} ${d.getDate()}` : `${mo.slice(0, 3)} ${d.getDate()}`;
  return `${weekday ? `${long ? wd : wd.slice(0, 3)}, ` : ''}${day}${year}`;
}

/** Today / Tomorrow / Yesterday, a weekday name within the coming week, else a date. */
export function relDay(s) {
  const n = diffDays(s, today());
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return WEEKDAYS[parseYmd(s).getDay()];
  return fmtDate(s, { weekday: false });
}

export const toMinutes = (hm) => { const [hh, mm] = String(hm).split(':').map(Number); return hh * 60 + (mm || 0); };
export const fromMinutes = (m) => `${pad(Math.floor(clamp(m, 0, 1439) / 60))}:${pad(clamp(m, 0, 1439) % 60)}`;

/** '15:30' as '3:30 PM' or '15:30', as the person prefers. */
export function fmtTime(hm, hour12 = true) {
  if (!hm) return '';
  const [hh, mm] = hm.split(':').map(Number);
  if (!hour12) return `${pad(hh)}:${pad(mm)}`;
  const suffix = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 || 12;
  return mm ? `${h12}:${pad(mm)} ${suffix}` : `${h12} ${suffix}`;
}

/** '1h 25m' from minutes. */
export function fmtDuration(mins) {
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
}

/** 'just now', '5 min ago', 'Nov 3' from a timestamp. */
export function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(ymd(new Date(ts)), { weekday: false });
}

/** Does `text` contain every word of `query`? Both are compared without case. */
export function matches(text, query) {
  const hay = String(text || '').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** Offer `text` as a file download (web). Returns false where downloads do nothing. */
export function download(filename, text, type = 'application/json') {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}
