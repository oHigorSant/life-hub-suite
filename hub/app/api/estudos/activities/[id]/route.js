import { db, parse } from "@/lib/atlas/db.js";
import { publicQuestion } from "@/lib/atlas/activities.js";
import { ok, fail, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const GET = route(async (req, { id }) => {
  const a = db().prepare("SELECT * FROM activities WHERE id=?").get(id);
  if (!a) return fail("Atividade não encontrada.", 404);
  const content = parse(a.content_json, {});
  let questions = null;
  if (a.type === "quiz") {
    questions = db().prepare("SELECT * FROM questions WHERE activity_id=? ORDER BY difficulty, created_at").all(id).map(publicQuestion);
  }
  return ok({ id: a.id, type: a.type, title: a.title, node_id: a.node_id, content, questions });
});
