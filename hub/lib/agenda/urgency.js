// Regras de urgência e de texto de prazo, puras (servidor e navegador usam o mesmo arquivo).
const H = 3600_000;
const TZ = "America/Sao_Paulo";

/** overdue | today (até 24 h) | soon (até 48 h) | week (até 7 dias) | later | none */
export function urgencyOf(dueIso, now) {
  if (!dueIso) return "none";
  const ms = Date.parse(dueIso) - now;
  if (ms < 0) return "overdue";
  if (ms <= 24 * H) return "today";
  if (ms <= 48 * H) return "soon";
  if (ms <= 7 * 24 * H) return "week";
  return "later";
}

export const URGENCY_LABEL = { overdue: "Atrasadas", today: "Nas próximas 24 h", soon: "Em até 48 h", week: "Esta semana", later: "Mais adiante", none: "Sem prazo" };

const ymd = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: TZ });

/** "em 6 dias", "amanhã", "hoje", "há 2 dias" — por dia do calendário de Brasília, não por blocos de 24 h. */
export function relDay(iso, now) {
  if (!iso) return "";
  const a = Date.parse(`${ymd(Date.parse(iso))}T12:00:00Z`);
  const b = Date.parse(`${ymd(now)}T12:00:00Z`);
  const d = Math.round((a - b) / 864e5);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d === -1) return "ontem";
  return d > 0 ? `em ${d} dias` : `há ${-d} dias`;
}

/** "ter, 27/10 às 23:59" */
export function whenLabel(iso, { allDay = false } = {}) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
  if (allDay) return day;
  return `${day} às ${d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}`;
}

/** "faltam 5 h 20 min" para prazos próximos; vazio quando não ajuda. */
export function countdown(iso, now) {
  if (!iso) return "";
  const ms = Date.parse(iso) - now;
  if (ms <= 0 || ms > 48 * H) return "";
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  return h ? `faltam ${h} h${min % 60 ? ` ${min % 60} min` : ""}` : `faltam ${min} min`;
}
