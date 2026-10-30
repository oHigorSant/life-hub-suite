// Validação do estudo de reforço gerado pela IA (funções puras, testáveis sem IA).

const str = (v, max = 2000) => String(v ?? "").trim().slice(0, max);
const BLANK = /_{3,}/;

export function cleanExercise(x) {
  const type = str(x?.type, 12);
  if (type === "mcq") {
    const options = (x.options || []).map((o) => str(o, 240)).filter(Boolean);
    const answer = Number(x.answer);
    if (!str(x.prompt) || options.length < 3 || options.length > 5 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null;
    return { type, prompt: str(x.prompt, 400), options, answer, explain: str(x.explain, 500) };
  }
  if (type === "cloze") {
    const en = str(x.en, 300), answer = str(x.answer, 60);
    if (!BLANK.test(en) || !answer || answer.split(/\s+/).length > 4) return null;
    return { type, en: en.replace(BLANK, "___"), answer, pt: str(x.pt, 300), explain: str(x.explain, 500) };
  }
  if (type === "translate") {
    const pt = str(x.pt, 300), answer = str(x.answer_en || x.answer, 300);
    if (!pt || !answer) return null;
    return { type, pt, answer, accept: (x.accept || []).map((a) => str(a, 300)).filter(Boolean).slice(0, 4), explain: str(x.explain, 500) };
  }
  return null;
}

/** `seen` (opcional) é compartilhado entre os temas: um termo "novo" aparece em um tema só. */
export function cleanTheme(t, i, knownTerms, seen = new Set()) {
  const id = `t${i + 1}`;
  const title = str(t?.title, 80);
  if (!title) return null;
  const examples = (t.examples || []).map((e) => ({ en: str(e.en, 260), pt: str(e.pt, 260), hit: str(e.hit, 80) })).filter((e) => e.en && e.pt).slice(0, 8);
  for (const k of knownTerms) seen.add(k.toLowerCase());
  const related = [];
  for (const r of t.related || []) {
    const term = str(r.term, 80);
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    related.push({ term, meaning: str(r.meaning, 160), en: str(r.example_en || r.en, 260), pt: str(r.example_pt || r.pt, 260) });
  }
  const exercises = (t.exercises || []).map(cleanExercise).filter(Boolean).slice(0, 10).map((x, k) => ({ ...x, id: `rf:${id}:${k}` }));
  return {
    id,
    title,
    kind: str(t.kind, 20) || "gramática",
    why: str(t.why, 500),
    items: (t.items || []).map((x) => str(x, 140)).filter(Boolean).slice(0, 30),
    lessonLink: /^gramatica-aula-\d\d$/.test(str(t.lessonLink || t.lesson_link)) ? str(t.lessonLink || t.lesson_link) : null,
    lesson: str(t.lesson, 3000),
    examples,
    related: related.slice(0, 8),
    exercises,
  };
}

export function splitSentencesSimple(text) {
  return str(text, 4000).replace(/\s+/g, " ").split(/(?<=[.!?]["']?)\s+(?=["']?[A-Z])/).map((s) => s.trim()).filter(Boolean);
}
