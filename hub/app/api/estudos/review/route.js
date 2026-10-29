import { db, now } from "@/lib/atlas/db.js";
import { ok, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

// Cartões vencidos (de uma área ou de todas), os mais atrasados primeiro.
export const GET = route(async (req) => {
  const sid = req.nextUrl.searchParams.get("subject");
  const nid = req.nextUrl.searchParams.get("node");
  const rows = db()
    .prepare(
      `SELECT c.id, c.front, c.back, c.subject_id, s.title AS subject, n.title AS node FROM cards c
       JOIN subjects s ON s.id=c.subject_id LEFT JOIN nodes n ON n.id=c.node_id
       WHERE c.due<=? ${sid ? "AND c.subject_id=?" : ""} ${nid ? "AND c.node_id=?" : ""} ORDER BY c.due LIMIT 40`
    )
    .all(...[now(), ...(sid ? [sid] : []), ...(nid ? [nid] : [])]);
  const total = db().prepare(`SELECT COUNT(*) n FROM cards c WHERE c.due<=? ${sid ? "AND c.subject_id=?" : ""} ${nid ? "AND c.node_id=?" : ""}`).get(...[now(), ...(sid ? [sid] : []), ...(nid ? [nid] : [])]).n;
  return ok({ cards: rows, total });
});
