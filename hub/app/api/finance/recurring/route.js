import { NextResponse } from "next/server";
import { readFinance, writeFinance } from "@/lib/financeStore";
import { emit } from "@/lib/live/bus.js";
import { createRecurring, updateRecurring, removeRecurring, adoptRecurring } from "@/lib/finance/recurring.js";
import { applyRules } from "@/lib/finance/reconcile.js";
import { todaySP } from "@/lib/finance/analytics.js";

// Ação direta da tela (como "+ Conta"): cadastrar/editar/ligar/desligar fixa ou assinatura. Muda o cadastro e as contas futuras da série.
async function run(fn) {
  const data = await readFinance();
  try {
    const out = fn(data, todaySP());
    await writeFinance(data);
    emit("finance");
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

async function body(request) { try { return (await request.json()) ?? {}; } catch { return {}; } }

export async function POST(request) {
  const b = await body(request);
  if (b.op === "adopt") return run((data, today) => ({ adopted: adoptRecurring(data, today) }));
  return run((data, today) => ({ subscription: createRecurring(data, b, today) }));
}

export async function PATCH(request) {
  const { id, ...patch } = await body(request);
  if (typeof id !== "string") return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  return run((data, today) => {
    const subscription = updateRecurring(data, id, patch, today);
    if (patch.payee !== undefined) applyRules(data, today); // favorecido novo: baixa já o que o extrato prova
    return { subscription };
  });
}

export async function DELETE(request) {
  const { id } = await body(request);
  if (typeof id !== "string") return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  return run((data, today) => ({ removed: removeRecurring(data, id, today).id }));
}
