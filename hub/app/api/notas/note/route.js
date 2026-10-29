import { readNote, writeNote, deleteNote, renameNote } from "@/lib/notas/store.js";
import { relationsFor } from "@/lib/notas/graph.js";
import { json, handle, body } from "@/lib/notas/http.js";

export const dynamic = "force-dynamic";

// GET    /api/notas/note?path=...  -> conteúdo + relações (backlinks/saídas)
// PUT    { path, raw }             -> salva (cria se não existir)
// POST   { path, raw }             -> cria (409 se já existe)
// PATCH  { from, to }              -> renomeia/move e atualiza [[links]]
// DELETE ?path=...                 -> manda para a lixeira do cofre
export const GET = handle(async (request) => {
  const p = request.nextUrl.searchParams.get("path");
  const note = readNote(p);
  return json({ ...note, relations: relationsFor(note.path) });
});

export const PUT = handle(async (request) => {
  const b = await body(request);
  return json(writeNote(b.path, b.raw));
});

export const POST = handle(async (request) => {
  const b = await body(request);
  return json(writeNote(b.path, b.raw ?? "", { create: true }), 201);
});

export const PATCH = handle(async (request) => {
  const b = await body(request);
  return json(renameNote(b.from, b.to));
});

export const DELETE = handle(async (request) => {
  deleteNote(request.nextUrl.searchParams.get("path"));
  return json({ ok: true });
});
