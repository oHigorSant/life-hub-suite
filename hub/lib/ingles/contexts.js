// Novos contextos por IA para palavras e expressões do Reforço.
// Saída validada: cada frase tem de conter o termo (ou a flexão dele) e vem com a tradução; o resto é descartado.
import { askJson } from "../atlas/llm.js";
import { readWords, writeWords, withSrs } from "./progress.js";
import { kindOfTerm, validateContexts } from "./terms.js";

export { kindOfTerm };

const SYSTEM = `Você é professor de inglês para um brasileiro adulto (nível A2 a B2) que estuda por textos e áudio.
Para cada TERMO (palavra, expressão, phrasal verb ou frase) escreva exemplos NOVOS de uso, em inglês natural e atual.
Regras:
- Cada exemplo é uma frase completa, de 8 a 20 palavras, que contém o termo exatamente como foi dado ou flexionado (tempo verbal, plural, pessoa). Em "hit" devolva o trecho EXATO da frase que corresponde ao termo.
- Varie o contexto entre os exemplos (trabalho, casa, viagem, tecnologia, relações...), o registro (informal, neutro, formal) e, quando fizer sentido, o tempo verbal. Cada exemplo mostra um uso diferente.
- Se o termo tiver mais de um sentido, use os sentidos mais comuns e indique qual no campo "sense".
- Não invente fatos, nomes de pessoas reais, números nem citações. Sem clichês de aula de inglês (maçã, "my name is", "I love pizza"). Sem emojis.
- "meaning": significado em português, em uma frase curta e exata. "usage": uma observação útil em português (colocação típica, registro, erro comum de brasileiro), no máximo 25 palavras.
- "pt": tradução natural do exemplo para português do Brasil.`;

/**
 * @param {string[]} ids ids em words.json (máx. 8 por chamada)
 * @returns itens atualizados
 */
export async function generateContexts(ids, { n = 3 } = {}) {
  const all = readWords();
  const picked = all.filter((w) => ids.includes(w.id)).slice(0, 8);
  if (!picked.length) throw new Error("Nenhuma palavra ou expressão selecionada.");
  const count = Math.max(2, Math.min(5, Number(n) || 3));
  const payload = picked.map((w) => ({
    id: w.id,
    termo: w.word,
    tipo: w.kind || kindOfTerm(w.word),
    frase_de_origem: w.context || null,
    traducao_conhecida: w.translation || null,
  }));
  const res = await askJson({
    label: "ingles-contextos",
    system: SYSTEM,
    prompt: `Gere ${count} exemplos para cada termo abaixo.\n\n${JSON.stringify(payload, null, 1)}\n\nJSON: {"itens":[{"id":"","meaning":"","usage":"","contexts":[{"en":"","pt":"","hit":"","register":"informal|neutro|formal","sense":""}]}]}`,
    effort: "low",
  });
  const byId = new Map((res.itens || res.items || []).map((x) => [x.id, x]));
  const now = new Date().toISOString();
  const updated = [];
  for (const w of picked) {
    const r = byId.get(w.id);
    const ctx = validateContexts(r, w.word);
    if (!ctx.length) continue;
    const i = all.findIndex((x) => x.id === w.id);
    all[i] = { ...withSrs(all[i]), kind: all[i].kind || kindOfTerm(all[i].word), contexts: ctx, meaning: r.meaning ? String(r.meaning).slice(0, 200) : all[i].meaning, usage: r.usage ? String(r.usage).slice(0, 220) : all[i].usage, contextsAt: now };
    updated.push(all[i]);
  }
  if (!updated.length) throw new Error("A IA não devolveu exemplos válidos. Tente novamente.");
  writeWords(all);
  return updated;
}
