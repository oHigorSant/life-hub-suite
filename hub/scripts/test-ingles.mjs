// Testes do módulo Inglês (sem servidor): node scripts/test-ingles.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseLessonText, splitSentences, tokenize, ptScore } from "../lib/ingles/text.js";
import { alignWords, alignFromTimeline } from "../lib/ingles/align.js";
import { kindOfTerm, validateContexts } from "../lib/ingles/terms.js";
import { cleanExercise, cleanTheme } from "../lib/ingles/reforcoPlan.js";
import { grammarTree, BRANCHES } from "../lib/ingles/grammarTree.js";

let ok = 0;
const t = (name, fn) => { try { fn(); ok++; } catch (e) { console.error("FALHOU:", name, "\n ", e.message); process.exitCode = 1; } };

t("ptScore distingue PT de EN", () => {
  assert.ok(ptScore("Ela jogou os feijões pela janela.") > 2);
  assert.ok(ptScore("She threw the beans out of the window.") < 0);
});

t("linha a linha: pares EN/PT, sem cabeçalho nem versão 'com notes'", () => {
  const raw = "CIMV 5.0 | X \n© 2019 | Curso de Inglês\n1 \nX | Part 01 \nTexto linha a linha (sem notes) \n \nOnce upon a time,  \nEra uma vez, \n \nJack went to the market and on the way  \nJack foi ao mercado e no caminho \n \n \nTexto linha a linha (com notes) \n \nOnce upon a time,  \nEra uma vez, \nObserve isto \n";
  const b = parseLessonText(raw, "story");
  assert.equal(b.length, 2);
  assert.deepEqual(b[0], { t: "pair", en: "Once upon a time,", pt: "Era uma vez," });
});

t("linha a linha: tradução quebrada em duas linhas e fim de frase deslocado", () => {
  const raw = "Texto linha a linha\n \nEvery night when they got home,  \nToda noite quando eles chegavam em casa, \n \nHe took after his mother, with olive-toned \nskin. Ele puxava a mãe, com pele morena clara.\n";
  const b = parseLessonText(raw, "story");
  assert.equal(b[0].en, "Every night when they got home,");
  assert.equal(b[0].pt, "Toda noite quando eles chegavam em casa,");
  assert.equal(b[1].en, "He took after his mother, with olive-toned skin.");
});

t("texto corrido: parágrafos viram frases, marca d'água some", () => {
  const raw = "Texto para mineração e treinamento:\n \nThe Jenson family had been camping. They loved to get away. Mr. Smith agreed, saying \"Boo!\" and left. \n \nOTE5ODk3NDI2MA==\n";
  const b = parseLessonText(raw, "mining");
  assert.deepEqual(b.map((x) => x.en), ["The Jenson family had been camping.", "They loved to get away.", "Mr. Smith agreed, saying \"Boo!\" and left."]);
});

t("par quebrado pelo rodapé da página volta a ser par", () => {
  const raw = "Texto linha a linha\n \n\"I see a wonderful thing!\" \n\nCIMV 5.0 | X \n \n© 2019 | Curso de Inglês\n2 \n\"Eu vejo uma coisa maravilhosa!\" \n \n\"What kind of thing?\" asked the farmer. \n\"Que tipo de coisa?\", perguntou o fazendeiro. \n";
  const b = parseLessonText(raw, "story");
  assert.equal(b.length, 2);
  assert.equal(b[0].t, "pair");
  assert.match(b[0].pt, /maravilhosa/);
});

t("tradução enfiada no meio da frase em inglês é removida", () => {
  const raw = "Texto para mineração e treinamento:\n \nLater that evening I had a biopsy, Mais tarde naquela noite eu fiz uma biópsia, where they stuck an endoscope down my throat. \n";
  assert.equal(parseLessonText(raw, "mining")[0].en, "Later that evening I had a biopsy, where they stuck an endoscope down my throat.");
});

t("frase cortada pela quebra de página é reunida", () => {
  const raw = "Texto Completo\nThe King sent a message to every city and \n \nCIMV 5.0 | X\n© 2019 | Curso\n2 \ntown, offering a prize. He waited.\n";
  const b = parseLessonText(raw, "complete");
  assert.equal(b[0].en, "The King sent a message to every city and town, offering a prize.");
});

t("IPA quebrado em duas linhas e sem barra final", () => {
  const b = parseLessonText("communication /kəˌmjuːnɪ\nˈkeɪʃn/ \nconfusion /kənˈfjuːʒn\n", "pronunciation").filter((x) => x.t === "word");
  assert.deepEqual(b.map((x) => x.ipa), ["/kəˌmjuːnɪˈkeɪʃn/", "/kənˈfjuːʒn/"]);
});

t("expressões: tipo do termo e validação dos contextos gerados por IA", () => {
  assert.equal(kindOfTerm("cow"), "word");
  assert.equal(kindOfTerm("call off"), "expr");
  assert.equal(kindOfTerm("What have you been up to?"), "expr");
  const ok = validateContexts({ contexts: [
    { en: "They had to call off the match because of the storm.", pt: "Eles tiveram de cancelar o jogo.", hit: "call off", register: "neutro" },
    { en: "The meeting was cancelled.", pt: "A reunião foi cancelada.", hit: "call off" },      // não contém o termo
    { en: "She called off the wedding last week.", pt: "Ela cancelou o casamento.", hit: "called off" },
    { en: "We call off.", pt: "" },                                                              // sem tradução
  ] }, "call off");
  assert.deepEqual(ok.map((c) => c.hit), ["call off", "called off"]);
});

t("splitSentences respeita abreviações", () => {
  assert.equal(splitSentences("Dr. Brown met Mrs. Green. They talked.").length, 2);
});

t("pronúncia: palavra + IPA", () => {
  const b = parseLessonText("Initial TH \n \nthrough /θruː/ \nthink /θɪŋk/ \n", "pronunciation");
  assert.deepEqual(b.filter((x) => x.t === "word").map((x) => x.en), ["through", "think"]);
});

t("tokenize mantém apóstrofo e hífen", () => {
  assert.deepEqual(tokenize("Jack's well-known cow, 5 beans").map((x) => x.w), ["Jack's", "well-known", "cow", "5", "beans"]);
});

t("alignWords: tempos por palavra, tolera palavra extra e faltante", () => {
  const text = ["once", "upon", "a", "time", "there", "lived", "a", "poor", "widow"];
  const heard = [["Once", 0.1, 0.4], ["upon", 0.4, 0.7], ["a", 0.7, 0.8], ["time", 0.8, 1.2], ["um", 1.2, 1.3], ["there", 1.4, 1.7], ["lived", 1.7, 2.1], ["poor", 2.4, 2.8], ["widow", 2.8, 3.3]];
  const { spans, coverage } = alignWords(text, heard, 3.5);
  assert.equal(spans.length, 18);
  assert.equal(spans[0], 0.1);
  assert.equal(spans[2 * 4], 1.4); // "there"
  assert.ok(spans[2 * 6] >= 2.1 && spans[2 * 6 + 1] <= 2.4 + 1e-6, "a (sem par) fica entre lived e poor");
  assert.ok(coverage >= 0.8);
  for (let i = 1; i < 9; i++) assert.ok(spans[2 * i] >= spans[2 * i - 1] - 1e-6, "monotônico");
});

t("alignFromTimeline: palavras dividem o trecho de cada bloco", () => {
  const toks = [{ b: 2, k: "i" }, { b: 2, k: "am" }, { b: 5, k: "you" }, { b: 5, k: "are" }, { b: 5, k: "here" }];
  const { spans, coverage } = alignFromTimeline(toks, [[2, 0, 1], [5, 2, 4]]);
  assert.equal(coverage, 1);
  assert.equal(spans[0], 0);
  assert.equal(spans[3], 1);              // fim do bloco 2
  assert.equal(spans[4], 2);              // começo do bloco 5
  assert.equal(spans[9], 4);              // fim da última palavra
  for (let i = 1; i < 5; i++) assert.ok(spans[2 * i] >= spans[2 * i - 1] - 1e-9);
});

t("reforço: exercícios inválidos da IA são descartados; termos já marcados não voltam como 'novos'", () => {
  assert.equal(cleanExercise({ type: "mcq", prompt: "Pick", options: ["a", "b", "c", "d"], answer: 4 }), null); // índice fora
  assert.equal(cleanExercise({ type: "mcq", prompt: "Pick", options: ["a", "a", "b"], answer: 0 }), null);       // opções repetidas
  assert.ok(cleanExercise({ type: "mcq", prompt: "Pick", options: ["a", "b", "c"], answer: 2 }));
  assert.equal(cleanExercise({ type: "cloze", en: "She can swim.", answer: "can" }), null);                      // sem lacuna
  assert.equal(cleanExercise({ type: "cloze", en: "She ____ swim.", answer: "can" }).en, "She ___ swim.");
  assert.equal(cleanExercise({ type: "translate", pt: "Ela pode nadar.", answer_en: "She can swim." }).answer, "She can swim.");
  const th = cleanTheme({ title: "Modais", items: ["would"], related: [{ term: "would" }, { term: "might", meaning: "talvez" }], exercises: [{ type: "mcq", prompt: "x", options: ["a", "b", "c"], answer: 1 }], lessonLink: "gramatica-aula-18" }, 0, ["would"]);
  assert.deepEqual(th.related.map((r) => r.term), ["might"]);
  assert.equal(th.exercises[0].id, "rf:t1:0");
  assert.equal(th.lessonLink, "gramatica-aula-18");
});

t("trilha de gramática: árvore sem ciclos, nível pelo maior caminho de pré-requisitos", () => {
  const nums = Array.from({ length: 42 }, (_, i) => i + 1);
  const tree = grammarTree(nums);
  for (const n of nums) for (const p of tree[n].prereqs) assert.ok(tree[p].tier < tree[n].tier, `aula ${n} depende de ${p}`);
  assert.equal(tree[1].tier, 0);
  assert.ok(BRANCHES.includes(tree[29].branch));
  assert.deepEqual(grammarTree([2, 6, 17])[17].prereqs, []); // pré-requisito ausente não trava a aula
});

// ---- progresso em pasta temporária
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ing-"));
fs.mkdirSync(path.join(tmp, "data", "ingles"), { recursive: true });
fs.copyFileSync("data/ingles/lessons.json", path.join(tmp, "data", "ingles", "lessons.json"));
const cwd = process.cwd();
process.chdir(tmp);
const P = await import("../lib/ingles/progress.js?t=" + Date.now());
const L = await import("../lib/ingles/lessons.js?t=" + Date.now());
const first = L.loadLessons().lessons.find((l) => l.kind === "story");
const second = L.loadLessons().lessons.find((l) => l.group === first.group && l.part === first.part + 1);

t("lição inicial disponível, a seguinte travada", () => {
  const { state } = P.computeState();
  assert.equal(state[first.id].status, "available");
  assert.equal(state[second.id].status, "locked");
});

t("evidência fraca não aprova; 3 acertos distintos aprovam e destravam a próxima", () => {
  P.recordAttempt({ lesson: first.id, type: "cloze", key: "c:0", score: 1, difficulty: 3 });
  P.recordAttempt({ lesson: first.id, type: "cloze", key: "c:1", score: 1, difficulty: 3 });
  assert.equal(P.computeState().state[first.id].passed, false);
  P.recordAttempt({ lesson: first.id, type: "dictation", key: "d:0", score: 1, difficulty: 4 });
  P.recordAttempt({ lesson: first.id, type: "dictation", key: "d:1", score: 1, difficulty: 4 });
  const s = P.computeState().state;
  assert.equal(s[first.id].passed, true, "mastery " + s[first.id].mastery);
  assert.equal(s[second.id].status, "available");
});

t("dominado exige 5 itens distintos e acerto difícil", () => {
  for (let i = 0; i < 8; i++) P.recordAttempt({ lesson: first.id, type: "dictation", key: "x:" + i, score: 1, difficulty: 4 });
  assert.equal(P.computeState().state[first.id].mastered, true);
});

t("XP segue a regra do Atlas: round(nota·10·dificuldade)", () => {
  const r = P.recordAttempt({ lesson: second.id, type: "cloze", key: "z", score: 0.5, difficulty: 4 });
  assert.equal(r.xp, 20);
});

t("marcar como já estudada aprova sem exercícios", () => {
  const third = L.loadLessons().lessons.find((l) => l.group === first.group && l.part === second.part + 1);
  P.setManualDone(second.id, true);
  assert.equal(P.computeState().state[second.id].passed, true);
  assert.equal(P.computeState().state[third.id].status, "available");
});

t("SM-2 das palavras: acertar adia, errar volta em 10 min", () => {
  P.writeWords([{ id: "w1", word: "cow", lessonId: first.id, createdAt: new Date().toISOString() }]);
  const a = P.reviewWord("w1", 2);
  assert.ok(a.due > Date.now() + 3600e3);
  const b = P.reviewWord("w1", 0);
  assert.ok(b.due < Date.now() + 11 * 60e3);
});

t("overview: nível, fases, plano de hoje", () => {
  const o = P.overview();
  assert.ok(o.xp > 0 && o.level.n >= 1);
  assert.equal(o.phases.length, 7);
  assert.ok(o.plan.picks.length >= 1);
  assert.ok(o.streak >= 1);
});

process.chdir(cwd);
console.log(`${ok} testes ok`);
