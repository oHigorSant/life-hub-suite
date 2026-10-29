import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "node:path";
import { UPLOADS_DIR, DATA_DIR, isWithin } from "./paths.js";
import { db, now } from "./db.js";
import { STUDY_STANDARD } from "../contentStandard.js";

// Todas as chamadas ao modelo passam por aqui: sem ferramentas (exceto leitura de imagem dentro de
// uploads/), sem sessão persistida, sem CLAUDE.md — é só "prompt in, texto/JSON out".
const MODEL = process.env.ATLAS_MODEL || undefined;
const MAX_PARALLEL = Number(process.env.ATLAS_LLM_PARALLEL || 3);

let running = 0;
const waiters = [];
async function slot() {
  if (running >= MAX_PARALLEL) await new Promise((r) => waiters.push(r));
  running++;
}
function release() {
  running--;
  waiters.shift()?.();
}

// Padrões que valem para TODA chamada de inteligência do Atlas (o Claude é o único motor): mantêm o app coerente.
const PRINCIPLES = `PADRÕES DO ATLAS (valem sempre):
- Você é o motor de inteligência do Atlas, um app de estudos que leva o aluno do iniciante ao ápice por uma trilha gradual. Pense como um professor-mestre exigente e honesto.
- Progressão: o aluno só conhece o que foi ensinado até o ponto atual. Nunca cobre, antecipe ou pressuponha conteúdo mais avançado do que o nível em questão.
- Fidelidade: ancore-se no material do aluno quando houver; não invente fatos, números, citações ou referências. Se algo não está no material nem é conhecimento sólido, diga que não sabe.
- Qualidade: específico em vez de genérico; correto antes de bonito; desafiador na medida certa (nem trivial, nem injusto).
- Idioma: português do Brasil, salvo quando o conteúdo exigir outro idioma.
- Formato: siga exatamente o formato de saída pedido. Não use emojis em nenhum conteúdo.

${STUDY_STANDARD}`;

async function runOnce({ system, prompt, tools = [], effort, model, timeoutMs = 600_000 }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const options = {
    cwd: DATA_DIR,
    systemPrompt: `${PRINCIPLES}\n\n${system}`,
    tools,
    settingSources: [],
    persistSession: false,
    maxTurns: tools.length ? 12 : 1,
    abortController: ac,
    ...(model || MODEL ? { model: model || MODEL } : {}),
    ...(effort ? { effort } : {}),
    canUseTool: async (name, input) => {
      if (name === "Read" && typeof input?.file_path === "string" && isWithin(UPLOADS_DIR, input.file_path)) {
        return { behavior: "allow", updatedInput: input };
      }
      return { behavior: "deny", message: "Ferramenta não permitida." };
    },
  };
  let text = null;
  let err = null;
  try {
    for await (const msg of query({ prompt, options })) {
      if (msg.type === "result") {
        if (msg.subtype === "success") text = msg.result;
        else err = msg.result ?? msg.errors?.join("; ") ?? msg.subtype;
      }
    }
  } catch (e) {
    err = e?.message || String(e);
  } finally {
    clearTimeout(timer);
  }
  if (text == null) throw new Error(err || "Modelo não respondeu.");
  return text;
}

function logCall(label, t0, ok, error, cin, cout) {
  try {
    db().prepare("INSERT INTO ai_calls(label, ms, ok, error, chars_in, chars_out, created_at) VALUES (?,?,?,?,?,?,?)").run(label || "ai", Date.now() - t0, ok ? 1 : 0, error ? String(error).slice(0, 300) : null, cin, cout, now());
  } catch {}
}

export async function askText(opts) {
  await slot();
  const t0 = Date.now();
  try {
    const out = await runOnce(opts);
    logCall(opts.label, t0, true, null, String(opts.prompt || "").length, out.length);
    return out;
  } catch (e) {
    logCall(opts.label, t0, false, e?.message, String(opts.prompt || "").length, 0);
    throw e;
  } finally {
    release();
  }
}

function extractJson(raw) {
  let s = String(raw).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = Math.min(...["{", "["].map((c) => (s.indexOf(c) === -1 ? Infinity : s.indexOf(c))));
  if (first === Infinity) throw new Error("sem JSON");
  const open = s[first];
  const close = open === "{" ? "}" : "]";
  const last = s.lastIndexOf(close);
  return JSON.parse(s.slice(first, last + 1));
}

/** Pede JSON estrito; faz uma tentativa de reparo se vier inválido. */
export async function askJson({ system, prompt, ...rest }) {
  const sys = `${system}\n\nResponda SOMENTE com JSON válido (sem markdown, sem comentários, sem texto antes/depois).`;
  let raw = await askText({ system: sys, prompt, ...rest });
  try {
    return extractJson(raw);
  } catch {
    raw = await askText({
      system: sys,
      prompt: `${prompt}\n\n---\nSua resposta anterior não era JSON válido. Reenvie apenas o JSON corrigido, completo.\nResposta anterior:\n${String(raw).slice(0, 12000)}`,
      ...rest,
    });
    return extractJson(raw);
  }
}

/** Lê uma imagem (dentro de uploads/) com visão do modelo e devolve transcrição + descrição. */
export async function readImage(filePath, instruction) {
  if (!isWithin(UPLOADS_DIR, filePath)) throw new Error("caminho fora de uploads/");
  await slot();
  try {
    return await runOnce({
      system:
        "Você extrai conhecimento de imagens para um app de estudos. Use a ferramenta Read para abrir a imagem indicada.",
      prompt: `${instruction}\n\nArquivo: ${path.resolve(filePath)}`,
      tools: ["Read"],
    });
  } finally {
    release();
  }
}

export const pLimit = (n) => {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= n || !q.length) return;
    active++;
    const { fn, res, rej } = q.shift();
    fn()
      .then(res, rej)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) => new Promise((res, rej) => (q.push({ fn, res, rej }), next()));
};
