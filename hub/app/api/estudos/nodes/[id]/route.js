import { db, parse } from "@/lib/atlas/db.js";
import { computeTree } from "@/lib/atlas/progress.js";
import { ACTIVITY_TYPES, nodeContext } from "@/lib/atlas/activities.js";
import { ok, fail, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const GET = route(async (req, { id }) => {
  const row = db().prepare("SELECT * FROM nodes WHERE id=?").get(id);
  if (!row) return fail("Nó não encontrado.", 404);
  const tree = computeTree(row.subject_id);
  const node = tree.nodes.find((n) => n.id === id);
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const concepts = db()
    .prepare(
      `SELECT c.id, c.title, c.definition, c.methodology, c.criteria, c.refs, c.importance, m.attempts, m.avg_score, m.recent_score
       FROM node_concepts nc JOIN concepts c ON c.id=nc.concept_id LEFT JOIN v_concept_mastery m ON m.concept_id=c.id WHERE nc.node_id=? ORDER BY c.importance DESC`
    )
    .all(id);
  const activities = db().prepare("SELECT id, type, title, created_at FROM activities WHERE node_id=? ORDER BY created_at DESC").all(id);
  const ctx = nodeContext(id, { maxChars: 1 });
  const sources = db()
    .prepare("SELECT DISTINCT s.id, s.title, s.kind FROM node_chunks nc JOIN chunks c ON c.id=nc.chunk_id JOIN sources s ON s.id=c.source_id WHERE nc.node_id=?")
    .all(id);
  // geração em andamento (a tela retoma o acompanhamento mesmo depois de sair e voltar)
  const activeJob = db().prepare("SELECT id, kind FROM jobs WHERE ref_id=? AND kind LIKE 'activity:%' AND status IN ('queued','running') AND updated_at > ? ORDER BY created_at DESC LIMIT 1").get(id, Date.now() - 20 * 60_000) || null;
  return ok({
    activeJob,
    node,
    concepts,
    activities,
    sources,
    types: ACTIVITY_TYPES,
    prereqs: node.prereqs.map((p) => ({ ...p, title: byId.get(p.id)?.title, status: byId.get(p.id)?.status })),
    unlocks: node.unlocks.map((p) => ({ ...p, title: byId.get(p.id)?.title, status: byId.get(p.id)?.status })),
    hasSources: ctx.hasSources || sources.length > 0,
  });
});

export const POST = route(async (req, { id }) => {
  // marca estado manual (ex.: lição lida)
  const b = await req.json();
  const row = db().prepare("SELECT subject_id FROM nodes WHERE id=?").get(id);
  db()
    .prepare("INSERT INTO node_state(node_id, subject_id, started, lesson_done, updated_at) VALUES (?,?,1,?,?) ON CONFLICT(node_id) DO UPDATE SET started=1, lesson_done=COALESCE(?, lesson_done), updated_at=excluded.updated_at")
    .run(id, row.subject_id, b.lesson_done ? 1 : 0, Date.now(), b.lesson_done == null ? null : b.lesson_done ? 1 : 0);
  return ok();
});
