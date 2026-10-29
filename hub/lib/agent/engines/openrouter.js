import { toolDeclarations, executeTool, toolLabel, summarizeArgs } from "./toolkit.js";
import { EngineError, cooldownMs } from "./errors.js";
import { openrouterKey } from "./config.js";
import { recordUsage, coolDown, cooldownOf, clearCooldown } from "./usage.js";

const URL = "https://openrouter.ai/api/v1/chat/completions";
export const orSlot = (model) => `openrouter:${model}`;

async function ocall({ key, model, body, slot }) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try {
      r = await fetch(URL, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "HTTP-Referer": process.env.LIFEHUB_PUBLIC_URL || "http://localhost:4000", "X-Title": "Life Hub" }, body: JSON.stringify(body), signal: AbortSignal.timeout(180_000) });
    } catch (e) { last = new EngineError("network", `Sem resposta do OpenRouter (${e.name === "TimeoutError" ? "tempo esgotado" : e.message}).`, { slot }); continue; }
    const j = await r.json().catch(() => ({}));
    if (r.ok && !j.error) return j;
    const status = r.ok ? j.error?.code : r.status;
    const msg = j.error?.message || `HTTP ${status}`;
    if (status === 401) throw new EngineError("auth", "Chave do OpenRouter recusada.", { slot, status });
    if (status === 402) throw new EngineError("credits", "Sem créditos no OpenRouter.", { slot, status });
    if (status === 429) throw new EngineError("quota-minute", "Limite de uso do OpenRouter/provedor.", { retryAfterMs: 20_000, slot, status });
    if (status === 404 || status === 400 && /model/i.test(msg)) throw new EngineError("bad-model", `Modelo ${model} indisponível: ${msg.slice(0, 120)}`, { slot, status });
    if (status >= 500 || status === 408 || status === 502 || status === 503) { last = new EngineError("overloaded", `OpenRouter/provedor instável (${status}).`, { slot, status }); await new Promise((s) => setTimeout(s, 1500)); continue; }
    throw new EngineError("other", `OpenRouter: ${msg.slice(0, 200)}`, { slot, status });
  }
  throw last;
}

export async function runOpenRouter({ surface, system, prompt, onEvent, onAction, config, ignoreCooldown = false }) {
  const key = openrouterKey();
  if (!key) throw new EngineError("auth", "Chave do OpenRouter não configurada.");
  const model = config.models.openrouter;
  const slot = orSlot(model);
  if (!ignoreCooldown && cooldownOf(slot)) throw new EngineError("overloaded", cooldownOf(slot).reason || "OpenRouter em espera.", { slot });
  const usage = { in: 0, out: 0, thoughts: 0, requests: 0, cost: 0 };
  const tools = toolDeclarations(surface).map((d) => ({ type: "function", function: { name: d.name, description: d.description, parameters: d.parameters } }));
  const messages = [{ role: "system", content: system }, { role: "user", content: prompt }];
  const maxSteps = config.limits.maxSteps[surface] || 25;
  try {
    for (let step = 0; step < maxSteps; step++) {
      const resp = await ocall({ key, model, slot, body: { model, messages, tools, tool_choice: "auto", max_tokens: surface === "dev" ? 8192 : 4096, usage: { include: true } } });
      const u = resp.usage || {};
      usage.in += u.prompt_tokens || 0; usage.out += u.completion_tokens || 0; usage.requests++; usage.cost += Number(u.cost) || 0;
      recordUsage(slot, { ok: true, inTok: u.prompt_tokens || 0, outTok: u.completion_tokens || 0, cost: Number(u.cost) || 0, surface });
      const msg = resp.choices?.[0]?.message;
      if (!msg) throw new EngineError("other", "OpenRouter respondeu vazio.", { slot });
      const calls = msg.tool_calls || [];
      if (!calls.length) {
        const text = String(msg.content || "").trim();
        if (!text) throw new EngineError("other", "OpenRouter respondeu sem texto.", { slot });
        clearCooldown(slot);
        return { ok: true, text, model, slot, usage };
      }
      if (msg.content && String(msg.content).trim()) onEvent({ type: "text", text: String(msg.content).trim() });
      messages.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
      for (const c of calls) {
        const name = c.function?.name;
        let args = {};
        try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* argumentos inválidos: ferramenta devolve erro claro */ }
        onEvent({ type: "tool", name, label: toolLabel(name) });
        const result = await executeTool(name, args, { surface });
        onAction({ tool: name, summary: summarizeArgs(name, args), ok: !result?.error });
        messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result).slice(0, 30_000) });
      }
    }
    throw new EngineError("steps", "Esse pedido precisa de mais passos do que o limite configurado. Divida em partes menores.", { slot });
  } catch (e) {
    const err = e instanceof EngineError ? e : new EngineError("other", String(e.message || e), { slot });
    recordUsage(slot, { ok: false, error: err.message, surface });
    const ms = cooldownMs(err);
    if (ms > 0) coolDown(slot, Date.now() + ms, err.message);
    throw err;
  }
}

export function openrouterAvailable(config) {
  if (!openrouterKey()) return { ok: false, reason: "sem chave" };
  const c = cooldownOf(orSlot(config.models.openrouter));
  return c ? { ok: false, reason: c.reason || "em espera", until: c.until } : { ok: true };
}
