import { gradeAnswer } from "@/lib/atlas/activities.js";
import { ok, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { id }) => {
  const b = await req.json();
  return ok(await gradeAnswer(id, b.answer, { confidence: b.confidence ?? null, timeMs: b.timeMs ?? null }));
});
