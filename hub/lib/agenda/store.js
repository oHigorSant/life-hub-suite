import fs from "node:fs";
import path from "node:path";
import { generateId } from "../ids.js";
import { emit } from "../live/bus.js";

// Agenda e tempo: data/agenda.json (eventos, rotinas, pomodoro, preferências).
// Datas em horário local (sem fuso): "YYYY-MM-DD" e "HH:MM".
export const AGENDA_FILE = process.env.AGENDA_FILE || path.join(process.cwd(), "data", "agenda.json");

export const COLORS = ["blue", "green", "red", "orange", "purple", "teal", "pink", "grey"];

export function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const DEFAULT = () => ({
  events: [],
  routines: [],
  pomodoro: { focus: 25, short: 5, long: 15, cycles: 4, autoStart: false, log: [] },
  settings: { worldClocks: ["America/Sao_Paulo", "UTC", "America/New_York", "Europe/Lisbon"] },
  // estado dos relógios (vive no servidor: o agente e todas as telas enxergam/controlam o mesmo)
  timer: { running: false, endsAt: null, remaining: 300, total: 300, label: "", done: false },
  stopwatch: { running: false, startedAt: null, acc: 0, laps: [] },
  pomo: { mode: "focus", running: false, endsAt: null, remaining: 1500, cycle: 1, label: "" },
});

let queue = Promise.resolve(); // serializa escritas dentro do processo

function readRaw() {
  try {
    const j = JSON.parse(fs.readFileSync(AGENDA_FILE, "utf8"));
    const d = DEFAULT();
    return {
      events: Array.isArray(j.events) ? j.events : d.events,
      routines: Array.isArray(j.routines) ? j.routines : d.routines,
      pomodoro: { ...d.pomodoro, ...(j.pomodoro || {}), log: Array.isArray(j.pomodoro?.log) ? j.pomodoro.log : [] },
      settings: { ...d.settings, ...(j.settings || {}) },
      timer: { ...d.timer, ...(j.timer || {}) },
      stopwatch: { ...d.stopwatch, ...(j.stopwatch || {}), laps: Array.isArray(j.stopwatch?.laps) ? j.stopwatch.laps : [] },
      pomo: { ...d.pomo, ...(j.pomo || {}) },
    };
  } catch {
    return DEFAULT();
  }
}

function writeRaw(data) {
  fs.mkdirSync(path.dirname(AGENDA_FILE), { recursive: true });
  const tmp = `${AGENDA_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, AGENDA_FILE);
}

export function readAgenda() {
  return { ...readRaw(), serverNow: Date.now() };
}

/** Aplica uma mudança com leitura+escrita serializadas (evita perder gravações simultâneas) e avisa as telas. */
export function mutate(fn) {
  const run = queue.then(() => {
    const data = readRaw();
    const out = fn(data);
    writeRaw(data);
    emit("agenda", { source: "api" });
    return out;
  });
  queue = run.catch(() => {});
  return run;
}

const str = (v, max) => String(v ?? "").trim().slice(0, max);

export function sanitizeEvent(e) {
  const date = str(e?.date, 10);
  if (!DATE_RE.test(date)) throw fail("Data inválida (use AAAA-MM-DD).");
  const allDay = !!e.allDay;
  const out = {
    id: str(e.id, 40) || generateId("evt"),
    title: str(e.title, 200) || "(sem título)",
    date,
    allDay,
    color: COLORS.includes(e.color) ? e.color : "blue",
    notes: str(e.notes, 4000),
    location: str(e.location, 200),
    done: !!e.done,
  };
  if (!allDay) {
    const st = str(e.startTime, 5);
    const en = str(e.endTime, 5);
    if (!TIME_RE.test(st)) throw fail("Horário de início inválido (HH:MM).");
    out.startTime = st;
    out.endTime = TIME_RE.test(en) && en > st ? en : addMinutes(st, 60);
  }
  if (e.endDate && DATE_RE.test(String(e.endDate)) && String(e.endDate) >= date) out.endDate = String(e.endDate);
  return out;
}

export function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + m + mins);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function sanitizeRoutine(r) {
  const days = [...new Set((Array.isArray(r?.days) ? r.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const time = str(r?.time, 5);
  if (!TIME_RE.test(time)) throw fail("Horário da rotina inválido (HH:MM).");
  return {
    id: str(r.id, 40) || generateId("rt"),
    title: str(r.title, 200) || "(rotina sem título)",
    days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
    time,
    duration: Math.max(5, Math.min(24 * 60, Number(r.duration) || 30)),
    color: COLORS.includes(r.color) ? r.color : "green",
    active: r.active !== false,
    notes: str(r.notes, 2000),
  };
}

export async function upsertEvent(e) {
  const ev = sanitizeEvent(e);
  return mutate((d) => {
    const i = d.events.findIndex((x) => x.id === ev.id);
    if (i >= 0) d.events[i] = ev; else d.events.push(ev);
    return ev;
  });
}
export async function deleteEvent(id) {
  return mutate((d) => {
    const n = d.events.length;
    d.events = d.events.filter((x) => x.id !== id);
    if (d.events.length === n) throw fail("Evento não encontrado.", 404);
    return { ok: true };
  });
}
export async function upsertRoutine(r) {
  const rt = sanitizeRoutine(r);
  return mutate((d) => {
    const i = d.routines.findIndex((x) => x.id === rt.id);
    if (i >= 0) d.routines[i] = rt; else d.routines.push(rt);
    return rt;
  });
}
export async function deleteRoutine(id) {
  return mutate((d) => {
    const n = d.routines.length;
    d.routines = d.routines.filter((x) => x.id !== id);
    if (d.routines.length === n) throw fail("Rotina não encontrada.", 404);
    return { ok: true };
  });
}

export async function logPomodoro(entry) {
  const raw = Number(entry?.minutes);
  if (!(raw > 0)) throw fail("Duração inválida.");
  const minutes = Math.max(1, Math.min(300, Math.round(raw)));
  return mutate((d) => {
    const item = {
      id: generateId("pom"),
      at: new Date().toISOString(),
      date: DATE_RE.test(entry?.date) ? entry.date : new Date().toISOString().slice(0, 10),
      minutes,
      label: str(entry?.label, 120),
      kind: entry?.kind === "break" ? "break" : "focus",
    };
    d.pomodoro.log.push(item);
    if (d.pomodoro.log.length > 2000) d.pomodoro.log = d.pomodoro.log.slice(-2000);
    return item;
  });
}

export async function savePomodoroSettings(p) {
  const n = (v, lo, hi, def) => Math.max(lo, Math.min(hi, Number(v) || def));
  return mutate((d) => {
    d.pomodoro = {
      ...d.pomodoro,
      focus: n(p?.focus, 1, 180, 25),
      short: n(p?.short, 1, 60, 5),
      long: n(p?.long, 1, 120, 15),
      cycles: n(p?.cycles, 1, 12, 4),
      autoStart: !!p?.autoStart,
    };
    return d.pomodoro;
  });
}

export async function saveSettings(s) {
  const clocks = (Array.isArray(s?.worldClocks) ? s.worldClocks : []).map((x) => str(x, 60)).filter((x) => /^[A-Za-z_]+(\/[A-Za-z_\-+0-9]+)*$/.test(x)).slice(0, 8);
  return mutate((d) => {
    if (clocks.length) d.settings.worldClocks = clocks;
    return d.settings;
  });
}
