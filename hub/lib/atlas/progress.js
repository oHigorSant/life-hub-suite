import { db, now, parse } from "./db.js";

const DAY = 864e5;
const HALF_LIFE_DAYS = 21;

export const PASS = 0.65; // libera dependentes
export const MASTER = 0.8; // nó dominado

function nodeEvidence(subjectId) {
  const rows = db()
    .prepare(
      `SELECT a.node_id, a.question_id, a.score, a.created_at, q.difficulty
       FROM attempts a JOIN questions q ON q.id=a.question_id
       WHERE a.subject_id=? AND a.node_id IS NOT NULL ORDER BY a.created_at`
    )
    .all(subjectId);
  const ev = new Map();
  const t = now();
  for (const r of rows) {
    let e = ev.get(r.node_id);
    if (!e) ev.set(r.node_id, (e = { num: 0, den: 0, qs: new Set(), hardOk: false, attempts: 0, last: 0 }));
    const age = (t - r.created_at) / DAY;
    const w = Math.pow(0.5, age / HALF_LIFE_DAYS) * (0.6 + 0.2 * (r.difficulty || 3));
    e.num += w * r.score;
    e.den += w;
    e.qs.add(r.question_id);
    e.attempts++;
    e.last = Math.max(e.last, r.created_at);
    if ((r.difficulty || 3) >= 3 && r.score >= 0.7) e.hardOk = true;
  }
  return ev;
}

/** Estado completo da árvore: mastery, status (locked/available/in_progress/mastered), contagens. */
export function computeTree(subjectId) {
  const nodes = db().prepare("SELECT * FROM nodes WHERE subject_id=? ORDER BY tier, sort").all(subjectId);
  const edges = db()
    .prepare("SELECT e.from_node AS f, e.to_node AS t, e.kind FROM node_edges e JOIN nodes n ON n.id=e.to_node WHERE n.subject_id=?")
    .all(subjectId);
  const state = new Map(db().prepare("SELECT * FROM node_state WHERE subject_id=?").all(subjectId).map((s) => [s.node_id, s]));
  const ev = nodeEvidence(subjectId);
  const qCount = new Map(db().prepare("SELECT node_id, COUNT(*) n FROM questions WHERE subject_id=? GROUP BY node_id").all(subjectId).map((r) => [r.node_id, r.n]));
  const actTypes = new Map();
  for (const r of db().prepare("SELECT node_id, type FROM activities WHERE subject_id=?").all(subjectId)) {
    if (!actTypes.has(r.node_id)) actTypes.set(r.node_id, new Set());
    actTypes.get(r.node_id).add(r.type);
  }
  const cardCount = new Map(db().prepare("SELECT node_id, COUNT(*) n, SUM(due<=?) d FROM cards WHERE subject_id=? GROUP BY node_id").all(now(), subjectId).map((r) => [r.node_id, r]));

  const byId = new Map();
  for (const n of nodes) {
    const e = ev.get(n.id);
    const mastery = e ? e.num / (e.den + 1.2) : 0; // encolhe para 0 com pouca evidência
    const distinct = e ? e.qs.size : 0;
    const passed = e && mastery >= PASS && distinct >= 3;
    const mastered = e && mastery >= MASTER && distinct >= 5 && e.hardOk;
    byId.set(n.id, {
      ...n,
      objectives: parse(n.objectives_json, []),
      mastery: Math.round(mastery * 1000) / 1000,
      distinct,
      attempts: e?.attempts || 0,
      lastAttempt: e?.last || null,
      passed: !!passed,
      mastered: !!mastered,
      started: !!state.get(n.id)?.started || !!e,
      lessonDone: !!state.get(n.id)?.lesson_done,
      xp: state.get(n.id)?.xp || 0,
      questions: qCount.get(n.id) || 0,
      activities: [...(actTypes.get(n.id) || [])],
      cards: cardCount.get(n.id)?.n || 0,
      cardsDue: cardCount.get(n.id)?.d || 0,
      prereqs: [],
      unlocks: [],
    });
  }
  for (const e of edges) {
    byId.get(e.t)?.prereqs.push({ id: e.f, kind: e.kind });
    byId.get(e.f)?.unlocks.push({ id: e.t, kind: e.kind });
  }
  for (const n of byId.values()) {
    const hard = n.prereqs.filter((p) => p.kind === "hard");
    const open = hard.every((p) => byId.get(p.id)?.passed || byId.get(p.id)?.mastered);
    n.status = n.mastered ? "mastered" : !open ? "locked" : n.started ? "in_progress" : "available";
    n.missing = hard.filter((p) => !(byId.get(p.id)?.passed || byId.get(p.id)?.mastered)).map((p) => p.id);
  }
  return { nodes: [...byId.values()], edges };
}

export function subjectSummary(subjectId) {
  const { nodes } = computeTree(subjectId);
  const total = nodes.length;
  const mastered = nodes.filter((n) => n.status === "mastered").length;
  const mins = nodes.reduce((a, n) => a + n.est_minutes, 0);
  const doneMins = nodes.reduce((a, n) => a + n.est_minutes * Math.min(1, n.mastery / MASTER), 0);
  const due = db().prepare("SELECT COUNT(*) n FROM cards WHERE subject_id=? AND due<=?").get(subjectId, now()).n;
  return {
    nodes: total,
    mastered,
    available: nodes.filter((n) => n.status === "available" || n.status === "in_progress").length,
    percent: mins ? Math.round((doneMins / mins) * 100) : 0,
    minutesTotal: mins,
    due,
  };
}

/** Pontos de atenção: o que o aluno está errando, com evidência. */
export function computeGaps(subjectId) {
  const weakConcepts = db()
    .prepare(
      `SELECT concept_id, title, importance, attempts, avg_score, recent_score FROM v_concept_mastery
       WHERE subject_id=? AND attempts>=2 AND COALESCE(recent_score, avg_score) < 0.65
       ORDER BY importance DESC, COALESCE(recent_score, avg_score) ASC LIMIT 12`
    )
    .all(subjectId);
  const misconceptions = db()
    .prepare(
      `SELECT m.node_id, n.title AS node_title, m.concept_id, c.title AS concept_title, m.misconception, m.times, m.last_seen
       FROM v_misconceptions m LEFT JOIN nodes n ON n.id=m.node_id LEFT JOIN concepts c ON c.id=m.concept_id
       WHERE m.subject_id=? ORDER BY m.times DESC, m.last_seen DESC LIMIT 12`
    )
    .all(subjectId);
  const overconfident = db()
    .prepare(
      `SELECT a.concept_id, c.title, COUNT(*) AS times FROM attempts a LEFT JOIN concepts c ON c.id=a.concept_id
       WHERE a.subject_id=? AND a.confidence=3 AND a.score<0.5 GROUP BY a.concept_id ORDER BY times DESC LIMIT 8`
    )
    .all(subjectId);
  const { nodes } = computeTree(subjectId);
  const stale = nodes
    .filter((n) => n.mastered && n.lastAttempt && now() - n.lastAttempt > 30 * DAY)
    .map((n) => ({ node_id: n.id, title: n.title, days: Math.round((now() - n.lastAttempt) / DAY) }));
  const stuck = nodes
    .filter((n) => n.attempts >= 6 && n.mastery < 0.5)
    .map((n) => ({ node_id: n.id, title: n.title, mastery: n.mastery, attempts: n.attempts }));
  const due = db().prepare("SELECT COUNT(*) n FROM cards WHERE subject_id=? AND due<=?").get(subjectId, now()).n;
  return { weakConcepts, misconceptions, overconfident, stale, stuck, dueCards: due };
}

/** "Hoje": revisões vencidas + próximos nós dentro do orçamento diário. */
export function todayPlan(subjectId) {
  const subject = db().prepare("SELECT * FROM subjects WHERE id=?").get(subjectId);
  const budget = Math.round(((subject?.hours_per_week || 7) * 60) / 7);
  const { nodes } = computeTree(subjectId);
  const cand = nodes
    .filter((n) => n.status === "in_progress" || n.status === "available")
    .sort((a, b) => (a.status === "in_progress" ? -1 : 1) - (b.status === "in_progress" ? -1 : 1) || a.tier - b.tier || a.sort - b.sort);
  const picks = [];
  let used = 0;
  for (const n of cand) {
    if (used + n.est_minutes > budget && picks.length) continue;
    picks.push({ id: n.id, title: n.title, branch: n.branch, minutes: n.est_minutes, status: n.status });
    used += n.est_minutes;
    if (picks.length >= 4) break;
  }
  const due = db().prepare("SELECT COUNT(*) n FROM cards WHERE subject_id=? AND due<=?").get(subjectId, now()).n;
  return { budget, picks, dueCards: due };
}

// ------------------------------------------------------------------ SRS (SM-2 adaptado)

/** grade: 0 errei, 1 difícil, 2 bom, 3 fácil */
export function schedule(card, grade) {
  let { ease, interval_days: iv, reps, lapses } = card;
  if (grade === 0) {
    reps = 0;
    lapses++;
    iv = 0;
    ease = Math.max(1.3, ease - 0.2);
    return { ease, interval_days: iv, reps, lapses, due: now() + 10 * 60_000 };
  }
  reps++;
  if (grade === 1) ease = Math.max(1.3, ease - 0.15);
  if (grade === 3) ease += 0.1;
  if (reps === 1) iv = grade === 3 ? 2 : 1;
  else if (reps === 2) iv = grade === 3 ? 5 : 3;
  else iv = Math.max(1, iv * ease * (grade === 1 ? 0.8 : grade === 3 ? 1.3 : 1));
  return { ease, interval_days: iv, reps, lapses, due: now() + iv * DAY };
}
