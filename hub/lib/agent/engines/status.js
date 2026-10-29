import { readEngineConfig, ENGINES, geminiKeys, openrouterKey } from "./config.js";
import { allCooldowns, readUsageDays, todayKey } from "./usage.js";
import { geminiAvailable } from "./gemini.js";
import { openrouterAvailable } from "./openrouter.js";
import { claudeAvailable } from "./claude.js";
import { readUsage } from "../../home/usage.js";

// Visão única para a tela /motores e para o widget da Home: estado, uso e limites de TODAS as IAs.
export const CATALOG = {
  gemini: ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite-preview", "gemini-3-flash-preview", "gemini-flash-lite-latest"],
  claude: [["", "Padrão do Claude Code"], ["claude-haiku-5-5", "Haiku 5.5 (mais barato)"], ["claude-sonnet-5-5", "Sonnet 5.5"], ["claude-opus-5-5", "Opus 5.5"]],
};

const g = globalThis;
const cache = (g.__lhOrCache ??= { models: { at: 0, data: null }, account: { at: 0, data: null } });

/** Modelos do OpenRouter com ferramentas e preço baixo (catálogo público, cache de 6 h). */
export async function openrouterCatalog() {
  if (cache.models.data && Date.now() - cache.models.at < 6 * 3600_000) return cache.models.data;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10_000) });
    const j = await r.json();
    const rows = (j.data || [])
      .filter((m) => (m.supported_parameters || []).includes("tools") && m.pricing && !/:free$|:batch$|^~/.test(m.id))
      .map((m) => ({ id: m.id, name: m.name, in: Number(m.pricing.prompt) * 1e6, out: Number(m.pricing.completion) * 1e6, ctx: m.context_length }))
      .filter((m) => m.in >= 0 && m.in <= 1.5 && m.out <= 6)
      .sort((a, b) => a.in + a.out * 0.15 - (b.in + b.out * 0.15));
    cache.models = { at: Date.now(), data: rows.slice(0, 80) };
  } catch { /* mantém o cache anterior, se houver */ }
  return cache.models.data || [];
}

/** Uso do OpenRouter na conta toda: chave de gerenciamento (todas as chaves) ou, sem ela, só a chave do hub. */
async function openrouterAccount() {
  if (cache.account.data && Date.now() - cache.account.at < 60_000) return cache.account.data;
  const mgmt = (process.env.OPENROUTER_MANAGEMENT_KEY || "").trim();
  const key = openrouterKey();
  let out = { mode: "none" };
  const get = async (p, k) => { const r = await fetch(`https://openrouter.ai/api/v1${p}`, { headers: { authorization: `Bearer ${k}` }, signal: AbortSignal.timeout(10_000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); const j = await r.json(); return j.data ?? j; };
  try {
    if (mgmt) {
      const [credits, keys] = await Promise.all([get("/credits", mgmt).catch(() => null), get("/keys", mgmt).catch(() => [])]);
      out = {
        mode: "management",
        credits: credits ? { total: credits.total_credits, used: credits.total_usage, remaining: credits.total_credits - credits.total_usage } : null,
        keys: (Array.isArray(keys) ? keys : []).map((k) => ({ name: k.name || k.label, disabled: !!k.disabled, usage: k.usage, day: k.usage_daily, week: k.usage_weekly, month: k.usage_monthly, limit: k.limit, remaining: k.limit_remaining })),
      };
    } else if (key) {
      const me = await get("/key", key);
      out = { mode: "key", keys: [{ name: me.label || "chave do hub", usage: me.usage, day: me.usage_daily, week: me.usage_weekly, month: me.usage_monthly, limit: me.limit, remaining: me.limit_remaining }] };
    }
  } catch (e) { out = { ...out, error: String(e.message || e) }; }
  cache.account = { at: Date.now(), data: out };
  return out;
}

const sum = (rows, f) => rows.reduce((s, r) => s + (r[f] || 0), 0);

export async function engineStatus({ full = false } = {}) {
  const cfg = readEngineConfig();
  const cools = allCooldowns();
  const days = readUsageDays();
  const today = days[todayKey()] || {};
  const slotRows = (prefix) => Object.entries(today).filter(([k]) => k === prefix || k.startsWith(prefix + ":")).map(([slot, v]) => ({ slot, ...v }));

  const gem = slotRows("gemini");
  const orr = slotRows("openrouter");
  const cla = slotRows("claude");
  const keys = geminiKeys().map((k) => ({
    id: k.id, tail: k.tail,
    models: cfg.models.gemini.map((m) => {
      const slot = `gemini:${k.id}:${m}`;
      const u = today[slot] || {};
      return { model: m, requests: u.requests || 0, errors: u.errors || 0, inTok: u.inTok || 0, outTok: u.outTok || 0, cooldown: cools[slot] || null, lastError: u.lastError?.message || null };
    }),
  }));
  const availability = { gemini: geminiAvailable(cfg), claude: claudeAvailable(cfg), openrouter: openrouterAvailable(cfg) };

  // série dos últimos 7 dias (pedidos e tokens por motor)
  const week = Object.keys(days).sort().slice(-7).map((d) => {
    const rows = Object.entries(days[d]).map(([slot, v]) => ({ engine: slot.split(":")[0], ...v }));
    const by = (e) => rows.filter((r) => r.engine === e);
    return { day: d, gemini: sum(by("gemini"), "requests"), claude: sum(by("claude"), "requests"), openrouter: sum(by("openrouter"), "requests"), geminiTok: sum(by("gemini"), "inTok") + sum(by("gemini"), "outTok"), cost: sum(by("openrouter"), "cost") };
  });

  const [claudeUsage, orAccount] = await Promise.all([readUsage().catch(() => ({ windows: [] })), openrouterAccount()]);
  const out = {
    config: cfg,
    engines: Object.values(ENGINES).map((e) => ({ id: e.id, label: e.label, enabled: cfg.enabled[e.id] !== false, available: availability[e.id].ok, reason: availability[e.id].reason || null, until: availability[e.id].until || null })),
    today: {
      gemini: { requests: sum(gem, "requests"), errors: sum(gem, "errors"), inTok: sum(gem, "inTok"), outTok: sum(gem, "outTok"), thoughts: sum(gem, "thoughts") },
      openrouter: { requests: sum(orr, "requests"), errors: sum(orr, "errors"), inTok: sum(orr, "inTok"), outTok: sum(orr, "outTok"), cost: sum(orr, "cost") },
      claude: { requests: sum(cla, "requests"), errors: sum(cla, "errors") },
    },
    gemini: { keys },
    openrouter: { hasKey: !!openrouterKey(), hasManagement: !!(process.env.OPENROUTER_MANAGEMENT_KEY || "").trim(), model: cfg.models.openrouter, account: orAccount },
    claude: { windows: claudeUsage.windows, updatedAt: claudeUsage.updatedAt, model: cfg.models.claude || "padrão" },
    week,
    now: Date.now(),
  };
  if (full) out.catalog = { gemini: CATALOG.gemini, claude: CATALOG.claude, openrouter: await openrouterCatalog() };
  return out;
}
