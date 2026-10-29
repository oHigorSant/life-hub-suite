// Datas em horário local, como texto "YYYY-MM-DD" / "HH:MM". Semana começa na segunda.
export const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const WEEKDAYS_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const COLOR_HEX = { blue: "#0c66e4", green: "#1f845a", red: "#c9372c", orange: "#e56910", purple: "#8270db", teal: "#2898bd", pink: "#ae4787", grey: "#5e6c84" };

const p2 = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const todayYmd = () => ymd(new Date());
export const mins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const hhmm = (m) => `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
export const nowHhmm = () => { const d = new Date(); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };

export function startOfWeek(s) {
  const d = parseYmd(s);
  const wd = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - wd);
  return ymd(d);
}
export function weekDays(s) {
  const start = startOfWeek(s);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
/** Grade do mês: 6 semanas começando na segunda. */
export function monthGrid(s) {
  const d = parseYmd(s);
  const first = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function fmtLong(s) {
  const d = parseYmd(s);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}
export function fmtMonth(s) {
  const d = parseYmd(s);
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}
export function fmtShort(s) {
  const d = parseYmd(s);
  return `${WEEKDAYS[d.getDay()]} ${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
}

/** Instâncias das rotinas ativas em um intervalo de datas (inclusive). Não grava nada: são calculadas. */
export function expandRoutines(routines, from, to) {
  const out = [];
  for (const r of routines) {
    if (!r.active) continue;
    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (!r.days.includes(parseYmd(day).getDay())) continue;
      const endMin = Math.min(23 * 60 + 59, mins(r.time) + r.duration);
      out.push({ key: `${r.id}:${day}`, kind: "routine", routineId: r.id, title: r.title, date: day, startTime: r.time, endTime: hhmm(endMin), color: r.color, notes: r.notes });
    }
  }
  return out;
}

/** Eventos (e, se `events` tem endDate, cada dia coberto) de um dia específico. */
export function eventsOn(events, day) {
  return events.filter((e) => e.date === day || (e.endDate && e.date <= day && day <= e.endDate));
}

export function fmtDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${p2(m)}:${p2(ss)}` : `${p2(m)}:${p2(ss)}`;
}
