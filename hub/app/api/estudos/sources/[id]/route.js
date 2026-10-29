import { db, parse } from "@/lib/atlas/db.js";
import { processSource } from "@/lib/atlas/ingest.js";
import { ok, fail, route } from "@/lib/atlas/api.js";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export const GET = route(async (req, { id }) => {
  const s = db().prepare("SELECT * FROM sources WHERE id=?").get(id);
  if (!s) return fail("Fonte não encontrada.", 404);
  const concepts = db().prepare("SELECT id, title, definition, methodology, criteria, refs, importance FROM concepts WHERE source_id=? ORDER BY importance DESC").all(id);
  const chunks = db().prepare("SELECT id, locator, heading, substr(text,1,400) AS preview FROM chunks WHERE source_id=? ORDER BY ord LIMIT 80").all(id);
  return ok({ source: { ...s, outline: parse(s.outline_json, []) }, concepts, chunks });
});

export const POST = route(async (req, { id }) => ok({ job: processSource(id) })); // reprocessar

export const DELETE = route(async (req, { id }) => {
  const s = db().prepare("SELECT path FROM sources WHERE id=?").get(id);
  db().prepare("DELETE FROM concepts WHERE source_id=?").run(id);
  db().prepare("DELETE FROM sources WHERE id=?").run(id);
  if (s?.path) fs.rmSync(path.dirname(s.path), { recursive: true, force: true });
  return ok();
});
