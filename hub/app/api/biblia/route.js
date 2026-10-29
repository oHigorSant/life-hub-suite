import { json, handle } from "@/lib/notas/http.js";
import { versions, versionInfo, books, passage, verseOfTheDay, DEFAULT_VERSION } from "@/lib/biblia/yv.js";

export const dynamic = "force-dynamic";

// GET /api/biblia?op=versions
//   | op=books&v=<id>
//   | op=passage&v=<id>&ref=JHN.3  (ou JHN.3.16-18)
//   | op=votd[&v=<id>]
export const GET = handle(async (request) => {
  const q = new URL(request.url).searchParams;
  const v = Number(q.get("v")) || DEFAULT_VERSION;
  switch (q.get("op")) {
    case "versions": return json({ versions: await versions(), default: DEFAULT_VERSION });
    case "books": return json({ books: await books(v), version: await versionInfo(v) });
    case "passage": return json({ ...(await passage(v, String(q.get("ref") || ""))), version: await versionInfo(v) });
    case "votd": return json(await verseOfTheDay(v));
    default: return json({ error: "op inválida." }, 400);
  }
});
