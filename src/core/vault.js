// Locked notes. A passcode becomes a key (PBKDF2, 210,000 rounds of SHA-256) and each
// locked note is sealed with AES-GCM. Only the sealed form is stored; the key lives
// in memory until the app is closed or "Lock now" is used. There is no recovery:
// nobody, including this app, can open a locked note without the passcode.

import { store } from './store.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const CHECK = 'meridian-vault';
let key = null;

const toB64 = (buf) => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** WebCrypto needs a secure page (https, localhost, or the installed app). */
export const vaultAvailable = () => !!globalThis.crypto?.subtle;
export const vaultExists = () => !!store.data.settings.vault;
export const vaultOpen = () => !!key;

async function derive(passcode, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(salt), iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function seal(k, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(text));
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function open(k, box) {
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, k, fromB64(box.ct)));
}

/** Set the passcode for the first time. */
export async function createVault(passcode) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const k = await derive(passcode, salt);
  store.data.settings.vault = { salt, check: await seal(k, CHECK) };
  key = k;
}

/** Try a passcode. Returns false when it is wrong. */
export async function unlockVault(passcode) {
  const v = store.data.settings.vault;
  if (!v) return false;
  try {
    const k = await derive(passcode, v.salt);
    if ((await open(k, v.check)) !== CHECK) return false;
    key = k;
    return true;
  } catch {
    return false;
  }
}

export function lockVault() {
  key = null;
}

/** The sealed form of a note's words, for saving edits to a note that is already locked. */
export async function sealContent(content) {
  if (!key) throw new Error('The vault is locked.');
  return seal(key, JSON.stringify({ title: content.title, body: content.body, items: content.items }));
}

/** Seal a note's words; what stays readable is its colour, dates and that it is locked. */
export async function lockNote(note, content = { title: note.title, body: note.body, items: note.items }) {
  if (!key) throw new Error('The vault is locked.');
  note.locked = await sealContent(content);
  note.title = '';
  note.body = '';
  note.items = null;
}

/** The words of a locked note. Throws if the vault is locked or the note was sealed with another passcode. */
export async function readNote(note) {
  if (!key) throw new Error('The vault is locked.');
  const c = JSON.parse(await open(key, note.locked));
  return { title: String(c.title || ''), body: String(c.body || ''), items: Array.isArray(c.items) ? c.items : null };
}
