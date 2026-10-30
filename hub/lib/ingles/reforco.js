// Reforço inteligente: olha para TODAS as palavras/expressões marcadas de uma vez, descobre os nichos em que o aluno
// tem dificuldade (ex.: vários "would/could" = verbos modais; muitas formas no passado = passado simples) e monta um
// estudo: mini-lição por tema, exemplos novos, termos relacionados, exercícios intercalados e um texto com áudio.
import fs from "node:fs";
import path from "node:path";
import { askJson, pLimit } from "../atlas/llm.js";
import { synthesizeScript, voicestudioUp, AUDIO_DIR } from "../atlas/tts.js";
import { DATA_DIR, loadLessons } from "./lessons.js";
import { readWords, withSrs } from "./progress.js";
import { cleanTheme, splitSentencesSimple } from "./reforcoPlan.js";

const FILE = path.join(DATA_DIR, "reforco.json");

export function readPlan() {
  let p;
  try { p = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return { status: "idle" }; }
  // "montando" sem trabalho em andamento = o servidor reiniciou no meio: mostra o que já havia e libera o botão
  if (p.status === "building" && !running) return { ...p, status: p.themes ? "ready" : "idle", step: null, error: "A montagem anterior foi interrompida (o servidor reiniciou). Monte de novo." };
  return p;
}
function savePlan(p) {
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(p));
  fs.renameSync(tmp, FILE);
}

const SYSTEM = `Você é professor de inglês de um brasileiro adulto (A2 a B2) e vai montar um estudo de REFORÇO a partir de tudo que ele marcou como difícil.
Princípios: pense como diagnóstico. Itens marcados juntos revelam lacunas: vários modais (would, could, should) = ele precisa do tema "verbos modais", mesmo sem saber o nome; muitas formas no passado = passado simples e irregulares; várias preposições = preposições de lugar/tempo; expressões idiomáticas = chunks e collocations. Nomeie o tema com o termo correto da gramática ou do vocabulário.
Conteúdo: sucinto e preciso, sem clichês de aula de inglês, sem adjetivos de entusiasmo, sem emojis, sem inventar fatos ou citações. Explicações em português do Brasil; exemplos em inglês natural e atual com tradução.`;

const nowIso = () => new Date().toISOString();

async function analyze(items, aulas) {
  const res = await askJson({
    label: "ingles-reforco-diagnostico",
    system: SYSTEM,
    prompt: `ITENS MARCADOS (termo, tipo, frase de origem, tradução, nº de erros na revisão):
${JSON.stringify(items.map((w) => ({ termo: w.word, tipo: w.kind || "", origem: w.context || "", traducao: w.translation || "", erros: w.lapses || 0 })), null, 1)}

AULAS DE GRAMÁTICA DISPONÍVEIS NO APP (id: título):
${aulas.map((a) => `${a.id}: ${a.title}`).join("\n")}

Agrupe os itens em 2 a 6 TEMAS de reforço (um item pode servir a mais de um tema; itens soltos entram num tema de vocabulário). Ordene do tema mais urgente para o menos urgente (mais itens e mais erros primeiro). Para cada tema indique a aula do app mais ligada (ou null).
Escreva também um TEXTO curto (120 a 170 palavras, inglês natural, uma situação do cotidiano adulto) que use o máximo possível dos itens marcados, com tradução.

JSON: {"overview":"2 a 3 frases sobre o que o conjunto revela","themes":[{"title":"","kind":"gramática|vocabulário|expressões|tempo verbal|pronúncia","why":"por que é uma lacuna, citando os itens","items":["termos marcados deste tema"],"lessonLink":"gramatica-aula-NN ou null"}],"text":{"title":"","en":"","pt":"","uses":["termos usados no texto"]}}`,
    effort: "medium",
  });
  return res;
}

async function expandTheme(theme, items) {
  return askJson({
    label: "ingles-reforco-tema",
    system: SYSTEM,
    prompt: `TEMA: ${theme.title} (${theme.kind})
POR QUE: ${theme.why}
ITENS MARCADOS DESTE TEMA: ${JSON.stringify(theme.items)}
OUTROS ITENS MARCADOS (para misturar quando couber): ${JSON.stringify(items.filter((x) => !theme.items.includes(x)).slice(0, 20))}

Produza:
- "lesson": mini-lição em markdown (português, 120 a 220 palavras): a regra ou o padrão, o contraste com o português, o erro típico de brasileiro e quando NÃO usar. Use exemplos curtos em inglês com tradução entre parênteses.
- "examples": 5 frases NOVAS (8 a 18 palavras) que usem os itens marcados em contextos variados; "hit" = trecho exato do item na frase.
- "related": 4 termos NOVOS do mesmo nicho que ele provavelmente ainda não domina (ex.: se marcou would/could, traga might, should, must...), cada um com significado e um exemplo com tradução.
- "exercises": 8 exercícios misturando tipos e cobrindo itens marcados e relacionados:
  "mcq" (prompt em inglês ou português, 4 opções plausíveis, "answer" = índice da correta, "explain" em português),
  "cloze" (frase em inglês com ___ no lugar de UMA palavra ou expressão curta, "answer", "pt" = tradução da frase, "explain"),
  "translate" (frase curta em português, "answer_en" = tradução natural, "accept" = até 2 variações corretas, "explain").

JSON: {"lesson":"","examples":[{"en":"","pt":"","hit":""}],"related":[{"term":"","meaning":"","example_en":"","example_pt":""}],"exercises":[{"type":"mcq","prompt":"","options":["","","",""],"answer":0,"explain":""},{"type":"cloze","en":"","answer":"","pt":"","explain":""},{"type":"translate","pt":"","answer_en":"","accept":[],"explain":""}]}`,
    effort: "medium",
  });
}

/** Áudio (VoiceStudio): frases do texto e exemplos de cada tema num mp3 só, com o tempo de cada frase. */
async function buildAudio(plan, id) {
  if (!(await voicestudioUp())) return null;
  const lines = [];
  const segs = [];
  for (const s of plan.text?.sentences || []) { segs.push({ kind: "text", i: lines.length }); lines.push({ speaker: "A", text: s.en }); }
  plan.themes.forEach((t) => t.examples.forEach((e, k) => { segs.push({ kind: "example", theme: t.id, k }); lines.push({ speaker: "B", text: e.en }); }));
  if (!lines.length) return null;
  const out = await synthesizeScript(id, lines, () => {}, { voiceA: "vs:alloy", voiceB: "vs:nova", speed: 0.95 });
  const timeOf = (pred) => out.times[segs.findIndex(pred)] ?? null;
  return {
    id, file: out.file, duration: out.duration,
    text: segs.filter((s) => s.kind === "text").map((s) => out.times[s.i] ?? null),
    examples: Object.fromEntries(plan.themes.map((t) => [t.id, t.examples.map((_, k) => timeOf((s) => s.kind === "example" && s.theme === t.id && s.k === k))])),
  };
}

let running = null;

/** Começa (ou recomeça) a montar o estudo em segundo plano. A tela acompanha por GET (status/step). */
export function startBuild() {
  const cur = readPlan();
  if (running) return cur;
  const words = readWords().map(withSrs).filter((w) => w.level !== "consolidada");
  if (!words.length) throw new Error("Marque palavras, expressões ou frases no texto antes de montar o reforço.");
  // os mais difíceis primeiro (mais erros, menos repetições), até 60
  const items = words.sort((a, b) => (b.lapses || 0) - (a.lapses || 0) || (a.reps || 0) - (b.reps || 0)).slice(0, 60);
  const base = { ...cur, status: "building", step: "Analisando o que você marcou…", startedAt: nowIso(), error: null, basedOn: items.map((w) => w.id), count: items.length };
  savePlan(base);
  running = (async () => {
    try {
      const aulas = loadLessons().lessons.filter((l) => l.phase === "gramatica").map((l) => ({ id: l.id, title: l.title }));
      const a = await analyze(items, aulas);
      const terms = items.map((w) => w.word);
      const rawThemes = (a.themes || []).slice(0, 6);
      if (!rawThemes.length) throw new Error("A IA não encontrou temas. Tente de novo.");
      savePlan({ ...base, step: `Preparando ${rawThemes.length} temas (lição, exemplos, exercícios)…` });
      const limit = pLimit(3);
      const expanded = await Promise.all(rawThemes.map((t) => limit(() => expandTheme(t, terms).catch(() => ({})))));
      const seenRelated = new Set();
      const themes = rawThemes.map((t, i) => cleanTheme({ ...t, ...expanded[i] }, i, terms, seenRelated)).filter(Boolean).filter((t) => t.lesson || t.exercises.length);
      const sentences = splitSentencesSimple(a.text?.en);
      const ptSentences = splitSentencesSimple(a.text?.pt);
      const plan = {
        status: "ready", builtAt: nowIso(), startedAt: base.startedAt, basedOn: base.basedOn, count: items.length,
        overview: String(a.overview || "").slice(0, 800),
        themes,
        text: a.text?.en ? { title: String(a.text.title || "Texto de reforço").slice(0, 120), en: a.text.en, pt: a.text.pt || "", uses: (a.text.uses || []).slice(0, 40), sentences: sentences.map((en, i) => ({ en, pt: ptSentences.length === sentences.length ? ptSentences[i] : "" })) } : null,
        audio: null,
      };
      savePlan({ ...plan, status: "building", step: "Gerando o áudio (VoiceStudio)…" });
      try {
        plan.audio = await buildAudio(plan, `ingles-reforco-${Date.now()}`);
        if (!plan.audio) plan.audioNote = "VoiceStudio indisponível: o estudo ficou sem áudio. Ligue o VoiceStudio e monte de novo para ter o áudio.";
      } catch (e) {
        plan.audioNote = `Áudio não gerado: ${e.message}`;
      }
      // apaga o mp3 do estudo anterior
      if (cur.audio?.file && cur.audio.file !== plan.audio?.file) fs.rmSync(path.join(AUDIO_DIR, cur.audio.file), { force: true });
      savePlan(plan);
    } catch (e) {
      savePlan({ ...readPlan(), status: cur.themes ? "ready" : "error", step: null, error: e.message || String(e) });
    } finally {
      running = null;
    }
  })();
  return base;
}

export function audioPath(file) {
  if (!/^ingles-reforco-\d+\.mp3$/.test(file || "")) return null;
  const p = path.join(AUDIO_DIR, file);
  return fs.existsSync(p) ? p : null;
}
