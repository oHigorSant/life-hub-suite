"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import EnginePicker from "@/components/agent/EnginePicker.jsx";
import { recoverLast } from "@/components/agent/recover.js";
import "@/components/agent/agent.css";

const ENGINE_NAME = { gemini: "Gemini", claude: "Claude", openrouter: "OpenRouter" };

export default function DevChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dev-chat", { cache: "no-store" });
        const data = await res.json();
        setMessages(data.messages ?? []);
      } catch {
        // histórico é conveniência, não bloqueia o uso
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending, scrollToBottom]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);
    const sentAt = Date.now() - 3000;

    try {
      const res = await fetch("/api/dev-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply ?? "(sem resposta)", ok: data.ok !== false, engine: data.engine, model: data.model },
      ]);
    } catch (err) {
      // pedidos de código demoram: se a conexão cair, o servidor continua; busca o resultado lá antes de dar erro
      const r = await recoverLast(sentAt, { surface: "dev", maxTries: 200 });
      setMessages((prev) => [
        ...prev,
        r ? { role: "assistant", content: r.reply, ok: r.ok, engine: r.engine, model: r.model } : { role: "assistant", content: `Falha de rede: ${err.message}. O pedido não chegou ao servidor; tente de novo.`, ok: false },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function novaSessao() {
    if (sending) return;
    await fetch("/api/dev-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    setMessages((prev) => [
      ...prev,
      { role: "system", content: "— nova sessão: o contexto anterior foi esquecido —" },
    ]);
  }

  return (
    <div className="dev-shell">
      <header className="dev-header">
        <div>
          <div className="dev-title">Desenvolvimento — acesso remoto</div>
          <div className="dev-subtitle">Sessão privilegiada · pode editar código e rodar comandos</div>
        </div>
        <EnginePicker />
        <button type="button" className="dev-reset" onClick={novaSessao} disabled={sending}>
          Nova sessão
        </button>
      </header>

      <div className="dev-messages" ref={scrollRef}>
        {loadingHistory && <div className="dev-empty">Carregando histórico...</div>}
        {!loadingHistory && messages.length === 0 && (
          <div className="dev-empty">
            Sessão nova. Ela não é a mesma conversa do desktop, mas lê o projeto, o CLAUDE.md e o
            PROGRESS.md — peça pra ela se situar antes de pedir uma alteração.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`dev-msg dev-msg-${m.role}${m.ok === false ? " dev-msg-error" : ""}`}>
            {m.content}
            {m.role === "assistant" && ENGINE_NAME[m.engine] && <em className="lh-fast">{ENGINE_NAME[m.engine]}{m.model ? ` · ${m.model}` : ""}</em>}
          </div>
        ))}
        {sending && <div className="dev-msg dev-msg-assistant dev-thinking">Trabalhando...</div>}
      </div>

      <div className="dev-composer">
        <textarea
          value={input}
          rows={2}
          placeholder="O que você quer mudar?"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !sending) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" onClick={send} disabled={sending || !input.trim()}>
          {sending ? "..." : "Enviar"}
        </button>
      </div>
    </div>
  );
}
