import { NextResponse } from "next/server";
import { generateContexts } from "@/lib/ingles/contexts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** { ids: [...], n?: 2..5 } — gera novos contextos de uso (IA) para palavras/expressões do Reforço. */
export async function POST(req) {
  try {
    const { ids, n } = await req.json();
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: "Selecione ao menos um item." }, { status: 400 });
    const items = await generateContexts(ids.map(String), { n });
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
