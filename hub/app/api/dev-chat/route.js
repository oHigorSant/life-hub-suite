import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { sendDevMessage, resetDevSession } from "@/lib/devAgent";
import { DEV_LOG_FILE } from "@/lib/paths";

export const dynamic = "force-dynamic";

// Histórico: ao abrir a página no celular, mostra a conversa anterior em vez
// de uma tela em branco. Lê do mesmo log append-only que o devAgent grava.
export async function GET() {
  try {
    const raw = await fs.readFile(DEV_LOG_FILE, "utf8");
    const messages = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .slice(-60);
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (body?.action === "reset") {
    await resetDevSession();
    return NextResponse.json({ ok: true, reset: true });
  }

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
  }

  try {
    const { ok, reply, engine, model } = await sendDevMessage(message);
    return NextResponse.json({ ok, reply, engine, model });
  } catch (err) {
    console.error("Erro no dev-chat:", err);
    return NextResponse.json(
      { ok: false, reply: `Erro ao falar com o Claude Code: ${err.message}` },
      { status: 500 }
    );
  }
}
