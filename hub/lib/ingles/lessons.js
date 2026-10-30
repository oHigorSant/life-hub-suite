// Normaliza data/ingles/catalog.json (varredura crua das pastas do curso) em data/ingles/lessons.json:
// ordem correta do curso, grupos (história = série de partes), áudios ordenados por voz e texto em blocos limpos.
import fs from "node:fs";
import path from "node:path";
import { parseLessonText, lessonTokens } from "./text.js";
import { grammarTree } from "./grammarTree.js";

export const DATA_DIR = path.join(process.cwd(), "data", "ingles");
export const LESSONS_FILE = path.join(DATA_DIR, "lessons.json");

const PHASES = [
  { key: "01", id: "fundacao", name: "Fundação", goal: "Compreensão de histórias com texto linha a linha e áudio" },
  { key: "02", id: "mineracao", name: "Mineração", goal: "Textos longos: minerar vocabulário e treinar a escuta" },
  { key: "04", id: "transicao", name: "Transição", goal: "Pronúncia dos sons do inglês" },
  { key: "05", id: "monolingue", name: "Monolingue", goal: "Pronúncia e escuta sem apoio do português" },
  { key: "Bônus - Curso de Phrasal", id: "phrasal", name: "Phrasal Verbs", goal: "Phrasal verbs avançados em contexto" },
  { key: "Bônus - Dominando", id: "sons", name: "Dominando a Pronúncia", goal: "Os sons da língua inglesa, aula a aula" },
  { key: "__gramatica", id: "gramatica", name: "Gramática", goal: "A Jornada do Autodidata: explicação em português e frases para treinar" },
];
const phaseOf = (name) => PHASES.findIndex((p) => name.startsWith(p.key));

const num = (s) => { const m = String(s).match(/(\d+)/g); return m ? parseInt(m[m.length - 1], 10) : null; };
const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isComplete = (...s) => s.some((x) => /complet/i.test(x || ""));

function groupTitleOf(c) {
  const pdf = (c.texts?.[0]?.name || c.pdfs?.[0] || "").replace(/\.pdf$/i, "");
  let t = pdf.replace(/^PDF\s+/i, "").replace(/\s*(Texto\s+)?Complet[oa]s?\s*$/i, "").replace(/\s+0*\d+$/, "").trim();
  if (!t || /^(Os sons|O som|Sons)/i.test(t)) t = c.module.split("\\").pop().replace(/\s+0*\d+$/, "").trim();
  t = t.replace(/\s{2,}/g, " ");
  return /^Steve Jobs$/i.test(t) ? "Steve Jobs Commencement Address" : t;
}

function voiceOf(name) {
  let m = name.match(/\((American|British) English ([^)]+)\)/i);
  if (m) return { voice: m[2], accent: m[1].toLowerCase().startsWith("a") ? "americano" : "britânico" };
  const base = name.replace(/\.mp3$/i, "").replace(/\s*Complete Audio$/i, "");
  m = base.match(/\s([A-Z][a-z]+)$/);
  if (m && !/^(Audio|Completo|Lesson)$/i.test(m[1])) return { voice: m[1], accent: null };
  return { voice: "Narração", accent: null };
}

function kindOf(c, text) {
  if (c.phase.startsWith("Bônus - Curso de Phrasal")) return "phrasal";
  if (c.phase.startsWith("Bônus - Dominando")) return "lecture";
  if (/Pronunciation Lesson/i.test(c.module)) return "pronunciation";
  if (isComplete(c.module, c.texts?.[0]?.name)) return "complete";
  const first = text.search(/Texto (linha a linha|para minera|para treinamento)/i);
  if (first >= 0 && /^Texto linha a linha/i.test(text.slice(first))) return "story";
  return "mining";
}

/** Trilha de gramática (A Jornada do Autodidata): aulas já extraídas, com áudio gerado pelo VoiceStudio. */
function grammarLessons(gram, offset) {
  const aulas = (gram?.aulas || []).slice().sort((a, b) => a.num - b.num);
  if (!aulas.length) return null;
  const gid = "gramatica-jornada-do-autodidata";
  const idOf = (n) => `gramatica-aula-${String(n).padStart(2, "0")}`;
  const tree = grammarTree(aulas.map((a) => a.num));
  const lessons = aulas.map((a) => {
    const tokens = lessonTokens(a.blocks).length;
    const t = tree[a.num];
    return {
      id: idOf(a.num), group: gid, phase: "gramatica", kind: "grammar", part: a.num,
      branch: t.branch, tier: t.tier, prereqs: t.prereqs.map(idOf),
      title: `Aula ${String(a.num).padStart(2, "0")} · ${a.title}`, groupTitle: "A Jornada do Autodidata", source: `Jornada, p. ${a.pages[0]}-${a.pages[1]}`,
      audios: (a.audios || []).map((x) => ({ file: x.file, voice: x.voice, accent: null, label: x.label || x.voice, timeline: x.timeline })),
      blocks: a.blocks, words: tokens, minutes: Math.max(10, Math.round(tokens / 40)),
    };
  });
  return { group: { id: gid, phase: "gramatica", title: "A Jornada do Autodidata", kind: "grammar", lessons: lessons.map((l) => l.id) }, lessons };
}

export function buildLessons(catalog, gram = null) {
  const raw = catalog.map((c, idx) => {
    const text = (c.texts || []).find((t) => (t.content || "").length > 200)?.content || c.texts?.[0]?.content || "";
    const kind = kindOf(c, text);
    const phaseIdx = phaseOf(c.phase);
    const modNum = num((c.module.match(/M[óo]dulo\s*\d+/i) || [""])[0]) ?? 0;
    const last = c.module.split("\\").pop();
    let group, part;
    if (kind === "pronunciation") { group = "Lições de pronúncia"; part = num(last.replace(/^\d+\s*-\s*/, "")) ?? 0; }
    else if (kind === "phrasal") { group = "Phrasal verbs avançados"; part = num(last) ?? idx; }
    else if (kind === "lecture") { group = "Dominando a pronúncia do inglês"; part = num((last.match(/Aula\s*(\d+)/i) || [])[1]) ?? idx; }
    else {
      group = groupTitleOf(c);
      part = kind === "complete" ? 999 : num(c.texts?.[0]?.name?.replace(/\.pdf$/i, "")) ?? num(last) ?? 0;
    }
    return { c, text, kind, phaseIdx, modNum, group, part, idx };
  });

  // grupos: a história que cruza pastas (Jack Hannaford) vale pelo menor módulo; título com mais maiúsculas
  const groups = new Map();
  for (const r of raw) {
    const key = `${r.phaseIdx}|${slug(r.group)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, phaseIdx: r.phaseIdx, title: r.group, modNum: r.modNum, kind: r.kind === "complete" ? "story" : r.kind, members: [], first: r.idx }));
    g.modNum = Math.min(g.modNum, r.modNum);
    g.members.push(r);
    if ((r.group.match(/[A-Z]/g) || []).length > (g.title.match(/[A-Z]/g) || []).length) g.title = r.group;
    if (r.kind !== "complete") g.kind = r.kind;
  }
  const orderedGroups = [...groups.values()].sort((a, b) => a.phaseIdx - b.phaseIdx || a.modNum - b.modNum || a.first - b.first);

  const lessons = [];
  const outGroups = [];
  for (const g of orderedGroups) {
    g.members.sort((a, b) => a.part - b.part || a.idx - b.idx);
    const gid = `${PHASES[g.phaseIdx].id}-${slug(g.title)}`;
    const ids = [];
    for (const r of g.members) {
      const { c } = r;
      const lastSeg = c.module.split("\\").pop();
      let title;
      if (r.kind === "complete") title = "Texto completo";
      else if (r.kind === "pronunciation") title = `Aula ${String(r.part).padStart(2, "0")} · ${lastSeg.replace(/^\d+\s*-\s*/, "").replace(/^Pronunciation Lesson \d+\s*-\s*/i, "")}`;
      else if (r.kind === "phrasal") title = `Lesson ${String(r.part).padStart(2, "0")}`;
      else if (r.kind === "lecture") title = lastSeg.replace(/^Aula\s*(\d+)\s*-\s*/i, (_, n) => `Aula ${n} · `);
      else title = `Parte ${String(r.part).padStart(2, "0")}`;

      // áudios: some os desgarrados (ex.: "08" dentro da pasta "09") e ordena por voz
      let audios = c.audios.map((a) => ({ file: a.name, ...voiceOf(a.name) }));
      if (r.kind === "story" || r.kind === "mining") {
        const fit = audios.filter((a) => { const n = (a.file.match(/\s0*(\d+)\s+[A-Z][a-z]+\.mp3$/) || [])[1]; return !n || parseInt(n, 10) === r.part; });
        if (fit.length) audios = fit;
      }
      audios.sort((a, b) => (a.accent === b.accent ? 0 : a.accent === "americano" ? -1 : 1) || a.voice.localeCompare(b.voice));
      audios.forEach((a) => { a.label = a.accent ? `${a.voice} (${a.accent})` : a.voice; });

      const blocks = parseLessonText(r.text, r.kind);
      const tokens = lessonTokens(blocks).length;
      const id = `${gid}-${r.kind === "complete" ? "completo" : String(r.part).padStart(2, "0")}`;
      ids.push(id);
      lessons.push({
        id, group: gid, phase: PHASES[g.phaseIdx].id, kind: r.kind, part: r.part, title, groupTitle: g.title,
        source: c.module, audios, blocks, words: tokens, minutes: Math.max(4, Math.round(tokens / 90)),
      });
    }
    outGroups.push({ id: gid, phase: PHASES[g.phaseIdx].id, title: g.title, kind: g.kind, lessons: ids });
  }
  const g = grammarLessons(gram);
  if (g) { outGroups.push(g.group); lessons.push(...g.lessons); }
  lessons.forEach((l, i) => { l.order = i; });
  return { version: 2, builtAt: new Date().toISOString(), phases: PHASES.map((p) => ({ id: p.id, name: p.name, goal: p.goal })), groups: outGroups, lessons };
}

let cache = null;
export function loadLessons() {
  const st = fs.statSync(LESSONS_FILE);
  if (cache && cache.mtime === st.mtimeMs) return cache.data;
  const data = JSON.parse(fs.readFileSync(LESSONS_FILE, "utf8"));
  data.byId = new Map(data.lessons.map((l) => [l.id, l]));
  cache = { mtime: st.mtimeMs, data };
  return data;
}
