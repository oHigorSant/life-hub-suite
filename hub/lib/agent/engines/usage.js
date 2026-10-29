import fs from "node:fs";
import path from "node:path";

// Uso e saúde dos motores: contadores por dia (data/engine-usage.json) e "esfriamento" depois de limites/erros
// (data/engine-state.json — sobrevive a reinícios). Alimenta o roteador e o painel de uso.
const USAGE_FILE = path.join(process.cwd(), "data", "engine-usage.json");
const STATE_FILE = path.join(process.cwd(), "data", "engine-state.json");
const KEEP_DAYS = 14;

const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const write = (f, v) => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(`${f}.tmp`, JSON.stringify(v)); fs.renameSync(`${f}.tmp`, f); } catch { /* informativo */ } };
export const todayKey = (ms = Date.now()) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** slot = "gemini:g1:gemini-3.5-flash-lite" | "openrouter:anthropic/claude-haiku-5.5" | "claude" */
export function recordUsage(slot, { ok, inTok = 0, outTok = 0, thoughts = 0, cost = 0, error = null, surface = "dados" }) {
  const u = read(USAGE_FILE, { days: {} });
  const d = (u.days[todayKey()] ??= {});
  const s = (d[slot] ??= { requests: 0, ok: 0, errors: 0, inTok: 0, outTok: 0, thoughts: 0, cost: 0, bySurface: {} });
  s.requests++; ok ? s.ok++ : s.errors++;
  s.inTok += inTok; s.outTok += outTok; s.thoughts += thoughts; s.cost += cost;
  s.bySurface[surface] = (s.bySurface[surface] || 0) + 1;
  if (error) s.lastError = { at: Date.now(), message: String(error).slice(0, 200) };
  for (const day of Object.keys(u.days).sort().slice(0, -KEEP_DAYS)) delete u.days[day];
  write(USAGE_FILE, u);
}
export const readUsageDays = () => read(USAGE_FILE, { days: {} }).days;

// ---- esfriamento (cooldown) ----
export function coolDown(slot, untilMs, reason) {
  const st = read(STATE_FILE, { cooldowns: {} });
  st.cooldowns[slot] = { until: untilMs, reason: String(reason || "").slice(0, 160), at: Date.now() };
  write(STATE_FILE, st);
}
export function clearCooldown(slot) {
  const st = read(STATE_FILE, { cooldowns: {} });
  if (st.cooldowns[slot]) { delete st.cooldowns[slot]; write(STATE_FILE, st); }
}
export function cooldownOf(slot) {
  const c = read(STATE_FILE, { cooldowns: {} }).cooldowns[slot];
  return c && c.until > Date.now() ? c : null;
}
export function allCooldowns() {
  const st = read(STATE_FILE, { cooldowns: {} });
  const out = {};
  for (const [k, c] of Object.entries(st.cooldowns)) if (c.until > Date.now()) out[k] = c;
  return out;
}

/** Próxima virada do dia no fuso do Pacífico (quando as cotas diárias do Gemini renovam). */
export function nextPacificMidnight(now = Date.now()) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  const day0 = fmt.format(now);
  let t = now;
  while (fmt.format(t) === day0) t += 15 * 60_000;
  // refina para o minuto exato
  t -= 15 * 60_000;
  while (fmt.format(t) === day0) t += 60_000;
  return t;
}
