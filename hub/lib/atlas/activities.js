import { db, now, uid, j, parse, tx, logEvent } from "./db.js";
import { askJson, askText } from "./llm.js";
import { runJob } from "./jobs.js";
import { computeTree, schedule } from "./progress.js";
import { scopeFor } from "./scope.js";
import { synthesizeScript } from "./tts.js";
import { pickBalanced } from "./mockPick.js";
import { STUDY_STANDARD, LESSON_METHOD, lintContent, crivoPrompt, factCheckPrompt, unknownIdentifiers } from "../contentStandard.js";

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export const ACTIVITY_TYPES = {
  lesson: { label: "Lição", desc: "Explicação clara ancorada no seu material" },
  reading: { label: "Leitura guiada", desc: "Onde ler nas suas fontes, com perguntas-guia" },
  exercise: { label: "Exercícios", desc: "Problemas práticos com resolução e rubrica" },
  quiz: { label: "Quiz desafiador", desc: "Questões que só passa quem domina de verdade" },
  flashcards: { label: "Flashcards", desc: "Cartões com repetição espaçada" },
  podcast: { label: "Podcast", desc: "Conversa em áudio sobre o tema" },
  mock: { label: "Simulado", desc: "Prova cronometrada do ramo" },
  project: { label: "Projeto", desc: "Desafio integrador com rubrica" },
};

// ------------------------------------------------------------------ contexto ancorado

export function nodeContext(nodeId, { maxChars = 26000 } = {}) {
  const node = db().prepare("SELECT * FROM nodes WHERE id=?").get(nodeId);
  const subject = db().prepare("SELECT * FROM subjects WHERE id=?").get(node.subject_id);
  const concepts = db()
    .prepare("SELECT c.* FROM node_concepts nc JOIN concepts c ON c.id=nc.concept_id WHERE nc.node_id=? ORDER BY c.importance DESC")
    .all(nodeId);
  // Só o trecho em que ESTE nó é ensinado (nunca menções posteriores nem partes avançadas do material)
  let chunks = db()
    .prepare(
      `SELECT c.id, c.locator, c.heading, c.text, s.title AS source FROM node_chunks nc JOIN chunks c ON c.id=nc.chunk_id
       JOIN sources s ON s.id=c.source_id WHERE nc.node_id=? ORDER BY c.source_id, c.ord`
    )
    .all(nodeId);
  let size = 0;
  chunks = chunks.filter((c) => (size += c.text.length) <= maxChars);
  const labels = {};
  const body = chunks
    .map((c, i) => {
      const lab = `S${i + 1}`;
      labels[lab] = { source: c.source, locator: c.locator, chunk_id: c.id };
      return `[${lab}] ${c.source} — ${c.locator}${c.heading ? ` — ${c.heading}` : ""}\n${c.text}`;
    })
    .join("\n\n");
  const scope = scopeFor(nodeId);
  const head =
    `ÁREA: ${subject.title} | OBJETIVO DO ALUNO: ${subject.goal || "dominar a área"} | NÍVEL ALVO: ${subject.target_level || "ápice"}\n` +
    `NÓ: ${node.title} (ramo: ${node.branch}, nível ${node.tier + 1})\nRESUMO: ${node.summary || ""}\nOBJETIVOS: ${(parse(node.objectives_json, []) || []).join(" | ")}\n\n` +
    `CONCEITOS DESTE NÓ (o foco de tudo):\n` +
    concepts.map((c) => `- (c${c.id}) ${c.title}: ${c.definition || ""}${c.methodology ? ` | método: ${c.methodology}` : ""}${c.criteria ? ` | critérios: ${c.criteria}` : ""}${c.refs ? ` | refs: ${c.refs}` : ""}`).join("\n") +
    (scope.known.length ? `\n\nJÁ VISTO EM NÍVEIS ANTERIORES (o aluno domina; pode ser pressuposto, mas não é o foco):\n${scope.known.map((k) => `- ${k.title}`).join("\n")}` : "\n\nJÁ VISTO EM NÍVEIS ANTERIORES: nada — este é um ponto de partida; não pressuponha conhecimento além do básico.") +
    (scope.forbidden.length ? `\n\nFORA DE ESCOPO — o aluno AINDA NÃO ESTUDOU isto (é mais avançado ou de outra etapa). É PROIBIDO perguntar, exigir, antecipar ou usar como pressuposto:\n${scope.forbidden.map((t) => `- ${t}`).join("\n")}${scope.forbiddenTotal > scope.forbidden.length ? `\n(… e todo o restante do material que não esteja neste nó nem nos níveis anteriores)` : ""}` : "");
  const text = body
    ? `${head}\n\nMATERIAL DESTE NÍVEL (fonte única de conteúdo; cite como [S#]):\n${body}`
    : `${head}\n\n(Sem material anexado para este nó — use conhecimento consolidado e confiável da área, mantendo-se estritamente no nível e nos conceitos deste nó; não invente citações nem referências.)`;
  return { node, subject, concepts, labels, text, hasSources: chunks.length > 0, scope };
}

/** Segunda passada de qualidade: lint determinístico + reescrita pelo editor quando há violação ou excesso de extensão. */
async function crivo(kind, draft, { maxWords = 1000 } = {}) {
  const text = String(draft || "");
  if (!text) return text;
  const lint = lintContent(text);
  if (!lint.violations.length && lint.words <= maxWords) return text;
  try {
    const out = await askText({ system: `Responda SOMENTE com o texto reescrito, no mesmo formato (markdown), sem comentários.`, prompt: crivoPrompt(kind, text, lint), effort: "medium", label: `crivo:${kind}` });
    const fixed = String(out || "").trim();
    return fixed.length > text.length * 0.35 ? fixed : text; // reescrita vazia ou truncada: mantém o original
  } catch {
    return text;
  }
}

/** Revisão técnica de fatos: corrige o que está errado e rebaixa a "(a confirmar)" o que não se sustenta. Falhou: mantém o texto. */
async function factCheck(ctx, markdown) {
  const text = String(markdown || "");
  if (!text) return { markdown: text, issues: [] };
  try {
    const r = await askJson({ system: "Responda no formato pedido. Seja conservador: na dúvida, marque como a confirmar em vez de afirmar.", prompt: factCheckPrompt(text, ctx.text, unknownIdentifiers(text, ctx.text)), effort: "medium", label: "factcheck:lição" });
    const fixed = String(r?.markdown || "").trim();
    let out = fixed.length > text.length * 0.5 ? fixed : text;
    for (const id of unknownIdentifiers(out, ctx.text)) out = out.split(id).join(`${id} (nome a confirmar)`); // o que o revisor deixou passar vira dúvida explícita
    return { markdown: out, issues: Array.isArray(r?.issues) ? r.issues.slice(0, 20) : [] };
  } catch {
    return { markdown: text, issues: [] };
  }
}
const BASE = `Você é um professor-mestre e designer instrucional. Escreva em português (pt-BR) a menos que o material esteja noutro idioma e o objetivo exija esse idioma.
Siga o PADRÃO DE ESTUDO acima em tudo que escrever: sucinto, apoiado nos maiores nomes da área, história, ciência e casos reais; conhecimento de sênior; sem analogias bobas, exemplos clichê ou verborragia.
Ancore tudo no material fornecido, citando [S#] quando usar um trecho. Nunca invente fatos, números ou referências.
ESCOPO PROGRESSIVO (regra máxima): o aluno só conhece o NÓ ATUAL e os níveis anteriores. Use SOMENTE o conteúdo do nó e o que ele pressupõe dos níveis anteriores. Tudo em "FORA DE ESCOPO" e qualquer assunto que o material ensine mais adiante é PROIBIDO — em explicações, exemplos, perguntas, alternativas e cartões. Se um exemplo natural exigir algo avançado, troque o exemplo.`;

// ------------------------------------------------------------------ geradores por tipo

async function genLesson(ctx, opts = {}) {
  const say = opts.report || (() => {});
  say(0.15, "Escrevendo a lição…");
  const r = await askJson({
    system: `${BASE}\nCrie uma LIÇÃO que leve o aluno aos objetivos do nó seguindo o padrão de estudo, sem desvio.\nREGRA DE FONTES: o que o MATERIAL afirma sobre um sistema, arquivo ou prática interna você cita com [S#]; o que é conhecimento da área (lei, norma, teoria, história) vem de fonte canônica e oficial e não leva [S#]. Se o material descreve um SISTEMA, a lição ensina primeiro o conceito do domínio e só depois mostra como o sistema o implementa. Nunca invente nome de tabela, campo, registro, versão, artigo de lei ou número que não esteja no material ou que você não tenha certeza; use "(a confirmar)".\n${LESSON_METHOD}`,
    prompt: `${ctx.text}\n\nJSON: {"title":"","markdown":"lição completa, na estrutura acima (400-900 palavras)","takeaways":["3 a 6 pontos que um especialista consideraria o essencial"],"pitfalls":["erros que só a experiência ensina"],"check_yourself":["3 perguntas que exigem julgamento, não memória"]}`,
    effort: "medium",
  });
  say(0.55, "Aplicando o crivo de estilo…");
  r.markdown = await crivo("lição", r.markdown);
  say(0.75, "Conferindo os fatos…");
  const fc = await factCheck(ctx, r.markdown);
  r.markdown = fc.markdown;
  r.review = fc.issues;
  return { type: "lesson", title: r.title || ctx.node.title, data: r };
}

async function genReading(ctx) {
  const r = await askJson({
    system: `${BASE}\nMonte um PLANO DE LEITURA GUIADA a partir dos trechos: diga exatamente o que ler (fonte + localizador), em que ordem, o que procurar e por quê. Se não houver material, devolva "items" vazio e preencha "research" com 4-6 buscas/tópicos para o aluno pesquisar (sem inventar títulos de obras).`,
    prompt: `${ctx.text}\n\nJSON: {"title":"","intro":"","items":[{"label":"S1","why":"","focus":["pergunta-guia"],"minutes":15}],"research":["consulta"],"after":"o que fazer ao terminar"}`,
  });
  return { type: "reading", title: r.title || `Leitura: ${ctx.node.title}`, data: r };
}

async function genExercises(ctx, opts) {
  const n = opts.count || 5;
  const r = await askJson({
    system: `${BASE}\nCrie ${n} EXERCÍCIOS práticos de aplicação (não de memorização), em dificuldade crescente (1→5), cobrindo os objetivos do nó. Cada um deve ter enunciado concreto (situação real da área, com dados e restrições, no estilo de um problema que um profissional enfrentaria; nada de cenário infantil ou genérico), dicas progressivas (sem entregar a resposta), resolução comentada passo a passo que explicite o raciocínio de decisão e o erro mais provável, e rubrica objetiva de correção.`,
    prompt: `${ctx.text}\n\nJSON: {"title":"","problems":[{"prompt":"","difficulty":1,"concept":"título de conceito do nó","hints":["","",""],"solution":"resolução passo a passo","rubric":["critério verificável"],"source_labels":["S1"]}]}`,
    effort: "medium",
  });
  return { type: "exercise", title: r.title || `Exercícios: ${ctx.node.title}`, data: r };
}

async function genFlashcards(ctx, opts) {
  const n = opts.count || 14;
  const existing = db().prepare("SELECT front FROM cards WHERE node_id=?").all(ctx.node.id).map((c) => c.front);
  const r = await askJson({
    system: `${BASE}\nCrie ${n} FLASHCARDS de alta qualidade para repetição espaçada: um fato/ideia por cartão, frente como pergunta que exige recuperação ativa (evite "o que é X?" genérico quando houver pergunta melhor: por quê, quando usar, qual a diferença, qual o passo seguinte, o que acontece se...), verso curto e exato (uma frase ou fórmula; sem rodeio). Inclua cartões de aplicação, de distinção entre conceitos parecidos, de condição de validade/limite, de autor e contribuição quando a atribuição for relevante, e de armadilha de sênior ("o que dá errado se..."). Não repita cartões existentes.`,
    prompt: `${ctx.text}\n\nCARTÕES JÁ EXISTENTES (não repetir):\n${existing.join("\n") || "(nenhum)"}\n\nJSON: {"cards":[{"front":"","back":"","concept_id":12}]}  (concept_id = número do 'cN' do conceito mais relacionado, ou null)`,
  });
  const cards = (r.cards || []).filter((c) => c.front && c.back);
  const ins = db().prepare("INSERT INTO cards(id, subject_id, node_id, concept_id, front, back, due, created_at) VALUES (?,?,?,?,?,?,?,?)");
  const validC = new Set(ctx.concepts.map((c) => c.id));
  tx(() => {
    for (const c of cards) {
      const cid = Number(String(c.concept_id ?? "").replace(/^c/, ""));
      ins.run(uid("card_"), ctx.node.subject_id, ctx.node.id, validC.has(cid) ? cid : null, String(c.front), String(c.back), now(), now());
    }
  });
  return { type: "flashcards", title: `Flashcards: ${ctx.node.title}`, data: { count: cards.length } };
}

async function genPodcast(ctx, opts) {
  const minutes = opts.minutes || 8;
  const r = await askJson({
    system: `${BASE}
Você escreve o ROTEIRO FALADO de um podcast de estudo com dois apresentadores, para ser lido por um sintetizador de voz (TTS). O texto precisa soar como duas pessoas conversando de verdade, não como um texto lido.
Apresentadores: A (interlocutor exigente: faz a pergunta que um especialista faria, pede a fonte, aponta o caso limite) e B (especialista: preciso, objetivo, atribui as ideias a quem as formulou, traz história, dados e casos reais documentados e o que só a experiência ensina). Sem analogias de senso comum, sem exemplos clichê, sem entusiasmo de locutor: o interesse vem do conteúdo.

COMO ESCREVER PARA SER FALADO (humanizado):
- Frases curtas e médias, em ritmo de conversa. Cada fala tem de 1 a 4 frases; alterne os falantes com frequência. Nada de blocos longos.
- Controle o ritmo com a pontuação: vírgulas para respirar, reticências ("...") para hesitação, suspense ou pausa pensando, travessão ("—") para um aparte, ponto final para pausas fortes, ponto de interrogação para a voz subir, ponto de exclamação com moderação para ênfase. Pode usar uma frase de uma palavra só, para dar um tempo: "Exato.", "Calma...", "Olha só.".
- Use marcas de oralidade com naturalidade e sem exagero: "né?", "então...", "veja bem", "sabe quando...", "pensa comigo", "ou seja", "perceba", "faz sentido?". Reações curtas do outro apresentador: "Hm, entendi.", "Nossa, é verdade.", "Ah, agora fez sentido!".
- Comece direto no problema que o conceito resolve (uma pergunta técnica ou um fato histórico), nunca com "Olá ouvintes, hoje vamos falar de...". Feche com o essencial em duas frases e uma pergunta que exija julgamento.
- Inclua 2 ou 3 momentos de "pausa e responda", em que um apresentador pede para o ouvinte pensar na resposta antes de continuar (e dê um respiro com reticências).
- Ortografia padrão do português do Brasil. NÃO imite sotaque nem escreva palavras como se ouvem (nada de "tá", "num", "pra" repetidos em excesso, "cê", "né" só quando natural). NÃO escreva em fonética.
- Prepare o texto para a voz: escreva números, símbolos e fórmulas por extenso, como se fala ("dez elevado a vinte e cinco", "trinta por cento", "delta U igual a Q menos W"); sem siglas soltas difíceis (escreva "P V" ou explique); sem markdown, sem asteriscos, sem emojis, sem parênteses, sem listas numeradas, sem anotações de palco como "[risos]".
- Conteúdo fiel ao material fornecido, denso e correto, com um caso real ou exemplo técnico concreto (nunca analogia cotidiana). Não leia listas; transforme em conversa, mas sem encher: cada fala traz informação.
- Duração: cerca de ${minutes} minutos falados (≈ ${minutes * 150} palavras).`,
    prompt: `${ctx.text}\n\nJSON: {"title":"título curto e instigante","script":[{"speaker":"A","text":"fala com pontuação para ritmo"},{"speaker":"B","text":"..."}],"pause_questions":["perguntas para o ouvinte pensar"]}`,
    effort: "medium",
  });
  return { type: "podcast", title: r.title || `Podcast: ${ctx.node.title}`, data: r };
}

async function genProject(ctx) {
  const r = await askJson({
    system: `${BASE}\nCrie um PROJETO/DESAFIO INTEGRADOR que exija usar os objetivos do nó (e dos pré-requisitos) numa entrega concreta e verificável, modelada em um problema real da profissão (restrições, trade-offs e critérios como num caso de campo), com critérios de avaliação em níveis (insuficiente / bom / excelente) que descrevam o que separa o júnior do sênior.`,
    prompt: `${ctx.text}\n\nJSON: {"title":"","brief":"markdown com contexto, entregáveis e restrições","steps":["etapas sugeridas"],"rubric":[{"criterion":"","levels":{"insuficiente":"","bom":"","excelente":""}}],"stretch":"extensão opcional para quem quer ir além"}`,
    effort: "medium",
  });
  r.brief = await crivo("projeto", r.brief, { maxWords: 700 });
  return { type: "project", title: r.title || `Projeto: ${ctx.node.title}`, data: r };
}

// ------------------------------------------------------------------ quiz (gerar + criticar)

const QUIZ_RULES = `Você cria questões de AVALIAÇÃO DE DOMÍNIO — o tipo de questão em que, se o aluno acerta de forma consistente, ele realmente sabe o assunto.
Regras inegociáveis:
1. NADA genérico: proibido "qual a definição de X" óbvia, "qual das seguintes é verdadeira" sem cenário, "todas as anteriores/nenhuma das anteriores". Prefira cenários concretos de campo (casos reais ou verossímeis da profissão, com dados), trechos para analisar, decisões a tomar, erros a diagnosticar, comparações entre abordagens, e os equívocos que especialistas só superam com experiência. Sem exemplos clichê nem analogias.
2. Dificuldade e Bloom seguem o NÍVEL DO ALUNO NESTE NÓ informado no pedido (iniciante, intermediário, avançado ou domínio); respeite a distribuição indicada. Questão difícil só para quem já mostrou domínio; no primeiro contato com o nó, avalie compreensão e aplicação direta do que foi ensinado, nunca pegadinha nem detalhe de implementação.
3. Distratores PLAUSÍVEIS: cada alternativa errada deve representar um equívoco real e específico (campo "misconception" descrevendo o erro conceitual). Alternativas de tamanho/estilo parecidos; a correta não pode ser a mais longa/óbvia.
4. Uma única resposta defensável (ou conjunto exato em "multi"). Sem ambiguidade, sem pegadinha de redação.
5. Respondível SOMENTE com o que a LIÇÃO deste nó ensinou (bloco "O QUE FOI ENSINADO") e com o que os conceitos do nó definem, mais raciocínio. Proibido cobrar nome interno, versão, caminho de pasta, relação entre sistemas ou número que a lição não tenha ensinado de forma explícita (trivia). Se um aluno atento que leu a lição não saberia responder, a questão não serve. Cite [S#] em 'explanation' quando aplicável.
6. 'explanation': por que a correta está certa E por que cada errada está errada, em linguagem de professor.
7. Cubra os conceitos do nó de forma equilibrada; cada questão aponta o 'concept_id' (número do cN).
Tipos: "mcq" (4-5 alternativas, 1 correta), "multi" (4-6 alternativas, 2+ corretas), "tf" (afirmação sutil + justificativa), "short" (resposta curta/discursiva com 'model_answer' e 'rubric' de 2-4 critérios), "cloze" (lacuna ____ com 'accept' lista de respostas aceitas).`;

const Q_SPEC = `{"questions":[{
 "type":"mcq|multi|tf|short|cloze","bloom":"apply","difficulty":4,"concept_id":12,"prompt":"",
 "options":[{"text":"","correct":false,"misconception":"equívoco que esta alternativa representa"}],
 "answer_bool":true,"model_answer":"","rubric":["critério"],"accept":["resposta aceita"],
 "explanation":"","source_labels":["S1"]}]}
(options só em mcq/multi; answer_bool só em tf; model_answer+rubric só em short; accept só em cloze)`;

function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [r[i], r[k]] = [r[k], r[i]];
  }
  return r;
}

function normalizeQuestion(q, ctx) {
  const type = ["mcq", "multi", "tf", "short", "cloze"].includes(q.type) ? q.type : null;
  if (!type || !q.prompt || !q.explanation) return null;
  const validC = new Set(ctx.concepts.map((c) => c.id));
  const cid = Number(String(q.concept_id ?? "").replace(/^c/, ""));
  const base = {
    type,
    bloom: q.bloom || "apply",
    difficulty: Math.min(5, Math.max(1, Number(q.difficulty) || 3)),
    concept_id: validC.has(cid) ? cid : ctx.concepts[0]?.id ?? null,
    prompt: String(q.prompt),
    explanation: String(q.explanation),
    chunk_ids: (q.source_labels || []).map((l) => ctx.labels[l]?.chunk_id).filter(Boolean),
  };
  if (type === "mcq" || type === "multi") {
    const opts = (q.options || []).filter((o) => o?.text);
    const nCorrect = opts.filter((o) => o.correct).length;
    if (opts.length < 3 || nCorrect < 1 || (type === "mcq" && nCorrect !== 1)) return null;
    const sh = shuffle(opts);
    return {
      ...base,
      options: sh.map((o) => ({ text: String(o.text), misconception: o.correct ? null : o.misconception || null })),
      answer: { correct: sh.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0) },
    };
  }
  if (type === "tf") {
    if (typeof q.answer_bool !== "boolean") return null;
    return { ...base, options: null, answer: { bool: q.answer_bool } };
  }
  if (type === "short") {
    if (!q.model_answer) return null;
    return { ...base, options: null, answer: { model: String(q.model_answer) }, rubric: (q.rubric || []).map(String).join("\n") };
  }
  const accept = (q.accept || []).map(String).filter(Boolean);
  if (!accept.length || !/_{2,}/.test(base.prompt)) return null;
  return { ...base, options: null, answer: { accept } };
}

/** Nível do aluno NESTE nó, a partir da nota de domínio e do número de respostas: calibra a dificuldade do quiz. */
export function studentLevel(tree) {
  const m = tree?.mastery ?? 0, att = tree?.attempts ?? 0;
  if (att < 3) return { name: "iniciante", maxDiff: 3, guide: "O aluno está no PRIMEIRO CONTATO com este nó. Distribuição: ~40% dificuldade 1-2, ~50% dificuldade 3, no máximo 10% dificuldade 4, nenhuma de 5. Bloom: pelo menos 60% remember/understand/apply. Avalie compreensão e aplicação direta do que a lição ensinou." };
  if (m < 0.5) return { name: "intermediário", maxDiff: 4, guide: "O aluno já respondeu algumas questões mas ainda não domina. Distribuição: ~20% dificuldade 1-2, ~50% dificuldade 3, ~30% dificuldade 4, nenhuma de 5." };
  if (m < 0.75) return { name: "avançado", maxDiff: 5, guide: "O aluno vai bem. Distribuição: ~30% dificuldade 3, ~50% dificuldade 4, ~20% dificuldade 5; priorize transferência e exceções." };
  return { name: "domínio", maxDiff: 5, guide: "O aluno quase domina. Pelo menos 60% em dificuldade 4-5: transferência para situação nova, exceções, raciocínio sob restrição." };
}

/** O que foi efetivamente ensinado neste nó: a lição mais recente (é só o que o quiz pode cobrar, além dos conceitos). */
function taughtText(nodeId) {
  const row = db().prepare("SELECT content_json FROM activities WHERE node_id=? AND type='lesson' ORDER BY created_at DESC").get(nodeId);
  const c = row ? parse(row.content_json, {}) : null;
  if (!c?.markdown) return "(Nenhuma lição foi gerada para este nó. Cubra APENAS definição, propósito e distinções básicas dos conceitos do nó, com dificuldade 1-2.)";
  return `${c.markdown}\n\nPONTOS ESSENCIAIS: ${(c.takeaways || []).join(" | ")}`.slice(0, 12000);
}

async function critique(ctx, items, { level = null, taught = "" } = {}) {
  // Segundo olhar adversarial: resolve cada questão "às cegas" e julga qualidade.
  const view = items.map((q, i) => ({
    i,
    type: q.type,
    prompt: q.prompt,
    options: q.options?.map((o) => o.text),
    declared_difficulty: q.difficulty,
    ...(q.type === "short" ? { model_answer: q.answer.model, rubric: q.rubric } : {}),
    ...(q.type === "cloze" ? { accept: q.answer.accept } : {}),
    declared_correct: q.type === "tf" ? q.answer.bool : q.answer.correct,
    explanation: q.explanation,
  }));
  const r = await askJson({
    system: `Você é um revisor rigoroso de bancos de questões. Para cada questão: (1) resolva-a por conta própria com o material e confira se o gabarito declarado está CORRETO e é o ÚNICO defensável; (2) detecte ambiguidade, resposta vazada pelo enunciado, distratores absurdos, dependência de conhecimento fora do material; (3) julgue se é genérica/fácil demais para a dificuldade declarada; (4) DESCARTE ("drop") qualquer questão que exija ou mencione conteúdo de "FORA DE ESCOPO" ou que o aluno só aprenderia mais adiante — o aluno ainda não estudou isso; (5) DESCARTE também a questão cujo gabarito dependa de um detalhe que a lição/os conceitos do nó não ensinam explicitamente (trivia de implementação), e a que seja difícil demais para o NÍVEL DO ALUNO informado. Veredito "keep" só para questões realmente boas; "fix" se um pequeno ajuste resolve (devolva o campo corrigido em "patch": prompt/explanation/difficulty); "drop" caso contrário.`,
    prompt: `${ctx.text}\n\nO QUE FOI ENSINADO NESTE NÓ (a lição):\n${taught}\n\nNÍVEL DO ALUNO NESTE NÓ: ${level ? `${level.name}. ${level.guide}` : "não informado"}\n\nQUESTÕES:\n${JSON.stringify(view)}\n\nJSON: {"reviews":[{"i":0,"verdict":"keep|fix|drop","reason":"","patch":{"prompt":"","explanation":"","difficulty":4}}]}`,
    effort: "medium",
  });
  const out = [];
  for (const rv of r.reviews || []) {
    const q = items[rv.i];
    if (!q || rv.verdict === "drop") continue;
    if (rv.verdict === "fix" && rv.patch) {
      if (rv.patch.prompt) q.prompt = rv.patch.prompt;
      if (rv.patch.explanation) q.explanation = rv.patch.explanation;
      if (rv.patch.difficulty) q.difficulty = Math.min(5, Math.max(1, Number(rv.patch.difficulty)));
    }
    out.push(q);
  }
  return out;
}

export function storeQuestions(ctx, items, activityId) {
  const ins = db().prepare(
    `INSERT INTO questions(id, subject_id, node_id, concept_id, activity_id, type, bloom, difficulty, prompt, options_json, answer_json, explanation, rubric, chunk_ids_json, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const ids = [];
  tx(() => {
    for (const q of items) {
      const id = uid("q_");
      ins.run(id, ctx.node.subject_id, ctx.node.id, q.concept_id, activityId, q.type, q.bloom, q.difficulty, q.prompt, j(q.options), j(q.answer), q.explanation, q.rubric || null, j(q.chunk_ids), now());
      ids.push(id);
    }
  });
  return ids;
}

async function genQuiz(ctx, opts) {
  const n = opts.count || 10;
  const tree = computeTree(ctx.node.subject_id).nodes.find((x) => x.id === ctx.node.id);
  const prior = db().prepare("SELECT prompt FROM questions WHERE node_id=? ORDER BY created_at DESC LIMIT 40").all(ctx.node.id).map((q) => q.prompt.slice(0, 140));
  const weak = db()
    .prepare("SELECT title FROM v_concept_mastery WHERE subject_id=? AND concept_id IN (SELECT concept_id FROM node_concepts WHERE node_id=?) AND attempts>0 AND COALESCE(recent_score,avg_score)<0.65")
    .all(ctx.node.subject_id, ctx.node.id)
    .map((r) => r.title);
  const miscon = db()
    .prepare("SELECT misconception FROM v_misconceptions WHERE node_id=? ORDER BY times DESC LIMIT 5")
    .all(ctx.node.id)
    .map((r) => r.misconception);
  const lv = studentLevel(tree);
  const taught = taughtText(ctx.node.id);
  const level = `NÍVEL DO ALUNO NESTE NÓ: ${lv.name}. ${lv.guide}`;
  const raw = await askJson({
    system: QUIZ_RULES,
    effort: "high",
    timeoutMs: 900_000,
    prompt: `${ctx.text}\n\nO QUE FOI ENSINADO NESTE NÓ (a lição; é a única base das questões, além dos conceitos do nó):\n${taught}\n\nCrie ${Math.ceil(n * 1.4)} questões (serão filtradas por um revisor; as melhores ${n} ficam). ${level}
${weak.length ? `Conceitos em que o aluno está fraco (reforce): ${weak.join("; ")}\n` : ""}${miscon.length ? `Equívocos já cometidos (teste se foram superados): ${miscon.join("; ")}\n` : ""}${opts.focus ? `Foco pedido: ${opts.focus}\n` : ""}Questões já existentes (NÃO repita):\n${prior.join("\n") || "(nenhuma)"}\n\nJSON: ${Q_SPEC}`,
  });
  let items = (raw.questions || []).map((q) => normalizeQuestion(q, ctx)).filter(Boolean);
  if (!items.length) throw new Error("O modelo não devolveu questões válidas.");
  items = await critique(ctx, items, { level: lv, taught });
  // trava determinística: o que passar da dificuldade permitida para o nível só entra se faltar questão
  items = items.map((q, i) => ({ q, i })).sort((x, y) => (x.q.difficulty > lv.maxDiff) - (y.q.difficulty > lv.maxDiff) || x.i - y.i).map((x) => x.q);
  const within = items.filter((q) => q.difficulty <= lv.maxDiff);
  items = (within.length >= Math.ceil(n / 2) ? within : items).slice(0, n);
  if (!items.length) throw new Error("Revisão descartou todas as questões; tente de novo.");
  return { type: "quiz", title: `Quiz: ${ctx.node.title}`, data: { count: items.length }, _questions: items };
}

// ------------------------------------------------------------------ API pública

const GENERATORS = { lesson: genLesson, reading: genReading, exercise: genExercises, flashcards: genFlashcards, podcast: genPodcast, project: genProject, quiz: genQuiz };

export function generateActivity(nodeId, type, opts = {}) {
  const node = db().prepare("SELECT * FROM nodes WHERE id=?").get(nodeId);
  if (!node) throw new Error("Nó não encontrado");
  if (!GENERATORS[type]) throw new Error("Tipo inválido");
  return runJob(`activity:${type}`, node.subject_id, nodeId, async (report) => {
    report(0.1, `Gerando ${ACTIVITY_TYPES[type].label.toLowerCase()}…`);
    const ctx = nodeContext(nodeId);
    const res = await GENERATORS[type](ctx, { ...opts, report });
    report(0.9, "Salvando…");
    const id = uid("act_");
    const data = { ...res.data, sources: ctx.labels };
    db()
      .prepare("INSERT INTO activities(id, subject_id, node_id, type, title, content_json, created_at) VALUES (?,?,?,?,?,?,?)")
      .run(id, node.subject_id, nodeId, type, res.title, j(data), now());
    if (res._questions) storeQuestions(ctx, res._questions, id);
    if (type === "podcast") {
      report(0.6, "Gravando as vozes… (alguns minutos)");
      try {
        await attachAudio(id, data, report, { voiceA: opts.voiceA, voiceB: opts.voiceB, speed: opts.speed });
      } catch (e) {
        console.error("[tts]", e);
        report(0.95, "Roteiro pronto, mas o áudio falhou: " + (e.message || e));
      }
    }
    db().prepare("INSERT INTO node_state(node_id, subject_id, started, updated_at) VALUES (?,?,1,?) ON CONFLICT(node_id) DO UPDATE SET started=1, updated_at=excluded.updated_at").run(nodeId, node.subject_id, now());
    logEvent(node.subject_id, "activity_generated", id, { type, node: nodeId });
    return { activityId: id };
  });
}

/** Questão sem gabarito (vai para o navegador). */
export function publicQuestion(q) {
  return {
    id: q.id,
    type: q.type,
    bloom: q.bloom,
    difficulty: q.difficulty,
    prompt: q.prompt,
    options: parse(q.options_json)?.map((o) => ({ text: o.text })) ?? null,
    multi: q.type === "multi",
    node_id: q.node_id,
    concept_id: q.concept_id,
  };
}

function gradeSimple(q, answer) {
  const a = parse(q.answer_json);
  if (q.type === "mcq") {
    const ok = a.correct.includes(Number(answer));
    return { score: ok ? 1 : 0 };
  }
  if (q.type === "multi") {
    const sel = new Set((answer || []).map(Number));
    const cor = new Set(a.correct);
    const hit = [...sel].filter((i) => cor.has(i)).length;
    const wrong = [...sel].filter((i) => !cor.has(i)).length;
    return { score: Math.max(0, (hit - wrong) / cor.size) };
  }
  if (q.type === "tf") return { score: Boolean(answer) === a.bool ? 1 : 0 };
  if (q.type === "cloze") {
    const n = norm(answer || "");
    return { score: a.accept.some((x) => norm(x) === n) ? 1 : null };
  }
  return { score: null };
}

export async function gradeAnswer(questionId, answer, { confidence = null, timeMs = null } = {}) {
  const q = db().prepare("SELECT * FROM questions WHERE id=?").get(questionId);
  if (!q) throw new Error("Questão não encontrada");
  let { score } = gradeSimple(q, answer);
  let feedback = null;
  let misconception = null;
  const opts = parse(q.options_json);
  if (q.type === "mcq" && score === 0) misconception = opts?.[Number(answer)]?.misconception || null;
  if (q.type === "multi" && score < 1) {
    const cor = new Set(parse(q.answer_json).correct);
    misconception = (answer || []).map(Number).filter((i) => !cor.has(i)).map((i) => opts?.[i]?.misconception).filter(Boolean)[0] || null;
  }
  if (score === null) {
    // Resposta aberta (ou cloze fora da lista): correção por rubrica.
    const a = parse(q.answer_json);
    const g = await askJson({
      system: "Você é um corretor justo e exigente. Compare a resposta do aluno com o gabarito e a rubrica. Aceite formulações equivalentes; penalize erros conceituais e omissões. Dê nota 0 a 1 (parcial permitido).",
      prompt: `QUESTÃO: ${q.prompt}\nGABARITO: ${a.model || a.accept?.join(" / ")}\nRUBRICA:\n${q.rubric || "(equivalência de sentido com o gabarito)"}\n\nRESPOSTA DO ALUNO:\n${String(answer || "").slice(0, 4000)}\n\nJSON: {"score":0.0,"feedback":"o que acertou, o que faltou/errou, como melhorar (2-4 frases)","misconception":"equívoco específico revelado, ou vazio"}`,
    });
    score = Math.min(1, Math.max(0, Number(g.score) || 0));
    feedback = g.feedback || null;
    misconception = g.misconception || null;
  }
  db()
    .prepare("INSERT INTO attempts(subject_id, node_id, question_id, concept_id, score, answer_json, misconception, confidence, time_ms, feedback, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(q.subject_id, q.node_id, q.id, q.concept_id, score, j(answer), misconception, confidence, timeMs, feedback, now());
  if (q.node_id) {
    const xp = Math.round(score * 10 * q.difficulty);
    db()
      .prepare("INSERT INTO node_state(node_id, subject_id, started, xp, updated_at) VALUES (?,?,1,?,?) ON CONFLICT(node_id) DO UPDATE SET started=1, xp=xp+?, updated_at=excluded.updated_at")
      .run(q.node_id, q.subject_id, xp, now(), xp);
  }
  const a = parse(q.answer_json);
  return {
    score,
    feedback,
    misconception,
    explanation: q.explanation,
    correct: q.type === "tf" ? a.bool : q.type === "short" ? a.model : q.type === "cloze" ? a.accept : a.correct,
  };
}

export function reviewCard(cardId, grade) {
  const c = db().prepare("SELECT * FROM cards WHERE id=?").get(cardId);
  if (!c) throw new Error("Cartão não encontrado");
  const next = schedule(c, grade);
  db().prepare("UPDATE cards SET ease=?, interval_days=?, reps=?, lapses=?, due=? WHERE id=?").run(next.ease, next.interval_days, next.reps, next.lapses, next.due, cardId);
  db().prepare("INSERT INTO reviews(card_id, grade, created_at) VALUES (?,?,?)").run(cardId, grade, now());
  // Cartão conta como evidência leve de domínio no conceito (via attempts sintéticas seria ruído; ficam só em reviews).
  return next;
}

/** Simulado: monta prova com as melhores questões do ramo/área; gera mais se o banco for curto. */
export function buildMock(subjectId, { branch = null, nodeIds = null, count = 20, minutes = null } = {}) {
  const tree = computeTree(subjectId).nodes;
  const scope = tree.filter((n) => (nodeIds ? nodeIds.includes(n.id) : branch ? n.branch === branch : n.started || n.status !== "locked"));
  const ids = scope.map((n) => n.id);
  if (!ids.length) throw new Error("Nenhum nó no escopo do simulado.");
  const qs = db()
    .prepare(`SELECT * FROM questions WHERE node_id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids);
  // Prioriza difícil + pouco visto
  const seen = new Map(db().prepare("SELECT question_id, COUNT(*) n FROM attempts WHERE subject_id=? GROUP BY question_id").all(subjectId).map((r) => [r.question_id, r.n]));
  const ranked = qs.sort((a, b) => (seen.get(a.id) || 0) - (seen.get(b.id) || 0) || b.difficulty - a.difficulty);
  const pick = pickBalanced(ranked, count);

  const needMore = Math.max(0, count - pick.length);
  return { questions: shuffle(pick), needMore, scope: ids, minutes: minutes || Math.max(10, Math.round(pick.length * 2.2)) };
}

/** Gera (ou regera) o áudio de um podcast já existente. */
export async function attachAudio(activityId, content, report = () => {}, voice = {}) {
  const c = content || parse(db().prepare("SELECT content_json FROM activities WHERE id=?").get(activityId)?.content_json, {});
  if (!c.script?.length) throw new Error("Roteiro vazio.");
  const audio = await synthesizeScript(activityId, c.script, report, voice);
  db().prepare("UPDATE activities SET content_json=? WHERE id=?").run(j({ ...c, audio }), activityId);
  return audio;
}

export function generateAudio(activityId, voice = {}) {
  const a = db().prepare("SELECT * FROM activities WHERE id=?").get(activityId);
  if (!a || a.type !== "podcast") throw new Error("Podcast não encontrado");
  return runJob("audio", a.subject_id, a.node_id, async (report) => {
    report(0.1, "Gravando as vozes…");
    await attachAudio(activityId, null, report, voice);
    return { activityId };
  });
}
