"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { recoverLast } from "@/components/agent/recover.js";

let nextId = 1;
function newId() {
  return nextId++;
}

// Tabela de resposta financeira facilmente passa da largura da bolha —
// embrulha num container com scroll horizontal próprio em vez de estourar.
const markdownComponents = {
  table: ({ children }) => (
    <div className="chat-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

export default function ChatPanel({ onMessageHandled }) {
  const [messages, setMessages] = useState([
    {
      id: newId(),
      role: "assistant",
      text:
        "Oi! Manda uma tarefa, uma transcrição, um PDF ou qualquer bagunça " +
        "que você precise organizar — eu transformo em cards no quadro.",
    },
  ]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]); // [{ id, filename }]
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // lembra se o chat estava recolhido (vale para Tarefas e Finanças)
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("lh-chat-collapsed") === "1"); } catch {}
  }, []);
  function toggleCollapsed() {
    setCollapsed((v) => {
      try { localStorage.setItem("lh-chat-collapsed", v ? "0" : "1"); } catch {}
      return !v;
    });
  }

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Cada arquivo sobe e entra na lista assim que termina, em paralelo —
  // colar/selecionar 5 imagens não espera uma de cada vez.
  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAttachments((prev) => [...prev, { id: newId(), filename: data.filename }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "error", text: `Falha ao enviar arquivo: ${err.message}` },
      ]);
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    files.forEach(uploadFile);
  }

  function removeAttachment(id) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  // Print/screenshot colado (ctrl+V) vira anexo igual um arquivo escolhido
  // pelo "+" — mesmo destino (uploads/), mesma prévia. Colar imagem some
  // do textarea (não faz sentido "colar" um blob como texto), mas colar
  // texto normal continua funcionando do jeito nativo do navegador. Um
  // paste pode trazer mais de uma imagem (ex: copiar vários arquivos no
  // explorador e colar de uma vez), então processa todas, não só a primeira.
  function handlePaste(e) {
    const imageItems = Array.from(e.clipboardData?.items ?? []).filter((i) => i.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    imageItems.forEach((item, i) => {
      const blob = item.getAsFile();
      if (!blob) return;
      const ext = item.type.split("/")[1] || "png";
      const file = new File([blob], `colado-${Date.now()}-${i}.${ext}`, { type: item.type });
      uploadFile(file);
    });
  }

  async function handleSend() {
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const fileLines = attachments.map((a) => `Arquivo enviado: uploads/${a.filename}`);
    const parts = [];
    if (text) parts.push(text);
    parts.push(...fileLines);
    const fullMessage = parts.join("\n\n");

    const userBubbleText = text || fileLines.join("\n");
    setMessages((prev) => [...prev, { id: newId(), role: "user", text: userBubbleText }]);
    setInput("");
    setAttachments([]);

    const pendingId = newId();
    setMessages((prev) => [...prev, { id: pendingId, role: "pending", text: "Pensando..." }]);
    setSending(true);
    const sentAt = Date.now() - 3000;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: fullMessage }),
      });
      const data = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { id: pendingId, role: data.ok ? "assistant" : "error", text: data.reply || data.error || "Erro desconhecido." }
            : m
        )
      );
      if (res.ok) onMessageHandled?.();
    } catch (err) {
      // a conexão caiu, mas o servidor pode ter concluído o pedido: busca a resposta lá antes de dar erro
      setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, text: "Reconectando..." } : m)));
      const r = await recoverLast(sentAt);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { id: pendingId, role: r ? (r.ok ? "assistant" : "error") : "error", text: r ? r.reply : `Falha na conexão (${err.message}). O pedido não chegou ao servidor; tente de novo.` }
            : m
        )
      );
      if (r?.ok) onMessageHandled?.();
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending) handleSend();
    }
  }

  if (collapsed) {
    return (
      <button type="button" className="chat-collapsed-tab" onClick={toggleCollapsed} aria-label="Abrir o chat" title="Abrir o chat">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        <span>Chat</span>
      </button>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div>
          <h1>Life Hub</h1>
          <p>Toda mudança passa por aqui</p>
        </div>
        <button type="button" className="chat-collapse-btn" onClick={toggleCollapsed} aria-label="Recolher o chat" title="Recolher o chat">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble ${m.role}`}>
            {m.role === "assistant" ? (
              <div className="chat-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {m.text}
                </ReactMarkdown>
              </div>
            ) : (
              m.text
            )}
          </div>
        ))}
      </div>

      <div className="chat-input-area">
        {attachments.length > 0 && (
          <div className="chat-attachment-list">
            {attachments.map((a) => (
              <div key={a.id} className="chat-attachment-preview">
                <span>{a.filename}</span>
                <button onClick={() => removeAttachment(a.id)} type="button" aria-label={`Remover ${a.filename}`}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="chat-input-row">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileChange}
            accept=".pdf,.txt,.md,.docx,.png,.jpg,.jpeg"
            multiple
          />
          <button
            type="button"
            className="chat-icon-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Anexar arquivo (PDF, transcrição, imagem)"
          >
            {uploading ? "..." : "+"}
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Escreva ou cole aqui..."
            rows={1}
          />
          <button
            type="button"
            className="chat-send-btn"
            onClick={handleSend}
            disabled={sending || (!input.trim() && attachments.length === 0)}
            title="Enviar"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
