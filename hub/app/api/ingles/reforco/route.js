import { NextResponse } from "next/server";
import { readPlan, startBuild } from "@/lib/ingles/reforco";
import { readWords } from "@/lib/ingles/progress";

export const dynamic = "force-dynamic";

/** Estudo de reforço atual (ou o andamento da montagem). `stale` = há itens novos desde a última montagem. */
export async function GET() {
  const plan = readPlan();
  const ids = new Set(plan.basedOn || []);
  const fresh = readWords().filter((w) => w.level !== "consolidada" && !ids.has(w.id)).length;
  return NextResponse.json({ ...plan, newItems: plan.basedOn ? fresh : null });
}

/** { op: "build" } — monta (ou refaz) o estudo em segundo plano. */
export async function POST(req) {
  try {
    const { op } = await req.json().catch(() => ({}));
    if (op !== "build") return NextResponse.json({ error: "Operação desconhecida" }, { status: 400 });
    return NextResponse.json(startBuild());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
