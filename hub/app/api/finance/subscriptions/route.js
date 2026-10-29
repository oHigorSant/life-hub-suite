import { NextResponse } from "next/server";
import { readFinance, writeFinance } from "@/lib/financeStore";

function newId(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 10);
}

/** Próximas `count` datas de vencimento (YYYY-MM-DD) a partir do mês atual. */
function nextOccurrenceDates(dayOfMonth, count) {
  const now = new Date();
  const dates = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, dayOfMonth);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

// Reativar uma assinatura materializa as próximas ocorrências que ainda não
// existem — mesma convenção de "3 meses de horizonte" usada pro resto de
// bills[] (ver CLAUDE.md). Não mexe em nada já existente pra essa série.
function ensureUpcomingBills(data, sub) {
  data.bills = data.bills ?? [];
  const existingDates = new Set(
    data.bills.filter((b) => b.seriesId === sub.seriesId).map((b) => b.dueDate)
  );
  const now = new Date().toISOString();
  for (const dueDate of nextOccurrenceDates(sub.dayOfMonth, 3)) {
    if (existingDates.has(dueDate)) continue;
    data.bills.push({
      id: newId("bill"),
      name: sub.name,
      categoryId: sub.categoryId,
      amount: sub.amount,
      originalAmount: null,
      lateFee: null,
      dueDate,
      status: "pending",
      recurrence: { freq: "monthly", dayOfMonth: sub.dayOfMonth, endDate: null },
      seriesId: sub.seriesId,
      installment: null,
      notes: "Assinatura ativa — gerada automaticamente a partir do quadro de Assinaturas.",
      accountId: sub.accountId ?? null,
      source: "chat",
      archived: false,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// Direct write: cadastrar assinatura pelo formulário é ação estrutural
// (mesma categoria de "+ Conta"), não passa pelo chat.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { name, categoryId, amount, accountId, dayOfMonth } = body ?? {};
  const parsedAmount = Number(amount);
  const parsedDay = Number(dayOfMonth) || 1;
  if (typeof name !== "string" || !name.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readFinance();
  const now = new Date().toISOString();
  const sub = {
    id: newId("sub"),
    name: name.trim(),
    categoryId: categoryId || null,
    amount: parsedAmount,
    accountId: accountId || null,
    dayOfMonth: Math.min(Math.max(parsedDay, 1), 28),
    active: true,
    seriesId: newId("bser"),
    cancelledAt: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
  data.subscriptions = data.subscriptions ?? [];
  data.subscriptions.push(sub);
  ensureUpcomingBills(data, sub);
  await writeFinance(data);
  return NextResponse.json({ ok: true, subscription: sub });
}

// Direct write: o toggle ativo/inativo é estrutural (mesma categoria do
// checkbox de "pago"). Desativar remove só as ocorrências FUTURAS ainda não
// vencidas em bills[] (nunca mexe em passado/pago — o mês corrente ou
// atrasado já é considerado "cobrado" e fica registrado). Reativar
// materializa de novo. A palavra final de qualquer mês específico segue
// sendo a fatura, quando ela for processada — isso aqui é só a previsão.
export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { subscriptionId, active } = body ?? {};
  if (typeof subscriptionId !== "string" || typeof active !== "boolean") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readFinance();
  const sub = (data.subscriptions ?? []).find((s) => s.id === subscriptionId);
  if (!sub) {
    return NextResponse.json({ error: "Assinatura não encontrada." }, { status: 404 });
  }

  sub.active = active;
  sub.updatedAt = new Date().toISOString();

  if (!active) {
    sub.cancelledAt = sub.updatedAt.slice(0, 10);
    const today = sub.cancelledAt;
    data.bills = (data.bills ?? []).filter(
      (b) => !(b.seriesId === sub.seriesId && b.status === "pending" && b.dueDate > today)
    );
  } else {
    sub.cancelledAt = null;
    ensureUpcomingBills(data, sub);
  }

  await writeFinance(data);
  return NextResponse.json({ ok: true, subscription: sub });
}
