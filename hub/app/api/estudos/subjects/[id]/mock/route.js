import { buildMock, publicQuestion } from "@/lib/atlas/activities.js";
import { ok, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { id }) => {
  const b = await req.json().catch(() => ({}));
  const m = buildMock(id, { branch: b.branch || null, count: b.count || 20 });
  return ok({ ...m, questions: m.questions.map(publicQuestion) });
});
