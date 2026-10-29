import fs from "node:fs";
import { cachedImage } from "@/lib/lazer/store";

export const dynamic = "force-dynamic";

/** Miniatura externa servida pelo próprio hub (com cache em data/lazer/cache): não quebra se o site bloquear o link direto. */
export async function GET(req) {
  const u = new URL(req.url).searchParams.get("u");
  if (!u) return new Response("Falta a URL.", { status: 400 });
  try {
    const { file, type } = await cachedImage(u);
    return new Response(fs.readFileSync(file), { headers: { "content-type": type, "cache-control": "private, max-age=604800", "x-content-type-options": "nosniff" } });
  } catch (e) {
    return new Response(e.message || "Falhou", { status: 502 });
  }
}
