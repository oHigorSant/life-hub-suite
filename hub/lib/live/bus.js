import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

// Barramento em tempo real: qualquer mudança (pela API, pelo agente ou editando arquivos) vira um evento
// { scope, ts, ... } que as telas recebem por SSE (/api/live) e usam para se atualizar sozinhas.
// Escopos: tasks | finance | agenda | notas | quadros | estudos | home | alarm | ui | agent
const g = globalThis;
const bus = (g.__lhBus ??= new EventEmitter());
bus.setMaxListeners(500);

const DATA_DIR = path.join(process.cwd(), "data");

export function emit(scope, extra = {}) {
  bus.emit("evt", { scope, ts: Date.now(), ...extra });
}
export function subscribe(fn) {
  bus.on("evt", fn);
  return () => bus.off("evt", fn);
}

/** Comando de interface (ex.: navegar). As telas abertas executam. */
export function uiCommand(action, payload = {}) {
  emit("ui", { action, ...payload });
}

function scopeOf(file) {
  const f = String(file || "").replace(/\\/g, "/");
  if (!f || f.endsWith(".tmp") || f.includes(".lixeira") || f.includes("lixeira/")) return null;
  if (f === "tasks.json") return "tasks";
  if (f === "finance.json") return "finance";
  if (f === "agenda.json") return "agenda";
  if (f === "home.json") return "home";
  if (f.startsWith("notas/")) return "notas";
  if (f.startsWith("quadros/") && f.endsWith(".meta.json")) return "quadros";
  if (f.startsWith("estudos/") && /atlas\.db(-wal)?$/.test(f)) return "estudos";
  return null;
}

/** Observa data/ (edições feitas pelo agente com Write/Edit, por scripts, etc.) e converte em eventos. */
export function startWatcher() {
  if (g.__lhWatcher) return;
  try {
    const timers = new Map();
    g.__lhWatcher = fs.watch(DATA_DIR, { recursive: true }, (_ev, file) => {
      const scope = scopeOf(file);
      if (!scope) return;
      clearTimeout(timers.get(scope));
      timers.set(scope, setTimeout(() => { timers.delete(scope); emit(scope, { source: "file" }); }, 150));
    });
    g.__lhWatcher.on("error", () => { g.__lhWatcher = null; });
  } catch (e) {
    console.error("[live] não consegui observar data/:", e.message);
  }
}
