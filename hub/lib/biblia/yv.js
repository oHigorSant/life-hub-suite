// Bíblia via YouVersion Platform API (https://api.youversion.com/v1). A chave fica só no servidor:
// variável de ambiente YOUVERSION_APP_KEY (.env.local) — nunca vai para o navegador.
const BASE = "https://api.youversion.com/v1";
const g = globalThis;
const cache = (g.__lhYv ??= new Map());

export const DEFAULT_VERSION = 3254; // BLT — Bíblia Livre Para Todos (a que a chave libera em português)

export function yvError(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

async function yv(path, { ttl = 24 * 3600_000 } = {}) {
  const key = process.env.YOUVERSION_APP_KEY;
  if (!key) throw yvError("Chave da YouVersion não configurada (YOUVERSION_APP_KEY).", 503);
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  let r;
  try {
    r = await fetch(BASE + path, { headers: { "X-YVP-App-Key": key, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  } catch {
    if (hit) return hit.data;
    throw yvError("Não consegui falar com a YouVersion agora.");
  }
  if (r.status === 403) throw yvError("Esta versão não está liberada para a sua chave da YouVersion.", 403);
  if (r.status === 404) throw yvError("Passagem não encontrada.", 404);
  if (!r.ok) { if (hit) return hit.data; throw yvError(`YouVersion respondeu ${r.status}.`); }
  const data = await r.json();
  cache.set(path, { at: Date.now(), data });
  if (cache.size > 600) cache.delete(cache.keys().next().value);
  return data;
}

const dayOfYear = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
};

const decode = (s) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

/** Versões acessíveis para a chave, em português (e inglês, se liberadas). */
export async function versions() {
  const out = await yv("/bibles?language_ranges[]=pt&language_ranges[]=en&page_size=50", { ttl: 12 * 3600_000 });
  return (out.data || []).map((b) => ({ id: b.id, abbr: b.abbreviation, title: b.localized_title || b.title, lang: b.language_tag }));
}

export async function versionInfo(id) {
  const b = await yv(`/bibles/${Number(id)}`, { ttl: 12 * 3600_000 });
  return { id: b.id, abbr: b.abbreviation, title: b.localized_title || b.title, copyright: b.copyright || "" };
}

/** Livros com o número de capítulos. */
export async function books(id) {
  const out = await yv(`/bibles/${Number(id)}/books`, { ttl: 24 * 3600_000 });
  return (out.data || []).map((b) => ({ id: b.id, title: b.title, abbr: b.abbreviation, canon: b.canon, chapters: (b.chapters || []).length }));
}

/** Passagem como lista de versículos [{ n, text, p }] (p = índice do parágrafo) + referência e texto corrido. */
export async function passage(id, ref) {
  if (!/^[1-3A-Z]{3}(\.\d{1,3}(\.\d{1,3}(-\d{1,3})?)?)?$/.test(ref)) throw yvError("Referência inválida. Use o formato USFM, ex.: JHN.3 ou JHN.3.16-18.", 400);
  const html = await yv(`/bibles/${Number(id)}/passages/${ref}?format=html`);
  const plain = await yv(`/bibles/${Number(id)}/passages/${ref}`);
  const verses = [];
  const paras = (html.content || "").match(/<div class="p">[\s\S]*?<\/div>/g) || [];
  paras.forEach((para, p) => {
    const parts = para.split(/<span class="yv-v" v="(\d+)"><\/span><span class="yv-vlbl">\d+<\/span>/);
    // parts: [antes, n1, texto1, n2, texto2, ...]
    for (let i = 1; i < parts.length; i += 2) {
      const text = decode(parts[i + 1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      if (text) verses.push({ n: Number(parts[i]), text, p });
    }
  });
  return { ref, reference: plain.reference || html.reference || ref, text: (plain.content || "").trim(), verses };
}

/** Versículo do dia da YouVersion (dia do ano, no fuso de São Paulo) já com o texto. */
export async function verseOfTheDay(versionId = DEFAULT_VERSION, ymd) {
  const day = dayOfYear(ymd || new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }));
  const v = await yv(`/verse_of_the_days/${day}`, { ttl: 6 * 3600_000 });
  const p = await yv(`/bibles/${Number(versionId)}/passages/${v.passage_id}`);
  const info = await versionInfo(versionId).catch(() => null);
  return { day, passage_id: v.passage_id, reference: p.reference, text: (p.content || "").trim(), version: info?.abbr || "" };
}
