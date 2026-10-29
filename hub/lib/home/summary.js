import fs from "node:fs";
import { TASKS_FILE, FINANCE_FILE } from "../paths.js";
import { readAgenda } from "../agenda/store.js";
import { expandRoutines, eventsOn, addDays } from "../../components/agenda/dates.js";
import { readHome } from "./store.js";

const TZ = "America/Sao_Paulo";
const ymdIn = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: TZ });
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
const round2 = (n) => Math.round(n * 100) / 100;

function tasksPart(today) {
  const t = readJson(TASKS_FILE, { boards: [], lists: [], cards: [] });
  const boards = new Map((t.boards || []).map((b) => [b.id, b]));
  const lists = new Map((t.lists || []).map((l) => [l.id, l]));
  const live = (t.cards || []).filter((c) => !c.archived && !boards.get(c.boardId)?.archived && !lists.get(c.listId)?.archived);
  const isHoje = (c) => /^hoje$/i.test(lists.get(c.listId)?.name || "");
  const dueNow = (c) => (c.dueDate && c.dueDate <= today) || isHoje(c);
  const doneToday = live.filter((c) => c.done && c.completedAt && ymdIn(c.completedAt) === today);
  const open = live.filter((c) => !c.done && dueNow(c));
  open.sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || (a.order ?? 0) - (b.order ?? 0));
  const shape = (c) => ({
    id: c.id, title: c.title, done: !!c.done,
    board: boards.get(c.boardId)?.name || "", list: lists.get(c.listId)?.name || "",
    due: c.dueDate || null, overdue: !!c.dueDate && c.dueDate < today && !c.done,
  });
  return {
    items: [...open.slice(0, 7).map(shape), ...doneToday.slice(0, 4).map(shape)],
    doneCount: doneToday.length,
    openCount: open.length,
    overdueCount: open.filter((c) => c.dueDate && c.dueDate < today).length,
    totalOpenAll: live.filter((c) => !c.done).length,
  };
}

function billsPart(today) {
  const f = readJson(FINANCE_FILE, { bills: [] });
  const open = (f.bills || []).filter((b) => !b.archived && b.status !== "paid" && !b.hideFromForecast);
  const in7 = addDays(today, 7);
  const shape = (b) => ({ id: b.id, name: b.name, amount: round2(b.amount), due: b.dueDate, overdue: b.dueDate < today || b.status === "overdue", installment: b.installment || null });
  const now = open.filter((b) => b.dueDate <= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next = open.filter((b) => b.dueDate > today && b.dueDate <= in7).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    now: now.slice(0, 6).map(shape),
    nowCount: now.length,
    nowTotal: round2(now.reduce((s, b) => s + b.amount, 0)),
    next: next.slice(0, 4).map(shape),
    nextTotal: round2(next.reduce((s, b) => s + b.amount, 0)),
  };
}

async function studiesPart() {
  try {
    const { db } = await import("../atlas/db.js");
    const { subjectSummary, todayPlan } = await import("../atlas/progress.js");
    const rows = db().prepare("SELECT * FROM subjects WHERE status!='archived' ORDER BY updated_at DESC").all();
    const areas = rows.map((s) => {
      const sum = subjectSummary(s.id);
      const plan = todayPlan(s.id);
      return { id: s.id, title: s.title, color: s.color, percent: sum.percent, mastered: sum.mastered, nodes: sum.nodes, due: sum.due, plan: (plan.picks || []).slice(0, 3).map((p) => ({ id: p.id, title: p.title, minutes: p.minutes })) };
    });
    const dueTotal = db().prepare("SELECT COUNT(*) n FROM cards WHERE due<=?").get(Date.now()).n;
    return { areas, dueTotal, avg: areas.length ? Math.round(areas.reduce((s, a) => s + a.percent, 0) / areas.length) : 0 };
  } catch (e) {
    return { areas: [], dueTotal: 0, avg: 0, error: String(e.message || e) };
  }
}

/** Frase do dia: a que o agente escreveu hoje; senão um trecho do estudo bíblico (área com "bíblia" no nome), um por dia. */
async function phrasePart(today, home) {
  if (home.phrase && home.phrase.date === today) return { text: home.phrase.text, ref: home.phrase.ref || "", source: "agente" };
  try {
    const { verseOfTheDay } = await import("../biblia/yv.js");
    const v = await verseOfTheDay();
    if (v.text) return { text: v.text, ref: `${v.reference}${v.version ? ` · ${v.version}` : ""}`, source: "youversion" };
  } catch { /* sem chave/sem rede: tenta os estudos */ }
  try {
    const { db } = await import("../atlas/db.js");
    const sub = db().prepare("SELECT id, title FROM subjects WHERE status!='archived' AND (title LIKE '%bíbli%' OR title LIKE '%biblia%' OR title LIKE '%bibli%' OR title LIKE '%teolog%') ORDER BY updated_at DESC LIMIT 1").get();
    if (sub) {
      const nodes = db().prepare("SELECT title, summary FROM nodes WHERE subject_id=? AND summary IS NOT NULL AND length(summary) > 30 ORDER BY tier, sort").all(sub.id);
      if (nodes.length) {
        const day = Math.floor(new Date(today + "T12:00:00Z").getTime() / 864e5);
        const n = nodes[day % nodes.length];
        const text = n.summary.length > 230 ? n.summary.slice(0, 227).replace(/\s+\S*$/, "") + "…" : n.summary;
        return { text, ref: `${sub.title} · ${n.title}`, source: "estudos" };
      }
    }
  } catch { /* sem estudos */ }
  return { text: "", ref: "", source: null };
}

function agendaPart(today) {
  const ag = readAgenda();
  const items = [
    ...eventsOn(ag.events, today).map((e) => ({ id: e.id, kind: "event", title: e.title, start: e.allDay ? null : e.startTime, end: e.allDay ? null : e.endTime, color: e.color, done: !!e.done })),
    ...expandRoutines(ag.routines, today, today).map((r) => ({ id: r.key, kind: "routine", title: r.title, start: r.startTime, end: r.endTime, color: r.color, done: false })),
  ].sort((a, b) => (a.start || "00:00").localeCompare(b.start || "00:00"));
  return { items };
}

export async function homeSummary() {
  const today = ymdIn(Date.now());
  const home = readHome();
  const studies = await studiesPart();
  return {
    today,
    serverNow: Date.now(),
    layout: home.layout,
    goals: home.goals,
    tasks: tasksPart(today),
    bills: billsPart(today),
    studies,
    phrase: await phrasePart(today, home),
    agenda: agendaPart(today),
  };
}
