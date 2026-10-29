// Notícias da Home: Google Notícias (RSS) + newsletters Drops (beehiiv: sem RSS, usa sitemap + og:tags).
// Tudo em cache de memória; se uma fonte falhar, mostra o link do dia (arquivo da newsletter).
import fs from "node:fs";
import path from "node:path";

const TTL = 20 * 60_000;
const g = globalThis;
const cache = (g.__lhNews ??= { at: 0, items: null, busy: null, good: false });

const UA = { "user-agent": "Mozilla/5.0 (compatible; LifeHub/1.0)", "accept-language": "pt-BR,pt;q=0.9" };

const DROPS = [
  { id: "techdrops", name: "Tech Drops", host: "https://www.techdrops.com.br" },
  { id: "aidrops", name: "AI Drops", host: "https://www.aidrops.com.br" },
  { id: "moneydrops", name: "Money Drops", host: "https://www.moneydrops.com.br" },
];

async function getText(url, ms = 12_000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms), redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

const decode = (s = "") =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

// sem emojis na interface
const noEmoji = (s = "") => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "").replace(/[̀-ͯ]/g, (m) => (m === "̶" ? "" : m)).replace(/\s{2,}/g, " ").trim();

function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re);
  return decode(m?.[1] ?? m?.[2] ?? "");
}

async function dropLatest(d) {
  const archive = `${d.host}/archive`;
  try {
    const xml = await getText(`${d.host}/sitemap.xml`);
    const posts = [...xml.matchAll(/<loc>([^<]+\/p\/[^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)]
      .map((m) => ({ url: m[1], date: m[2] }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 2);
    const items = [];
    for (const p of posts) {
      try {
        const html = await getText(p.url);
        const title = noEmoji(meta(html, "og:title") || decode((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || ""));
        if (!title) continue;
        items.push({
          source: d.name, sourceId: d.id, title,
          summary: noEmoji(meta(html, "og:description")).slice(0, 220),
          image: meta(html, "og:image") || null,
          url: p.url, date: meta(html, "article:published_time") || p.date,
        });
      } catch { /* pula este post */ }
    }
    if (items.length) return items;
  } catch { /* cai no link do dia */ }
  return [{ source: d.name, sourceId: d.id, title: `Edição do dia — ${d.name}`, summary: "Abrir o arquivo da newsletter.", image: null, url: archive, date: null, fallback: true }];
}

// O link do RSS do Google é um redirecionador opaco: resolve para a URL real da matéria (mesmo fluxo da página do Google Notícias).
async function resolveGoogleLink(link) {
  try {
    const id = new URL(link).pathname.split("/").pop();
    const page = await getText(`https://news.google.com/rss/articles/${id}`, 8000);
    const sg = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sg || !ts) return null;
    const inner = ["garturlreq", [["pt-BR", "BR", ["FINANCE_TOP_INDICES", "WEB_TEST_1_0_0"], null, null, 1, 1, "BR:pt-419", null, 180, null, null, null, null, null, 0, null, null, [1608992183, 723341000]], "pt-BR", "BR", 1, [2, 4, 8], 1, 1, null, 0, 0, null, 0], id, Number(ts), sg];
    const r = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { ...UA, "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", JSON.stringify(inner), null, "generic"]]])),
      signal: AbortSignal.timeout(8000),
    });
    const m = (await r.text()).match(/\\"garturlres\\",\\"(.*?)\\"/);
    return m ? m[1].replace(/\\\\u0026/g, "&") : null;
  } catch { return null; }
}

// imagens de CDN enormes (ex.: glbimg /6500x0/) -> tamanho de cartão
const shrink = (u) => u.replace(/\/(\d{3,5})x0\//, (_, w) => (Number(w) > 1000 ? "/960x0/" : `/${w}x0/`));

async function enrichGoogle(items) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const it = items[next++];
      const real = await resolveGoogleLink(it.url);
      if (!real) continue;
      it.url = real;
      try {
        const html = await getText(real, 7000);
        const img = meta(html, "og:image") || meta(html, "twitter:image");
        if (img && /^https?:\/\//.test(img)) it.image = shrink(img);
      } catch { /* fica sem imagem */ }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return items;
}

async function googleNews() {
  try {
    const xml = await getText("https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419");
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10).map((m) => {
      const it = m[1];
      const tag = (t) => decode((it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || "");
      const full = tag("title");
      const src = tag("source");
      const title = noEmoji(src && full.endsWith(` - ${src}`) ? full.slice(0, -(src.length + 3)) : full);
      return { source: src || "Google Notícias", sourceId: "google", title, summary: "", image: null, url: tag("link"), date: tag("pubDate") || null };
    }).filter((x) => x.title && x.url);
    return await enrichGoogle(items);
  } catch {
    return [{ source: "Google Notícias", sourceId: "google", title: "Abrir o Google Notícias", summary: "", image: null, url: "https://news.google.com/?hl=pt-BR&gl=BR&ceid=BR:pt-419", date: null, fallback: true }];
  }
}

// Se uma fonte falhar agora (rede lenta, site fora), reaproveita o que já tínhamos dela: nunca troca notícias com foto por
// um item "sem foto" só porque a busca de hoje falhou. Também completa fotos que faltaram em itens já conhecidos.
function mergeWithPrevious(items, prev) {
  if (!prev?.length) return items;
  const prevBySource = (id) => prev.filter((x) => x.sourceId === id && !x.fallback);
  const prevImg = new Map(prev.filter((x) => x.image).map((x) => [x.url, x.image]));
  const out = [];
  for (const id of ["techdrops", "aidrops", "moneydrops", "google"]) {
    let cur = items.filter((x) => x.sourceId === id);
    const ok = cur.some((x) => !x.fallback);
    if (!ok && prevBySource(id).length) cur = prevBySource(id);
    out.push(...cur.map((x) => (x.image || !prevImg.has(x.url) ? x : { ...x, image: prevImg.get(x.url) })));
  }
  return out;
}

async function load(prev) {
  const [drops, google] = await Promise.all([Promise.all(DROPS.map(dropLatest)), googleNews()]);
  // intercala: uma edição de cada Drop primeiro (têm imagem), depois as demais e o Google Notícias
  const first = drops.map((l) => l[0]);
  const rest = drops.flatMap((l) => l.slice(1));
  return mergeWithPrevious([...first, ...rest, ...google], prev);
}

const quality = (items) => items.length > 0 && !items.some((x) => x.fallback) && items.filter((x) => x.image).length >= items.length * 0.8;

// cache em disco: depois de um reinício (deploy) a Home já mostra as últimas notícias, com foto, sem esperar a rede
const FILE = path.join(process.cwd(), "data", "news-cache.json");
function readDisk() { try { const j = JSON.parse(fs.readFileSync(FILE, "utf8")); return Array.isArray(j.items) ? j : null; } catch { return null; } }
function writeDisk(items, at) { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(`${FILE}.tmp`, JSON.stringify({ at, items })); fs.renameSync(`${FILE}.tmp`, FILE); } catch { /* cache é opcional */ } }

function refresh() {
  cache.busy ??= load(cache.items)
    .then((items) => { cache.items = items; cache.at = Date.now(); cache.good = quality(items); writeDisk(items, cache.at); return items; })
    .finally(() => { cache.busy = null; });
  return cache.busy;
}

export async function getNews({ force = false } = {}) {
  if (!cache.items) { const d = readDisk(); if (d) { cache.items = d.items; cache.at = d.at || 0; cache.good = quality(d.items); } }
  const ttl = cache.good ? TTL : 3 * 60_000; // resultado incompleto vale pouco: tenta de novo logo
  const fresh = cache.items && Date.now() - cache.at < ttl;
  if (fresh && !force) return { items: cache.items, at: cache.at };
  // há algo para mostrar: devolve na hora e atualiza em segundo plano (stale-while-revalidate)
  if (cache.items?.length && !force) { refresh().catch(() => {}); return { items: cache.items, at: cache.at }; }
  try { await refresh(); } catch { /* mantém o que houver */ }
  return { items: cache.items || [], at: cache.at };
}
