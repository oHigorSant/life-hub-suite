import { NextResponse } from "next/server";
import { overview, recordAttempt, recordListen, setManualDone, setGoal } from "@/lib/ingles/progress";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(overview());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** op: attempt | listen | done | undone | goal */
export async function POST(req) {
  try {
    const b = await req.json();
    if (b.op === "attempt") return NextResponse.json({ ok: true, ...recordAttempt(b) });
    if (b.op === "listen") return NextResponse.json({ ok: true, ...recordListen(b) });
    if (b.op === "done" || b.op === "undone") { setManualDone(b.lesson, b.op === "done"); return NextResponse.json({ ok: true }); }
    if (b.op === "goal") { setGoal(b.minutes); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "Operação desconhecida" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
