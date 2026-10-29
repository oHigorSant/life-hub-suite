import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { webhookSecret, onWebhook } from "@/lib/finance/pluggy.js";

export const dynamic = "force-dynamic";

// Aviso do Pluggy (item atualizado, transações novas...). Rota pública (sem cookie), protegida por segredo na URL:
// só aciona uma sincronização dos bancos que o usuário já conectou; não lê nem escreve nada vindo do corpo.
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export async function POST(request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!same(token, await webhookSecret())) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  let evt = {};
  try { evt = await request.json(); } catch { /* corpo vazio */ }
  return NextResponse.json(onWebhook(evt));
}

export async function GET() { return NextResponse.json({ ok: true }); }
