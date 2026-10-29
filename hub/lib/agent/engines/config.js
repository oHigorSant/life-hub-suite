import fs from "node:fs";
import path from "node:path";
import { emit } from "../../live/bus.js";

// Configuração dos motores de IA: data/engine.json (o que você escolhe na tela /motores e no seletor do chat).
export const ENGINE_FILE = process.env.ENGINE_FILE || path.join(process.cwd(), "data", "engine.json");

export const ENGINES = {
  gemini: { id: "gemini", label: "Gemini (grátis)", kind: "api" },
  claude: { id: "claude", label: "Claude (CLI)", kind: "cli" },
  openrouter: { id: "openrouter", label: "OpenRouter (pago)", kind: "api" },
};

export const DEFAULTS = () => ({
  mode: "auto", // auto = segue a ordem abaixo | manual = usa o motor escolhido
  manual: { engine: "gemini", strict: false }, // strict: se o escolhido falhar, NÃO troca de motor
  chain: ["gemini", "claude", "openrouter"], // ordem do modo automático
  // /dev (alterar código) pode ter ordem própria; vazio = usa a mesma
  devChain: [],
  enabled: { gemini: true, claude: true, openrouter: true },
  models: {
    gemini: ["gemini-3.5-flash-lite", "gemini-3.5-flash"], // tenta na ordem (cada modelo tem a própria cota)
    claude: "claude-haiku-5-5", // Haiku na CLI (gasta menos limite); vazio = padrão do Claude Code; troque na tela /motores
    openrouter: "qwen/qwen3.7-flash", // o mais barato que acertou tudo no teste (alternativa mais rápida: deepseek/deepseek-v4.1-flash)
  },
  // Camada gratuita do Gemini: o Google pode usar o conteúdo para treino. Com a proteção ligada, no modo automático o
  // Gemini NÃO recebe pedidos do chat que toquem dados pessoais (finanças, tarefas, notas, agenda...) e só usa ferramentas seguras.
  privacy: { geminiPersonal: false },
  limits: { maxSteps: { dados: 25, dev: 40 } },
});

let queue = Promise.resolve();

function sanitize(j) {
  const d = DEFAULTS();
  const ids = Object.keys(ENGINES);
  const okChain = (c) => [...new Set((Array.isArray(c) ? c : []).filter((x) => ids.includes(x)))];
  const chain = okChain(j.chain);
  for (const id of d.chain) if (!chain.includes(id)) chain.push(id); // nunca perde um motor da lista
  const models = { ...d.models, ...(j.models || {}) };
  const gem = (Array.isArray(models.gemini) ? models.gemini : String(models.gemini || "").split(",")).map((s) => String(s).trim()).filter((s) => /^[\w.\-]+$/.test(s));
  return {
    mode: j.mode === "manual" ? "manual" : "auto",
    manual: { engine: ids.includes(j.manual?.engine) ? j.manual.engine : d.manual.engine, strict: !!j.manual?.strict },
    chain,
    devChain: okChain(j.devChain),
    enabled: { ...d.enabled, ...Object.fromEntries(ids.map((i) => [i, j.enabled?.[i] !== false])) },
    models: {
      gemini: gem.length ? gem : d.models.gemini,
      claude: typeof models.claude === "string" && /^[\w.\-\[\]]*$/.test(models.claude) ? models.claude : "",
      openrouter: typeof models.openrouter === "string" && /^[\w.\-:~\/]+$/.test(models.openrouter) ? models.openrouter : d.models.openrouter,
    },
    privacy: { geminiPersonal: j.privacy?.geminiPersonal === true },
    limits: { maxSteps: { dados: clamp(j.limits?.maxSteps?.dados, 3, 80, d.limits.maxSteps.dados), dev: clamp(j.limits?.maxSteps?.dev, 3, 120, d.limits.maxSteps.dev) } },
  };
}
const clamp = (v, a, b, def) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Math.round(Number(v)))) : def);

export function readEngineConfig() {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(ENGINE_FILE, "utf8")); } catch { /* padrão */ }
  return sanitize(j);
}

export function saveEngineConfig(patch) {
  const run = queue.then(() => {
    const cur = readEngineConfig();
    const next = sanitize({ ...cur, ...patch, manual: { ...cur.manual, ...(patch.manual || {}) }, enabled: { ...cur.enabled, ...(patch.enabled || {}) }, models: { ...cur.models, ...(patch.models || {}) }, privacy: { ...cur.privacy, ...(patch.privacy || {}) }, limits: { maxSteps: { ...cur.limits.maxSteps, ...(patch.limits?.maxSteps || {}) } } });
    fs.mkdirSync(path.dirname(ENGINE_FILE), { recursive: true });
    fs.writeFileSync(`${ENGINE_FILE}.tmp`, JSON.stringify(next, null, 2));
    fs.renameSync(`${ENGINE_FILE}.tmp`, ENGINE_FILE);
    emit("engines");
    return next;
  });
  queue = run.catch(() => {});
  return run;
}

/** Chaves do Gemini: GEMINI_API_KEY (principal) + GEMINI_API_KEYS (extras, separadas por vírgula). */
export function geminiKeys() {
  const list = [process.env.GEMINI_API_KEY, ...String(process.env.GEMINI_API_KEYS || "").split(",")].map((s) => (s || "").trim()).filter(Boolean);
  return [...new Set(list)].map((key, i) => ({ key, id: `g${i + 1}`, tail: key.slice(-4) }));
}
export const openrouterKey = () => (process.env.OPENROUTER_API_KEY || "").trim() || null;
