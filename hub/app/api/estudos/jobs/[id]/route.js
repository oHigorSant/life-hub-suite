import { db, parse } from "@/lib/atlas/db.js";
import { ok, fail, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const GET = route(async (req, { id }) => {
  const j = db().prepare("SELECT * FROM jobs WHERE id=?").get(id);
  if (!j) return fail("Job não encontrado.", 404);
  return ok({ ...j, result: parse(j.result_json) });
});
