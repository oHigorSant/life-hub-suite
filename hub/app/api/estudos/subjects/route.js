import { db, now, uid, logEvent } from "@/lib/atlas/db.js";
import { subjectSummary, todayPlan } from "@/lib/atlas/progress.js";
import { ok, fail, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

const COLORS = ["#8b5cf6", "#22d3ee", "#f59e0b", "#34d399", "#f472b6", "#60a5fa", "#fb7185", "#a3e635"];

export const GET = route(async () => {
  const rows = db().prepare("SELECT * FROM subjects WHERE status!='archived' ORDER BY updated_at DESC").all();
  return ok({ subjects: rows.map((s) => ({ ...s, summary: subjectSummary(s.id), today: todayPlan(s.id) })) });
});

export const POST = route(async (req) => {
  const b = await req.json();
  if (!b.title?.trim()) return fail("Dê um nome à área.");
  const id = uid("sub_");
  const n = db().prepare("SELECT COUNT(*) n FROM subjects").get().n;
  db()
    .prepare("INSERT INTO subjects(id, title, goal, start_level, target_level, deadline, hours_per_week, color, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(id, b.title.trim(), b.goal || null, b.start_level || null, b.target_level || null, b.deadline || null, b.hours_per_week ? Number(b.hours_per_week) : null, COLORS[n % COLORS.length], now(), now());
  logEvent(id, "subject_created", id, { title: b.title });
  return ok({ id });
});
