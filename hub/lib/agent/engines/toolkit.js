import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import { buildHubServer } from "../tools.js";
import { PROJECT_ROOT, DATA_DIR, UPLOADS_DIR, isWithin } from "../../paths.js";

// Ferramentas para os motores de API (Gemini/OpenRouter): as MESMAS ferramentas do hub que o Claude usa (mcp__hub__*)
// + ferramentas de arquivo com as MESMAS travas do chat de dados. No /dev (código) liberam o projeto inteiro e o bash.
const CLIP = 30_000;
const clip = (s, n = CLIP) => { const t = typeof s === "string" ? s : JSON.stringify(s); return t.length > n ? t.slice(0, n) + `\n…(cortado: ${t.length - n} caracteres)` : t; };

let hub = null;
const hubTools = () => (hub ??= buildHubServer().tools);

const READ_ROOTS = [DATA_DIR, UPLOADS_DIR, path.join(PROJECT_ROOT, "atlas")];
const READ_FILES = [path.join(PROJECT_ROOT, "CLAUDE.md"), path.join(PROJECT_ROOT, "ENGINES.md")];
const WRITE_BLOCKED = [path.join(DATA_DIR, "estudos"), path.join(DATA_DIR, "notas", ".meta", "lixeira"), path.join(DATA_DIR, "quadros", ".lixeira"), path.join(DATA_DIR, ".backups")];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".cache"]);
const SECRET_RE = /(^|[\\/])\.env(\.|$)|credentials|oauth_creds|\.pem$|id_rsa/i;

const resolveIn = (p) => path.resolve(PROJECT_ROOT, String(p ?? ""));

function canRead(r, surface) {
  if (SECRET_RE.test(r)) return false;
  if (surface === "dev") return isWithin(PROJECT_ROOT, r);
  return READ_FILES.includes(r) || READ_ROOTS.some((root) => isWithin(root, r));
}
function canWrite(r, surface) {
  if (SECRET_RE.test(r)) return false;
  if (surface === "dev") return isWithin(PROJECT_ROOT, r) && !isWithin(path.join(PROJECT_ROOT, "node_modules"), r);
  if (WRITE_BLOCKED.some((b) => isWithin(b, r))) return false;
  return isWithin(DATA_DIR, r) || isWithin(UPLOADS_DIR, r);
}
const denyRead = (surface) => ({ error: surface === "dev" ? "Leitura bloqueada (segredos ou fora do projeto)." : "Leitura bloqueada: só data/, uploads/, atlas/ e CLAUDE.md (nunca código ou segredos)." });
const denyWrite = (surface) => ({ error: surface === "dev" ? "Escrita bloqueada (segredos ou fora do projeto)." : "Bloqueado: só é permitido escrever em data/ ou uploads/ (e não em locais gerenciados pelo app: use as ferramentas). Mudanças no código se fazem pela página /dev." });

/** Antes de sobrescrever um JSON de dados: valida o JSON novo e guarda cópia (as últimas 8). */
function guardedWrite(r, content) {
  if (/\.json$/i.test(r)) {
    try { JSON.parse(content); } catch (e) { return { error: `JSON inválido, nada foi gravado: ${e.message}` }; }
  }
  fs.mkdirSync(path.dirname(r), { recursive: true });
  if (fs.existsSync(r) && isWithin(DATA_DIR, r)) {
    const bdir = path.join(DATA_DIR, ".backups");
    fs.mkdirSync(bdir, { recursive: true });
    const base = path.relative(DATA_DIR, r).replace(/[\\/]/g, "__");
    try {
      fs.copyFileSync(r, path.join(bdir, `${base}.${Date.now()}.bak`));
      const mine = fs.readdirSync(bdir).filter((f) => f.startsWith(base + ".")).sort();
      for (const old of mine.slice(0, -8)) fs.unlinkSync(path.join(bdir, old));
    } catch { /* backup é melhor esforço */ }
  }
  fs.writeFileSync(r + ".tmp", content);
  fs.renameSync(r + ".tmp", r);
  return { ok: true, bytes: Buffer.byteLength(content) };
}

function walk(dir, out, max = 4000) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (out.length >= max) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, out, max); } else out.push(p);
  }
}

const DENY_BASH = /\bsudo\b|\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME|\.\.|\*)|\bmkfs\b|\bdd\s+if=|:\(\)\s*\{|\bshutdown\b|\breboot\b|\bsystemctl\s+(stop|disable|mask)\b|>\s*\/dev\/sd|(^|[\s\/"'=<>])\.env(\.|\b)|credentials|oauth_creds|\bcurl\b[^|;]*\|\s*(ba)?sh|\bchmod\s+-R\s+777/i;
const SECRET_ENV = /KEY|TOKEN|PASSWORD|SECRET|LIFEHUB|ANTHROPIC|GEMINI|OPENROUTER|YOUVERSION/i;

function runBash(command, timeoutSec) {
  return new Promise((resolve) => {
    if (DENY_BASH.test(command)) return resolve({ error: "Comando bloqueado pela política de segurança (sudo, apagar fora do projeto, segredos, parar serviços...)." });
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !SECRET_ENV.test(k)));
    const child = spawn("bash", ["-c", command], { cwd: PROJECT_ROOT, env });
    let out = "";
    const add = (b) => { if (out.length < 200_000) out += b.toString(); };
    child.stdout.on("data", add); child.stderr.on("data", add);
    const t = setTimeout(() => { child.kill("SIGKILL"); out += "\n[tempo esgotado]"; }, Math.min(Math.max(Number(timeoutSec) || 120, 5), 600) * 1000);
    child.on("close", (code) => { clearTimeout(t); resolve({ exit: code, output: clip(out.slice(-CLIP * 2).slice(-CLIP)) }); });
    child.on("error", (e) => { clearTimeout(t); resolve({ error: e.message }); });
  });
}

// ---------- declarações ----------
const obj = (properties, required = []) => ({ type: "object", properties, required });
const FILE_DECLS = (surface) => {
  const decls = [
    { name: "read_file", description: surface === "dev" ? "Lê um arquivo do projeto (opcional: offset/limit de linhas)." : "Lê um arquivo de data/, uploads/, atlas/ ou o CLAUDE.md (opcional: offset/limit de linhas).", parameters: obj({ path: { type: "string" }, offset: { type: "integer" }, limit: { type: "integer" } }, ["path"]) },
    { name: "list_files", description: "Lista os arquivos de uma pasta (recursivo, até 300).", parameters: obj({ dir: { type: "string" } }, ["dir"]) },
    { name: "grep", description: "Busca um texto/regex nos arquivos de uma pasta e devolve arquivo:linha:trecho (até 80).", parameters: obj({ pattern: { type: "string" }, dir: { type: "string" } }, ["pattern", "dir"]) },
    { name: "write_file", description: surface === "dev" ? "Cria/substitui um arquivo do projeto." : "Cria/substitui um arquivo em data/ ou uploads/ (JSON é validado e há backup automático). Para mudanças pequenas prefira edit_file; para tarefas prefira a ferramenta tasks.", parameters: obj({ path: { type: "string" }, content: { type: "string" } }, ["path", "content"]) },
    { name: "edit_file", description: "Troca um trecho EXATO de um arquivo (old_string deve ocorrer uma única vez, salvo replace_all).", parameters: obj({ path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" }, replace_all: { type: "boolean" } }, ["path", "old_string", "new_string"]) },
  ];
  if (surface === "dev") decls.push({ name: "bash", description: "Executa um comando no servidor, na raiz do projeto (build, testes, git, npm...). Tempo máximo 600 s.", parameters: obj({ command: { type: "string" }, timeout_seconds: { type: "integer" } }, ["command"]) });
  return decls;
};

/** Ferramentas sem dados pessoais (usadas pelo Gemini grátis quando a proteção está ligada). */
export const SAFE_TOOLS = ["biblia", "time_control", "navigate"];
const DOMAIN_RE = /financ|conta\b|contas\b|gast|despes|receit|fatura|cart[aã]o|pagar|pago|saldo|d[ií]vida|parcela|assinatura|ofx|extrato|sal[aá]rio|dinheiro|r\$|tarefa|\bcard|quadro|checklist|prazo|\bnota|anot|agenda|evento|reuni|rotina|estud|aula|flashcard|\bmeta|home|resumo do dia|o que (eu )?tenho|hoje|amanh|semana|hist[oó]rico|upload|arquivo|pdf|anex/i;
/** O pedido mexe com dados pessoais do usuário? (heurística conservadora: na dúvida, é pessoal) */
export const touchesPersonalData = (message) => DOMAIN_RE.test(String(message || ""));

export function toolDeclarations(surface, { only = null } = {}) {
  if (only) {
    return toolDeclarations(surface).filter((d) => only.includes(d.name));
  }
  const hubDecls = hubTools().map((t) => {
    let schema = { type: "object", properties: {} };
    try { schema = z.toJSONSchema(z.object(t.inputSchema || {})); } catch { /* sem parâmetros */ }
    delete schema.$schema; delete schema.additionalProperties;
    return { name: t.name, description: t.description, parameters: schema };
  });
  return [...hubDecls, ...FILE_DECLS(surface)];
}

const LABELS = { app_state: "Lendo o estado do sistema", tasks: "Mexendo nas tarefas", tasks_history: "Consultando o histórico", time_control: "Controlando o relógio", navigate: "Abrindo a tela", agenda_events: "Atualizando a agenda", agenda_routines: "Atualizando a rotina", notes: "Mexendo nas notas", graph_views: "Ajustando o grafo", areas: "Organizando as áreas", estudos: "Consultando os estudos", home: "Ajustando a Home", biblia: "Consultando a Bíblia", read_file: "Lendo arquivos", list_files: "Consultando os arquivos", grep: "Procurando nos arquivos", write_file: "Gravando alterações", edit_file: "Gravando alterações", bash: "Rodando um comando" };
export const toolLabel = (name) => LABELS[name] || "Executando uma ação";

/** Resumo curto dos argumentos para o diário. */
export function summarizeArgs(name, a = {}) {
  const v = a.path || a.dir || a.command || a.title || a.action || a.pattern || "";
  return String(v).replace(/\s+/g, " ").slice(0, 80);
}

export async function executeTool(name, args = {}, { surface = "dados" } = {}) {
  try {
    switch (name) {
      case "read_file": {
        const r = resolveIn(args.path);
        if (!canRead(r, surface)) return denyRead(surface);
        if (!fs.existsSync(r) || fs.statSync(r).isDirectory()) return { error: "Arquivo não encontrado." };
        let txt = fs.readFileSync(r, "utf8");
        if (args.offset || args.limit) { const lines = txt.split("\n"); const o = Math.max(0, (args.offset || 1) - 1); txt = lines.slice(o, o + (args.limit || 400)).join("\n"); }
        return { content: clip(txt) };
      }
      case "list_files": {
        const r = resolveIn(args.dir || ".");
        if (!canRead(r, surface) && !(surface === "dados" && r === PROJECT_ROOT)) return denyRead(surface);
        if (surface === "dados" && r === PROJECT_ROOT) return { files: ["data/", "uploads/", "atlas/", "CLAUDE.md"] };
        const out = []; walk(r, out, 300);
        return { files: out.map((p) => path.relative(PROJECT_ROOT, p).replace(/\\/g, "/")).filter((p) => canRead(resolveIn(p), surface)) };
      }
      case "grep": {
        const r = resolveIn(args.dir || ".");
        if (!canRead(r, surface)) return denyRead(surface);
        let re; try { re = new RegExp(args.pattern, "i"); } catch { re = new RegExp(String(args.pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
        const files = []; walk(r, files, 3000); const hits = [];
        for (const f of files) {
          if (hits.length >= 80) break;
          if (!canRead(f, surface) || fs.statSync(f).size > 1_500_000) continue;
          let txt; try { txt = fs.readFileSync(f, "utf8"); } catch { continue; }
          if (txt.includes("\u0000")) continue;
          txt.split("\n").forEach((line, i) => { if (hits.length < 80 && re.test(line)) hits.push(`${path.relative(PROJECT_ROOT, f).replace(/\\/g, "/")}:${i + 1}:${line.trim().slice(0, 160)}`); });
        }
        return { matches: hits };
      }
      case "write_file": {
        const r = resolveIn(args.path);
        if (!args.path) return { error: "Caminho ausente." };
        if (!canWrite(r, surface)) return denyWrite(surface);
        return guardedWrite(r, String(args.content ?? ""));
      }
      case "edit_file": {
        const r = resolveIn(args.path);
        if (!canWrite(r, surface)) return denyWrite(surface);
        if (!fs.existsSync(r)) return { error: "Arquivo não encontrado." };
        const txt = fs.readFileSync(r, "utf8");
        const n = txt.split(String(args.old_string)).length - 1;
        if (n === 0) return { error: "old_string não encontrado (precisa ser idêntico, inclusive espaços)." };
        if (n > 1 && !args.replace_all) return { error: `old_string ocorre ${n} vezes; dê mais contexto ou use replace_all.` };
        const next = args.replace_all ? txt.split(String(args.old_string)).join(String(args.new_string)) : txt.replace(String(args.old_string), () => String(args.new_string));
        return guardedWrite(r, next);
      }
      case "bash":
        if (surface !== "dev") return { error: "bash só existe na página /dev." };
        return await runBash(String(args.command || ""), args.timeout_seconds);
      default: {
        const t = hubTools().find((x) => x.name === name);
        if (!t) return { error: `Ferramenta desconhecida: ${name}` };
        const res = await t.handler(args, {});
        const text = res?.content?.map((c) => c.text).join("\n") ?? "";
        return res?.isError ? { error: clip(text, 4000) } : { result: clip(text) };
      }
    }
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 400) };
  }
}
