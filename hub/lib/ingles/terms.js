// Palavras e expressões do Reforço (funções puras, testáveis sem IA).
import { tokenize } from "./text.js";

/** palavra (1 termo) ou expressão (2+ termos: collocation, phrasal verb, frase inteira) */
export const kindOfTerm = (text) => (tokenize(text).length >= 2 ? "expr" : "word");

/** Mantém só exemplos que realmente contêm o termo (ou a flexão indicada em "hit") e têm tradução. */
export function validateContexts(entry, term) {
  const out = [];
  for (const c of entry?.contexts || []) {
    const en = String(c.en || "").trim();
    const hit = String(c.hit || "").trim();
    if (!en || !c.pt || en.length > 220) continue;
    if (hit && !en.toLowerCase().includes(hit.toLowerCase())) continue;
    if (!hit && !en.toLowerCase().includes(term.toLowerCase())) continue; // sem "hit", o termo aparece inteiro
    out.push({ en, pt: String(c.pt).trim(), hit: hit || term, register: String(c.register || "").slice(0, 12), sense: c.sense ? String(c.sense).slice(0, 60) : undefined });
  }
  return out;
}
