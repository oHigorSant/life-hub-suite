import { NextResponse } from "next/server";
import { readFinance, writeFinance } from "@/lib/financeStore";
import { emit } from "@/lib/live/bus.js";

const VALID_TYPES = ["expense", "income"];

function newId() {
  return "txn_" + Math.random().toString(36).slice(2, 10);
}

// Direct write: manual entry from the dashboard form (user filled the fields
// themselves, so it needs no separate confirmation step). Natural-language
// entries via chat ("gastei 40 no mercado") go through /api/chat instead,
// where CLAUDE.md requires showing a summary and waiting for confirmation
// before writing.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { accountId, categoryId, type, amount, date, description } = body ?? {};
  const numericAmount = Number(amount);

  if (
    typeof accountId !== "string" ||
    typeof categoryId !== "string" ||
    !VALID_TYPES.includes(type) ||
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0 ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readFinance();
  if (!data.accounts.some((a) => a.id === accountId)) {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }
  if (!data.categories.some((c) => c.id === categoryId)) {
    return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const transaction = {
    id: newId(),
    accountId,
    categoryId,
    type,
    amount: numericAmount,
    date,
    description: typeof description === "string" ? description.trim() : "",
    source: "manual",
    recurring: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  data.transactions.push(transaction);
  await writeFinance(data);
  emit("finance");
  return NextResponse.json({ ok: true, transaction });
}

// Direct write: reclassificar um lançamento (categoria) e dizer se é transferência (fora dos gastos) são ajustes da tela.
// Nos importados do banco, `manualTransfer` faz a sua escolha sobreviver às próximas sincronizações.
export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const { id, categoryId, transfer } = body ?? {};
  if (typeof id !== "string") return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  const data = await readFinance();
  const t = data.transactions.find((x) => x.id === id);
  if (!t) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  if (categoryId !== undefined) {
    if (!data.categories.some((c) => c.id === categoryId)) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
    t.categoryId = categoryId;
  }
  if (transfer !== undefined) {
    t.transfer = transfer ? true : undefined;
    t.manualTransfer = Boolean(transfer);
  }
  t.updatedAt = new Date().toISOString();
  await writeFinance(data);
  emit("finance");
  return NextResponse.json({ ok: true });
}
