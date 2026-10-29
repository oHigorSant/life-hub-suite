import { NextResponse } from "next/server";
import { readFinance, writeFinance } from "@/lib/financeStore";
import { emit } from "@/lib/live/bus.js";
import { applyRules, linkSeries, unlinkSeries, ignoreSeries } from "@/lib/finance/reconcile.js";
import { todaySP } from "@/lib/finance/analytics.js";

// Ação direta da tela: ligar uma conta ao favorecido que aparece no extrato (e baixar as pagas com a data real do banco).
export async function POST(request) {
  let b;
  try { b = (await request.json()) ?? {}; } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const data = await readFinance();
  try {
    const now = todaySP();
    let result = {};
    if (b.op === "link") { linkSeries(data, b.seriesId, b.keyword); result = applyRules(data, now); }
    else if (b.op === "link_many") { for (const l of b.links || []) linkSeries(data, l.seriesId, l.keyword); result = applyRules(data, now); }
    else if (b.op === "unlink") unlinkSeries(data, b.seriesId);
    else if (b.op === "ignore") ignoreSeries(data, b.seriesId);
    else if (b.op === "apply") result = applyRules(data, now);
    else return NextResponse.json({ error: "Operação desconhecida." }, { status: 400 });
    await writeFinance(data);
    emit("finance");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
