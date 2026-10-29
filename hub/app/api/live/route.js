import { subscribe, startWatcher } from "@/lib/live/bus.js";
import { ensureTimers } from "@/lib/agenda/timers.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Fluxo SSE: cada mudança no sistema chega aqui em tempo real.
export async function GET(request) {
  startWatcher();
  ensureTimers();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (obj) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {} };
      send({ scope: "hello", ts: Date.now() });
      const unsub = subscribe(send);
      const ka = setInterval(() => { try { controller.enqueue(enc.encode(": ka\n\n")); } catch {} }, 20000);
      const close = () => { clearInterval(ka); unsub(); try { controller.close(); } catch {} };
      request.signal.addEventListener("abort", close);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
