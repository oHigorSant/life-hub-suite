import { parseIntent, replyFor } from "../intents/parse.js";
import { timeAction } from "../agenda/timers.js";
import { uiCommand } from "../live/bus.js";
import { appendChatLog } from "../chatLog.js";
import { route } from "./router.js";

/**
 * Entrada única de TODA mensagem do usuário (aba do Claude, botão flutuante, grafo...):
 * 1) comandos que o app entende na hora (temporizador, pomodoro, cronômetro, abrir uma tela) são executados
 *    imediatamente, sem esperar o modelo;
 * 2) o resto vai para o agente geral (com ferramentas), que também age direto no sistema.
 */
export async function handleMessage({ message, screen }, onEvent = () => {}) {
  const text = String(message ?? "").trim();
  if (!text) return { ok: false, reply: "Mensagem vazia." };

  const intent = parseIntent(text);
  if (intent) {
    try {
      if (intent.type === "navigate") uiCommand("navigate", { to: intent.to });
      else await timeAction(intent.kind, intent.action, { seconds: intent.seconds, label: intent.label, mode: intent.mode });
      const reply = replyFor(intent);
      await appendChatLog("user", text, { surface: "agente", rapido: true });
      await appendChatLog("assistant", reply, { ok: true, surface: "agente", rapido: true });
      onEvent({ type: "intent", reply });
      return { ok: true, reply, fast: true };
    } catch (e) {
      // se o comando rápido falhar por algum motivo, o agente tenta resolver
      onEvent({ type: "text", text: `(O atalho falhou: ${e.message}. Vou resolver de outro jeito.)` });
    }
  }
  // o roteador escolhe o motor (Gemini grátis > Claude CLI > OpenRouter, ou o que você fixou em /motores)
  return route({ surface: "dados", message: text, screen, onEvent });
}
