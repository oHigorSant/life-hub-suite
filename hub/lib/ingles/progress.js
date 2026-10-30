// Progresso, domínio e graduação do Inglês — a MESMA lógica do Atlas (lib/atlas/progress.js), sobre arquivos JSON:
//  · cada lição é um nó; evidências (tentativas) pesam por dificuldade e decaem com meia-vida de 21 dias
//  · domínio = Σ(peso·nota) / (Σpeso + 1,2): encolhe para 0 com pouca evidência
//  · "aprovado" (libera a próxima parte): domínio ≥ 0,65 em ≥ 3 itens distintos
//  · "dominado": domínio ≥ 0,8 em ≥ 5 itens distintos, com um acerto difícil (dificuldade ≥ 3, nota ≥ 0,7)
//  · XP por tentativa = round(nota · 10 · dificuldade); palavras mineradas usam o SM-2 do Atlas (schedule)
import fs from "node:fs";
import path from "node:path";
import { loadLessons, DATA_DIR } from "./lessons.js";
import { schedule } from "../atlas/progress.js";

const DAY = 864e5;
const HALF_LIFE_DAYS = 21;
export const PASS = 0.65;
export const MASTER = 0.8;

const FILE = path.join(DATA_DIR, "progress.json");
const WORDS_FILE = path.join(DATA_DIR, "words.json");

// ------------------------------------------------------------------ armazenamento

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

export function readProgress() {
  const p = readJson(FILE, null) || {};
  return { version: 2, attempts: p.attempts || [], lessons: p.lessons || {}, days: p.days || {}, goal: p.goal || { minutes: 20 } };
}
function saveProgress(p) { writeJson(FILE, p); }

export const today = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(t));

// ------------------------------------------------------------------ evidência → domínio

function evidence(attempts, nowMs) {
  const ev = new Map();
  for (const a of attempts) {
    let e = ev.get(a.lesson);
    if (!e) ev.set(a.lesson, (e = { num: 0, den: 0, keys: new Set(), hardOk: false, n: 0, last: 0, byType: {} }));
    const age = (nowMs - a.at) / DAY;
    const w = Math.pow(0.5, age / HALF_LIFE_DAYS) * (0.6 + 0.2 * (a.difficulty || 3));
    e.num += w * a.score;
    e.den += w;
    e.keys.add(a.key);
    e.n++;
    e.last = Math.max(e.last, a.at);
    if ((a.difficulty || 3) >= 3 && a.score >= 0.7) e.hardOk = true;
    const t = (e.byType[a.type] ||= { n: 0, sum: 0 });
    t.n++; t.sum += a.score;
  }
  return ev;
}

/** Nível do aluno numa lição (calibra a dificuldade dos exercícios) — igual ao studentLevel do Atlas. */
export function studentLevel(mastery, attempts) {
  if (attempts < 3) return { name: "iniciante", blanks: 1, maxDiff: 3 };
  if (mastery < 0.5) return { name: "intermediário", blanks: 2, maxDiff: 4 };
  if (mastery < 0.75) return { name: "avançado", blanks: 3, maxDiff: 5 };
  return { name: "domínio", blanks: 4, maxDiff: 5 };
}

export const XP_LEVELS = [
  [0, "Iniciante"], [100, "Aprendiz"], [300, "Explorador"], [700, "Praticante"], [1400, "Fluente em formação"],
  [2600, "Intermediário"], [4400, "Avançado"], [7000, "Proficiente"], [11000, "Mestre"],
];
export function levelOf(xp) {
  let i = 0;
  while (i + 1 < XP_LEVELS.length && xp >= XP_LEVELS[i + 1][0]) i++;
  const next = XP_LEVELS[i + 1];
  return { n: i + 1, title: XP_LEVELS[i][1], xp, from: XP_LEVELS[i][0], to: next ? next[0] : null };
}

/** Estado de cada lição (status, domínio, xp...) + grupos + graduação das fases. */
export function computeState(nowMs = Date.now()) {
  const data = loadLessons();
  const prog = readProgress();
  const ev = evidence(prog.attempts, nowMs);
  const lessonIndex = new Map();
  const state = {};
  for (const l of data.lessons) {
    const e = ev.get(l.id);
    const st = prog.lessons[l.id] || {};
    const mastery = e ? e.num / (e.den + 1.2) : 0;
    const distinct = e ? e.keys.size : 0;
    const passedByEvidence = !!e && mastery >= PASS && distinct >= 3;
    const masteredByEvidence = !!e && mastery >= MASTER && distinct >= 5 && e.hardOk;
    state[l.id] = {
      id: l.id,
      mastery: Math.round(mastery * 1000) / 1000,
      distinct,
      attempts: e?.n || 0,
      last: e?.last || st.lastAt || null,
      xp: st.xp || 0,
      listened: Object.keys(st.listened || {}).length,
      manual: !!st.done, // "já estudei" (nivelamento): conta como aprovado
      passed: passedByEvidence || masteredByEvidence || !!st.done,
      mastered: masteredByEvidence,
      byType: e?.byType || {},
      level: studentLevel(mastery, e?.n || 0),
    };
    lessonIndex.set(l.id, l);
  }
  // pré-requisitos: a parte anterior do mesmo grupo (duro); "texto completo" só recomenda (suave)
  for (const g of data.groups) {
    let prev = null;
    for (const id of g.lessons) {
      const l = lessonIndex.get(id);
      const s = state[id];
      // trilha em árvore (gramática): vários pré-requisitos; séries: a parte anterior (o "texto completo" pede a última aprovada)
      s.prereqs = Array.isArray(l.prereqs) ? l.prereqs.filter((p) => state[p]) : prev ? [prev] : [];
      s.prereq = s.prereqs[0] || null;
      if (l.kind !== "complete") prev = id;
    }
  }
  for (const l of data.lessons) {
    const s = state[l.id];
    const missing = s.prereqs.filter((p) => !state[p].passed);
    const open = missing.length === 0;
    s.missing = missing;
    if (missing.length) s.prereq = missing[0];
    const started = s.attempts > 0 || s.listened > 0;
    s.status = s.mastered ? "mastered" : s.passed ? "passed" : !open ? "locked" : started ? "in_progress" : "available";
    s.percent = Math.round(Math.min(1, s.mastery / MASTER) * 100);
    if (s.manual && !s.mastered) s.percent = Math.max(s.percent, 65);
  }
  return { data, prog, state };
}

// ------------------------------------------------------------------ gravação de eventos

function addXp(prog, lessonId, xp, t) {
  const st = (prog.lessons[lessonId] ||= {});
  st.xp = (st.xp || 0) + xp;
  st.lastAt = t;
  const d = today(t);
  const day = (prog.days[d] ||= { xp: 0, n: 0, sec: 0 });
  day.xp += xp;
  day.n += 1;
}

/** Registra uma tentativa de exercício (nota 0..1). */
export function recordAttempt({ lesson, type, key, score, difficulty = 3, ms = 0 }) {
  const data = loadLessons();
  // "reforco" = estudo de reforço (não é uma lição): conta XP, sequência e pontos fracos, sem mexer no domínio das lições
  if (lesson !== "reforco" && !data.byId.has(lesson)) throw new Error("Lição desconhecida");
  const s = Math.max(0, Math.min(1, Number(score) || 0));
  const prog = readProgress();
  const t = Date.now();
  const diff = Math.max(1, Math.min(5, Math.round(difficulty)));
  prog.attempts.push({ lesson, type: String(type).slice(0, 16), key: String(key).slice(0, 60), score: s, difficulty: diff, at: t });
  if (prog.attempts.length > 20000) prog.attempts.splice(0, prog.attempts.length - 20000);
  const xp = Math.round(s * 10 * diff);
  addXp(prog, lesson, xp, t);
  if (ms > 0) (prog.days[today(t)] ||= { xp: 0, n: 0, sec: 0 }).sec += Math.min(600, Math.round(ms / 1000));
  saveProgress(prog);
  return { xp };
}

/** Áudio ouvido (≥85%): evidência fácil, uma por voz. */
export function recordListen({ lesson, file, seconds = 0, complete = false }) {
  const data = loadLessons();
  const l = data.byId.get(lesson);
  if (!l || !l.audios.some((a) => a.file === file)) throw new Error("Áudio desconhecido");
  const prog = readProgress();
  const st = (prog.lessons[lesson] ||= {});
  st.listened ||= {};
  const first = complete && !st.listened[file];
  if (complete) st.listened[file] = Date.now();
  const t = Date.now();
  if (first) {
    prog.attempts.push({ lesson, type: "listen", key: `listen:${file}`, score: 1, difficulty: 1, at: t });
    addXp(prog, lesson, 10, t);
  }
  const day = (prog.days[today(t)] ||= { xp: 0, n: 0, sec: 0 });
  day.sec += Math.min(900, Math.round(seconds));
  saveProgress(prog);
  return { first };
}

export function setManualDone(lesson, done) {
  const data = loadLessons();
  if (!data.byId.has(lesson)) throw new Error("Lição desconhecida");
  const prog = readProgress();
  const st = (prog.lessons[lesson] ||= {});
  st.done = !!done;
  st.lastAt = Date.now();
  saveProgress(prog);
}

export function setGoal(minutes) {
  const prog = readProgress();
  prog.goal = { minutes: Math.max(5, Math.min(240, Math.round(minutes))) };
  saveProgress(prog);
}

// ------------------------------------------------------------------ vocabulário (SRS)

export function readWords() {
  const w = readJson(WORDS_FILE, []);
  return Array.isArray(w) ? w : [];
}
export function writeWords(w) { writeJson(WORDS_FILE, w); }

const DUE_NOW = () => Date.now();
export function withSrs(w) {
  return { ease: 2.5, interval_days: 0, reps: 0, lapses: 0, due: new Date(w.createdAt || Date.now()).getTime(), ...w };
}

export function reviewWord(id, grade) {
  const words = readWords();
  const i = words.findIndex((w) => w.id === id);
  if (i < 0) throw new Error("Palavra não encontrada");
  const w = withSrs(words[i]);
  const next = schedule(w, Math.max(0, Math.min(3, grade)));
  const level = next.reps >= 4 && next.interval_days >= 14 ? "consolidada" : next.reps >= 1 ? "praticada" : "minerada";
  words[i] = { ...w, ...next, level, updatedAt: new Date().toISOString() };
  writeWords(words);
  // a revisão também é evidência para a lição de onde a palavra veio
  const lessonId = w.lessonId;
  if (lessonId && loadLessons().byId.has(lessonId)) {
    recordAttempt({ lesson: lessonId, type: "word", key: `w:${w.word.toLowerCase()}`, score: [0, 0.4, 0.8, 1][grade] ?? 0.5, difficulty: 3 });
  }
  return words[i];
}

export function dueWords(limit = 20) {
  const t = DUE_NOW();
  return readWords().map(withSrs).filter((w) => w.due <= t).sort((a, b) => a.due - b.due).slice(0, limit);
}

// ------------------------------------------------------------------ visão geral: graduação, sequência, plano de hoje

function streakOf(days, nowMs) {
  let n = 0;
  let t = nowMs;
  if (!days[today(t)]) t -= DAY; // hoje ainda não conta contra a sequência
  while (days[today(t)]) { n++; t -= DAY; }
  return n;
}

export function overview(nowMs = Date.now()) {
  const { data, prog, state } = computeState(nowMs);
  const phases = data.phases.map((p) => {
    const ls = data.lessons.filter((l) => l.phase === p.id && l.kind !== "complete");
    const total = ls.length;
    const passed = ls.filter((l) => state[l.id].passed).length;
    const mastered = ls.filter((l) => state[l.id].mastered).length;
    const percent = total ? Math.round(ls.reduce((a, l) => a + state[l.id].percent, 0) / total) : 0;
    // graduação: 80% aprovadas e 40% dominadas (ou tudo dominado)
    const graduated = total > 0 && passed / total >= 0.8 && mastered / total >= 0.4;
    return { ...p, total, passed, mastered, percent, graduated, groups: data.groups.filter((g) => g.phase === p.id).length };
  });
  const xp = Object.values(prog.lessons).reduce((a, s) => a + (s.xp || 0), 0);
  const words = readWords().map(withSrs);
  const due = words.filter((w) => w.due <= nowMs).length;
  const d = today(nowMs);
  const todayRec = prog.days[d] || { xp: 0, n: 0, sec: 0 };
  const budget = prog.goal.minutes;

  // plano de hoje: revisões vencidas + lições em andamento + próximas disponíveis (na ordem do curso)
  const cand = data.lessons
    .filter((l) => ["in_progress", "available"].includes(state[l.id].status))
    .sort((a, b) => (state[a.id].status === "in_progress" ? -1 : 1) - (state[b.id].status === "in_progress" ? -1 : 1) || a.order - b.order);
  const picks = [];
  let used = due ? Math.min(10, Math.ceil(due / 3)) : 0;
  for (const l of cand) {
    if (used + l.minutes > budget && picks.length) continue;
    picks.push({ id: l.id, title: `${l.groupTitle} · ${l.title}`, minutes: l.minutes, status: state[l.id].status });
    used += l.minutes;
    if (picks.length >= 3) break;
  }
  // pontos de atenção: dominadas há muito tempo sem revisar e lições travadas em nota baixa
  const stale = data.lessons.filter((l) => state[l.id].mastered && state[l.id].last && nowMs - state[l.id].last > 30 * DAY).slice(0, 6)
    .map((l) => ({ id: l.id, title: `${l.groupTitle} · ${l.title}`, days: Math.round((nowMs - state[l.id].last) / DAY) }));
  const stuck = data.lessons.filter((l) => state[l.id].attempts >= 6 && state[l.id].mastery < 0.5).slice(0, 6)
    .map((l) => ({ id: l.id, title: `${l.groupTitle} · ${l.title}`, mastery: state[l.id].mastery, attempts: state[l.id].attempts }));
  // fraquezas por tipo de exercício
  const typeAgg = {};
  for (const a of prog.attempts.slice(-600)) { const t = (typeAgg[a.type] ||= { n: 0, sum: 0 }); t.n++; t.sum += a.score; }
  const byType = Object.entries(typeAgg).map(([type, v]) => ({ type, n: v.n, avg: Math.round((v.sum / v.n) * 100) })).sort((a, b) => a.avg - b.avg);

  // nichos que o reforço inteligente encontrou (lido direto do arquivo, sem carregar a IA)
  const rf = readJson(path.join(DATA_DIR, "reforco.json"), null);
  const reforco = (rf?.themes || []).map((t) => ({ title: t.title, kind: t.kind, items: t.items.length }));

  // últimos 28 dias
  const heat = [];
  for (let i = 27; i >= 0; i--) { const k = today(nowMs - i * DAY); heat.push({ d: k, xp: prog.days[k]?.xp || 0, min: Math.round((prog.days[k]?.sec || 0) / 60) }); }

  const lessonsTotal = data.lessons.filter((l) => l.kind !== "complete").length;
  const passedTotal = data.lessons.filter((l) => l.kind !== "complete" && state[l.id].passed).length;
  const current = cand[0] || null;
  return {
    level: levelOf(xp),
    xp,
    streak: streakOf(prog.days, nowMs),
    today: { ...todayRec, minutes: Math.round(todayRec.sec / 60), goal: budget },
    phases,
    plan: { budget, picks, dueWords: due },
    gaps: { stale, stuck, byType, reforco },
    heat,
    totals: { lessons: lessonsTotal, passed: passedTotal, mastered: data.lessons.filter((l) => state[l.id].mastered).length, words: words.length, consolidated: words.filter((w) => w.level === "consolidada").length },
    current: current ? { id: current.id, title: `${current.groupTitle} · ${current.title}` } : null,
  };
}
