// Padrão de conteúdo gerado por IA no Life Hub. Fonte única: tudo que uma IA escreve para o usuário (lições, trilhas, flashcards,
// quiz, podcast, projetos, chat de estudos, notas, resumos) passa por este crivo. Mudou o critério? Mude aqui.

/** Regras gerais: valem para QUALQUER texto que a IA produz como conteúdo. */
export const CONTENT_STANDARD = `PADRÃO DE CONTEÚDO (vale para tudo que você escreve como conteúdo):
- Sucinto, preciso e proveitoso. Cada frase traz informação nova. Sem introdução, sem recapitulação decorativa, sem fecho motivacional, sem verborragia. Corte antes de acrescentar.
- Nada de analogias de senso comum, exemplos clichê (maçã, padaria, receita de bolo, "João e Maria"), metáforas decorativas, adjetivos de entusiasmo (fascinante, poderoso, incrível, revolucionário) nem ganchos de marketing ("imagine que", "pense em", "vamos mergulhar", "no mundo de hoje").
- Não invente fato, número, data, citação, caso ou referência. Se não tiver certeza, diga que não tem ou omita. Distinga consenso, hipótese e opinião de escola.
- Termos exatos do campo (e o termo corrente em inglês, quando for o que o mercado/academia usa), sem eufemismo.`;

/** Padrão rigoroso de ESTUDO: o que separa conteúdo de curso de conteúdo de mestre. */
export const STUDY_STANDARD = `PADRÃO DE ESTUDO (crivo único, sem exceção por tipo de conteúdo):
1. Postura: escreva para quem vai ATUAR na área, não para quem quer uma ideia geral. Assuma inteligência; não assuma conhecimento além do nível do aluno.
2. Cerne primeiro: o problema que o conceito resolve e o que quebra sem ele; depois o modelo correto, o mecanismo, as condições de validade e os limites.
3. Autoridade: apoie-se nos maiores nomes e obras da área (autores, artigos seminais, tratados, normas, decisões). Atribua cada ideia a quem a formulou e dê autor, obra e ano quando tiver certeza. Onde houver escolas divergentes, mostre a divergência e quem defende o quê.
4. História e evidência: a origem do conceito (quem, quando, que falha ou pergunta o motivou) quando explica por que ele é como é; resultados empíricos e dados quando existirem; casos reais documentados (nome, data, o que falhou ou funcionou, consequência), escolhidos por ensinarem o LIMITE do conceito, não o caso de livro-texto repetido.
5. Conhecimento de sênior: o que só se aprende errando durante anos: armadilhas, exceções, falsos positivos, sinais de alerta, heurísticas de decisão, custo do erro, quando NÃO aplicar. É isso que faz o aluno atalhar o caminho.
6. Exemplos do domínio real da área, com dados verificáveis e raciocínio explícito; prefira o caso-limite ao trivial. Analogia só quando é o modelo formal da própria disciplina, com seus limites declarados; por padrão, nenhuma.
7. Honestidade intelectual: marque incerteza ("a confirmar"), não preencha lacuna com verossimilhança, aponte quando o material do aluno diverge do consenso.
8. Forma: markdown com títulos curtos, voz ativa, frases diretas; listas só para enumerações reais; tabelas para comparar; fórmulas quando são a linguagem da área. Sem emojis.
9. Autoverificação antes de responder: (a) alguma frase pode sair sem perda? corte; (b) há afirmação sem sustentação? sustente ou retire; (c) há algo que um especialista chamaria de superficial ou clichê? troque pelo que ele realmente diria.`;

/** Estrutura obrigatória de uma lição. */
export const LESSON_METHOD = `ESTRUTURA DA LIÇÃO (markdown, 400 a 900 palavras; use estes títulos, nesta ordem, omitindo apenas o que não se aplica ao nível):
## Problema — o que este conceito resolve e o que quebra sem ele.
## Origem — quem, quando e por quê (história curta e relevante; só o que explica o conceito).
## Núcleo — definição precisa, modelo correto, condições de validade e limites.
## Método — o procedimento ou raciocínio passo a passo, com o critério de decisão em cada ponto; um exemplo resolvido do domínio real, com dados.
## Caso real — um caso documentado (contexto, decisão, resultado, lição), que mostre onde o conceito falha ou exige julgamento.
## O que o sênior sabe — armadilhas, exceções, sinais de alerta, quando não aplicar.
## Critério de domínio — o que o aluno deve conseguir fazer e distinguir ao final.
## Fontes canônicas — 2 a 5 obras/autores fundamentais (autor, obra, ano, por que ler); marque "(a confirmar)" se houver dúvida sobre a referência.`;

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const RULES = [
  [/\bimagin[ea] (que|um|uma|se)\b/i, "gancho 'imagine'"],
  [/\bpens[ea] (em|num|numa|nisso)\b/i, "gancho 'pense em'"],
  [/(?<![\p{L}])[ée] como (um|uma|se)\b/iu, "analogia 'é como'"],
  [/\b(fascinante|incr[ií]vel|poderos[oa]|revolucion[aá]ri[oa]|maravilhos[oa]|extraordin[aá]ri[oa]|surpreendente)\b/i, "adjetivo de entusiasmo"],
  [/\bvamos (mergulhar|explorar|descobrir|ver|come[cç]ar|entender)\b/i, "chamada 'vamos'"],
  [/\bneste (artigo|texto|guia|material|cap[ií]tulo)\b/i, "metadiscurso"],
  [/\bno mundo (de hoje|atual|moderno)\b|\bhoje em dia\b|\bnos dias de hoje\b/i, "abertura genérica"],
  [/(?<![\p{L}])[ée] (muito )?importante (notar|ressaltar|destacar|salientar|lembrar)\b|\bvale (a pena )?(ressaltar|destacar|lembrar|notar)\b/iu, "enchimento ('é importante notar')"],
  [/\bem (resumo|conclus[aã]o|suma|síntese)\b/i, "fecho vazio"],
  [/(?<![\p{L}])(ma[cç][aã]s?|laranjas?|padaria|receita de bolo|jo[aã]o e maria)(?![\p{L}])/iu, "exemplo clichê"],
  [/\bsem d[uú]vida( alguma)?\b|\bcomo todos sabemos\b|\bobviamente\b/i, "retórica vazia"],
];

/** Lint determinístico: onde o texto viola o padrão. Serve de gatilho para a reescrita e de teste. */
export function lintContent(text) {
  const s = String(text || "");
  const found = [];
  for (const [re, label] of RULES) { const m = s.match(re); if (m) found.push({ rule: label, match: m[0] }); }
  if (EMOJI.test(s)) found.push({ rule: "emoji", match: "" });
  const words = s.split(/\s+/).filter(Boolean).length;
  return { words, violations: found };
}

/** Ordem de reescrita usada pelo crivo (segunda passada sobre o rascunho). */
export function crivoPrompt(kind, draft, lint) {
  return `Você é o editor-chefe do padrão de estudo. Reescreva o RASCUNHO (${kind}) para cumprir integralmente o padrão: corte verborragia, troque analogias e exemplos clichê por casos e mecanismos reais da área, sustente ou retire afirmações sem apoio, preserve tudo que é correto e útil, mantenha a estrutura e o formato exatos.
${lint.violations.length ? `Violações detectadas automaticamente: ${lint.violations.map((v) => `${v.rule}${v.match ? ` ("${v.match}")` : ""}`).join("; ")}.\n` : ""}${lint.words ? `Extensão atual: ${lint.words} palavras.\n` : ""}Não acrescente referências, números ou casos de que não tenha certeza; na dúvida, remova ou marque "(a confirmar)".

RASCUNHO:
${draft}`;
}

/** Padrão de TRILHA: vale para toda árvore de habilidades criada ou estendida (roadmap.js). */
export const ROADMAP_STANDARD = `PADRÃO DE TRILHA (crivo único para toda árvore, criada do zero ou estendida):
1. Estrutura canônica: a árvore reproduz como os maiores nomes e as obras de referência estruturam o campo. Cite-os em 'refs' dos conceitos quando tiver certeza; nunca invente autor, obra ou ano. Nenhuma lacuna que um especialista apontaria; nenhum nó decorativo ou de enchimento.
2. Fundamento antes de aplicação: todo nó de ferramenta, sistema ou procedimento tem como pré-requisito "hard" o nó de domínio que o explica (teoria, norma, princípio). Ninguém aprende a operar o que não entende.
3. Profundidade: cada nó trata UM conceito, com objetivo verificável no nível analisar, avaliar ou criar. Título específico e técnico ("NBC TA 530: amostragem em auditoria"); proibido título genérico ("Introdução a", "Visão geral", "Conceitos básicos") sem objeto.
4. Casos e problemas: cada ramo inclui nós sobre os casos históricos e os problemas reais que formaram a disciplina e sobre os erros que especialistas só aprendem com anos de prática.
5. Atualidade: normas, versões e leiautes vigentes; sinalize o que mudou recentemente e o que está para mudar.
6. Capstone por ramo: um problema real da profissão, avaliável por rubrica, que obrigue a combinar os nós do ramo.
7. Quando o material do aluno descreve sistemas ou prática interna, separe nós "do sistema" (ancorados no material) de nós "do domínio" (ancorados em conhecimento consolidado e fontes oficiais) e ligue um ao outro: o domínio vem antes, o sistema mostra como ele é implementado.
8. A ordem do caminho segue a dependência real entre conceitos, não a ordem de um livro nem a ordem alfabética.`;

/** Revisão técnica de fatos (segunda passada da lição): corrige ou rebaixa o que não se sustenta. */
/** Identificadores técnicos (tb_*, usp_*, vw_*) que o texto cita e que NÃO aparecem no material: quase sempre invenção do modelo. */
export function unknownIdentifiers(text, material) {
  const mat = String(material || "").toLowerCase();
  const ids = new Set(String(text || "").match(/\b(?:tb|usp|vw|fn|sp)_[A-Za-z0-9_{}]+/g) || []);
  return [...ids].filter((id) => !mat.includes(id.toLowerCase()));
}

export function factCheckPrompt(markdown, material, suspects = []) {
  return `Você é revisor técnico sênior do padrão de estudo. Confira CADA afirmação factual do TEXTO (normas e leis com número, versões e leiautes, nomes e formatos de arquivo, nomes de tabelas/campos/registros, datas, valores, atribuições de autoria) contra o MATERIAL e contra conhecimento consolidado e verificável.
Para cada problema: se tiver certeza da correção, corrija no texto; se não tiver certeza, reescreva a frase como incerta ("(a confirmar)") ou remova. Afirmação sobre um sistema que não esteja no MATERIAL deve sair. Todo nome de tabela, coluna, procedure, classe ou arquivo deve aparecer LITERALMENTE no MATERIAL; senão troque pelo padrão literal que o material traz ou remova.${suspects.length ? `\nIDENTIFICADORES CITADOS QUE NÃO APARECEM NO MATERIAL (provável invenção, corrija ou remova): ${suspects.join(", ")}.` : ""} Não acrescente fatos novos de que não tenha certeza. Preserve estrutura, títulos e o que está correto.

MATERIAL (resumo do contexto fornecido ao autor):
${String(material).slice(0, 30000)}

TEXTO:
${markdown}

JSON: {"markdown":"texto final revisado","issues":[{"claim":"trecho original","problem":"por que estava errado ou sem sustentação","action":"corrigido|marcado a confirmar|removido"}]}`;
}