import { promises as fs } from "node:fs";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { PROJECT_ROOT, DATA_DIR, UPLOADS_DIR, SESSION_FILE, isWithin } from "../paths.js";
import { buildHubServer } from "./tools.js";
import { recordLimitEvent } from "../home/usage.js";
import { CONTENT_STANDARD, STUDY_STANDARD } from "../contentStandard.js";

// Agente geral do Life Hub — a MESMA lógica do chat que já existia (Claude Agent SDK guiado pelo CLAUDE.md,
// uma sessão contínua em data/.chat-session.json), agora com ferramentas que agem direto no app
// e uma trava de leitura/escrita. É o que responde na aba do Claude e no botão flutuante.
const BUILTIN = ["Read", "Write", "Edit", "Glob", "Grep"];
const SESSION_NOT_FOUND_RE = /no conversation found|session.*not found/i;

const READ_ROOTS = [DATA_DIR, UPLOADS_DIR, path.join(PROJECT_ROOT, "atlas")];
const READ_FILES = [path.join(PROJECT_ROOT, "CLAUDE.md")];
// escrever à mão aqui corromperia (banco SQLite) ou burlaria a validação
const WRITE_BLOCKED = [path.join(DATA_DIR, "estudos"), path.join(DATA_DIR, "notas", ".meta", "lixeira"), path.join(DATA_DIR, "quadros", ".lixeira")];

const resolveIn = (p) => path.resolve(PROJECT_ROOT, String(p ?? ""));

async function canUseTool(toolName, input) {
  if (toolName.startsWith("mcp__hub__")) return { behavior: "allow" };

  if (toolName === "Read" || toolName === "Glob" || toolName === "Grep") {
    const p = input?.file_path ?? input?.path;
    if (!p) return { behavior: "deny", message: "Informe um caminho dentro de data/, uploads/ ou atlas/ (a raiz do projeto não é pesquisável)." };
    const r = resolveIn(p);
    if (READ_FILES.includes(r) || READ_ROOTS.some((root) => isWithin(root, r))) return { behavior: "allow" };
    return { behavior: "deny", message: "Leitura bloqueada: só é permitido ler data/, uploads/ e atlas/ (nunca código, configuração ou segredos)." };
  }

  if (toolName === "Write" || toolName === "Edit") {
    const r = resolveIn(input?.file_path);
    if (!input?.file_path) return { behavior: "deny", message: "Caminho de arquivo ausente." };
    if (WRITE_BLOCKED.some((b) => isWithin(b, r))) return { behavior: "deny", message: "Esse local é gerenciado pelo app: use as ferramentas (estudos, notes...) em vez de editar o arquivo." };
    if (isWithin(DATA_DIR, r) || isWithin(UPLOADS_DIR, r)) return { behavior: "allow" };
    return { behavior: "deny", message: `Bloqueado: só é permitido escrever em data/ ou uploads/ (tentativa em "${input.file_path}"). Mudanças no código do app se fazem pela página /dev.` };
  }
  return { behavior: "deny", message: `Ferramenta "${toolName}" não está disponível aqui.` };
}

const HUB_APPEND = `
Você é o AGENTE GERAL do Life Hub do usuário: conhece o sistema inteiro (tarefas, finanças, estudos, notas e grafo, quadros do Excalidraw, agenda e relógios, home) e pode manipular tudo.

Como agir:
- Toda mensagem começa com um bloco [Contexto do sistema] com data/hora atuais e a tela aberta. Use isso (ex.: "amanhã", "hoje às 15h").
- AJA NA HORA com as ferramentas mcp__hub__*: time_control (temporizador/pomodoro/cronômetro — sem pedir confirmação), navigate, agenda_events, agenda_routines, notes, graph_views, areas, estudos, tasks_history (histórico de tarefas), trilhas (criar/listar/gerar trilhas de aprendizado no app Trilhas: para pedido simples use generate; para controlar o conteúdo escreva você mesmo com create + add_lessons seguindo as regras da descrição da ferramenta — sempre ENSINAR ANTES DE COBRAR), app_state. Os efeitos aparecem nas telas abertas em tempo real.
- Para saber o que existe/está acontecendo, chame app_state antes de responder.
- Tarefas (data/tasks.json) e finanças (data/finance.json) seguem as regras do CLAUDE.md (editar o arquivo; finanças exigem confirmação antes de gravar).
- Pedidos de organização ("organize tudo sobre Back-end") = ajustar notas/áreas/tags e, se fizer sentido, criar uma visão do grafo e abri-la com navigate.
- MUDAR O CÓDIGO DO APP (implementar telas/funções, corrigir bugs, itens de um quadro de "Implementações") NÃO é feito por este chat: você só escreve em data/ e uploads/. Não tente: responda em 1-2 frases que isso é desenvolvimento, resuma o que entendeu do pedido e diga que ele é feito pela página /dev (ou numa sessão de desenvolvimento). Não gaste passos tentando.
- Nunca invente dados; se faltar uma informação essencial, pergunte em uma frase.
- Responda em português do Brasil, curto: diga o que fez em 1 a 3 frases, sem emojis.

${CONTENT_STANDARD}
Quando o pedido for conteúdo de ESTUDO (nota, resumo, explicação, trilha, aula), aplique também o PADRÃO DE ESTUDO: ${STUDY_STANDARD.split("\n").slice(1, 9).join(" ")}
`;

let hub = null;
const getHub = () => (hub ??= buildHubServer());

// Uma mensagem por vez (a sessão é uma só; duas simultâneas se atropelariam).
let chain = Promise.resolve();
const exclusive = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

async function readSessionId() {
  try { return JSON.parse(await fs.readFile(SESSION_FILE, "utf8")).sessionId ?? null; } catch { return null; }
}
async function writeSessionId(sessionId) {
  await fs.writeFile(SESSION_FILE, JSON.stringify({ sessionId }, null, 2) + "\n", "utf8");
}

const TOOL_LABELS = {
  app_state: "Lendo o estado do sistema",
  time_control: "Controlando o relógio",
  navigate: "Abrindo a tela",
  agenda_events: "Atualizando a agenda",
  agenda_routines: "Atualizando a rotina",
  notes: "Mexendo nas notas",
  graph_views: "Ajustando o grafo",
  areas: "Organizando as áreas",
  estudos: "Consultando os estudos",
  trilhas: "Montando a trilha no app Trilhas",
};
function toolLabel(name) {
  if (name.startsWith("mcp__hub__")) return TOOL_LABELS[name.slice(10)] || "Executando uma ação";
  if (name === "Write" || name === "Edit") return "Gravando alterações";
  return "Consultando os dados";
}

async function runOnce(prompt, options, resume, onEvent) {
  let finalText = null;
  let lastText = null;
  let newSessionId = resume ?? null;
  let errorText = null;
  try {
    for await (const msg of query({ prompt, options: resume ? { ...options, resume } : options })) {
      if (msg.type === "system" && msg.subtype === "init") newSessionId = msg.session_id ?? newSessionId;
      else if (msg.type === "rate_limit_event") recordLimitEvent(msg);
      else if (msg.type === "assistant") {
        for (const b of msg.message?.content || []) {
          if (b.type === "text" && b.text?.trim()) { lastText = b.text; onEvent({ type: "text", text: b.text }); }
          else if (b.type === "tool_use") onEvent({ type: "tool", name: b.name, label: toolLabel(b.name), input: b.input });
        }
      } else if (msg.type === "result") {
        newSessionId = msg.session_id ?? newSessionId;
        if (msg.subtype === "success") finalText = msg.result;
        else if (msg.subtype === "error_max_turns") errorText = "Esse pedido precisa de mais passos do que consigo dar de uma vez. Divida em partes menores — ou, se for mudar o código do app (novas telas, correções de bugs), use a página /dev.";
        else errorText = msg.result ?? msg.errors?.join("; ") ?? `Erro: ${msg.subtype}`;
      }
    }
  } catch (err) {
    errorText = err.message ?? String(err);
  }
  return { finalText: finalText ?? lastText, newSessionId, errorText };
}

/** Roda uma mensagem no agente. `onEvent` recebe {type:"text"|"tool", ...} enquanto trabalha. */
export function runHubAgent({ message, screen, preface = "", model = "" }, onEvent = () => {}) {
  return exclusive(async () => {
    const sessionId = await readSessionId();
    const { server, toolNames } = getHub();
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "medium" });
    const prompt = `[Contexto do sistema — agora: ${agora}; tela aberta: ${screen || "/"}]\n\n${preface ? `${preface}\n\n` : ""}${message}`;
    const options = {
      ...(model ? { model } : {}),
      cwd: PROJECT_ROOT,
      settingSources: ["project"], // carrega o CLAUDE.md
      tools: BUILTIN,
      mcpServers: { hub: server },
      allowedTools: toolNames,
      canUseTool,
      systemPrompt: { type: "preset", preset: "claude_code", append: HUB_APPEND },
      maxTurns: 120,
    };

    let r = await runOnce(prompt, options, sessionId ?? undefined, onEvent);
    if (r.errorText && sessionId && SESSION_NOT_FOUND_RE.test(r.errorText)) r = await runOnce(prompt, options, undefined, onEvent);
    if (r.newSessionId) await writeSessionId(r.newSessionId);

    // o registro do chat e o diário ficam por conta do roteador (lib/agent/router.js)
    if (r.errorText) return { ok: false, reply: r.errorText, error: r.errorText };
    return { ok: true, reply: r.finalText ?? "(sem resposta)" };
  });
}
