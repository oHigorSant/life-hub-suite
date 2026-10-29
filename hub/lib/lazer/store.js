// Área de Lazer: links e ideias para o tempo livre (vídeos, filmes e séries, livros, projetos, hobbies) em data/lazer.json.
// Cada item tem uma imagem: miniatura do YouTube, og:image da página, capa encontrada pela busca ou arquivo enviado.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { parse } from "node-html-parser";
import { DATA_DIR } from "../paths.js";

const FILE = path.join(DATA_DIR, "lazer.json");
export const CACHE_DIR = path.join(DATA_DIR, "lazer", "cache");

export const CATEGORIES = [
  { id: "video", label: "Vídeos" },
  { id: "filme", label: "Filmes e séries" },
  { id: "livro", label: "Livros" },
  { id: "projeto", label: "Projetos" },
  { id: "hobby", label: "Hobbies" },
  { id: "outro", label: "Outros" },
];
export const STATUSES = [
  { id: "quero", label: "Quero ver/fazer" },
  { id: "andamento", label: "Em andamento" },
  { id: "feito", label: "Concluído" },
];
const CAT_IDS = new Set(CATEGORIES.map((c) => c.id));
const ST_IDS = new Set(STATUSES.map((s) => s.id));

export function readLazer() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { items: Array.isArray(d.items) ? d.items : [] };
  } catch {
    return { items: [] };
  }
}
function writeLazer(d) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(d, null, 1));
  fs.renameSync(tmp, FILE);
}
const newId = () => "lz_" + crypto.randomBytes(5).toString("hex");
const nowIso = () => new Date().toISOString();
const str = (v, n) => String(v ?? "").trim().slice(0, n);

// ---------------------------------------------------------------- rede com proteção (só endereços públicos)

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const s = ip.toLowerCase();
  return s === "::1" || s === "::" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80") || s.startsWith("::ffff:127.") || s.startsWith("::ffff:10.") || s.startsWith("::ffff:192.168.");
}

/** Só http(s) para hosts públicos (evita que o servidor seja usado para acessar a rede interna). */
export async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("Link inválido."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Só links http(s).");
  if (/^(localhost|.*\.local|.*\.internal|.*\.ts\.net)$/i.test(u.hostname)) throw new Error("Endereço não permitido.");
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error("Endereço não permitido.");
  return u;
}

async function fetchLimited(url, { accept = "*/*", max = 2_000_000, timeout = 9000 } = {}) {
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(cur);
    const r = await fetch(cur, { redirect: "manual", signal: AbortSignal.timeout(timeout), headers: { accept, "user-agent": "Mozilla/5.0 (LifeHub link preview)", "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { cur = new URL(r.headers.get("location"), cur).href; continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const len = Number(r.headers.get("content-length") || 0);
    if (len > max) throw new Error("Arquivo grande demais.");
    const reader = r.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) { reader.cancel(); break; }
      chunks.push(value);
    }
    return { buf: Buffer.concat(chunks.map((c) => Buffer.from(c))), type: r.headers.get("content-type") || "", url: cur };
  }
  throw new Error("Redirecionamentos demais.");
}

// ---------------------------------------------------------------- metadados do link

export function youtubeId(url) {
  try {
    const u = new URL(url);
    if (/youtu\.be$/.test(u.hostname)) return u.pathname.slice(1).split("/")[0] || null;
    if (/youtube\.com$/.test(u.hostname.replace(/^www\.|^m\./, ""))) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
      if (m) return m[2];
    }
  } catch {}
  return null;
}

export function guessCategory(url) {
  const h = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  if (/youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|tiktok\.com/.test(h)) return "video";
  if (/imdb\.com|letterboxd\.com|netflix\.com|primevideo\.com|disneyplus\.com|max\.com|hbomax\.com|themoviedb\.org|filmow\.com|justwatch\.com|apple\.com\/tv/.test(h)) return "filme";
  if (/goodreads\.com|skoob\.com\.br|openlibrary\.org|books\.google|amazon\.[a-z.]+\/.*(dp|livro|book)/.test(h + (url || "")) ) return "livro";
  if (/github\.com|gitlab\.com|instructables\.com|hackaday/.test(h)) return "projeto";
  return "outro";
}

const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export async function fetchMeta(url) {
  const yt = youtubeId(url);
  if (yt) {
    let title = "", author = "";
    try {
      const { buf } = await fetchLimited(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { accept: "application/json", max: 200_000 });
      const j = JSON.parse(buf.toString("utf8"));
      title = j.title || "";
      author = j.author_name || "";
    } catch {}
    return { title, image: ytThumb(yt), site: author ? `YouTube · ${author}` : "YouTube", description: "", category: "video" };
  }
  const { buf, type, url: finalUrl } = await fetchLimited(url, { accept: "text/html,application/xhtml+xml", max: 1_500_000 });
  if (!/html/i.test(type)) {
    if (/^image\//.test(type)) return { title: path.basename(new URL(finalUrl).pathname), image: finalUrl, site: new URL(finalUrl).hostname, description: "", category: guessCategory(url) };
    return { title: "", image: "", site: new URL(finalUrl).hostname, description: "", category: guessCategory(url) };
  }
  const root = parse(buf.toString("utf8"));
  const meta = (...names) => {
    for (const n of names) {
      const el = root.querySelector(`meta[property="${n}"]`) || root.querySelector(`meta[name="${n}"]`);
      const v = el?.getAttribute("content");
      if (v) return v.trim();
    }
    return "";
  };
  let image = meta("og:image:secure_url", "og:image", "twitter:image", "twitter:image:src");
  if (image) try { image = new URL(image, finalUrl).href; } catch { image = ""; }
  return {
    title: meta("og:title", "twitter:title") || root.querySelector("title")?.text?.trim() || "",
    image,
    site: meta("og:site_name") || new URL(finalUrl).hostname.replace(/^www\./, ""),
    description: meta("og:description", "description", "twitter:description").slice(0, 300),
    category: guessCategory(finalUrl),
  };
}

// ---------------------------------------------------------------- busca de imagens (sem chave de API)

async function getJson(url) {
  const { buf } = await fetchLimited(url, { accept: "application/json", max: 1_500_000 });
  return JSON.parse(buf.toString("utf8"));
}

export async function searchImages(q, category, link) {
  const query = str(q, 120);
  // cada fonte tem sua "prateleira"; a ordem final segue a relevância para a categoria (livro: capas; filme: pôsteres; resto: Wikipédia)
  const shelves = { youtube: [], openlibrary: [], itunes: [], wikipt: [], wikien: [] };
  let shelf = "youtube";
  const add = (url, source, title) => { if (url) shelves[shelf].push({ url, source, title: str(title, 120) }); };
  const into = (name, fn) => (...a) => { shelf = name; fn(...a); };
  const yt = link ? youtubeId(link) : null;
  if (yt) ["maxresdefault", "hqdefault", "mqdefault"].forEach((v) => add(`https://i.ytimg.com/vi/${yt}/${v}.jpg`, "YouTube", "Miniatura do vídeo"));
  const jobs = [];
  if (query && (!category || category === "livro" || category === "outro"))
    jobs.push(getJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8&fields=title,author_name,cover_i`).then(into("openlibrary", (j) =>
      (j.docs || []).filter((d) => d.cover_i).forEach((d) => add(`https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`, "Open Library", `${d.title}${d.author_name ? " — " + d.author_name[0] : ""}`)))).catch(() => {}));
  if (query && (!category || category === "filme" || category === "outro"))
    for (const media of ["movie", "tvShow"])
      jobs.push(getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=${media}&limit=6&country=BR`).then(into("itunes", (j) =>
        (j.results || []).forEach((r) => add((r.artworkUrl100 || "").replace(/\d+x\d+bb/, "600x600bb"), "Apple TV/iTunes", r.trackName || r.collectionName)))).catch(() => {}));
  if (query)
    for (const lang of ["pt", "en"])
      jobs.push(getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=6&prop=pageimages&piprop=thumbnail&pithumbsize=640`).then(into(lang === "pt" ? "wikipt" : "wikien", (j) =>
        Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index).forEach((p) => p.thumbnail?.source && add(p.thumbnail.source, `Wikipédia (${lang})`, p.title)))).catch(() => {}));
  await Promise.all(jobs);
  const order = category === "livro" ? ["youtube", "openlibrary", "wikipt", "wikien", "itunes"]
    : category === "filme" ? ["youtube", "itunes", "wikipt", "wikien", "openlibrary"]
    : ["youtube", "wikipt", "wikien", "openlibrary", "itunes"];
  const out = [];
  for (const k of order) for (const r of shelves[k]) if (!out.some((x) => x.url === r.url)) out.push(r);
  return out.slice(0, 24);
}

// ---------------------------------------------------------------- miniaturas guardadas localmente (proxy com cache)

export async function cachedImage(url) {
  const key = crypto.createHash("sha1").update(url).digest("hex");
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const hit = fs.readdirSync(CACHE_DIR).find((f) => f.startsWith(key));
  if (hit) return { file: path.join(CACHE_DIR, hit), type: TYPE_OF[path.extname(hit)] || "image/jpeg" };
  const { buf, type } = await fetchLimited(url, { accept: "image/*", max: 6_000_000 });
  const ext = EXT_OF[type.split(";")[0].trim()] || null;
  if (!ext || buf.length < 100) throw new Error("Não é uma imagem.");
  const file = path.join(CACHE_DIR, key + ext);
  fs.writeFileSync(file, buf);
  return { file, type: TYPE_OF[ext] };
}
const EXT_OF = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif" };
const TYPE_OF = Object.fromEntries(Object.entries(EXT_OF).map(([t, e]) => [e, t]));

// ---------------------------------------------------------------- operações

function normalize(input, prev = {}) {
  const category = CAT_IDS.has(input.category) ? input.category : prev.category || "outro";
  const status = ST_IDS.has(input.status) ? input.status : prev.status || "quero";
  const rating = input.rating == null ? prev.rating ?? null : Math.max(0, Math.min(5, Math.round(Number(input.rating) || 0))) || null;
  return {
    ...prev,
    title: str(input.title ?? prev.title, 200) || "Sem título",
    url: str(input.url ?? prev.url, 1000),
    category,
    status,
    image: str(input.image ?? prev.image, 1000),
    notes: str(input.notes ?? prev.notes, 4000),
    site: str(input.site ?? prev.site, 120),
    description: str(input.description ?? prev.description, 300),
    rating,
    updatedAt: nowIso(),
    ...(status === "feito" && prev.status !== "feito" ? { doneAt: nowIso() } : {}),
  };
}

/** Adiciona a partir de um link (busca título, imagem e categoria) ou de um título solto. */
export async function addItem({ input, category, status }) {
  const text = str(input, 1000);
  if (!text) throw new Error("Cole um link ou escreva um título.");
  let base = { title: text, url: "", image: "", category: category || "outro" };
  if (/^https?:\/\//i.test(text)) {
    base = { title: "", url: text, image: "", category: category || guessCategory(text) };
    try {
      const m = await fetchMeta(text);
      base = { ...base, title: m.title || new URL(text).hostname, image: m.image, site: m.site, description: m.description, category: category && category !== "outro" ? category : m.category || base.category };
    } catch {
      base.title = new URL(text).hostname.replace(/^www\./, "");
    }
  }
  const d = readLazer();
  const item = { id: newId(), createdAt: nowIso(), ...normalize({ ...base, status }) };
  d.items.unshift(item);
  writeLazer(d);
  return item;
}

export function updateItem(id, patch) {
  const d = readLazer();
  const i = d.items.findIndex((x) => x.id === id);
  if (i < 0) throw new Error("Item não encontrado.");
  d.items[i] = normalize(patch, d.items[i]);
  writeLazer(d);
  return d.items[i];
}

export function deleteItem(id) {
  const d = readLazer();
  const n = d.items.length;
  d.items = d.items.filter((x) => x.id !== id);
  if (d.items.length === n) throw new Error("Item não encontrado.");
  writeLazer(d);
}

export function reorder(ids) {
  const d = readLazer();
  const pos = new Map(ids.map((id, i) => [id, i]));
  d.items.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e9) - (pos.has(b.id) ? pos.get(b.id) : 1e9));
  writeLazer(d);
}
