import fs from "node:fs";
import path from "node:path";

// Diário compartilhado entre os motores: toda requisição, ação e resposta (feito PELO HUB, não pelo modelo).
// Qualquer motor que assume a vez recebe o resumo do que aconteceu (contextFor) e, assim, mantém o fio da meada.
const DIR = path.join(process.cwd(), "data");
export const JOURNAL_FILE = path.join(DIR, "agent-journal.jsonl");
export const STATE_MD = path.join(DIR, "AGENT-STATE.md");
const MAX_BYTES = 6 * 1024 * 1024;

let seq = 0;
export const newTurnId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

const clip = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

export function journal(entry) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(JOURNAL_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
    // rotação simples: mantém o arquivo abaixo do teto
    if (fs.statSync(JOURNAL_FILE).size > MAX_BYTES) {
      const lines = fs.readFileSync(JOURNAL_FILE, "utf8").split("\n").filter(Boolean);
      fs.writeFileSync(JOURNAL_FILE, lines.slice(-Math.floor(lines.length / 2)).join("\n") + "\n");
    }
  } catch { /* o diário nunca derruba o atendimento */ }
}

export function recentJournal(limit = 400) {
  try {
    const lines = fs.readFileSync(JOURNAL_FILE, "utf8").split("\n").filter(Boolean).slice(-limit);
    return lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/**
 * Contexto compartilhado para o motor que assume: últimas trocas (de qualquer motor) + ações recentes.
 * `surface` separa o chat de dados do /dev; `exceptTurn` omite o turno atual.
 */
export function contextFor(surface, { exceptTurn, turns = 6, actions = 12 } = {}) {
  const ev = recentJournal(500).filter((e) => e.surface === surface && e.turn !== exceptTurn);
  const byTurn = new Map();
  for (const e of ev) {
    const t = byTurn.get(e.turn) ?? { request: null, result: null, actions: [], engine: null };
    if (e.kind === "request") t.request = e;
    else if (e.kind === "result") { t.result = e; t.engine = e.engine; }
    else if (e.kind === "action") t.actions.push(e);
    byTurn.set(e.turn, t);
  }
  const last = [...byTurn.values()].filter((t) => t.request).slice(-turns);
  if (!last.length) return "";
  const lines = ["[Contexto compartilhado — o que aconteceu antes neste sistema, com qualquer motor de IA]"];
  for (const t of last) {
    lines.push(`- Pedido: ${clip(t.request.text, 220)}`);
    const acts = t.actions.slice(-actions).map((a) => `${a.tool}${a.summary ? `(${clip(a.summary, 60)})` : ""}${a.ok === false ? " [falhou]" : ""}`);
    if (acts.length) lines.push(`  Ações (${t.engine || "?"}): ${acts.join(", ")}`);
    if (t.result) lines.push(`  Resposta${t.result.ok === false ? " (com erro)" : ""}: ${clip(t.result.text, 260)}`);
  }
  lines.push("Use isso como memória do que já foi feito; confira o estado real com as ferramentas antes de repetir ações.");
  return lines.join("\n");
}

/** AGENT-STATE.md: resumo legível do estado, regenerado após cada turno (para humanos e para CLIs externas). */
export function writeStateMd({ config, engineNote } = {}) {
  try {
    const ev = recentJournal(300);
    const reqs = ev.filter((e) => e.kind === "request").slice(-8).reverse();
    const lines = [
      "# Estado do agente (gerado automaticamente)",
      "",
      `Atualizado: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      config ? `Motores: modo ${config.mode}${config.mode === "manual" ? ` (${config.manual.engine})` : ` — ordem ${config.chain.join(" > ")}`}` : "",
      engineNote ? `Último atendimento: ${engineNote}` : "",
      "",
      "## Últimos pedidos",
    ];
    for (const r of reqs) {
      const res = ev.find((e) => e.kind === "result" && e.turn === r.turn);
      const acts = ev.filter((e) => e.kind === "action" && e.turn === r.turn).map((a) => a.tool);
      lines.push(`- ${r.ts.slice(0, 16).replace("T", " ")} [${r.surface}] ${clip(r.text, 160)}`);
      lines.push(`  -> ${res ? `${res.engine}: ${clip(res.text, 200)}` : "sem resposta registrada"}${acts.length ? ` | ações: ${[...new Set(acts)].join(", ")}` : ""}`);
    }
    fs.writeFileSync(STATE_MD, lines.filter((l) => l !== undefined).join("\n") + "\n");
  } catch { /* informativo */ }
}
