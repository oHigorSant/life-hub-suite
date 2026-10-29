import { json, handle, body } from "@/lib/notas/http.js";
import { engineStatus } from "@/lib/agent/engines/status.js";
import { saveEngineConfig, ENGINES } from "@/lib/agent/engines/config.js";
import { clearCooldown, allCooldowns } from "@/lib/agent/engines/usage.js";
import { testEngine } from "@/lib/agent/router.js";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

// GET /api/agente/engines[?full=1] -> estado, uso e limites de todas as IAs (full inclui o catálogo de modelos)
export const GET = handle(async (request) => json(await engineStatus({ full: new URL(request.url).searchParams.get("full") === "1" })));

// POST { config: {...parcial} } | { op: "test", engine } | { op: "clear", slot? } (sem slot = limpa todas as esperas)
export const POST = handle(async (request) => {
  const b = await body(request);
  if (b.op === "test") {
    if (!ENGINES[b.engine]) return json({ error: "Motor desconhecido." }, 400);
    return json(await testEngine(b.engine));
  }
  if (b.op === "clear") {
    for (const slot of b.slot ? [b.slot] : Object.keys(allCooldowns())) clearCooldown(slot);
    return json({ ok: true });
  }
  if (b.config && typeof b.config === "object") return json({ config: await saveEngineConfig(b.config) });
  return json({ error: "Operação desconhecida." }, 400);
});
