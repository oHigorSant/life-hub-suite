import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db, now, uid, j, parse, tx, logEvent } from "./db.js";
import { UPLOADS_DIR, ROOT } from "./paths.js";
import { askJson, readImage, pLimit } from "./llm.js";
import { runJob } from "./jobs.js";

const run = promisify(execFile);
const BIG = { maxBuffer: 512 * 1024 * 1024 };

const EXT_KIND = {
  pdf: "pdf",
  txt: "text", md: "text", markdown: "text", rtf: "text", csv: "text", json: "text", html: "text", htm: "text",
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", bmp: "image",
  mp3: "audio", wav: "audio", m4a: "audio", ogg: "audio", flac: "audio", opus: "audio", aac: "audio",
  mp4: "video", mkv: "video", mov: "video", webm: "video", avi: "video",
};

export function kindFromName(name) {
  const ext = path.extname(name || "").slice(1).toLowerCase();
  return EXT_KIND[ext] || "text";
}

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// ------------------------------------------------------------------ registro

export function registerFile(subjectId, { buffer, filename, mime }) {
  const id = uid("src_");
  const dir = path.join(UPLOADS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const safe = filename.replace(/[^\w.\- ()]+/g, "_");
  const filePath = path.join(dir, safe);
  fs.writeFileSync(filePath, buffer);
  db()
    .prepare(
      "INSERT INTO sources(id, subject_id, kind, title, filename, path, mime, bytes, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    )
    .run(id, subjectId, kindFromName(filename), filename.replace(/\.[^.]+$/, ""), safe, filePath, mime || null, buffer.length, "queued", now());
  return id;
}

export function registerText(subjectId, { title, text }) {
  const id = uid("src_");
  const dir = path.join(UPLOADS_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "texto.txt");
  fs.writeFileSync(filePath, text);
  db()
    .prepare("INSERT INTO sources(id, subject_id, kind, title, filename, path, bytes, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(id, subjectId, "text", title || "Texto colado", "texto.txt", filePath, Buffer.byteLength(text), "queued", now());
  return id;
}

export function registerUrl(subjectId, url) {
  const id = uid("src_");
  db()
    .prepare("INSERT INTO sources(id, subject_id, kind, title, url, status, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, subjectId, "url", url, url, "queued", now());
  return id;
}

// ------------------------------------------------------------------ extração

async function extractPdf(src, report) {
  const { stdout: info } = await run("pdfinfo", [src.path], BIG).catch(() => ({ stdout: "" }));
  const pages = Number(info.match(/Pages:\s+(\d+)/)?.[1] || 0);
  const { stdout } = await run("pdftotext", ["-layout", "-enc", "UTF-8", src.path, "-"], BIG);
  const raw = stdout.split("\f");
  if (raw[raw.length - 1].trim() === "") raw.pop();
  const units = raw.map((t, i) => ({ locator: `p.${i + 1}`, text: t.replace(/[ \t]+\n/g, "\n").trim() })).filter((u) => u.text);
  const chars = units.reduce((n, u) => n + u.text.length, 0);
  // PDF escaneado (quase sem texto): OCR por visão, em lotes de páginas.
  if (pages && chars / pages < 150) {
    report(0.05, "PDF escaneado — lendo páginas com visão…");
    return { pages, units: await ocrPdf(src, pages, report) };
  }
  return { pages: pages || raw.length, units };
}

async function ocrPdf(src, pages, report) {
  const dir = path.join(path.dirname(src.path), "pages");
  fs.mkdirSync(dir, { recursive: true });
  await run("pdftoppm", ["-r", "110", "-jpeg", src.path, path.join(dir, "p")], BIG);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
  const B = 3;
  const limit = pLimit(3);
  const units = [];
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.ceil(files.length / B) }, (_, bi) =>
      limit(async () => {
        const batch = files.slice(bi * B, bi * B + B);
        const text = await readImage(
          batch.map((f) => path.join(dir, f))[0],
          `Transcreva fielmente TODO o texto das páginas a seguir, na ordem, separando cada página com uma linha "=== PÁGINA N ===" (N = número no nome do arquivo). Inclua fórmulas e descreva figuras/tabelas entre colchetes. Arquivos (leia todos com Read): ${batch.map((f) => path.join(dir, f)).join(" | ")}`
        );
        const parts = text.split(/===\s*P[ÁA]GINA\s+(\d+)\s*===/i);
        for (let i = 1; i < parts.length; i += 2) units.push({ locator: `p.${Number(parts[i])}`, text: parts[i + 1].trim() });
        done += batch.length;
        report(0.05 + 0.25 * (done / files.length), `OCR ${done}/${files.length} páginas`);
      })
    )
  );
  units.sort((a, b) => Number(a.locator.slice(2)) - Number(b.locator.slice(2)));
  return units.filter((u) => u.text);
}

function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

async function extractMedia(src, report) {
  const wav = path.join(path.dirname(src.path), "audio.wav");
  report(0.05, "Extraindo áudio…");
  await run("ffmpeg", ["-y", "-i", src.path, "-vn", "-ac", "1", "-ar", "16000", wav], BIG);
  report(0.1, "Transcrevendo (Whisper local)…");
  const py = process.env.ATLAS_PYTHON || path.join(process.env.HOME, "apps/english-trainer/.venv/bin/python");
  const { stdout } = await run(py, [path.join(ROOT, "scripts/transcribe.py"), wav], { ...BIG, timeout: 6 * 3600_000 });
  const data = JSON.parse(stdout.trim().split("\n").pop());
  // Agrupa segmentos em janelas de ~75s para virar unidades com timestamp.
  const units = [];
  let cur = null;
  for (const s of data.segments) {
    if (!cur || s.end - cur.start > 75) {
      cur = { start: s.start, end: s.end, text: s.text };
      units.push(cur);
    } else {
      cur.end = s.end;
      cur.text += " " + s.text;
    }
  }
  const ts = (t) => new Date(t * 1000).toISOString().slice(11, 19);
  return { duration: data.duration, units: units.map((u) => ({ locator: `${ts(u.start)}-${ts(u.end)}`, text: u.text })) };
}

async function extract(src, report) {
  switch (src.kind) {
    case "pdf":
      return extractPdf(src, report);
    case "image": {
      report(0.1, "Lendo imagem com visão…");
      const text = await readImage(
        src.path,
        "Transcreva fielmente todo o texto da imagem. Se for diagrama/figura/quadro/fórmula, descreva a estrutura e o conteúdo de modo que alguém que não vê a imagem consiga estudar a partir da descrição."
      );
      return { units: [{ locator: "imagem", text }] };
    }
    case "audio":
    case "video":
      return extractMedia(src, report);
    case "url": {
      report(0.1, "Baixando página…");
      const res = await fetch(src.url, { headers: { "user-agent": "Mozilla/5.0 AtlasStudy" }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`URL respondeu ${res.status}`);
      const ct = res.headers.get("content-type") || "";
      const body = await res.text();
      return { units: [{ locator: "página", text: ct.includes("html") ? htmlToText(body) : body }] };
    }
    default: {
      let text = fs.readFileSync(src.path, "utf8");
      if (/\.html?$/i.test(src.filename || "")) text = htmlToText(text);
      return { units: [{ locator: "texto", text }] };
    }
  }
}

// ------------------------------------------------------------------ chunking

const MAX_CHARS = 2200;
const HEADING_RE = /^(?:(?:cap[ií]tulo|chapter|se[cç][aã]o|section|parte|part|unidade|unit|aula|lesson)\s+[\w.]+.*|\d+(?:\.\d+){0,3}[.)]?\s+\p{Lu}.{2,80}|\p{Lu}[\p{Lu}\s\d:–-]{5,80})$/iu;

function findHeading(text) {
  for (const line of text.split("\n").slice(0, 30)) {
    const l = line.trim();
    if (l.length > 3 && l.length < 90 && !/[.;,]$/.test(l) && HEADING_RE.test(l)) return l;
  }
  return null;
}

export function chunkUnits(units) {
  const out = [];
  let buf = [];
  let size = 0;
  let heading = null;
  const flush = () => {
    if (!buf.length) return;
    out.push({
      locator: buf[0].locator === buf[buf.length - 1].locator ? buf[0].locator : `${buf[0].locator}–${buf[buf.length - 1].locator}`,
      heading,
      text: buf.map((b) => b.text).join("\n\n"),
    });
    buf = [];
    size = 0;
  };
  for (const u of units) {
    const h = findHeading(u.text);
    if (h) {
      flush();
      heading = h;
    }
    // Unidade enorme (texto corrido/transcrição) → divide em parágrafos.
    const pieces = [];
    if (u.text.length > MAX_CHARS * 1.5) {
      let acc = "";
      for (const para of u.text.split(/\n\s*\n|(?<=[.!?])\s+(?=\p{Lu})/u)) {
        if (acc.length + para.length > MAX_CHARS && acc) {
          pieces.push(acc);
          acc = "";
        }
        acc += (acc ? "\n\n" : "") + para;
      }
      if (acc) pieces.push(acc);
    } else pieces.push(u.text);
    for (const p of pieces) {
      if (size + p.length > MAX_CHARS && buf.length) flush();
      buf.push({ locator: u.locator, text: p });
      size += p.length;
    }
  }
  flush();
  return out;
}

// ------------------------------------------------------------------ análise (map → reduce)

const MAP_SYSTEM = `Você é um especialista em engenharia do conhecimento. Recebe trechos de um material de estudo e extrai ÁTOMOS DE CONHECIMENTO fiéis ao material.
Para cada conceito capture: definição precisa, metodologia/abordagem (como o autor ensina ou aplica: passos, método, raciocínio), critérios (como distinguir correto de incorreto, o que significa dominar) e referências citadas (autores, obras, normas, exemplos canônicos).
Regras: seja fiel ao texto (não invente). Em definição, metodologia e critérios, só escreva nomes (tabelas, colunas, procedures, arquivos, normas, números, versões) e exemplos que apareçam LITERALMENTE no trecho; nunca complete um padrão com um exemplo seu (se o texto diz tb_{tipo}_{REG}, não escreva um nome concreto que o texto não traz); na dúvida, descreva sem o nome; prefira conceitos específicos a rótulos genéricos; ignore ruído (índices, rodapés, anúncios); 'importance' 1-5 (5 = central para dominar a área); 'chunk_ids' = ids dos trechos onde o conceito é INTRODUZIDO e explicado (a sua primeira exposição neste bloco). NÃO liste trechos que apenas mencionam o conceito de passagem, nem usos posteriores/avançados: eles distorcem a graduação do conteúdo.`;

function groupChunks(chunks, maxChars = 22000) {
  const groups = [];
  let cur = [];
  let size = 0;
  for (const c of chunks) {
    if (size + c.text.length > maxChars && cur.length) {
      groups.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(c);
    size += c.text.length;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

async function mapGroup(src, subject, group) {
  const body = group.map((c) => `[#${c.id} | ${c.locator}${c.heading ? " | " + c.heading : ""}]\n${c.text}`).join("\n\n");
  const res = await askJson({
    system: MAP_SYSTEM,
    prompt: `Área de estudo: ${subject.title}\nObjetivo do aluno: ${subject.goal || "dominar a área"}\nFonte: ${src.title}\n\nTRECHOS:\n${body}\n\nDevolva JSON:
{"digest":"2-4 frases do que este bloco ensina","concepts":[{"title":"","definition":"","methodology":"","criteria":"","refs":"","importance":3,"chunk_ids":[0]}]}`,
  });
  return { digest: res.digest || "", concepts: Array.isArray(res.concepts) ? res.concepts : [], ids: new Set(group.map((c) => c.id)), first: group[0], last: group[group.length - 1] };
}

function storeConcepts(subjectId, sourceId, concepts, validIds) {
  const upsert = db().prepare(
    `INSERT INTO concepts(subject_id, source_id, title, norm, definition, methodology, criteria, refs, importance, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(subject_id, norm) DO UPDATE SET
       definition = COALESCE(NULLIF(excluded.definition,''), concepts.definition),
       methodology = COALESCE(NULLIF(excluded.methodology,''), concepts.methodology),
       criteria = COALESCE(NULLIF(excluded.criteria,''), concepts.criteria),
       refs = COALESCE(NULLIF(excluded.refs,''), concepts.refs),
       importance = MAX(concepts.importance, excluded.importance)`
  );
  const get = db().prepare("SELECT id FROM concepts WHERE subject_id=? AND norm=?");
  const link = db().prepare("INSERT OR IGNORE INTO concept_chunks(concept_id, chunk_id) VALUES (?,?)");
  tx(() => {
    for (const c of concepts) {
      const title = String(c.title || "").trim();
      if (!title) continue;
      const n = norm(title);
      if (!n) continue;
      const imp = Math.min(5, Math.max(1, Number(c.importance) || 3));
      upsert.run(subjectId, sourceId, title, n, c.definition || "", c.methodology || "", c.criteria || "", c.refs || "", imp, now());
      const id = get.get(subjectId, n).id;
      for (const cid of c.chunk_ids || []) if (validIds.has(Number(cid))) link.run(id, Number(cid));
    }
  });
}

async function reduceSource(src, subject, digests) {
  let items = digests.map((d) => `(${d.first.locator} → ${d.last.locator}) ${d.digest}`);
  // Redução hierárquica quando a fonte é gigante.
  while (items.join("\n").length > 60000) {
    const next = [];
    for (let i = 0; i < items.length; i += 40) {
      const part = items.slice(i, i + 40).join("\n");
      const r = await askJson({
        system: "Condense os resumos preservando a ordem, os localizadores e a estrutura de capítulos/temas.",
        prompt: `${part}\n\nJSON: {"items":["(localizador inicial → final) resumo condensado", ...]} com no máximo 10 itens.`,
      });
      next.push(...(r.items || []));
    }
    if (next.length >= items.length) break;
    items = next;
  }
  return askJson({
    system:
      "Você mapeia materiais de estudo. Com os resumos sequenciais de uma fonte, produza o 'índice inteligente': resumo geral, a metodologia/abordagem didática que a fonte adota (como organiza e ensina, critérios de qualidade, referências-base) e o outline em seções.",
    prompt: `Fonte: ${src.title} (${src.kind})\nÁrea: ${subject.title}\n\nRESUMOS EM ORDEM:\n${items.join("\n")}\n\nJSON: {"summary":"","methodology":"","outline":[{"title":"","summary":"","locator":""}]}`,
  });
}

// ------------------------------------------------------------------ pipeline

export function processSource(sourceId) {
  const src0 = db().prepare("SELECT * FROM sources WHERE id=?").get(sourceId);
  return runJob("ingest", src0.subject_id, sourceId, async (report) => {
    const src = db().prepare("SELECT * FROM sources WHERE id=?").get(sourceId);
    const subject = db().prepare("SELECT * FROM subjects WHERE id=?").get(src.subject_id);
    const setStatus = (status, error = null) => db().prepare("UPDATE sources SET status=?, error=? WHERE id=?").run(status, error, sourceId);
    try {
      setStatus("extracting");
      const ex = await extract(src, report);
      if (!ex.units.some((u) => u.text?.trim())) throw new Error("Nenhum texto extraído do arquivo.");
      const chunks = chunkUnits(ex.units);
      tx(() => {
        db().prepare("DELETE FROM chunks WHERE source_id=?").run(sourceId);
        db().prepare("DELETE FROM concepts WHERE source_id=? AND subject_id=?").run(sourceId, src.subject_id);
        const ins = db().prepare("INSERT INTO chunks(source_id, subject_id, ord, locator, heading, text) VALUES (?,?,?,?,?,?)");
        chunks.forEach((c, i) => ins.run(sourceId, src.subject_id, i, c.locator, c.heading, c.text));
        db().prepare("UPDATE sources SET pages=?, duration_sec=? WHERE id=?").run(ex.pages ?? null, ex.duration ?? null, sourceId);
      });
      report(0.32, `${chunks.length} trechos indexados`);

      setStatus("analyzing");
      const rows = db().prepare("SELECT id, locator, heading, text FROM chunks WHERE source_id=? ORDER BY ord").all(sourceId);
      const groups = groupChunks(rows);
      const limit = pLimit(Number(process.env.ATLAS_LLM_PARALLEL || 3));
      let done = 0;
      const digests = await Promise.all(
        groups.map((g) =>
          limit(async () => {
            const r = await mapGroup(src, subject, g);
            storeConcepts(src.subject_id, sourceId, r.concepts, r.ids);
            done++;
            report(0.32 + 0.55 * (done / groups.length), `Extraindo conceitos ${done}/${groups.length}`);
            return r;
          })
        )
      );
      digests.sort((a, b) => a.first.id - b.first.id);
      report(0.9, "Mapeando a estrutura da fonte…");
      const red = await reduceSource(src, subject, digests);
      db()
        .prepare("UPDATE sources SET summary=?, methodology=?, outline_json=?, status='ready' WHERE id=?")
        .run(red.summary || "", red.methodology || "", j(red.outline || []), sourceId);
      logEvent(src.subject_id, "source_ready", sourceId, { chunks: chunks.length, groups: groups.length });
      return { chunks: chunks.length };
    } catch (e) {
      setStatus("error", String(e?.message || e));
      throw e;
    }
  });
}

export function sourceStats(subjectId) {
  return db()
    .prepare(
      `SELECT s.*, (SELECT COUNT(*) FROM chunks c WHERE c.source_id=s.id) AS chunk_count,
              (SELECT COUNT(*) FROM concepts k WHERE k.source_id=s.id) AS concept_count
       FROM sources s WHERE s.subject_id=? ORDER BY s.created_at DESC`
    )
    .all(subjectId)
    .map((s) => ({ ...s, outline: parse(s.outline_json, []) }));
}
