// Leitura de uma nota markdown: frontmatter simples, título, tags (#tag), links [[...]] e menções (@Nome).

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function slug(s) {
  return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

function parseValue(v) {
  const s = v.trim();
  if (s === "") return "";
  if (s.startsWith("[") && s.endsWith("]")) {
    return s.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  return s.replace(/^["']|["']$/g, "");
}

/** Frontmatter YAML mínimo: `chave: valor`, `chave: [a, b]` e listas `- item`. */
export function parseFrontmatter(raw) {
  const m = FM_RE.exec(raw);
  if (!m) return { fm: {}, body: raw, hasFm: false };
  const fm = {};
  let lastKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const li = /^\s*-\s+(.*)$/.exec(line);
    if (li && lastKey) {
      if (!Array.isArray(fm[lastKey])) fm[lastKey] = fm[lastKey] ? [fm[lastKey]] : [];
      fm[lastKey].push(li[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const kv = /^([A-Za-z0-9_\-À-ÿ]+)\s*:\s*(.*)$/.exec(line);
    if (kv) {
      lastKey = kv[1].toLowerCase();
      fm[lastKey] = parseValue(kv[2]);
    }
  }
  return { fm, body: raw.slice(m[0].length), hasFm: true };
}

/** Separa o bloco de frontmatter (com os ---) do corpo, preservando os dois exatamente. */
export function splitFrontmatter(raw) {
  const m = FM_RE.exec(raw);
  return m ? { head: m[0], body: raw.slice(m[0].length) } : { head: "", body: raw };
}

function fmValueToString(v) {
  if (Array.isArray(v)) return `[${v.join(", ")}]`;
  return String(v);
}

/** Define/remove uma chave do frontmatter sem mexer no resto do texto. */
export function setFrontmatterKey(raw, key, value) {
  const k = key.toLowerCase();
  const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
  const m = FM_RE.exec(raw);
  if (!m) {
    if (empty) return raw;
    return `---\n${k}: ${fmValueToString(value)}\n---\n\n${raw.replace(/^\s+/, "")}`;
  }
  const lines = m[1].split(/\r?\n/);
  const out = [];
  let replaced = false;
  let skipList = false;
  for (const line of lines) {
    if (skipList && /^\s*-\s+/.test(line)) continue;
    skipList = false;
    const kv = /^([A-Za-z0-9_\-À-ÿ]+)\s*:/.exec(line);
    if (kv && kv[1].toLowerCase() === k) {
      replaced = true;
      skipList = true;
      if (!empty) out.push(`${k}: ${fmValueToString(value)}`);
      continue;
    }
    out.push(line);
  }
  if (!replaced && !empty) out.push(`${k}: ${fmValueToString(value)}`);
  const rest = raw.slice(m[0].length);
  if (out.filter((l) => l.trim()).length === 0) return rest.replace(/^\s+/, "");
  return `---\n${out.join("\n")}\n---\n${rest.startsWith("\n") ? "" : "\n"}${rest}`;
}

function stripCode(body) {
  return body.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
}

const LINK_RE = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g;
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu;
const MENTION_RE = /(^|[\s(])@(?:"([^"\n]+)"|([\p{L}\p{N}_][\p{L}\p{N}_\-]*))/gu;

export function extractLinks(body) {
  const out = [];
  for (const m of stripCode(body).matchAll(LINK_RE)) out.push(m[1].trim());
  return out;
}
export function extractTags(body) {
  const out = [];
  for (const m of stripCode(body).matchAll(TAG_RE)) out.push(m[2].toLowerCase());
  return out;
}
export function extractMentions(body) {
  const out = [];
  for (const m of stripCode(body).matchAll(MENTION_RE)) out.push((m[2] ?? m[3]).trim());
  return out;
}

export function extractHeadings(body) {
  const out = [];
  for (const line of stripCode(body).split("\n")) {
    const m = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2] });
  }
  return out;
}

function asList(v) {
  if (v == null || v === "") return [];
  return (Array.isArray(v) ? v : String(v).split(",")).map((x) => String(x).trim().replace(/^#/, "")).filter(Boolean);
}

/** Interpreta uma nota completa. `relPath` é o caminho no cofre (com .md). */
export function parseNote(raw, relPath) {
  const { fm, body } = parseFrontmatter(raw);
  const base = relPath.split("/").pop().replace(/\.md$/i, "");
  const h1 = /^#\s+(.+?)\s*#*\s*$/m.exec(body);
  const title = String(fm.title || (h1 && h1[1]) || base).trim();
  const tags = [...new Set([...asList(fm.tags).map((t) => t.toLowerCase()), ...extractTags(body)])];
  return {
    path: relPath,
    title,
    base,
    type: String(fm.tipo || fm.type || "nota").trim().toLowerCase() || "nota",
    area: String(fm.area || fm["área"] || "").trim(),
    tags,
    links: extractLinks(body),
    mentions: extractMentions(body),
    headings: extractHeadings(body),
    words: (body.match(/\S+/g) || []).length,
    fm,
  };
}
