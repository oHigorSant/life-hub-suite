import { json, handle, body } from "@/lib/notas/http.js";
import { publicStatus, createConnectToken, registerItem, syncItem, syncAll, refreshItem, removeItem, setSettings, ensureScheduler, configured } from "@/lib/finance/pluggy.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const fail = (m, s = 400) => Object.assign(new Error(m), { status: s });

// GET -> estado da integração (bancos conectados, última sincronização, configurações)
export const GET = handle(async () => { ensureScheduler(); return json(publicStatus()); });

// POST { op }: connectToken{itemId?} | register{itemId} | sync{itemId?, full?, refresh?} | remove{itemId} | settings{importBills?, autoSync?}
export const POST = handle(async (request) => {
  const b = await body(request);
  if (!configured() && b.op !== "settings") throw fail("Pluggy ainda não configurado no servidor (Client ID e Secret).", 503);
  switch (b.op) {
    case "connectToken": return json(await createConnectToken({ itemId: b.itemId || undefined, publicBase: process.env.LIFEHUB_PUBLIC_URL || null }));
    case "register": return json(await registerItem(String(b.itemId || "")));
    case "sync": {
      if (b.itemId) return json(b.refresh ? await refreshItem(String(b.itemId)) : await syncItem(String(b.itemId), { full: !!b.full }));
      return json({ results: await syncAll({ full: !!b.full }) });
    }
    case "remove": await removeItem(String(b.itemId || "")); return json({ ok: true });
    case "settings": await setSettings(b); return json(publicStatus());
    default: throw fail("Operação desconhecida.");
  }
});
