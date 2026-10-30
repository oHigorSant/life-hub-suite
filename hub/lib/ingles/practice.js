// Geração de exercícios a partir do texto da lição (sem IA): lacunas, ditado, tradução e ordenação.
// Os blocos que o aluno mais errou (ou nunca viu) vêm primeiro; a dificuldade segue o nível do aluno (studentLevel).
import fs from "node:fs";
import path from "node:path";
import { loadLessons, DATA_DIR } from "./lessons.js";
import { lessonTokens } from "./text.js";
import { readProgress, studentLevel, computeState } from "./progress.js";

const STOP = new Set("the and but for with that this was were are you his her its our they them then than what when where who whom have has had not from into out over after before there their about would could should will can just very also some any all one two been being does did done said say says".split(" "));

export function loadAlign(lessonId) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "align", lessonId + ".json"), "utf8")); } catch { return null; }
}

/** Escolhe a melhor trilha de tempo da lição: a do áudio pedido, ou a de maior cobertura. */
export function pickTrack(align, file) {
  if (!align) return null;
  const entries = Object.entries(align.audios);
  const one = file && align.audios[file] ? [file, align.audios[file]] : entries.sort((a, b) => b[1].coverage - a[1].coverage)[0];
  return one ? { file: one[0], ...one[1] } : null;
}

export function blockSegment(toks, spans, bi) {
  let a = -1, z = -1;
  for (let i = 0; i < toks.length; i++) if (toks[i].b === bi && toks[i].f === "en") { if (a < 0) a = i; z = i; }
  if (a < 0) return null;
  return [Math.max(0, +(spans[2 * a] - 0.12).toFixed(2)), +(spans[2 * z + 1] + 0.18).toFixed(2)];
}

function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Quais tipos de exercício a lição comporta. */
export function availableTypes(lesson, track) {
  const blocks = lesson.blocks;
  const aligned = !!track && track.coverage >= 0.55;
  const long = blocks.filter((b) => (b.t === "pair" || b.t === "sent") && b.en.split(/\s+/).length >= 6);
  return {
    cloze: long.length >= 3,
    dictation: aligned && blocks.filter((b) => ["pair", "sent", "word"].includes(b.t)).length >= 3,
    translate: blocks.filter((b) => b.t === "pair").length >= 4,
    order: blocks.filter((b) => (b.t === "pair" || b.t === "sent") && b.en.split(/\s+/).length >= 4 && b.en.split(/\s+/).length <= 11).length >= 3,
  };
}

export function buildPractice(lessonId, type, { n = 8, file } = {}) {
  const data = loadLessons();
  const lesson = data.byId.get(lessonId);
  if (!lesson) throw new Error("Lição desconhecida");
  const { state } = computeState();
  const lvl = state[lessonId].level;
  const toks = lessonTokens(lesson.blocks);
  const track = pickTrack(loadAlign(lessonId), file);
  const prog = readProgress();
  const last = new Map();
  for (const a of prog.attempts) if (a.lesson === lessonId) last.set(a.key, a.score);
  const order = (items, keyOf) => shuffle(items).sort((x, y) => (last.has(keyOf(x)) ? last.get(keyOf(x)) : -1) - (last.has(keyOf(y)) ? last.get(keyOf(y)) : -1));

  const items = [];
  const bl = lesson.blocks.map((b, bi) => ({ b, bi }));
  if (type === "cloze") {
    const pool = bl.filter(({ b }) => (b.t === "pair" || b.t === "sent") && b.en.split(/\s+/).length >= 6);
    for (const { b, bi } of order(pool, (x) => `cloze:${x.bi}`).slice(0, n)) {
      const words = [...b.en.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)];
      const cand = shuffle(words.filter((m) => m[0].length >= 4 && !STOP.has(m[0].toLowerCase())));
      const chosen = [];
      for (const m of cand) {
        if (chosen.length >= lvl.blanks) break;
        if (chosen.every((c) => Math.abs(c.index - m.index) > m[0].length + 3)) chosen.push(m);
      }
      chosen.sort((a, z) => a.index - z.index);
      if (!chosen.length) continue;
      const parts = [];
      let at = 0;
      chosen.forEach((m, k) => {
        parts.push({ text: b.en.slice(at, m.index) });
        parts.push({ blank: k, answer: m[0], hint: m[0][0] + "…" + m[0].length });
        at = m.index + m[0].length;
      });
      parts.push({ text: b.en.slice(at) });
      items.push({ id: `cloze:${bi}`, type, block: bi, difficulty: Math.min(4, 2 + chosen.length), parts, pt: b.pt || null, seg: track && track.coverage >= 0.55 ? blockSegment(toks, track.spans, bi) : null });
    }
  } else if (type === "dictation") {
    if (!track || track.coverage < 0.55) return { items: [], track: null, level: lvl };
    const pool = bl.filter(({ b }) => ["pair", "sent", "word"].includes(b.t) && b.en.split(/\s+/).length <= 18);
    for (const { b, bi } of order(pool, (x) => `dict:${x.bi}`).slice(0, n)) {
      const seg = blockSegment(toks, track.spans, bi);
      if (!seg || seg[1] - seg[0] < 0.3 || seg[1] - seg[0] > 20) continue;
      items.push({ id: `dict:${bi}`, type, block: bi, difficulty: b.en.split(/\s+/).length > 8 ? 5 : 4, expected: b.en, seg });
    }
  } else if (type === "translate") {
    const pairs = bl.filter(({ b }) => b.t === "pair");
    const all = pairs.map(({ b }) => b);
    const toEn = lvl.name === "iniciante";
    for (const { b, bi } of order(pairs, (x) => `tr:${x.bi}`).slice(0, n)) {
      const same = toEn ? "en" : "pt";
      const others = shuffle(all.filter((o) => o !== b && Math.abs(o[same].length - b[same].length) < Math.max(25, b[same].length * 0.6))).slice(0, 3);
      if (others.length < 3) continue;
      const opts = shuffle([b, ...others]);
      items.push({
        id: `tr:${bi}`, type, block: bi, difficulty: toEn ? 2 : 3,
        prompt: toEn ? b.pt : b.en, promptLang: toEn ? "pt" : "en",
        options: opts.map((o) => o[same]), answer: opts.indexOf(b),
        seg: !toEn && track && track.coverage >= 0.55 ? blockSegment(toks, track.spans, bi) : null,
      });
    }
  } else if (type === "order") {
    const pool = bl.filter(({ b }) => (b.t === "pair" || b.t === "sent") && b.en.split(/\s+/).length >= 4 && b.en.split(/\s+/).length <= 11);
    for (const { b, bi } of order(pool, (x) => `ord:${x.bi}`).slice(0, n)) {
      const words = b.en.split(/\s+/);
      let sh = shuffle(words);
      if (sh.join(" ") === words.join(" ")) sh = shuffle(words);
      items.push({ id: `ord:${bi}`, type, block: bi, difficulty: 3, words: sh, expected: b.en, pt: b.pt || null });
    }
  } else throw new Error("Tipo de exercício desconhecido");
  return { items, track: track ? { file: track.file, coverage: track.coverage } : null, level: lvl };
}
