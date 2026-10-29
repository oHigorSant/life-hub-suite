import { json, handle } from "@/lib/notas/http.js";
import { recentJournal } from "@/lib/agent/journal.js";

export const dynamic = "force-dynamic";

// GET /api/agente/last?since=<ms> -> resultado do último pedido do chat de dados feito a partir de `since`.
// Usado pela tela para recuperar a resposta quando a conexão cai no meio (o servidor continua e grava no diário).
//   { state: "none" } nenhum pedido desde `since` | { state: "running" } em andamento | { state: "done", ok, reply, engine, model }
export const GET = handle(async (request) => {
  const q = new URL(request.url).searchParams;
  const since = Number(q.get("since")) || 0;
  const surface = q.get("surface") === "dev" ? "dev" : "dados";
  const ev = recentJournal(300).filter((e) => e.surface === surface);
  const req = [...ev].reverse().find((e) => e.kind === "request" && Date.parse(e.ts) >= since);
  if (!req) return json({ state: "none" });
  const res = ev.find((e) => e.kind === "result" && e.turn === req.turn);
  if (!res) return json({ state: "running" });
  return json({ state: "done", ok: res.ok !== false, reply: res.text, engine: res.engine, model: res.model || null });
});
