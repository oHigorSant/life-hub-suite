import { db, now } from "@/lib/atlas/db.js";
import { computeTree, subjectSummary, computeGaps, todayPlan } from "@/lib/atlas/progress.js";
import { sourceStats } from "@/lib/atlas/ingest.js";
import { deleteSubject } from "@/lib/atlas/subjects.js";
import { ok, fail, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const GET = route(async (req, { id }) => {
  const subject = db().prepare("SELECT * FROM subjects WHERE id=?").get(id);
  if (!subject) return fail("Área não encontrada.", 404);
  const tree = computeTree(id);
  const jobs = db().prepare("SELECT * FROM jobs WHERE subject_id=? AND (status IN ('queued','running') OR updated_at > ?) ORDER BY created_at DESC LIMIT 20").all(id, now() - 120_000);
  return ok({
    subject,
    summary: subjectSummary(id),
    nodes: tree.nodes,
    edges: tree.edges,
    sources: sourceStats(id),
    today: todayPlan(id),
    jobs,
  });
});

export const PATCH = route(async (req, { id }) => {
  const b = await req.json();
  const cols = ["title", "goal", "start_level", "target_level", "deadline", "hours_per_week", "status"];
  for (const c of cols) if (c in b) db().prepare(`UPDATE subjects SET ${c}=?, updated_at=? WHERE id=?`).run(b[c], now(), id);
  return ok();
});

export const DELETE = route(async (req, { id }) => {
  if (!deleteSubject(id)) return fail("Área não encontrada.", 404);
  return ok();
});
