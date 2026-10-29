"use client";

/**
 * Recupera a resposta de um pedido cuja conexão caiu no meio (rede, proxy, redeploy). O servidor continua trabalhando e grava
 * o resultado no diário; aqui perguntamos por ele até aparecer. Devolve { ok, reply, engine, model } ou null se o pedido
 * nunca chegou ao servidor (ou se esgotou o tempo).
 */
export async function recoverLast(sentAt, { surface = "dados", maxTries = 80 } = {}) {
  for (let i = 0; i < maxTries; i++) {
    await new Promise((r) => setTimeout(r, i < 3 ? 1500 : 3000));
    try {
      const j = await (await fetch(`/api/agente/last?since=${sentAt}&surface=${surface}`, { cache: "no-store" })).json();
      if (j.state === "done") return { ok: j.ok, reply: j.reply, engine: j.engine, model: j.model };
      if (j.state === "none" && i >= 4) return null;
    } catch { /* sem rede agora: segue tentando */ }
  }
  return null;
}
