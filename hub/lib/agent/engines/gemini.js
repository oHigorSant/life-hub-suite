import { toolDeclarations, executeTool, toolLabel, summarizeArgs, SAFE_TOOLS } from "./toolkit.js";
import { EngineError, cooldownMs } from "./errors.js";
import { geminiKeys } from "./config.js";
import { recordUsage, coolDown, cooldownOf, clearCooldown, nextPacificMidnight } from "./usage.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const geminiSlot = (keyId, model) => `gemini:${keyId}:${model}`;

async function gcall({ key, model, body, slot }) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try {
      r = await fetch(`${BASE}/${model}:generateContent`, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
    } catch (e) {
      last = new EngineError("network", `Sem resposta do Gemini (${e.name === "TimeoutError" ? "tempo esgotado" : e.message}).`, { slot });
      continue;
    }
    if (r.ok) return r.json();
    const j = await r.json().catch(() => ({}));
    const msg = j.error?.message || `HTTP ${r.status}`;
    if (r.status === 429) {
      const viol = (j.error?.details || []).flatMap((d) => d.violations || []).map((v) => v.quotaId || v.quotaMetric || "");
      const retry = (j.error?.details || []).map((d) => d.retryDelay).filter(Boolean)[0];
      if (viol.some((q) => /PerDay/i.test(q))) throw new EngineError("quota-daily", `Cota diária do Gemini esgotada (${model}).`, { until: nextPacificMidnight(), slot, status: 429 });
      throw new EngineError("quota-minute", `Limite por minuto do Gemini (${model}).`, { retryAfterMs: (parseFloat(retry) || 30) * 1000, slot, status: 429 });
    }
    if (r.status === 401 || r.status === 403 || /API key not valid|API_KEY_INVALID/i.test(msg)) throw new EngineError("auth", `Chave do Gemini recusada (${r.status}).`, { slot, status: r.status });
    if (r.status === 404) throw new EngineError("bad-model", `Modelo ${model} indisponível: ${msg.slice(0, 120)}`, { slot, status: 404 });
    if (r.status === 500 || r.status === 503 || r.status === 504) { last = new EngineError("overloaded", `Gemini sobrecarregado (${r.status}).`, { slot, status: r.status }); await new Promise((s) => setTimeout(s, 1500)); continue; }
    throw new EngineError("other", `Gemini: ${msg.slice(0, 200)}`, { slot, status: r.status });
  }
  throw last;
}

async function loop({ key, model, slot, system, prompt, surface, maxSteps, onEvent, onAction, usage, safeOnly }) {
  const decls = toolDeclarations(surface, safeOnly ? { only: SAFE_TOOLS } : {}).map((d) => ({ name: d.name, description: d.description, parametersJsonSchema: d.parameters }));
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  for (let step = 0; step < maxSteps; step++) {
    const body = { systemInstruction: { parts: [{ text: system }] }, contents, tools: [{ functionDeclarations: decls }], generationConfig: { maxOutputTokens: surface === "dev" ? 8192 : 4096 } };
    const resp = await gcall({ key, model, body, slot });
    const u = resp.usageMetadata || {};
    usage.in += u.promptTokenCount || 0; usage.out += u.candidatesTokenCount || 0; usage.thoughts += u.thoughtsTokenCount || 0; usage.requests++;
    recordUsage(slot, { ok: true, inTok: u.promptTokenCount || 0, outTok: u.candidatesTokenCount || 0, thoughts: u.thoughtsTokenCount || 0, surface });
    const cand = resp.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const texts = parts.filter((p) => p.text && !p.thought).map((p) => p.text);
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const text = texts.join("\n").trim();
      if (!text) throw new EngineError("other", `Gemini respondeu vazio (${cand?.finishReason || resp.promptFeedback?.blockReason || "sem motivo"}).`, { slot });
      return { text, finish: cand?.finishReason };
    }
    if (texts.length) onEvent({ type: "text", text: texts.join("\n").trim() });
    contents.push({ role: "model", parts }); // devolve as partes como vieram (assinaturas de raciocínio incluídas)
    const out = [];
    for (const c of calls) {
      const name = c.functionCall.name, args = c.functionCall.args || {};
      onEvent({ type: "tool", name, label: toolLabel(name) });
      const result = safeOnly && !SAFE_TOOLS.includes(name) ? { error: "Ferramenta indisponível neste motor (proteção de dados pessoais)." } : await executeTool(name, args, { surface });
      onAction({ tool: name, summary: summarizeArgs(name, args), ok: !result?.error });
      out.push({ functionResponse: { name, response: result } });
    }
    contents.push({ role: "user", parts: out });
  }
  throw new EngineError("steps", "Esse pedido precisa de mais passos do que o limite configurado. Divida em partes menores.", { slot });
}

/** Tenta cada (chave x modelo) livre, na ordem; esfria o que falhar e passa ao próximo. */
export async function runGemini({ surface, system, prompt, onEvent, onAction, config, ignoreCooldown = false, safeOnly = false }) {
  const keys = geminiKeys();
  if (!keys.length) throw new EngineError("auth", "Nenhuma chave do Gemini configurada.");
  const usage = { in: 0, out: 0, thoughts: 0, requests: 0, cost: 0 };
  const models = config.models.gemini;
  let lastErr = null;
  for (const model of models) {
    for (const k of keys) {
      const slot = geminiSlot(k.id, model);
      if (!ignoreCooldown && cooldownOf(slot)) continue;
      try {
        const r = await loop({ key: k.key, model, slot, system, prompt, surface, maxSteps: config.limits.maxSteps[surface] || 25, onEvent, onAction, usage, safeOnly });
        clearCooldown(slot);
        return { ok: true, text: r.text, model, slot, keyTail: k.tail, usage };
      } catch (e) {
        const err = e instanceof EngineError ? e : new EngineError("other", String(e.message || e), { slot });
        recordUsage(slot, { ok: false, error: err.message, surface });
        if (err.kind === "steps") throw err;
        const ms = err.until ? err.until - Date.now() : cooldownMs(err);
        if (ms > 0) coolDown(slot, Date.now() + ms, err.message);
        if (err.kind === "auth") for (const m of models) coolDown(geminiSlot(k.id, m), Date.now() + cooldownMs(err), err.message); // chave ruim: esfria em todos os modelos
        lastErr = err;
      }
    }
  }
  throw lastErr || new EngineError("quota-minute", "Todas as chaves/modelos do Gemini estão em espera.", { retryAfterMs: 30_000 });
}

/** Há alguma combinação livre agora? (para o roteador decidir sem gastar um pedido) */
export function geminiAvailable(config) {
  const keys = geminiKeys();
  if (!keys.length) return { ok: false, reason: "sem chave" };
  let soonest = Infinity, why = "";
  for (const model of config.models.gemini) for (const k of keys) {
    const c = cooldownOf(geminiSlot(k.id, model));
    if (!c) return { ok: true };
    if (c.until < soonest) { soonest = c.until; why = c.reason; }
  }
  return { ok: false, reason: why || "em espera", until: soonest };
}
