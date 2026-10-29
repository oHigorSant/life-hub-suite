import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { appendChatLog } from "../chatLog.js";
import { PROJECT_ROOT, DEV_LOG_FILE } from "../paths.js";
import { readEngineConfig, ENGINES } from "./engines/config.js";
import { EngineError } from "./engines/errors.js";
import { runGemini, geminiAvailable } from "./engines/gemini.js";
import { runOpenRouter, openrouterAvailable } from "./engines/openrouter.js";
import { runClaude, claudeAvailable } from "./engines/claude.js";
import { systemForData, systemForDev } from "./engines/prompts.js";
import { touchesPersonalData } from "./engines/toolkit.js";
import { journal, contextFor, newTurnId, recentJournal, writeStateMd } from "./journal.js";

// Roteador de motores: escolhe quem atende cada pedido (modo automático = ordem configurada; manual = o escolhido),
// troca de motor sem perder o contexto quando algum falha ou bate o limite, e SEMPRE devolve uma resposta.
const nowStr = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "medium" });
// `impl` é trocável nos testes (scripts/test-router.mjs) para simular falhas sem chamar nenhuma API.
export const impl = {
  gemini: runGemini, claude: runClaude, openrouter: runOpenRouter,
  available: { gemini: geminiAvailable, claude: claudeAvailable, openrouter: openrouterAvailable },
  snapshot: () => snapshotCode(),
};

export function buildChain(cfg, surface, force) {
  const base = surface === "dev" && cfg.devChain.length ? cfg.devChain : cfg.chain;
  const pick = force?.engine || (cfg.mode === "manual" ? cfg.manual.engine : null);
  const strict = force ? !!force.strict : cfg.manual.strict;
  let chain;
  if (pick && ENGINES[pick]) chain = strict ? [pick] : [pick, ...base.filter((e) => e !== pick)];
  else chain = [...base];
  return chain.filter((e) => cfg.enabled[e] !== false || e === force?.engine);
}

const lastEngine = (surface) => {
  const ev = recentJournal(200).filter((e) => e.surface === surface && e.kind === "result" && e.ok !== false);
  return ev.length ? ev[ev.length - 1].engine : null;
};

/** Cópia do código antes de um turno do /dev (rede de segurança contra uma alteração ruim de qualquer motor). */
async function snapshotCode() {
  const dir = path.join(os.homedir(), "backups", "dev-snapshots");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `code-${new Date().toISOString().replace(/[:.]/g, "-")}.tgz`);
    await new Promise((resolve) => {
      const p = spawn("tar", ["--exclude=./node_modules", "--exclude=./.next", "--exclude=./data", "--exclude=./uploads", "--exclude=./logs", "--exclude=./.env*", "-czf", file, "-C", PROJECT_ROOT, "."], { stdio: "ignore" });
      p.on("close", resolve); p.on("error", resolve);
    });
    const old = fs.readdirSync(dir).filter((f) => f.startsWith("code-")).sort().slice(0, -8);
    for (const f of old) fs.unlinkSync(path.join(dir, f));
    return file;
  } catch { return null; }
}

function fmtWhen(ms) {
  const min = Math.max(1, Math.round((ms - Date.now()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h${min % 60 ? ` ${min % 60} min` : ""}` : `${Math.round(h / 24)} dia(s)`;
}

export async function route({ surface = "dados", message, screen = "/", onEvent = () => {}, force = null }) {
  const cfg = readEngineConfig();
  const turn = newTurnId();
  const logFile = surface === "dev" ? DEV_LOG_FILE : undefined;
  const tag = surface === "dev" ? {} : { surface: "agente", tela: screen || null };

  journal({ kind: "request", turn, surface, text: message, screen });
  await appendChatLog("user", message, tag, logFile).catch(() => {});

  const chain = buildChain(cfg, surface, force);
  // Proteção: no automático, o Gemini grátis (Google pode treinar com o conteúdo) não vê pedidos do chat com dados pessoais.
  // Escolher o Gemini à mão (modo manual) vale como consentimento.
  const guardGemini = surface === "dados" && cfg.mode === "auto" && !force && !cfg.privacy.geminiPersonal;
  const actions = [];
  const attempts = [];
  const emit = (e) => { try { onEvent(e); } catch { /* cliente desconectou */ } };
  let snap = null;
  const finishOk = async (r, engine) => {
    journal({ kind: "result", turn, surface, engine, model: r.model, ok: true, text: r.text, usage: r.usage, attempts: attempts.length });
    await appendChatLog("assistant", r.text, { ok: true, engine, model: r.model, ...tag }, logFile).catch(() => {});
    writeStateMd({ config: cfg, engineNote: `${ENGINES[engine]?.label || engine}${r.model ? ` (${r.model})` : ""}` });
    return { ok: true, reply: r.text, engine, model: r.model, attempts, usage: r.usage };
  };

  const attempt = async (engine, ignoreCooldown) => {
    const sharedCtx = contextFor(surface, { exceptTurn: turn });
    const needCtx = engine !== "claude" || lastEngine(surface) !== "claude";
    const note = actions.length ? `[Atenção: antes de uma falha técnica de outro motor, estas ações JÁ foram executadas neste pedido — não as repita: ${actions.map((a) => `${a.tool}${a.summary ? `(${a.summary})` : ""}`).join(", ")}]` : "";
    const preface = [needCtx ? sharedCtx : "", note].filter(Boolean).join("\n\n");
    const onAction = (a) => { actions.push(a); journal({ kind: "action", turn, surface, engine, ...a }); };
    const common = { surface, onEvent: emit, onAction, config: cfg, ignoreCooldown };
    if (surface === "dev" && !snap) snap = await impl.snapshot();
    if (engine === "claude") return impl.claude({ ...common, message, screen, preface });
    const prompt = `[Contexto do sistema — agora: ${nowStr()}${surface === "dev" ? "" : `; tela aberta: ${screen || "/"}`}]\n\n${preface ? `${preface}\n\n` : ""}${message}`;
    const system = surface === "dev" ? systemForDev() : systemForData(message);
    if (engine === "gemini") return impl.gemini({ ...common, system, prompt, safeOnly: guardGemini });
    return impl.openrouter({ ...common, system, prompt });
  };

  let prev = null;
  const pass = async (ignoreCooldown) => {
    for (const engine of chain) {
      if (engine === "gemini" && guardGemini && touchesPersonalData(message)) {
        if (!attempts.some((a) => a.engine === "gemini" && a.privacy)) attempts.push({ engine, skipped: true, privacy: true, reason: "pedido com dados pessoais (proteção do Gemini grátis)" });
        continue;
      }
      if (ignoreCooldown && attempts.some((a) => a.engine === engine && !a.skipped)) continue; // já falhou neste pedido: não insiste
      if (!ignoreCooldown) {
        const av = impl.available[engine](cfg);
        if (!av.ok) { attempts.push({ engine, pass: 1, skipped: true, reason: av.reason, until: av.until }); continue; }
      }
      emit({ type: "engine", engine, label: ENGINES[engine].label, model: engine === "gemini" ? cfg.models.gemini[0] : cfg.models[engine] || "", from: prev });
      try {
        const r = await attempt(engine, ignoreCooldown);
        return await finishOk(r, engine);
      } catch (e) {
        const err = e instanceof EngineError ? e : new EngineError("other", String(e?.message || e));
        attempts.push({ engine, pass: ignoreCooldown ? 2 : 1, kind: err.kind, reason: err.message });
        journal({ kind: "switch", turn, surface, from: engine, reason: err.message, errKind: err.kind });
        if (err.kind === "steps") {
          const text = err.message;
          journal({ kind: "result", turn, surface, engine, ok: false, text });
          await appendChatLog("assistant", text, { ok: false, engine, ...tag }, logFile).catch(() => {});
          return { ok: false, reply: text, engine, attempts };
        }
        prev = engine;
      }
    }
    return null;
  };

  let res = await pass(false);
  if (!res && chain.length) res = await pass(true); // última chance: ignora esperas (podem estar vencidas/ultrapassadas)
  if (res) return res;

  // Nenhum motor respondeu: ainda assim devolvemos uma resposta útil (o chat nunca fica mudo).
  const lines = attempts.map((a) => `- ${ENGINES[a.engine]?.label || a.engine}: ${a.reason || a.kind}${a.until ? ` (volta em ~${fmtWhen(a.until)})` : ""}`);
  const text = `Nenhum motor de IA conseguiu responder agora. Os atalhos instantâneos (temporizador, pomodoro, abrir telas) continuam funcionando.\n\n${lines.join("\n") || "- nenhum motor habilitado (veja /motores)"}\n\nTente de novo em instantes ou escolha outro motor em /motores.`;
  journal({ kind: "result", turn, surface, engine: "none", ok: false, text });
  await appendChatLog("assistant", text, { ok: false, engine: "none", ...tag }, logFile).catch(() => {});
  return { ok: false, reply: text, engine: "none", attempts };
}

/** Teste rápido de um motor (botão "Testar" em /motores): um pedido mínimo, sem diário. */
export async function testEngine(engine) {
  const cfg = readEngineConfig();
  const t0 = Date.now();
  const common = { surface: "dados", onEvent: () => {}, onAction: () => {}, config: cfg, ignoreCooldown: true };
  const system = "Responda apenas com a palavra: ok";
  const prompt = "Teste de conexão.";
  try {
    const r = engine === "claude" ? await runClaude({ ...common, message: "Responda apenas com a palavra: ok (teste de conexão, não use ferramentas).", screen: "/", preface: "" })
      : engine === "gemini" ? await runGemini({ ...common, system, prompt })
        : await runOpenRouter({ ...common, system, prompt });
    return { ok: true, ms: Date.now() - t0, model: r.model, reply: String(r.text).slice(0, 80), usage: r.usage };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, kind: e.kind || "other", error: String(e.message || e).slice(0, 200) };
  }
}
