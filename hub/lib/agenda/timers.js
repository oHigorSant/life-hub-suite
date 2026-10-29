import { mutate, readAgenda, fail } from "./store.js";
import { emit } from "../live/bus.js";
import { generateId } from "../ids.js";

// Temporizador, cronômetro e pomodoro com estado no SERVIDOR: o agente, a home e todas as telas
// controlam e enxergam o mesmo relógio. O servidor agenda o fim e avisa as telas (evento "alarm").
const g = globalThis;
const handles = (g.__lhTimerHandles ??= { timer: null, pomo: null });

const MAX_SECONDS = 24 * 3600;
const lenFor = (mode, cfg) => (mode === "focus" ? cfg.focus : mode === "short" ? cfg.short : cfg.long) * 60;
const clip = (s, n) => String(s ?? "").trim().slice(0, n);

function schedule(kind, endsAt) {
  clearTimeout(handles[kind]);
  handles[kind] = null;
  if (!endsAt) return;
  const ms = Math.max(0, endsAt - Date.now());
  handles[kind] = setTimeout(() => complete(kind).catch((e) => console.error("[timers]", e)), Math.min(ms, 2 ** 31 - 1));
}

/** (Re)agenda os alarmes a partir do estado salvo — chamado quando o servidor sobe e a cada acesso ao /api/live. */
export function ensureTimers() {
  if (g.__lhTimersBooted && handles.timer === null && handles.pomo === null) {
    // segue: pode haver algo rodando que ainda não foi agendado
  }
  const a = readAgenda();
  const wantTimer = a.timer.running ? a.timer.endsAt : null;
  const wantPomo = a.pomo.running ? a.pomo.endsAt : null;
  if (wantTimer && !handles.timer) schedule("timer", wantTimer);
  if (wantPomo && !handles.pomo) schedule("pomo", wantPomo);
  g.__lhTimersBooted = true;
}

async function complete(kind) {
  if (kind === "timer") {
    const out = await mutate((d) => {
      const t = d.timer;
      if (!t.running || !t.endsAt || t.endsAt > Date.now() + 80) return null;
      d.timer = { ...t, running: false, endsAt: null, remaining: 0, done: true };
      return { label: t.label };
    });
    handles.timer = null;
    if (out) emit("alarm", { kind: "timer", label: out.label });
    return;
  }
  const out = await mutate((d) => {
    const p = d.pomo;
    if (!p.running || !p.endsAt || p.endsAt > Date.now() + 80) return null;
    const cfg = d.pomodoro;
    const finished = p.mode;
    if (finished === "focus") {
      d.pomodoro.log.push({ id: generateId("pom"), at: new Date().toISOString(), date: new Date().toLocaleDateString("sv-SE"), minutes: cfg.focus, label: p.label, kind: "focus" });
      if (d.pomodoro.log.length > 2000) d.pomodoro.log = d.pomodoro.log.slice(-2000);
    }
    const next = finished === "focus" ? (p.cycle % cfg.cycles === 0 ? "long" : "short") : "focus";
    const cycle = finished === "focus" ? p.cycle : finished === "long" ? 1 : p.cycle + 1;
    const remaining = lenFor(next, cfg);
    const go = !!cfg.autoStart;
    d.pomo = { ...p, mode: next, cycle, remaining, running: go, endsAt: go ? Date.now() + remaining * 1000 : null };
    return { finished, next, label: p.label, endsAt: d.pomo.endsAt };
  });
  handles.pomo = null;
  if (out) {
    if (out.endsAt) schedule("pomo", out.endsAt);
    emit("alarm", { kind: "pomo", finished: out.finished, next: out.next, label: out.label });
  }
}

const view = () => {
  const a = readAgenda();
  return { timer: a.timer, stopwatch: a.stopwatch, pomo: a.pomo, pomodoro: a.pomodoro, serverNow: a.serverNow };
};

// ---------------------------------------------------------------- temporizador
export async function timerAction(action, p = {}) {
  switch (action) {
    case "start":
    case "resume": {
      const secs = p.seconds != null ? Math.round(Number(p.seconds)) : null;
      if (secs != null && !(secs > 0 && secs <= MAX_SECONDS)) throw fail("Tempo inválido (1 s a 24 h).");
      const t = await mutate((d) => {
        const cur = d.timer;
        const total = secs ?? (cur.total > 0 ? cur.total : 300);
        const remaining = secs ?? (cur.remaining > 0 ? cur.remaining : total);
        d.timer = { running: true, endsAt: Date.now() + remaining * 1000, remaining, total: secs ?? total, label: p.label != null ? clip(p.label, 120) : (secs != null ? "" : cur.label), done: false };
        return d.timer;
      });
      schedule("timer", t.endsAt);
      break;
    }
    case "pause": {
      await mutate((d) => {
        const t = d.timer;
        if (t.running) d.timer = { ...t, running: false, remaining: Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000)), endsAt: null };
      });
      schedule("timer", null);
      break;
    }
    case "reset":
    case "stop": {
      await mutate((d) => { d.timer = { ...d.timer, running: false, endsAt: null, remaining: d.timer.total, done: false }; });
      schedule("timer", null);
      break;
    }
    case "set": {
      const secs = Math.round(Number(p.seconds));
      if (!(secs > 0 && secs <= MAX_SECONDS)) throw fail("Tempo inválido (1 s a 24 h).");
      await mutate((d) => { d.timer = { running: false, endsAt: null, remaining: secs, total: secs, label: clip(p.label, 120), done: false }; });
      schedule("timer", null);
      break;
    }
    default: throw fail("Ação de timer desconhecida.");
  }
  return view();
}

// ---------------------------------------------------------------- cronômetro
export async function stopwatchAction(action) {
  switch (action) {
    case "start":
    case "resume":
      await mutate((d) => { if (!d.stopwatch.running) d.stopwatch = { ...d.stopwatch, running: true, startedAt: Date.now() }; });
      break;
    case "pause":
      await mutate((d) => { const s = d.stopwatch; if (s.running) d.stopwatch = { ...s, running: false, acc: s.acc + (Date.now() - s.startedAt), startedAt: null }; });
      break;
    case "lap":
      await mutate((d) => { const s = d.stopwatch; const t = s.acc + (s.running ? Date.now() - s.startedAt : 0); if (t > 0) d.stopwatch = { ...s, laps: [...s.laps, t].slice(-200) }; });
      break;
    case "reset":
    case "stop":
      await mutate((d) => { d.stopwatch = { running: false, startedAt: null, acc: 0, laps: [] }; });
      break;
    default: throw fail("Ação de cronômetro desconhecida.");
  }
  return view();
}

// ---------------------------------------------------------------- pomodoro
export async function pomoAction(action, p = {}) {
  switch (action) {
    case "start":
    case "resume": {
      const mode = ["focus", "short", "long"].includes(p.mode) ? p.mode : null;
      const out = await mutate((d) => {
        let s = d.pomo;
        if (mode && mode !== s.mode) s = { ...s, mode, running: false, endsAt: null, remaining: lenFor(mode, d.pomodoro) };
        if (p.label != null) s = { ...s, label: clip(p.label, 120) };
        if (!s.running) {
          const remaining = s.remaining > 0 ? s.remaining : lenFor(s.mode, d.pomodoro);
          s = { ...s, running: true, remaining, endsAt: Date.now() + remaining * 1000 };
        }
        d.pomo = s;
        return s;
      });
      schedule("pomo", out.endsAt);
      break;
    }
    case "pause": {
      await mutate((d) => { const s = d.pomo; if (s.running) d.pomo = { ...s, running: false, remaining: Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000)), endsAt: null }; });
      schedule("pomo", null);
      break;
    }
    case "reset": {
      await mutate((d) => { d.pomo = { mode: "focus", running: false, endsAt: null, remaining: lenFor("focus", d.pomodoro), cycle: 1, label: d.pomo.label }; });
      schedule("pomo", null);
      break;
    }
    case "skip": {
      await mutate((d) => {
        const s = d.pomo; const cfg = d.pomodoro;
        const next = s.mode === "focus" ? (s.cycle % cfg.cycles === 0 ? "long" : "short") : "focus";
        const cycle = s.mode === "focus" ? s.cycle : s.mode === "long" ? 1 : s.cycle + 1;
        d.pomo = { ...s, mode: next, cycle, running: false, endsAt: null, remaining: lenFor(next, cfg) };
      });
      schedule("pomo", null);
      break;
    }
    case "mode": {
      if (!["focus", "short", "long"].includes(p.mode)) throw fail("Modo inválido.");
      await mutate((d) => { d.pomo = { ...d.pomo, mode: p.mode, running: false, endsAt: null, remaining: lenFor(p.mode, d.pomodoro) }; });
      schedule("pomo", null);
      break;
    }
    case "label":
      await mutate((d) => { d.pomo = { ...d.pomo, label: clip(p.label, 120) }; });
      break;
    case "refresh": // depois de mudar as durações nas configurações
      await mutate((d) => { if (!d.pomo.running) d.pomo = { ...d.pomo, remaining: lenFor(d.pomo.mode, d.pomodoro) }; });
      break;
    default: throw fail("Ação de pomodoro desconhecida.");
  }
  return view();
}

/** Despachante único (API, agente e comandos rápidos usam este). */
export async function timeAction(kind, action, params = {}) {
  ensureTimers();
  if (kind === "timer") return timerAction(action, params);
  if (kind === "stopwatch") return stopwatchAction(action, params);
  if (kind === "pomo") return pomoAction(action, params);
  throw fail("Tipo de relógio desconhecido.");
}

export { view as timeView };
