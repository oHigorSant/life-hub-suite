import { handleMessage } from "@/lib/agent/handle.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 900;

// POST { message, path } -> fluxo SSE: {type:"intent"|"text"|"tool"|"done", ...}
// Comandos como "temporizador de 30min" respondem em milissegundos; o resto vai para o agente geral.
export async function POST(request) {
  let b;
  try { b = await request.json(); } catch { return Response.json({ error: "JSON inválido." }, { status: 400 }); }
  const message = typeof b?.message === "string" ? b.message.trim() : "";
  if (!message) return Response.json({ error: "Mensagem vazia." }, { status: 400 });
  if (message.length > 20000) return Response.json({ error: "Mensagem grande demais." }, { status: 413 });
  const screen = typeof b?.path === "string" ? b.path.slice(0, 200) : "/";

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (obj) => { if (!closed) { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {} } };
      request.signal.addEventListener("abort", () => { closed = true; });
      try {
        const r = await handleMessage({ message, screen }, send);
        send({ type: "done", ok: r.ok, reply: r.reply, fast: !!r.fast, engine: r.engine || null, model: r.model || null });
      } catch (e) {
        console.error("[agente]", e);
        send({ type: "done", ok: false, reply: `Erro ao falar com o Claude Code: ${e.message}` });
      } finally {
        closed = true;
        try { controller.close(); } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
