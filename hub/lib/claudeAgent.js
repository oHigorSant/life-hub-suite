import { promises as fs } from "node:fs";
import { PROJECT_ROOT, DATA_DIR, UPLOADS_DIR, SESSION_FILE, isWithin } from "./paths.js";
import { appendChatLog } from "./chatLog.js";
import { runAgentQuery } from "./agentQuery.js";

// Only these tools exist for the web-chat agent. No Bash, no Agent, no
// WebFetch/WebSearch — the integration has no code-execution surface at all,
// on top of the path lock below. See CLAUDE.md "Regra de segurança inegociável".
const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];

// Hard technical gate: Write/Edit may only ever touch data/ or uploads/,
// regardless of what CLAUDE.md says or what the model decides. This is what
// makes rule #5 of the project plan (never touch project code from the web
// chat) an actual guarantee instead of a prompt instruction.
async function canUseTool(toolName, input) {
  if (toolName === "Write" || toolName === "Edit") {
    const filePath = input?.file_path;
    if (typeof filePath !== "string" || filePath.length === 0) {
      return { behavior: "deny", message: "Caminho de arquivo ausente ou inválido." };
    }
    if (isWithin(DATA_DIR, filePath) || isWithin(UPLOADS_DIR, filePath)) {
      return { behavior: "allow" };
    }
    return {
      behavior: "deny",
      message:
        `Bloqueado: o chat web só pode escrever dentro de data/ ou uploads/, ` +
        `nunca no código do projeto (tentativa em "${filePath}").`,
    };
  }
  return { behavior: "allow" };
}

async function readSessionId() {
  try {
    const raw = await fs.readFile(SESSION_FILE, "utf8");
    return JSON.parse(raw).sessionId ?? null;
  } catch {
    return null;
  }
}

async function writeSessionId(sessionId) {
  await fs.writeFile(SESSION_FILE, JSON.stringify({ sessionId }, null, 2) + "\n", "utf8");
}

/**
 * Sends one chat message to the Life Hub Claude Code agent and waits for the
 * final reply. Keeps conversation continuity across calls via a session id
 * persisted in data/.chat-session.json (resume), so the model remembers
 * earlier messages the same way an interactive `claude` session would.
 */
export async function sendChatMessage(message) {
  // Logged first, before anything that could throw — the user's own words
  // must never be lost even if the agent call itself fails below.
  await appendChatLog("user", message);

  const sessionId = await readSessionId();

  const options = {
    cwd: PROJECT_ROOT,
    settingSources: ["project"], // required for CLAUDE.md to load
    tools: ALLOWED_TOOLS,
    canUseTool,
  };

  const { finalText, newSessionId, errorText } = await runAgentQuery(message, options, sessionId);

  if (newSessionId) await writeSessionId(newSessionId);

  if (errorText) {
    await appendChatLog("assistant", errorText, { ok: false });
    return { ok: false, reply: errorText };
  }
  const reply = finalText ?? "(sem resposta)";
  await appendChatLog("assistant", reply, { ok: true });
  return { ok: true, reply };
}
