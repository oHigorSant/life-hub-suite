import { search } from "@/lib/atlas/kb.js";
import { ok, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const GET = route(async (req, { id }) => {
  const q = req.nextUrl.searchParams.get("q") || "";
  const r = search(id, q, { limit: 20 });
  return ok({ ...r, chunks: r.chunks.map(({ text, ...c }) => c) });
});
