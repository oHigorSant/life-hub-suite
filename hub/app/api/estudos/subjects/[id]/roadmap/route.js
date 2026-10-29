import { generateRoadmap, resetTree } from "@/lib/atlas/roadmap.js";
import { ok, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { id }) => {
  const b = await req.json().catch(() => ({}));
  if (b.rebuild) resetTree(id); // reconstrói do zero (apaga progresso desta área)
  return ok({ job: generateRoadmap(id, { extend: !!b.extend, prompt: b.prompt || "" }) });
});
