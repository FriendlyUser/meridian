// Line icons, drawn on a 24 x 24 grid and inlined so nothing is fetched.

const PATHS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  tasks: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  notes: '<path d="M5 3h14a1 1 0 0 1 1 1v10l-6 6H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 20v-5a1 1 0 0 1 1-1h5"/>',
  habits: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  focus: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 14v7"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  checklist: '<path d="M11 6h9M11 12h9M11 18h9M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="11" rx="1.5"/><rect x="16" y="4" width="5" height="14" rx="1.5"/>',
  matrix: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M12 3v18M3 12h18"/>',
  repeat: '<path d="M4 11a7 7 0 0 1 12-4l2 2M20 13a7 7 0 0 1-12 4l-2-2"/><path d="M18 5v4h-4M6 19v-4h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  note: '<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  skip: '<path d="M5 5l10 7-10 7zM19 5v14"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 .2 1.6 1 2.4 1.8 2.6C10.5 9 10.800 5.500 12 3z"/>',
  sprout: '<path d="M12 21v-9M12 12c0-4-2.500-6-6.500-6 0 4 2.500 6 6.500 6zM12 14c0-3 2-5 6-5 0 3.500-2.500 5-6 5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
  moon: '<path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9l5-5 5 5M5 20h14"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.500 2h-15zM10 20a2 2 0 0 0 4 0"/>',
  star: '<path d="M12 3.500l2.600 5.400 5.900.800-4.300 4.100 1 5.900L12 16.900l-5.200 2.800 1-5.900-4.300-4.100 5.900-.800z"/>',
  place: '<path d="M12 21s7-6.200 7-11a7 7 0 0 0-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.500"/>',
  bolt: '<path d="M13 3L5 13.500h6L10 21l8-10.500h-6z"/>',
  inbox: '<path d="M4 13l2.500-8h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 13h4.500a3.500 3.500 0 0 0 7 0H20"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.700.400-1 .900-1 1.700M12 17v.100"/>',
};

/** @param {string} name @param {number} [size] */
export const icon = (name, size = 20) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;

/**
 * A plant for the focus garden, drawn fresh at each size: 0 a seed, 1 a sprout,
 * 2 a seedling, 3 a flower, 4 a small tree. Sessions grow one by how long they ran.
 */
export function plant(stage, { withered = false } = {}) {
  const leaf = withered ? '#a39c8f' : 'var(--accent)';
  const leaf2 = withered ? '#8a8378' : 'color-mix(in srgb, var(--accent) 70%, var(--c-gold))';
  const soil = '<ellipse cx="24" cy="41" rx="13" ry="3.500" fill="color-mix(in srgb, var(--ink) 22%, transparent)"/>';
  const stem = (top) => `<path d="M24 41V${top}" stroke="${leaf}" stroke-width="2.400" stroke-linecap="round" fill="none"/>`;
  const leafAt = (x, y, rot, s = 1, fill = leaf) => `<ellipse cx="${x}" cy="${y}" rx="${6.5 * s}" ry="${3.2 * s}" transform="rotate(${rot} ${x} ${y})" fill="${fill}"/>`;
  let body = '';
  if (stage <= 0) body = `<ellipse cx="24" cy="38" rx="4" ry="3" fill="${leaf2}"/>`;
  else if (stage === 1) body = stem(31) + leafAt(19.5, 30, 28, 0.8) + leafAt(28.5, 30, -28, 0.8, leaf2);
  else if (stage === 2) body = stem(24) + leafAt(18.5, 31, 30) + leafAt(29.5, 31, -30, 1, leaf2) + leafAt(19.5, 24, 35, 0.8, leaf2) + leafAt(28.5, 24, -35, 0.8);
  else if (stage === 3) {
    body = stem(18) + leafAt(18.5, 32, 30) + leafAt(29.5, 30, -30, 1, leaf2)
      + [0, 72, 144, 216, 288].map((a) => `<ellipse cx="24" cy="10.500" rx="3" ry="4.600" transform="rotate(${a} 24 15.500)" fill="var(--c-pink)"/>`).join('')
      + '<circle cx="24" cy="15.500" r="3" fill="var(--c-gold)"/>';
  } else {
    body = '<path d="M24 41V22" stroke="color-mix(in srgb, var(--ink) 55%, var(--c-orange))" stroke-width="3.400" stroke-linecap="round" fill="none"/>'
      + `<circle cx="24" cy="16" r="10.500" fill="${leaf}"/><circle cx="16" cy="21" r="6.500" fill="${leaf2}"/><circle cx="32" cy="21" r="6.500" fill="${leaf}"/><circle cx="27" cy="12" r="5" fill="${leaf2}"/>`;
  }
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${soil}${body}</svg>`;
}

/** Which plant a finished session earns. */
export const plantStage = (minutes) => (minutes < 10 ? 1 : minutes < 25 ? 2 : minutes < 45 ? 3 : 4);
