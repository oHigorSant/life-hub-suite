import { query } from "@anthropic-ai/claude-agent-sdk";
import { recordLimitEvent } from "./home/usage.js";

// Sessão salva (data/.chat-session.json ou .dev-session.json) aponta pra um
// histórico que só existe na máquina onde ele foi gerado — depois de migrar
// de servidor (ou limpar ~/.claude localmente), o resume falha com esse erro.
const SESSION_NOT_FOUND_RE = /no conversation found|session.*not found/i;

async function runOnce(message, options, resume) {
  const finalOptions = resume ? { ...options, resume } : options;
  let finalText = null;
  let newSessionId = resume ?? null;
  let errorText = null;

  try {
    for await (const msg of query({ prompt: message, options: finalOptions })) {
      if (msg.type === "system" && msg.subtype === "init") {
        newSessionId = msg.session_id ?? newSessionId;
      } else if (msg.type === "rate_limit_event") {
        recordLimitEvent(msg);
      } else if (msg.type === "result") {
        newSessionId = msg.session_id ?? newSessionId;
        if (msg.subtype === "success") {
          finalText = msg.result;
        } else {
          errorText = msg.result ?? msg.errors?.join("; ") ?? `Erro: ${msg.subtype}`;
        }
      }
    }
  } catch (err) {
    // Sessão de resume inexistente derruba o generator com uma exceção, não
    // uma mensagem "result" — trata igual pra dar chance ao retry abaixo.
    errorText = err.message ?? String(err);
  }
  return { finalText, newSessionId, errorText };
}

/**
 * Roda uma mensagem no Claude Agent SDK, retomando `sessionId` quando
 * presente. Se o resume falhar por sessão inexistente, tenta de novo do
 * zero (sessão nova) em vez de devolver erro pro usuário — a mensagem dele
 * não pode se perder por causa de um id de sessão obsoleto.
 */
export async function runAgentQuery(message, options, sessionId) {
  let result = await runOnce(message, options, sessionId ?? undefined);
  if (result.errorText && sessionId && SESSION_NOT_FOUND_RE.test(result.errorText)) {
    result = await runOnce(message, options, undefined);
  }
  return result;
}
