import fs from "node:fs";
import path from "node:path";
import { generateId } from "../ids.js";
import { emit } from "../live/bus.js";

// Home: data/home.json — quais widgets aparecem e em que ordem, metas e a frase do dia.
export const HOME_FILE = process.env.HOME_FILE || path.join(process.cwd(), "data", "home.json");

export const WIDGETS = [
  { id: "clock", label: "Data e relógio" },
  { id: "phrase", label: "Frase do dia" },
  { id: "tasks", label: "Tarefas do dia" },
  { id: "bills", label: "Contas do dia" },
  { id: "studies", label: "Estudos" },
  { id: "goals", label: "Metas" },
  { id: "progress", label: "Progresso" },
  { id: "agenda", label: "Agenda e tempo" },
  { id: "usage", label: "IAs e limites" },
  { id: "trilhas", label: "Trilhas" },
  { id: "news", label: "Notícias" },
];
const IDS = new Set(WIDGETS.map((w) => w.id));

export function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

const DEFAULT = () => ({
  layout: WIDGETS.map((w) => ({ id: w.id, visible: true })),
  goals: [],
  phrase: null, // { date, text, ref }
});

let queue = Promise.resolve();

export function readHome() {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(HOME_FILE, "utf8")); } catch { /* usa o padrão */ }
  const d = DEFAULT();
  // mantém a ordem salva e acrescenta widgets novos no fim
  const saved = (Array.isArray(j.layout) ? j.layout : []).filter((l) => IDS.has(l.id));
  const seen = new Set(saved.map((l) => l.id));
  const layout = saved.map((l) => ({ id: l.id, visible: l.visible !== false }));
  // widgets novos entram antes de "Notícias" (que fica por último, em largura total)
  const at = layout.findIndex((l) => l.id === "news");
  layout.splice(at < 0 ? layout.length : at, 0, ...d.layout.filter((l) => !seen.has(l.id)));
  return { layout, goals: Array.isArray(j.goals) ? j.goals : [], phrase: j.phrase || null };
}

function write(next) {
  const tmp = `${HOME_FILE}.tmp`;
  fs.mkdirSync(path.dirname(HOME_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, HOME_FILE);
  emit("home");
  return next;
}

function mutate(fn) {
  const run = queue.then(() => {
    const cur = readHome();
    const out = fn(cur);
    return write(out ?? cur);
  });
  queue = run.catch(() => {});
  return run;
}

const clamp = (n, a, b) => Math.min(b, Math.max(a, Number(n) || 0));

export const saveLayout = (layout) =>
  mutate((h) => {
    if (!Array.isArray(layout)) throw fail("Layout inválido.");
    const seen = new Set();
    const next = [];
    for (const l of layout) {
      if (!IDS.has(l?.id) || seen.has(l.id)) continue;
      seen.add(l.id);
      next.push({ id: l.id, visible: l.visible !== false });
    }
    for (const w of WIDGETS) if (!seen.has(w.id)) next.push({ id: w.id, visible: true });
    h.layout = next;
  });

export const setWidget = (id, visible) =>
  mutate((h) => {
    const l = h.layout.find((x) => x.id === id);
    if (!l) throw fail(`Widget desconhecido: ${id}. Use: ${WIDGETS.map((w) => w.id).join(", ")}`);
    l.visible = !!visible;
  });

export const upsertGoal = (goal) =>
  mutate((h) => {
    const title = String(goal?.title || "").trim().slice(0, 120);
    if (!title) throw fail("Dê um título à meta.");
    const existing = goal.id ? h.goals.find((g) => g.id === goal.id) : null;
    const patch = {
      title,
      progress: clamp(goal.progress ?? existing?.progress ?? 0, 0, 100),
      note: String(goal.note ?? existing?.note ?? "").slice(0, 300),
      due: /^\d{4}-\d{2}-\d{2}$/.test(goal.due || "") ? goal.due : existing?.due || null,
    };
    if (existing) Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
    else h.goals.push({ id: generateId("goal"), ...patch, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  });

export const deleteGoal = (id) =>
  mutate((h) => {
    const n = h.goals.length;
    h.goals = h.goals.filter((g) => g.id !== id);
    if (h.goals.length === n) throw fail("Meta não encontrada.", 404);
  });

export const setPhrase = (text, ref, date) =>
  mutate((h) => {
    const t = String(text || "").trim().slice(0, 400);
    h.phrase = t ? { date: date || new Date().toLocaleDateString("sv-SE"), text: t, ref: String(ref || "").slice(0, 120) } : null;
  });
