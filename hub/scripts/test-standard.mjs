// node scripts/test-standard.mjs — o lint do padrão de conteúdo (lib/contentStandard.js) e a presença do padrão nos prompts.
import assert from "node:assert/strict";
import fs from "node:fs";
import { pickBalanced } from "../lib/atlas/mockPick.js";
import { lintContent, CONTENT_STANDARD, STUDY_STANDARD, LESSON_METHOD, ROADMAP_STANDARD, crivoPrompt, factCheckPrompt, unknownIdentifiers } from "../lib/contentStandard.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("pega verborragia, analogia, entusiasmo e clichê", () => {
  const bad = "Imagine que a memória é como uma gaveta. Neste artigo vamos mergulhar num tema fascinante. É importante notar que, em resumo, a maçã cai.";
  const rules = lintContent(bad).violations.map((v) => v.rule);
  for (const r of ["gancho 'imagine'", "analogia 'é como'", "adjetivo de entusiasmo", "chamada 'vamos'", "metadiscurso", "enchimento ('é importante notar')", "fecho vazio", "exemplo clichê"]) assert.ok(rules.includes(r), `faltou ${r}: ${rules}`);
});

t("texto técnico limpo não é acusado", () => {
  const good = "## Núcleo\nO teorema CAP (Brewer, 2000; prova de Gilbert e Lynch, 2002) afirma que, sob partição de rede, um sistema distribuído escolhe entre consistência e disponibilidade. Em 2012 o próprio Brewer qualificou a leitura 'dois de três'.";
  assert.deepEqual(lintContent(good).violations, []);
});

t("conta palavras e detecta emoji", () => {
  assert.equal(lintContent("um dois três").words, 3);
  assert.ok(lintContent("ok \u{1F600}").violations.some((v) => v.rule === "emoji"));
});

t("o padrão traz os pilares pedidos", () => {
  for (const k of ["maiores nomes", "história", "casos reais", "sênior", "analogia", "Autoverificação"]) assert.ok(new RegExp(k, "i").test(STUDY_STANDARD), k);
  assert.match(CONTENT_STANDARD, /Sucinto/);
  assert.match(LESSON_METHOD, /Fontes canônicas/);
  assert.match(crivoPrompt("lição", "texto", { words: 10, violations: [{ rule: "x", match: "y" }] }), /Violações detectadas/);
});

t("o padrão está ligado a todo caminho de geração", () => {
  const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  assert.match(read("lib/atlas/llm.js"), /\$\{STUDY_STANDARD\}/); // toda chamada do Atlas (lição, quiz, trilha, chat, podcast, ingest)
  assert.match(read("lib/atlas/activities.js"), /await crivo\("lição"/);
  assert.match(read("lib/atlas/activities.js"), /LESSON_METHOD/);
  assert.match(read("lib/agent/engines/prompts.js"), /CONTENT_STANDARD/); // motores de API do agente geral
  assert.match(read("lib/agent/hubAgent.js"), /CONTENT_STANDARD/); // Claude
  assert.doesNotMatch(read("lib/atlas/activities.js"), /analogias e exemplos do dia a dia/);
});

t("o padrão de trilha cobre estrutura canônica, fundamento antes de sistema e capstone", () => {
  for (const k of ["maiores nomes", "Fundamento antes de aplicação", "Título específico", "Capstone", "do sistema", "do domínio", "Atualidade"]) assert.match(ROADMAP_STANDARD, new RegExp(k, "i"), k);
  const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  assert.match(read("lib/atlas/roadmap.js"), /\$\{ROADMAP_STANDARD\}/); // criar e estender trilha
});

t("a lição passa por revisão de fatos e separa fato do sistema de conhecimento da área", () => {
  const p = factCheckPrompt("## Núcleo\ntexto", "material");
  assert.match(p, /Afirmação sobre um sistema que não esteja no MATERIAL deve sair/);
  const src = fs.readFileSync(new URL("../lib/atlas/activities.js", import.meta.url), "utf8");
  assert.match(src, /await factCheck\(ctx, r\.markdown\)/);
  assert.match(src, /REGRA DE FONTES/);
});

t("identificadores técnicos que não estão no material são marcados", () => {
  const material = "A tabela tb_registros define o destino; o padrão é tb_{tipo}_{REG} e a carga usa usp_Arquivo.";
  assert.deepEqual(unknownIdentifiers("Usa `tb_registros`, tb_{tipo}_{REG} e usp_Arquivo, mas grava em tb_ecd_I050 via usp_Carga.", material).sort(), ["tb_ecd_I050", "usp_Carga"]);
  assert.match(factCheckPrompt("x", material, ["tb_ecd_I050"]), /NÃO APARECEM NO MATERIAL.*tb_ecd_I050/);
});

t("a extração de conceitos não completa padrões com exemplos inventados", () => {
  const src = fs.readFileSync(new URL("../lib/atlas/ingest.js", import.meta.url), "utf8");
  assert.match(src, /LITERALMENTE no trecho/);
});

t("o quiz é calibrado pelo nível do aluno e só cobra o que a lição ensinou", () => {
  const src = fs.readFileSync(new URL("../lib/atlas/activities.js", import.meta.url), "utf8");
  assert.match(src, /export function studentLevel/);
  assert.match(src, /PRIMEIRO CONTATO com este nó/); // iniciante: no máximo dificuldade 3
  assert.match(src, /maxDiff: 3/);
  assert.match(src, /O QUE FOI ENSINADO NESTE NÓ/);
  assert.match(src, /Proibido cobrar nome interno, versão, caminho de pasta/);
  assert.doesNotMatch(src, /com pelo menos 40% em 4-5/); // a regra antiga que tornava o primeiro quiz difícil
});

t("simulado: completa o total pedido mesmo quando só alguns nós têm questão", () => {
  const mk = (node, i) => ({ id: `${node}-${i}`, node_id: node });
  const ranked = [...Array.from({ length: 30 }, (_, i) => mk("a", i))]; // 30 questões em 1 nó (de 10 no escopo)
  assert.equal(pickBalanced(ranked, 20).length, 20); // antes: 4
  const two = [...Array.from({ length: 15 }, (_, i) => mk("a", i)), ...Array.from({ length: 15 }, (_, i) => mk("b", i))];
  const p = pickBalanced(two, 20); assert.equal(p.length, 20);
  assert.ok(p.filter((q) => q.node_id === "a").length >= 8 && p.filter((q) => q.node_id === "b").length >= 8); // equilibrado
  assert.equal(pickBalanced(ranked.slice(0, 5), 20).length, 5); // banco pequeno: devolve o que há
});

console.log(`\n${n} testes passaram`);
