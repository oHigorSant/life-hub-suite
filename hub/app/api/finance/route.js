import { NextResponse } from "next/server";
import { readFinance } from "@/lib/financeStore";
import { ensureScheduler } from "@/lib/finance/pluggy.js";

export async function GET() {
  ensureScheduler(); // sincronização automática do Open Finance (só age se o Pluggy estiver configurado)
  const data = await readFinance();
  return NextResponse.json(data);
}
