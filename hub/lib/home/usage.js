import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Uso do Claude (janela de 5 horas e semanal). O Claude Code emite eventos `rate_limit_event` a cada execução;
// guardamos o último de cada janela. Fontes: este app (data/claude-limits.json, gravado pelos agentes do hub)
// e o Claude Mobile da mesma VM (mesma conta), usando o mais recente de cada janela.
const OWN = path.join(process.cwd(), "data", "claude-limits.json");
const MOBILE = process.env.CLAUDE_LIMITS_FILE || path.join(os.homedir(), "apps", "claude-mobile", "data", "limits.json");

const LABELS = { five_hour: "Sessão de 5 horas", seven_day: "Semana", seven_day_opus: "Semana (Opus)", seven_day_sonnet: "Semana (Sonnet)", overage: "Uso extra" };
const ORDER = ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet", "overage"];

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; } };
const pct = (v) => (typeof v === "number" ? (v <= 1 ? v * 100 : v) : null);
const ms = (v) => (typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : null);

/** Chamado pelos agentes a cada mensagem `rate_limit_event` do Claude Agent SDK. */
export function recordLimitEvent(ev) {
  try {
    const info = ev?.rate_limit_info || ev;
    if (!info || typeof info !== "object") return;
    const main = info.rateLimitType || info.rate_limit_type || "unknown";
    const wins = {};
    for (const [t, w] of Object.entries(info.unifiedWindows || {})) {
      if (w && typeof w === "object") wins[t] = { utilization: pct(w.utilization), resetsAt: ms(w.resetsAt) };
    }
    wins[main] = { ...(wins[main] || {}), utilization: pct(info.utilization) ?? wins[main]?.utilization ?? null, resetsAt: ms(info.resetsAt ?? info.resets_at) ?? wins[main]?.resetsAt ?? null };
    const cur = readJson(OWN);
    for (const [type, w] of Object.entries(wins)) {
      cur[type] = { type, status: type === main ? info.status || null : "allowed", utilization: w.utilization, resetsAt: w.resetsAt, overage: !!info.isUsingOverage, seen: Date.now() };
    }
    fs.mkdirSync(path.dirname(OWN), { recursive: true });
    fs.writeFileSync(`${OWN}.tmp`, JSON.stringify(cur));
    fs.renameSync(`${OWN}.tmp`, OWN);
  } catch { /* o uso é informativo: nunca derruba o agente */ }
}

// Uso em tempo real: o mesmo endpoint que o Claude Code consulta no /usage, com o login da conta que já está na VM.
// O token só é lido no servidor (nunca sai daqui) e não é renovado por nós: o Claude Code renova ao ser usado.
const CREDS = process.env.CLAUDE_CREDENTIALS_FILE || path.join(os.homedir(), ".claude", ".credentials.json");
const LIVE_TTL = 60_000;
const g = globalThis;
const live = (g.__lhUsageLive ??= { at: 0, data: null, busy: null });

async function fetchLive() {
  const o = readJson(CREDS).claudeAiOauth;
  if (!o?.accessToken || (o.expiresAt && o.expiresAt <= Date.now())) return null;
  const r = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { authorization: `Bearer ${o.accessToken}`, "anthropic-beta": "oauth-2025-04-20", "user-agent": "claude-code/2.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const out = {};
  for (const type of ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet"]) {
    const w = j[type];
    if (w && typeof w.utilization === "number") out[type] = { type, status: "allowed", utilization: w.utilization, resetsAt: w.resets_at ? Date.parse(w.resets_at) : null, overage: false, seen: Date.now() };
  }
  return Object.keys(out).length ? out : null;
}

async function liveUsage() {
  if (live.data && Date.now() - live.at < LIVE_TTL) return live.data;
  live.busy ??= fetchLive().catch(() => null).finally(() => { live.busy = null; });
  const d = await live.busy;
  if (d) { live.data = d; live.at = Date.now(); }
  return d || (live.data && Date.now() - live.at < 30 * 60_000 ? live.data : null);
}

export async function readUsage() {
  const fresh = await liveUsage();
  const a = fresh || readJson(OWN);
  const b = readJson(MOBILE);
  const now = Date.now();
  const windows = [];
  let updatedAt = 0;
  for (const type of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[type], y = b[type];
    const w = !x ? y : !y ? x : (x.seen || 0) >= (y.seen || 0) ? x : y;
    if (!w || typeof w.utilization !== "number") continue;
    updatedAt = Math.max(updatedAt, w.seen || 0);
    // janela já renovada desde o último evento: o percentual gravado não vale mais
    const expired = !!w.resetsAt && w.resetsAt <= now;
    windows.push({
      type, label: LABELS[type] || type, percent: expired ? 0 : Math.round(w.utilization),
      resetsAt: expired ? null : w.resetsAt || null, expired, status: w.status || null, overage: !!w.overage,
    });
  }
  windows.sort((p, q) => (ORDER.indexOf(p.type) + 1 || 99) - (ORDER.indexOf(q.type) + 1 || 99));
  return { windows, updatedAt: updatedAt || null, now };
}
