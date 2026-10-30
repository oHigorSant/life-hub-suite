// Transforma o texto cru dos PDFs do curso em blocos limpos. Funções puras (sem fs), testáveis em node.
//
// Bloco: { t: "pair"|"sent"|"word"|"card"|"note"|"h", en?, pt?, ipa?, back?, p? }
//   pair = frase em inglês + tradução (texto linha a linha) · sent = frase só em inglês (p = parágrafo)
//   word = palavra com IPA · card = frente/verso (phrasal verbs) · note = explicação em português · h = título

const PT_WORDS = new Set("o a os as um uma uns umas de do da dos das em no na nos nas por para com sem que e é era foi são ser estar está estava ele ela eles elas eu você vocês nós seu sua seus suas meu minha mas se não já ao aos pelo pela muito mais também quando como onde porque então só até sobre entre depois antes isso isto esse essa este esta aqui lá tinha havia há vai foi vez dia".split(" "));
const EN_WORDS = new Set("the a an and of to in is was were are be been he she it they we you i his her their its my your our that this these those with for on at by from as but or not had have has do did does will would could should can may might there then than so if what which who when where how all one out up into over about him them me us".split(" "));

/** Pontuação positiva = parece português; negativa = parece inglês. */
export function ptScore(line) {
  const s = line.toLowerCase();
  let score = (s.match(/[áàâãéêíóôõúç]/g) || []).length * 2;
  for (const w of s.split(/[^a-zà-ú']+/)) {
    if (!w) continue;
    if (PT_WORDS.has(w) && !EN_WORDS.has(w)) score += 1;
    else if (EN_WORDS.has(w) && !PT_WORDS.has(w)) score -= 1;
  }
  return score;
}

export const clean = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/­/g, "").replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/ﬀ/g, "ff").replace(/\s+/g, " ").trim();

const WATERMARK = /^[A-Za-z0-9+/=\s]{8,}$/;
function isNoise(raw) {
  const l = raw.trim();
  if (!l) return false;
  if (/^CIMV 5\.0/i.test(l) || /©/.test(l) || /^\d{1,3}$/.test(l) || /^P[áa]gina \d+/i.test(l)) return true;
  if (/^(mairovergara|EXAMPLE|T)$/i.test(l)) return true;
  if (/^(DOMINANDO A PRON|OS SONS DA L[IÍ]NGUA|COM PAULO|MAIRO VERGARA)/i.test(l)) return true;
  if (/^AULA \d+( - .*)?$/i.test(l) || /^Os sons de$/i.test(l)) return true;
  if (WATERMARK.test(l) && /\d/.test(l) && !/[.,;:!?'"]/.test(l) && l.split(/\s+/).length <= 3) return true; // marca d'água em base64
  if (/^[A-Za-z0-9+/=]{2,8}$/.test(l) && /[a-z0-9]/.test(l) && /[A-Z]/.test(l) && !/[aeiouy]/.test(l)) return true; // pedaço da marca d'água ("Mj", "NzU")
  if (/^[A-Za-z0-9+/]{10,}={0,2}$/.test(l) && (/=$/.test(l) || /\d/.test(l) || /[a-z][A-Z]/.test(l))) return true;
  return false;
}

const HEAD = /^(Texto linha a linha|Texto para treinamento|Texto para minera[çc][ãa]o|Texto Completo|Transcript|Sentences for Anki)/i;
const TITLE_LINE = /\|\s*(Part \d+|Texto Completo)\s*$/i;

function wrapJoin(lines) {
  let out = "";
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    out = out && /[A-Za-z]-$/.test(out) ? out + t : out ? out + " " + t : t;
  }
  return clean(out);
}

/** Divide um parágrafo em frases sem quebrar abreviações comuns nem falas entre aspas. */
export function splitSentences(par) {
  const text = clean(par);
  const out = [];
  let cur = "";
  const tokens = text.split(" ");
  for (let i = 0; i < tokens.length; i++) {
    cur = cur ? cur + " " + tokens[i] : tokens[i];
    const end = /[.!?]["')\]]*$/.test(tokens[i]) && !/^(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|No)\.$/.test(tokens[i]) && !/^[A-Z]\.$/.test(tokens[i]);
    const next = tokens[i + 1];
    if (end && (!next || /^["'(\[]?[A-Z0-9]/.test(next))) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur) out.push(cur);
  return out;
}

function lineByLine(lines) {
  // fatia entre "Texto linha a linha" e o próximo cabeçalho de seção (as versões "com notes" repetem tudo)
  let start = lines.findIndex((l) => /^Texto linha a linha/i.test(l.trim()));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (HEAD.test(lines[i].trim()) && !TITLE_LINE.test(lines[i])) { end = i; break; }
  }
  const body = lines.slice(start + 1, end);
  const blocks = [];
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    // melhor ponto de corte: EN primeiro, PT depois
    let best = 1, bestScore = -1e9;
    for (let k = 1; k <= cur.length; k++) {
      let sc = 0;
      for (let i = 0; i < cur.length; i++) sc += i < k ? -ptScore(cur[i]) : ptScore(cur[i]);
      if (sc > bestScore) { bestScore = sc; best = k; }
    }
    let en = wrapJoin(cur.slice(0, best));
    let pt = wrapJoin(cur.slice(best));
    // o PDF quebra a linha em inglês no meio: sobra "skin." ou "home." no começo da tradução
    for (let n = 0; n < 1 && en && pt && !/[.!?"]$/.test(en); n++) {
      const m = pt.match(/^([A-Za-z'’-]+[.!?])\s+(.+)$/);
      if (!m || ptScore(m[1]) > 0 || PT_WORDS.has(m[1].toLowerCase().replace(/[^a-zà-ú]/g, "")) || ptScore(m[2]) < 2) break;
      en += " " + m[1];
      pt = m[2];
    }
    if (en) blocks.push(pt ? { t: "pair", en, pt } : { t: "sent", en });
    cur = [];
  };
  for (const raw of body) {
    if (isNoise(raw)) continue;
    if (!raw.trim()) flush();
    else cur.push(raw);
  }
  flush();
  return mergeBrokenPairs(blocks);
}

/** O PDF às vezes enfia uma tradução no meio da frase em inglês ("..., Mais tarde naquela noite eu fiz uma biópsia, where..."). */
export function stripPortuguese(sentence) {
  const parts = sentence.split(/(?<=[,;])\s+/);
  if (parts.length < 2) return sentence;
  const kept = parts.filter((p) => !(/[áàâãéêíóôõúç]/i.test(p) && ptScore(p) >= 3) && !(ptScore(p) >= 4));
  return kept.length && kept.length < parts.length ? kept.join(" ").replace(/,$/, ",") : sentence;
}

/** Linha em inglês no fim de uma página e a tradução no começo da seguinte: o rodapé quebrou o par. */
function mergeBrokenPairs(blocks) {
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], nx = blocks[i + 1];
    if (b.t === "sent" && nx && nx.t === "sent" && ptScore(b.en) <= 0 && ptScore(nx.en) > 1) {
      out.push({ t: "pair", en: b.en, pt: nx.en });
      i++;
    } else out.push(b);
  }
  return out;
}

function paragraphs(lines, from) {
  const body = lines.slice(from);
  const pars = [];
  let cur = [];
  const flush = () => { if (cur.length) pars.push(wrapJoin(cur)); cur = []; };
  for (const raw of body) {
    if (isNoise(raw)) continue;
    if (HEAD.test(raw.trim()) || TITLE_LINE.test(raw)) { flush(); continue; }
    if (!raw.trim()) flush();
    else cur.push(raw);
  }
  flush();
  // frase cortada pela quebra de página: o parágrafo termina sem pontuação e continua no seguinte
  for (let i = 0; i < pars.length - 1; i++) {
    if (!/[.!?"”)\]:]\s*$/.test(pars[i]) && pars[i].split(/\s+/).length > 1 && ptScore(pars[i + 1]) <= 2) {
      pars[i] = clean(pars[i] + " " + pars[i + 1]);
      pars.splice(i + 1, 1);
      i--;
    }
  }
  const blocks = [];
  pars.forEach((par, p) => {
    if (ptScore(par) > 2) return;
    for (const s of splitSentences(par)) blocks.push({ t: "sent", en: stripPortuguese(s), p });
  });
  return blocks;
}

const IPA_ITEM = /^([\p{L}'’\-]+(?: [\p{L}'’\-]+){0,3})\s*(\/[^/]{1,40}\/(?:\s*(?:or|ou)\s*\/[^/]{1,40}\/)?)\s*$/u;
const IPA_PAIR = /^([\p{L}'’\-]+)\s+(\/[^/]+\/)\s*-\s*([\p{L}'’\-]+)\s+(\/[^/]+\/)\s*$/u;

function pronunciation(rawLines) {
  // transcrição fonética quebrada em duas linhas ("communication /kəˌmjuːnɪ" + "ˈkeɪʃn/")
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    let l = rawLines[i];
    if ((l.match(/\//g) || []).length % 2 === 1 && /\/[^/\s]*$/.test(l.trim()) && i + 1 < rawLines.length && !/\//.test(rawLines[i + 1].trim().replace(/\/$/, ""))) { l = l.trim() + rawLines[++i].trim(); }
    lines.push(l);
  }
  const blocks = [];
  let para = [];
  const flushNote = () => {
    const t = wrapJoin(para);
    if (t) blocks.push({ t: "note", pt: t });
    para = [];
  };
  for (const raw of lines) {
    if (isNoise(raw)) continue;
    let l = clean(raw);
    if (/^[\p{L}'’-]+\s*\/[^/]+$/u.test(l)) l += "/"; // IPA sem a barra final no PDF
    if (!l) { flushNote(); continue; }
    const pair = l.match(IPA_PAIR);
    if (pair) {
      flushNote();
      blocks.push({ t: "word", en: pair[1], ipa: pair[2] }, { t: "word", en: pair[3], ipa: pair[4] });
      continue;
    }
    const item = l.match(IPA_ITEM);
    if (item) { flushNote(); blocks.push({ t: "word", en: item[1], ipa: item[2] }); continue; }
    if (HEAD.test(l)) continue;
    if (ptScore(l) > 1) { para.push(l); continue; }
    flushNote();
    if (/[:]$/.test(l) || (l.length < 38 && !/[.!?]$/.test(l) && /^[A-Z/]/.test(l) && !/^[a-z]/.test(l))) blocks.push({ t: "h", en: l.replace(/:$/, "") });
    else blocks.push({ t: "sent", en: l, p: 0 });
  }
  flushNote();
  return blocks;
}

function phrasal(lines) {
  const blocks = [];
  let mode = "", front = [], back = [];
  const flush = () => {
    const f = wrapJoin(front), def = back.length ? clean(back[0]) : "", b = wrapJoin(back.slice(1));
    if (f) blocks.push({ t: "card", en: f, def, back: b });
    front = []; back = [];
  };
  for (const raw of lines) {
    if (isNoise(raw)) continue;
    const l = raw.trim();
    if (/^Front:\s*$/i.test(l)) { flush(); mode = "f"; continue; }
    if (/^Back:/i.test(l)) { mode = "b"; const rest = l.replace(/^Back:\s*/i, ""); if (rest) back.push(rest); continue; }
    if (!l) continue;
    if (mode === "f") front.push(l);
    else if (mode === "b") back.push(l);
  }
  flush();
  return blocks;
}

/** kind: "story" | "mining" | "complete" | "pronunciation" | "phrasal" | "lecture" */
export function parseLessonText(content, kind) {
  const lines = String(content || "").replace(/\r/g, "").split("\n");
  if (kind === "phrasal") {
    const cards = phrasal(lines);
    if (cards.length) return cards;
    return paragraphs(lines, 0);
  }
  if (kind === "pronunciation" || kind === "lecture") return pronunciation(lines);
  // Se o texto corrido (mineração/completo) vem ANTES do "linha a linha", é ele que o áudio lê; as anotações em português ficam de fora.
  const hLine = lines.findIndex((l) => /^Texto linha a linha/i.test(l.trim()));
  if (hLine >= 0 && kind === "story") {
    const ll = lineByLine(lines);
    if (ll && ll.length) return ll;
  }
  const h = lines.findIndex((l) => /^Texto (para minera|para treinamento|Completo)/i.test(l.trim()) || TITLE_LINE.test(l));
  const stop = hLine > h && h >= 0 ? hLine : lines.length;
  return paragraphs(lines.slice(0, stop), h < 0 ? 0 : h + 1);
}

// ---------------------------------------------------------------- tokens (karaokê)

/** Palavras "falaveis" de um texto, na ordem; cada uma com a posição do bloco e do caractere. */
export function tokenize(text) {
  const out = [];
  const re = /[A-Za-zÀ-ɏ0-9]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g;
  let m;
  while ((m = re.exec(text))) out.push({ w: m[0], i: m.index, n: m[0].length });
  return out;
}

export const norm = (w) => w.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']/g, "");

/** Sequência plana de tokens do inglês da lição: { b: índice do bloco, f: "en"|"back", ... }. */
export function lessonTokens(blocks) {
  const toks = [];
  blocks.forEach((b, bi) => {
    for (const field of ["en", "def", "back"]) {
      if (!b[field] || b.t === "note" || b.t === "h") continue;
      for (const t of tokenize(b[field])) toks.push({ b: bi, f: field, i: t.i, n: t.n, w: t.w, k: norm(t.w) });
    }
  });
  return toks;
}
