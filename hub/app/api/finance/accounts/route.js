import { NextResponse } from "next/server";
import { readFinance, writeFinance } from "@/lib/financeStore";

const VALID_TYPES = ["checking", "savings", "credit_card", "cash", "investment"];
const VALID_COLORS = ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "black", "grey"];

function newId() {
  return "acct_" + Math.random().toString(36).slice(2, 10);
}

// Direct write: manual account creation from the dashboard form. The user
// typing the fields themselves is the confirmation — no chat round-trip
// needed here (that rule is only for chat-interpreted natural language).
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { name, type, color } = body ?? {};
  if (typeof name !== "string" || !name.trim() || !VALID_TYPES.includes(type) || !VALID_COLORS.includes(color)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readFinance();
  const account = {
    id: newId(),
    name: name.trim(),
    type,
    color,
    source: "manual",
    openFinanceId: null,
    balance: 0,
    archived: false,
    createdAt: new Date().toISOString(),
  };
  data.accounts.push(account);
  await writeFinance(data);
  return NextResponse.json({ ok: true, account });
}
