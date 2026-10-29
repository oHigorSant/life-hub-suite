import { loadNotes, searchNotes } from "@/lib/notas/store.js";
import { json, handle } from "@/lib/notas/http.js";

export const dynamic = "force-dynamic";

// GET /api/notas            -> lista de notas (metadados)
// GET /api/notas?q=texto    -> busca no conteúdo
export const GET = handle(async (request) => {
  const q = request.nextUrl.searchParams.get("q");
  if (q) return json({ results: searchNotes(q) });
  const notes = loadNotes().map((n) => ({
    path: n.path, title: n.title, type: n.type, area: n.area, tags: n.tags, mtime: n.mtime, words: n.words,
  }));
  return json({ notes });
});
