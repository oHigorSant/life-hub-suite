"use client";
// Espelho do estado de tempo que vive no SERVIDOR (timer, cronômetro, pomodoro): o que o agente ou outra aba
// faz aparece aqui na hora (canal /api/live). A hora de fim é absoluta; usamos o relógio do servidor como referência.
import { useEffect, useReducer } from "react";
import { subscribeLive } from "../live/liveClient.js";

const DEFAULT_CFG = { focus: 25, short: 5, long: 15, cycles: 4, autoStart: false };
const store = { data: null, offset: 0, listeners: new Set(), inflight: null };

async function refresh() {
  if (store.inflight) return store.inflight;
  store.inflight = fetch("/api/agenda", { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => { store.offset = (d.serverNow || Date.now()) - Date.now(); store.data = d; store.listeners.forEach((f) => f()); return d; })
    .catch(() => null)
    .finally(() => { store.inflight = null; });
  return store.inflight;
}

export const nowMs = () => Date.now() + store.offset;

function apply(partial) {
  if (!store.data) return;
  store.data = { ...store.data, ...partial };
  if (partial.serverNow) store.offset = partial.serverNow - Date.now();
  store.listeners.forEach((f) => f());
}

export async function act(kind, action, params = {}) {
  const r = await fetch("/api/agenda", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "time", kind, action, ...params }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  apply(j);
  return j;
}

/** Assina o estado compartilhado; re-renderiza ao mudar e a cada `tickMs` (para os contadores). */
function useTime(tickMs = 500) {
  const [, force] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    store.listeners.add(force);
    if (!store.data) refresh();
    const off = subscribeLive((evt) => { if (evt.scope === "agenda" || evt.scope === "reconnect") refresh(); });
    const t = setInterval(force, tickMs);
    return () => { store.listeners.delete(force); off(); clearInterval(t); };
  }, [tickMs]);
  return store.data;
}

// ---------- som e notificação (usados pelo ouvinte global de alarmes) ----------
let audioCtx = null;
export function primeAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
export function beep(times = 3) {
  try {
    primeAudio();
    if (!audioCtx) return;
    for (let i = 0; i < times; i++) {
      const t = audioCtx.currentTime + i * 0.35;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = i === times - 1 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.3);
    }
  } catch {}
}
export async function askNotifyPermission() {
  try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch {}
}
export function notify(title, body) {
  try { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body }); } catch {}
}

const lenFor = (mode, cfg) => (mode === "focus" ? cfg.focus : mode === "short" ? cfg.short : cfg.long) * 60;
const remainingOf = (s) => (s.running && s.endsAt ? Math.max(0, Math.ceil((s.endsAt - nowMs()) / 1000)) : s.remaining);

// ---------- pomodoro ----------
export function usePomodoro() {
  const d = useTime();
  const cfg = { ...DEFAULT_CFG, ...(d?.pomodoro || {}) };
  const state = d?.pomo || { mode: "focus", running: false, endsAt: null, remaining: cfg.focus * 60, cycle: 1, label: "" };
  const run = (action, p) => { primeAudio(); askNotifyPermission(); return act("pomo", action, p).catch(() => {}); };
  return {
    cfg, state,
    remainingSec: remainingOf(state),
    total: lenFor(state.mode, cfg),
    start: () => run("start"),
    pause: () => run("pause"),
    reset: () => run("reset"),
    skip: () => run("skip"),
    setLabel: (label) => { apply({ pomo: { ...state, label } }); return act("pomo", "label", { label }).catch(() => {}); },
    setMode: (mode) => run("mode", { mode }),
    async saveCfg(next) {
      await fetch("/api/agenda", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "savePomodoro", pomodoro: next }) });
      await refresh();
    },
  };
}

// ---------- cronômetro ----------
export function useStopwatch() {
  const d = useTime(100);
  const sw = d?.stopwatch || { running: false, startedAt: null, acc: 0, laps: [] };
  const elapsedMs = sw.acc + (sw.running && sw.startedAt ? nowMs() - sw.startedAt : 0);
  const run = (action) => act("stopwatch", action).catch(() => {});
  return { sw, elapsedMs, start: () => run("start"), pause: () => run("pause"), lap: () => run("lap"), reset: () => run("reset") };
}

// ---------- timer (contagem regressiva) ----------
export function useCountdown() {
  const d = useTime(250);
  const t = d?.timer || { running: false, endsAt: null, remaining: 300, total: 300, label: "", done: false };
  const run = (action, p) => { primeAudio(); askNotifyPermission(); return act("timer", action, p).catch(() => {}); };
  return {
    t,
    remainingSec: remainingOf(t),
    set: (seconds) => run("set", { seconds }),
    start: () => run("start"),
    pause: () => run("pause"),
    reset: () => run("reset"),
  };
}

/** Para widgets (home): estado completo dos relógios. */
export function useTimeState() {
  const d = useTime(500);
  return { data: d, nowMs, remainingOf, lenFor };
}
