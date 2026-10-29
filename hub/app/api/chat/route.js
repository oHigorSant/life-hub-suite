import { NextResponse } from "next/server";
import { handleMessage } from "@/lib/agent/handle.js";

export const dynamic = "force-dynamic";

// Chat da aba (Tarefas, Grafo...) — agora é o MESMO agente geral do botão flutuante, na mesma sessão.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
  }
  let screen = typeof body?.path === "string" ? body.path.slice(0, 200) : "/";
  if (!body?.path) {
    try { screen = new URL(request.headers.get("referer") || "http://x/").pathname; } catch {}
  }

  try {
    const { ok, reply } = await handleMessage({ message, screen });
    return NextResponse.json({ ok, reply });
  } catch (err) {
    console.error("Erro no chat:", err);
    return NextResponse.json(
      { ok: false, reply: `Erro ao falar com o Claude Code: ${err.message}` },
      { status: 500 }
    );
  }
}
