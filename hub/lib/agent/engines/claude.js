import { promises as fs } from "node:fs";
import { PROJECT_ROOT, DEV_SESSION_FILE } from "../../paths.js";
import { runAgentQuery } from "../../agentQuery.js";
import { runHubAgent } from "../hubAgent.js";
import { EngineError, cooldownMs } from "./errors.js";
import { recordUsage, coolDown, cooldownOf, clearCooldown } from "./usage.js";
import { readUsage } from "../../home/usage.js";

// Claude pela CLI (Claude Agent SDK): mantém a sessão própria, por isso só recebe o contexto compartilhado
// quando outro motor atendeu o turno anterior.
const SLOT = "claude";
const LIMIT_RE = /limit|quota|rate.?limit|overloaded|credit balance|usage|too many requests|429|529/i;
const AUTH_RE = /not logged in|login|authenticat|unauthorized|invalid api key|401/i;

const DEV_APPEND = [
  "Você está rodando na superfície PRIVILEGIADA do Life Hub (a página /dev), usada pelo usuário para desenvolver o projeto remotamente, em geral pelo celular.",
  "",
  "O CLAUDE.md deste projeto contém uma 'Regra de segurança inegociável' que proíbe alterar código. Essa regra vale para o OUTRO chat (o de dados, na página /), que é tecnicamente travado. Ela NÃO se aplica a você.",
  "",
  "Aqui você pode e deve: editar o código do projeto, criar e apagar arquivos, rodar comandos, instalar dependências e fazer build. Não recuse pedidos de desenvolvimento alegando que 'isso é feito no terminal' — aqui é o terminal.",
  "",
  "Cuidados: o servidor de produção roda na porta 4000 a partir de um build; depois de mexer no código é preciso rodar o build de novo e reiniciar para a mudança valer. Avise o usuário quando isso for necessário. Respostas vão para uma bolha de chat no celular — seja direto e evite despejar arquivos inteiros na resposta.",
].join("\n");

async function readDevSession() { try { return JSON.parse(await fs.readFile(DEV_SESSION_FILE, "utf8")).sessionId ?? null; } catch { return null; } }
async function writeDevSession(sessionId) { await fs.writeFile(DEV_SESSION_FILE, JSON.stringify({ sessionId }, null, 2) + "\n", "utf8"); }

function classify(text, usageHint) {
  if (AUTH_RE.test(text) && !LIMIT_RE.test(text)) return new EngineError("auth", `Claude CLI sem login: ${text.slice(0, 140)}`, { slot: SLOT });
  if (LIMIT_RE.test(text)) {
    const w = (usageHint?.windows || []).filter((x) => x.resetsAt && x.percent >= 95).sort((a, b) => a.resetsAt - b.resetsAt)[0];
    return new EngineError("quota-daily", `Limite de uso do Claude atingido. ${text.slice(0, 100)}`, { until: w?.resetsAt || Date.now() + 30 * 60_000, slot: SLOT });
  }
  return new EngineError("other", `Claude: ${text.slice(0, 200)}`, { slot: SLOT });
}

export async function runClaude({ surface, message, screen, preface, onEvent, onAction, config, ignoreCooldown = false }) {
  const c = cooldownOf(SLOT);
  if (!ignoreCooldown && c) throw new EngineError("quota-daily", c.reason || "Claude em espera.", { until: c.until, slot: SLOT });
  const model = config.models.claude || "";
  const usage = { in: 0, out: 0, thoughts: 0, requests: 1, cost: 0 };
  let r;
  try {
    if (surface === "dev") {
      const sessionId = await readDevSession();
      const options = { cwd: PROJECT_ROOT, settingSources: ["project"], canUseTool: async () => ({ behavior: "allow" }), systemPrompt: { type: "preset", preset: "claude_code", append: DEV_APPEND }, ...(model ? { model } : {}) };
      const out = await runAgentQuery(preface ? `${preface}\n\n${message}` : message, options, sessionId);
      if (out.newSessionId) await writeDevSession(out.newSessionId);
      r = out.errorText ? { ok: false, error: out.errorText } : { ok: true, reply: out.finalText ?? "(sem resposta)" };
    } else {
      r = await runHubAgent({ message, screen, preface, model }, (e) => {
        if (e.type === "tool") {
          const name = String(e.name || "").replace(/^mcp__hub__/, "");
          const input = e.input || {};
          onAction({ tool: name, summary: String(input.action || input.file_path || input.title || input.command || "").slice(0, 80), ok: true });
        }
        onEvent(e);
      });
    }
  } catch (e) {
    r = { ok: false, error: String(e.message || e) };
  }
  if (!r.ok) {
    let hint = null; try { hint = await readUsage(); } catch { /* sem dados */ }
    const err = /mais passos|max.?turns/i.test(r.error || "") ? new EngineError("steps", r.error, { slot: SLOT }) : classify(r.error || "erro desconhecido", hint);
    recordUsage(SLOT, { ok: false, error: err.message, surface });
    const ms = err.until ? err.until - Date.now() : cooldownMs(err);
    if (ms > 0) coolDown(SLOT, Date.now() + ms, err.message);
    throw err;
  }
  clearCooldown(SLOT);
  recordUsage(SLOT, { ok: true, surface });
  return { ok: true, text: r.reply, model: model || "padrão", slot: SLOT, usage };
}

export function claudeAvailable(config) {
  const c = cooldownOf(SLOT);
  return c ? { ok: false, reason: c.reason || "em espera", until: c.until } : { ok: true };
}
