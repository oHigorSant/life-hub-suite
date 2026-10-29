import { NextResponse } from "next/server";
import { readFinance, writeFinance } from "@/lib/financeStore";
import { emit } from "@/lib/live/bus.js";

// Direct write: marcar paga/pendente, ajustar valor ou vencimento e baixar várias de uma vez são ações estruturais da tela
// (mesmo nível de marcar item de checklist), sem passar pelo chat. Criar uma conta NOVA a partir de texto livre continua
// passando pela confirmação do chat (ver CLAUDE.md).
export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const ids = Array.isArray(body?.billIds) ? body.billIds : typeof body?.billId === "string" ? [body.billId] : [];
  const { status, amount, dueDate } = body ?? {};
  if (!ids.length || (status !== undefined && !["pending", "paid", "overdue"].includes(status))) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }
  if (amount !== undefined && !(Number(amount) > 0)) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
  if (dueDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return NextResponse.json({ error: "Data inválida." }, { status: 400 });

  const data = await readFinance();
  const now = new Date().toISOString();
  let n = 0;
  for (const id of ids) {
    const bill = (data.bills ?? []).find((b) => b.id === id);
    if (!bill) continue;
    if (status !== undefined) {
      bill.status = status;
      if (status === "paid") bill.paidAt = bill.paidAt || now.slice(0, 10);
      else { delete bill.paidAt; delete bill.paidBy; }
    }
    if (amount !== undefined) bill.amount = Math.round(Number(amount) * 100) / 100;
    if (dueDate !== undefined) bill.dueDate = dueDate;
    bill.updatedAt = now;
    n++;
  }
  if (!n) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  await writeFinance(data);
  emit("finance");
  return NextResponse.json({ ok: true, updated: n });
}
