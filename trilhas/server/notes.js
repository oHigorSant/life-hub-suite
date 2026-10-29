// Notas do aluno: guardadas em data/notes.json e espelhadas nas Notas do Life Hub (quando disponível).
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { pushNote, removeNote } from './hub.js';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'notes.json');
let notes = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];

const save = () => {
  writeFileSync(file + '.tmp', JSON.stringify(notes));
  renameSync(file + '.tmp', file);
};

const sanitize = (n) => ({
  title: String(n.title || '').trim().slice(0, 120) || 'Nota sem título',
  body: String(n.body || '').slice(0, 20000),
  tags: [...new Set((Array.isArray(n.tags) ? n.tags : []).map((t) => String(t).trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 8),
});

const sync = async (note) => {
  note.hub = await pushNote(note);
  save();
};

export const listNotes = () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt);

export async function createNote(input, source = null) {
  const now = Date.now();
  const note = { id: randomUUID().slice(0, 8), ...sanitize(input), source, hub: { status: 'pending', path: null }, createdAt: now, updatedAt: now };
  notes.push(note);
  save();
  await sync(note);
  return note;
}

export async function updateNote(id, input) {
  const note = notes.find((n) => n.id === id);
  if (!note) return null;
  Object.assign(note, sanitize({ ...note, ...input }), { updatedAt: Date.now() });
  save();
  await sync(note);
  return note;
}

export async function deleteNote(id) {
  const note = notes.find((n) => n.id === id);
  if (!note) return false;
  notes = notes.filter((n) => n.id !== id);
  save();
  await removeNote(note);
  return true;
}

// Reenvia ao Hub as notas que ficaram pendentes.
export async function syncPending() {
  for (const n of notes.filter((x) => x.hub?.status === 'pending')) await sync(n);
  return listNotes();
}
