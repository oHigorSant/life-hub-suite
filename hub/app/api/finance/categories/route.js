import { NextResponse } from "next/server";
import { readFinance, writeFinance } from "@/lib/financeStore";

const VALID_COLORS = ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "black", "grey"];
const VALID_KINDS = ["expense", "income", "both"];

function newId() {
  return "cat_" + Math.random().toString(36).slice(2, 10);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { name, color, kind } = body ?? {};
  if (typeof name !== "string" || !name.trim() || !VALID_COLORS.includes(color) || !VALID_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readFinance();
  const category = { id: newId(), name: name.trim(), color, kind };
  data.categories.push(category);
  await writeFinance(data);
  return NextResponse.json({ ok: true, category });
}
