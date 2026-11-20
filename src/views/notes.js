// Notes: coloured cards that hold text or a checklist. They can be pinned, filed by
// colour, tied to a day, linked to each other with [[Title]], archived, and locked
// behind a passcode.

import { store } from '../core/store.js';
import { esc, uid, h, ago, fmtDate, matches, debounce, today } from '../core/util.js';
import { TINTS, addNote, noteIsEmpty } from '../core/model.js';
import { vaultAvailable, vaultExists, vaultOpen, createVault, unlockVault, lockVault, lockNote, readNote, sealContent } from '../core/vault.js';
import { icon } from '../ui/icons.js';
import { viewHead, swatches } from '../ui/parts.js';
import { openModal, toast, promptDialog, confirmDialog } from '../ui/overlay.js';

let query = '';
const LINK = /\[\[([^[\]\n]{1,80})\]\]/g;

function ui() {
  const u = store.data.ui;
  if (!u.notes || typeof u.notes !== 'object') u.notes = { color: 'all', layout: 'grid' };
  return u.notes;
}

const tintOf = (color) => `var(--tint-${TINTS.includes(color) ? color : 'none'})`;
/** Escaped text with [[links]] marked up. */
const withLinks = (text) => esc(text).replace(LINK, '<span class="wikilink">$1</span>');

function card(n) {
  const foot = [
    n.date ? `${icon('calendar', 13)}<span>${esc(fmtDate(n.date, { weekday: false }))}</span>` : '',
    `<span class="muted">${esc(ago(n.updated || n.created))}</span>`,
  ].join('');
  if (n.locked) {
    return `
      <div class="note-card" data-note="${n.id}" style="--tint: ${tintOf(n.color)}" role="button" tabindex="0" aria-label="Locked note">
        ${n.pinned ? `<span class="note-pin">${icon('pin', 16)}</span>` : ''}
        <div class="note-title row" style="gap:8px">${icon('lock', 16)} Locked note</div>
        <div class="note-body">${vaultOpen() ? 'Open to read.' : 'Enter your passcode to read.'}</div>
        <div class="note-foot">${foot}</div>
      </div>`;
  }
  const items = n.items || [];
  const open = items.filter((i) => !i.done);
  const shown = [...open, ...items.filter((i) => i.done)].slice(0, 8);
  return `
    <div class="note-card" data-note="${n.id}" style="--tint: ${tintOf(n.color)}" role="button" tabindex="0" aria-label="${esc(n.title || 'Note')}">
      ${n.pinned ? `<span class="note-pin">${icon('pin', 16)}</span>` : ''}
      ${n.title ? `<div class="note-title">${esc(n.title)}</div>` : ''}
      ${n.items
        ? `<ul class="note-items">${shown.map((i) => `
            <li class="${i.done ? 'done' : ''}"><button class="box" data-item="${esc(i.id)}" aria-label="${i.done ? 'Untick' : 'Tick'}: ${esc(i.text)}">${icon('check', 11)}</button><span>${esc(i.text)}</span></li>`).join('')}
            ${items.length > shown.length ? `<li class="muted">+ ${items.length - shown.length} more</li>` : ''}</ul>`
        : `<div class="note-body">${withLinks(n.body)}</div>`}
      <div class="note-foot">${foot}</div>
    </div>`;
}

function visibleNotes() {
  const state = ui();
  return store.data.notes.filter((n) => {
    if (state.color === 'archive') { if (!n.archived) return false; } else {
      if (n.archived) return false;
      if (state.color !== 'all' && n.color !== state.color) return false;
    }
    if (!query.trim()) return true;
    if (n.locked) return false;
    return matches(`${n.title} ${n.body} ${(n.items || []).map((i) => i.text).join(' ')}`, query);
  });
}

function html() {
  const state = ui();
  const notes = visibleNotes();
  const pinned = notes.filter((n) => n.pinned);
  const others = notes.filter((n) => !n.pinned);
  const used = TINTS.filter((t) => store.data.notes.some((n) => !n.archived && n.color === t));
  const archived = store.data.notes.filter((n) => n.archived).length;
  const grid = (list) => `<div class="note-grid ${state.layout === 'list' ? 'list' : ''}">${list.map(card).join('')}</div>`;
  const actions = `
    ${vaultOpen() ? `<button class="btn" data-lock-now>${icon('lock', 16)}Lock now</button>` : ''}
    <div class="seg" aria-label="Layout">
      <button data-layout="grid" class="${state.layout !== 'list' ? 'on' : ''}" aria-label="Grid">${icon('grid', 16)}</button>
      <button data-layout="list" class="${state.layout === 'list' ? 'on' : ''}" aria-label="List">${icon('list', 16)}</button>
    </div>`;
  return `
    ${viewHead('Notes', '', actions)}
    <form class="capture" data-capture>
      <input type="text" placeholder="Write a note and press Enter…" autocomplete="off" enterkeyhint="done" aria-label="Quick note">
      <button type="button" class="btn" data-new="list" title="New checklist">${icon('checklist', 18)}<span class="only-desktop">Checklist</span></button>
      <button type="button" class="btn primary" data-new="text" title="New note">${icon('plus', 18)}<span class="only-desktop">Note</span></button>
    </form>
    <div class="filters">
      <input type="search" data-search placeholder="Search notes" value="${esc(query)}" aria-label="Search notes" style="max-width:220px">
      <button class="chip ${state.color === 'all' ? 'on' : ''}" data-filter="all">All</button>
      ${used.length > 1 ? used.map((t) => `<button class="swatch ${state.color === t ? 'on' : ''}" data-filter="${t}" style="--c: ${tintOf(t)}" aria-label="Only ${t === 'none' ? 'plain' : t} notes" aria-pressed="${state.color === t}"></button>`).join('') : ''}
      ${archived || state.color === 'archive' ? `<button class="chip ${state.color === 'archive' ? 'on' : ''}" data-filter="archive">${icon('archive', 14)}Archive · ${archived}</button>` : ''}
    </div>
    <div data-results>
    ${notes.length ? `
      ${pinned.length ? `<div class="group-title">Pinned</div>${grid(pinned)}${others.length ? '<div class="group-title">Others</div>' : ''}` : ''}
      ${grid(others)}`
      : `<div class="empty"><b>${query ? 'No notes match' : state.color === 'archive' ? 'The archive is empty' : 'No notes yet'}</b>${query ? 'Try fewer words.' : 'Type above to jot one down.'}</div>`}
    </div>`;
}

// ---- Passcode ----------------------------------------------------------------------

/** Make sure the vault is open, asking for (or setting) the passcode. Resolves false if it stays shut. */
async function ensureVault() {
  if (!vaultAvailable()) { toast('Locking needs a secure page: use https, localhost or the installed app.'); return false; }
  if (vaultOpen()) return true;
  if (!vaultExists()) {
    const first = await promptDialog('Set a passcode', {
      type: 'password', ok: 'Next', placeholder: 'At least 4 characters',
      note: 'This passcode locks notes on this device. It cannot be recovered: without it, locked notes stay locked for good.',
    });
    if (first === null) return false;
    if (first.length < 4) { toast('Use at least 4 characters.'); return false; }
    const again = await promptDialog('Type the passcode again', { type: 'password', ok: 'Set passcode' });
    if (again === null) return false;
    if (again !== first) { toast('Those did not match. Nothing was changed.'); return false; }
    await createVault(first);
    store.commit('notes');
    return true;
  }
  const code = await promptDialog('Enter your passcode', { type: 'password', ok: 'Unlock' });
  if (code === null) return false;
  if (await unlockVault(code)) return true;
  toast('Wrong passcode.');
  return false;
}

// ---- Editor --------------------------------------------------------------------------

async function openNoteEditor(note, rerender) {
  // `content` is what is being edited: the note itself, or the opened copy of a locked one.
  let content = note;
  if (note.locked) {
    if (!(await ensureVault())) { rerender(); return; }
    try {
      content = await readNote(note);
    } catch {
      toast('This note was locked with a different passcode.');
      return;
    }
  }
  // Edits to a locked note are sealed again a moment after each change. The lock may be
  // removed while a seal is still being worked out, hence the second look at note.locked.
  const reseal = debounce(async () => {
    if (!note.locked) return;
    const sealed = await sealContent(content);
    if (note.locked) { note.locked = sealed; store.touch(); }
  }, 300);
  const changed = () => {
    note.updated = Date.now();
    if (note.locked) reseal(); else store.touch();
  };

  const modal = openModal({
    title: note.locked ? 'Locked note' : 'Note',
    className: 'tinted',
    body: '<div class="note-editor"></div>',
    footer: '<div class="toolbar" data-tools style="flex:1"></div><button class="btn primary" data-close>Done</button>',
    onClose: async () => {
      reseal.flush();
      if (noteIsEmpty(note) && !note.locked) store.data.notes = store.data.notes.filter((n) => n !== note);
      store.commit('notes');
      rerender();
    },
  });
  const box = /** @type {HTMLElement} */ (modal.el.querySelector('.modal'));
  const body = /** @type {HTMLElement} */ (modal.body.querySelector('.note-editor'));
  const tools = /** @type {HTMLElement} */ (modal.el.querySelector('[data-tools]'));

  const drawTools = () => {
    box.style.setProperty('--tint', tintOf(note.color));
    /** @type {HTMLElement} */ (modal.el.querySelector('.modal-head h2')).textContent = note.locked ? 'Locked note' : 'Note';
    tools.innerHTML = `
      ${swatches(note.color, TINTS, 'tint')}
      <span style="flex:1"></span>
      <button class="icon-btn ${note.pinned ? 'on' : ''}" data-tool="pin" title="${note.pinned ? 'Unpin' : 'Pin'}" aria-label="${note.pinned ? 'Unpin' : 'Pin'}" aria-pressed="${note.pinned}">${icon('pin')}</button>
      <button class="icon-btn ${content.items ? 'on' : ''}" data-tool="list" title="${content.items ? 'Turn into text' : 'Turn into a checklist'}" aria-label="Checklist" aria-pressed="${!!content.items}">${icon('checklist')}</button>
      <button class="icon-btn ${note.date ? 'on' : ''}" data-tool="date" title="${note.date ? `On ${fmtDate(note.date)} — remove from the calendar` : 'Tie to today on the calendar'}" aria-label="Calendar day" aria-pressed="${!!note.date}">${icon('calendar')}</button>
      <button class="icon-btn ${note.locked ? 'on' : ''}" data-tool="lock" title="${note.locked ? 'Remove the lock' : 'Lock with passcode'}" aria-label="${note.locked ? 'Remove the lock' : 'Lock with passcode'}" aria-pressed="${!!note.locked}">${icon(note.locked ? 'lock' : 'unlock')}</button>
      <button class="icon-btn" data-tool="archive" title="${note.archived ? 'Move out of the archive' : 'Archive'}" aria-label="${note.archived ? 'Unarchive' : 'Archive'}">${icon('archive')}</button>
      <button class="icon-btn" data-tool="delete" title="Delete" aria-label="Delete">${icon('trash')}</button>`;
  };

  const itemRow = (i) => `
    <div class="item-row ${i.done ? 'done' : ''}" data-id="${esc(i.id)}">
      <input type="checkbox" ${i.done ? 'checked' : ''} aria-label="Done">
      <input type="text" value="${esc(i.text)}" placeholder="List item" aria-label="Item">
      <button type="button" class="icon-btn" data-remove aria-label="Remove item">${icon('x', 16)}</button>
    </div>`;

  const drawLinks = () => {
    const el = body.querySelector('[data-links]');
    if (!el) return;
    const names = [...new Set([...`${content.body}`.matchAll(LINK)].map((m) => m[1].trim()))];
    el.innerHTML = names.length ? `<span class="muted" style="font-size:13px">Links:</span> ${names.map((n) => `<button type="button" class="wikilink" data-link="${esc(n)}">${esc(n)}</button>`).join(' · ')}` : '';
  };

  const drawBody = (focusId) => {
    body.innerHTML = `
      <input type="text" class="title" data-title value="${esc(content.title)}" placeholder="Title" aria-label="Title">
      ${content.items
        ? `<div data-items>${content.items.map(itemRow).join('')}</div>
           <button type="button" class="btn small quiet" data-add-item style="justify-self:start">${icon('plus', 14)}Add item</button>`
        : `<textarea data-body placeholder="Write here. Link to another note with [[its title]]." aria-label="Note">${esc(content.body)}</textarea>
           <div data-links></div>`}`;
    const area = /** @type {HTMLTextAreaElement|null} */ (body.querySelector('[data-body]'));
    if (area) { area.style.height = 'auto'; area.style.height = `${Math.max(180, area.scrollHeight + 4)}px`; }
    drawLinks();
    if (focusId) /** @type {HTMLElement|null} */ (body.querySelector(`[data-id="${focusId}"] input[type="text"]`))?.focus();
  };

  const addItem = (afterId = null) => {
    const item = { id: uid(), text: '', done: false };
    const at = afterId ? content.items.findIndex((i) => i.id === afterId) + 1 : content.items.length;
    content.items.splice(at, 0, item);
    changed();
    drawBody(item.id);
  };

  body.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.matches('[data-title]')) content.title = el.value;
    else if (el.matches('[data-body]')) {
      content.body = el.value;
      el.style.height = 'auto';
      el.style.height = `${Math.max(180, el.scrollHeight + 4)}px`;
      drawLinks();
    } else {
      const row = /** @type {HTMLElement|null} */ (el.closest('[data-id]'));
      const item = row && content.items?.find((i) => i.id === row.dataset.id);
      if (!item) return;
      if (el.type === 'checkbox') { item.done = el.checked; row.classList.toggle('done', item.done); } else item.text = el.value;
    }
    changed();
  });
  body.addEventListener('keydown', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const row = /** @type {HTMLElement|null} */ (el.closest?.('[data-id]'));
    if (!row || el.type !== 'text') return;
    if (e.key === 'Enter') { e.preventDefault(); addItem(row.dataset.id); }
    if (e.key === 'Backspace' && !el.value && content.items.length > 1) {
      e.preventDefault();
      const i = content.items.findIndex((x) => x.id === row.dataset.id);
      content.items.splice(i, 1);
      changed();
      drawBody(content.items[Math.max(0, i - 1)].id);
    }
  });
  body.addEventListener('click', (e) => {
    const target = /** @type {Element} */ (e.target);
    if (target.closest('[data-add-item]')) { addItem(); return; }
    const remove = target.closest('[data-remove]');
    if (remove) {
      const id = /** @type {HTMLElement} */ (remove.closest('[data-id]')).dataset.id;
      content.items = content.items.filter((i) => i.id !== id);
      changed();
      drawBody();
      return;
    }
    const link = /** @type {HTMLElement|null} */ (target.closest('[data-link]'));
    if (link) {
      const title = link.dataset.link;
      const found = store.data.notes.find((n) => !n.locked && n.title.trim().toLowerCase() === title.toLowerCase()) || addNote({ title });
      modal.close();
      openNoteEditor(found, rerender);
    }
  });

  tools.addEventListener('click', async (e) => {
    const target = /** @type {Element} */ (e.target);
    const sw = /** @type {HTMLElement|null} */ (target.closest('[data-color]'));
    if (sw) { note.color = sw.dataset.color; changed(); drawTools(); return; }
    const tool = /** @type {HTMLElement|null} */ (target.closest('[data-tool]'))?.dataset.tool;
    if (!tool) return;
    if (tool === 'pin') note.pinned = !note.pinned;
    else if (tool === 'date') note.date = note.date ? null : today();
    else if (tool === 'list') {
      if (content.items) {
        content.body = content.items.map((i) => i.text).filter(Boolean).join('\n');
        content.items = null;
      } else {
        content.items = content.body.split('\n').map((s) => s.trim()).filter(Boolean).map((text) => ({ id: uid(), text, done: false }));
        if (!content.items.length) content.items.push({ id: uid(), text: '', done: false });
        content.body = '';
      }
      drawBody(content.items?.[content.items.length - 1].id);
    } else if (tool === 'archive') {
      note.archived = !note.archived;
      changed();
      modal.close();
      toast(note.archived ? 'Note archived' : 'Note moved out of the archive', { action: 'Undo', onAction: () => { note.archived = !note.archived; store.commit('notes'); rerender(); } });
      return;
    } else if (tool === 'delete') {
      if (note.locked && !(await confirmDialog('A locked note cannot be brought back once deleted.', { title: 'Delete this note?' }))) return;
      const at = store.data.notes.indexOf(note);
      store.data.notes = store.data.notes.filter((n) => n !== note);
      reseal.flush();
      modal.close();
      if (!noteIsEmpty(note)) toast('Note deleted', { action: 'Undo', onAction: () => { store.data.notes.splice(Math.max(0, at), 0, note); store.commit('notes'); rerender(); } });
      return;
    } else if (tool === 'lock') {
      if (note.locked) {
        reseal.cancel();
        Object.assign(note, { title: content.title, body: content.body, items: content.items, locked: null });
        content = note;
      } else {
        if (!(await ensureVault())) return;
        content = { title: note.title, body: note.body, items: note.items };
        await lockNote(note, content);
        toast('Locked. It opens with your passcode.');
      }
      drawBody();
    }
    changed();
    drawTools();
  });

  drawTools();
  drawBody();
  /** @type {HTMLElement|null} */ (body.querySelector(content.title || content.items ? '[data-title]' : '[data-body]'))?.focus();
}

export function mount(el, param) {
  const render = () => { el.innerHTML = html(); };
  const openNote = (note) => openNoteEditor(note, render);

  el.addEventListener('click', (e) => {
    const target = /** @type {Element} */ (e.target);
    const pick = (name) => /** @type {HTMLElement|null} */ (target.closest(`[data-${name}]`));
    const state = ui();
    if (pick('item')) {
      const note = store.data.notes.find((n) => n.id === /** @type {HTMLElement} */ (target.closest('[data-note]')).dataset.note);
      const item = note?.items?.find((i) => i.id === pick('item').dataset.item);
      if (item) { item.done = !item.done; note.updated = Date.now(); store.commit('notes'); render(); }
      return;
    }
    if (pick('note')) {
      const note = store.data.notes.find((n) => n.id === pick('note').dataset.note);
      if (note) openNote(note);
      return;
    }
    if (pick('new')) { openNote(addNote(pick('new').dataset.new === 'list' ? { items: [{ id: uid(), text: '', done: false }] } : {})); return; }
    if (pick('filter')) { state.color = pick('filter').dataset.filter; store.touch(); render(); return; }
    if (pick('layout')) { state.layout = pick('layout').dataset.layout; store.touch(); render(); return; }
    if (pick('lock-now')) { lockVault(); render(); toast('Locked notes are sealed again.'); }
  });
  el.addEventListener('keydown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if ((e.key === 'Enter' || e.key === ' ') && target.matches('[data-note]')) { e.preventDefault(); target.click(); }
  });
  el.addEventListener('submit', (e) => {
    if (!/** @type {Element} */ (e.target).matches('[data-capture]')) return;
    e.preventDefault();
    const input = /** @type {HTMLInputElement} */ (el.querySelector('[data-capture] input'));
    const text = input.value.trim();
    if (!text) return;
    addNote({ body: text });
    store.commit('notes');
    render();
    /** @type {HTMLElement|null} */ (el.querySelector('[data-capture] input'))?.focus();
  });
  el.addEventListener('input', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    if (!input.matches('[data-search]')) return;
    query = input.value;
    // Redraw only the results, so the search box keeps the cursor.
    const fresh = h(`<div>${html()}</div>`);
    el.querySelector('[data-results]').replaceWith(fresh.querySelector('[data-results]'));
  });

  render();
  if (param) {
    const note = store.data.notes.find((n) => n.id === param);
    if (note) openNote(note);
    history.replaceState(null, '', '#/notes');
  }
  return { refresh: render, create: () => openNote(addNote()) };
}
