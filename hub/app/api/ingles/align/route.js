import { NextResponse } from "next/server";
import { loadAlign } from "@/lib/ingles/practice";

export const dynamic = "force-dynamic";

/** Tempo de cada palavra do texto (karaokê). `words` só vem quando o texto do curso não bate com a fala (modo ao vivo). */
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const id = p.get("lesson"), file = p.get("file");
  const al = loadAlign(id || "");
  const t = al?.audios?.[file || ""];
  if (!t) return NextResponse.json({ error: "Sem alinhamento para este áudio" }, { status: 404 });
  return NextResponse.json({ coverage: t.coverage, duration: t.duration, spans: t.spans, words: t.words || null, tokens: al.tokens });
}
