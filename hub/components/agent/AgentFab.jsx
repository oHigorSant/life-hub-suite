"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles, X, ArrowUp, Paperclip, Loader2, Trash2 } from "lucide-react";
import EnginePicker from "./EnginePicker.jsx";

const ENGINE_NAME = { gemini: "Gemini", claude: "Claude", openrouter: "OpenRouter" };

const KEY = "lh-agent-msgs";
const SUGGESTIONS = ["temporizador de 25 min", "o que tenho pra hoje?", "abrir finanças", "organize tudo sobre Back-end"];

let seq = 1;
const mid = () => `${Date.now()}-${seq++}`;

export default function AgentFab() {
  const pathname = usePathname();
  if (pathname?.startsWith("/login")) return null;
  return <AgentFabInner pathname={pathname} />;
}

function AgentFabInner({ pathname }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const scroller = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    try { setMsgs(JSON.parse(localStorage.getItem(KEY) || "[]").filter((m) => m.role !== "pending")); } catch {}
    try { if (sessionStorage.getItem("lh-agent-open") === "1") setOpen(true); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(msgs.filter((m) => m.role !== "pending").slice(-40))); } catch {}
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs]);
  useEffect(() => {
    try { sessionStorage.setItem("lh-agent-open", open ? "1" : "0"); } catch {}
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const upload = useCallback(async (file) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setFiles((l) => [...l, j.filename]);
    } catch (e) {
      setMsgs((l) => [...l, { id: mid(), role: "error", text: `Falha ao enviar arquivo: ${e.message}` }]);
    } finally { setUploading(false); }
  }, []);

  function onPaste(e) {
    const imgs = Array.from(e.clipboardData?.items ?? []).filter((i) => i.type.startsWith("image/"));
    if (!imgs.length) return;
    e.preventDefault();
    imgs.forEach((it, i) => {
      const blob = it.getAsFile();
      if (blob) upload(new File([blob], `colado-${Date.now()}-${i}.${it.type.split("/")[1] || "png"}`, { type: it.type }));
    });
  }

  async function send(textOverride) {
    const text = (textOverride ?? input).trim();
    if ((!text && !files.length) || busy) return;
    const full = [text, ...files.map((f) => `Arquivo enviado: uploads/${f}`)].filter(Boolean).join("\n\n");
    const pendingId = mid();
    setMsgs((l) => [...l, { id: mid(), role: "user", text: text || files.map((f) => f).join(", ") }, { id: pendingId, role: "pending", text: "", steps: [] }]);
    setInput("");
    setFiles([]);
    setBusy(true);
    const patch = (fn) => setMsgs((l) => l.map((m) => (m.id === pendingId ? fn(m) : m)));
    const sentAt = Date.now() - 3000;
    // Se a conexão cair no meio (rede, proxy, redeploy), o servidor continua e grava o resultado: busca a resposta de lá.
    async function recover(reason) {
      patch((m) => ({ ...m, role: "pending", steps: [...new Set([...(m.steps || []), "Reconectando"])] }));
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, i < 3 ? 1500 : 3000));
        try {
          const j = await (await fetch(`/api/agente/last?since=${sentAt}`, { cache: "no-store" })).json();
          if (j.state === "done") { patch((m) => ({ ...m, role: j.ok ? "assistant" : "error", text: j.reply || m.text || "(sem resposta)", engine: j.engine || m.engine, model: j.model || null })); return; }
          if (j.state === "none" && i >= 4) break; // o pedido nunca chegou ao servidor
        } catch { /* sem rede agora: segue tentando */ }
      }
      patch((m) => ({ ...m, role: "error", text: `Falha na conexão${reason ? ` (${reason})` : ""}. O pedido não chegou ao servidor; tente de novo.` }));
    }
    try {
      const res = await fetch("/api/agente", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: full, path: pathname }) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let ev;
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.type === "tool") patch((m) => ({ ...m, steps: [...new Set([...(m.steps || []), ev.label])] }));
          else if (ev.type === "text") patch((m) => ({ ...m, text: m.text ? `${m.text}\n\n${ev.text}` : ev.text }));
          else if (ev.type === "intent") patch((m) => ({ ...m, text: ev.reply, fast: true }));
          else if (ev.type === "engine") patch((m) => ({ ...m, engine: ev.engine, switchedFrom: ev.from || m.switchedFrom || null }));
          else if (ev.type === "done") { done = true; patch((m) => ({ ...m, role: ev.ok ? "assistant" : "error", text: ev.reply || m.text || "(sem resposta)", engine: ev.engine || m.engine, model: ev.model || null })); }
        }
      }
      if (!done) await recover("conexão interrompida");
    } catch (e) {
      await recover(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={`lh-fab${open ? " hide" : ""}`} onClick={() => setOpen(true)} aria-label="Abrir o Claude (Ctrl+K)" title="Claude (Ctrl+K)">
        <Sparkles size={22} />
      </button>

      {open && (
        <aside className="lh-agent" role="dialog" aria-label="Claude">
          <header>
            <Sparkles size={17} />
            <div><strong>Assistente</strong><span>Conhece e controla todo o Life Hub</span></div>
            <EnginePicker />
            <button type="button" onClick={() => { if (confirm("Limpar a conversa exibida aqui? (O agente continua lembrando do contexto.)")) setMsgs([]); }} aria-label="Limpar" title="Limpar a tela"><Trash2 size={15} /></button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar"><X size={18} /></button>
          </header>

          <div className="lh-agent-msgs" ref={scroller}>
            {msgs.length === 0 && (
              <div className="lh-agent-empty">
                <p>Peça qualquer coisa — acontece na hora, em qualquer tela.</p>
                <div className="lh-chips">{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)}>{s}</button>)}</div>
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={`lh-bubble ${m.role}`}>
                {m.role === "pending" && !m.text && <span className="lh-working"><Loader2 size={14} className="spin" /> {m.steps?.length ? m.steps[m.steps.length - 1] : "Pensando"}…</span>}
                {m.role === "pending" && m.text && <><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown><span className="lh-working"><Loader2 size={14} className="spin" /> {m.steps?.length ? m.steps[m.steps.length - 1] : "Trabalhando"}…</span></>}
                {m.role === "assistant" && <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>}
                {(m.role === "user" || m.role === "error") && m.text}
                {m.role === "assistant" && m.fast && <em className="lh-fast">instantâneo</em>}
                {m.role === "assistant" && !m.fast && m.engine && ENGINE_NAME[m.engine] && <em className="lh-fast">{ENGINE_NAME[m.engine]}{m.model ? ` · ${m.model}` : ""}{m.switchedFrom ? ` (após ${ENGINE_NAME[m.switchedFrom] || m.switchedFrom})` : ""}</em>}
              </div>
            ))}
          </div>

          {files.length > 0 && <div className="lh-files">{files.map((f) => <span key={f}>{f}<button type="button" onClick={() => setFiles((l) => l.filter((x) => x !== f))} aria-label="Remover"><X size={11} /></button></span>)}</div>}
          <form className="lh-agent-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input type="file" ref={fileRef} hidden multiple accept=".pdf,.txt,.md,.docx,.png,.jpg,.jpeg" onChange={(e) => { Array.from(e.target.files || []).forEach(upload); e.target.value = ""; }} />
            <button type="button" className="lh-ic" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Anexar"><Paperclip size={17} /></button>
            <textarea ref={inputRef} rows={1} value={input} placeholder="Escreva ou cole aqui…" onChange={(e) => setInput(e.target.value)} onPaste={onPaste}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button type="submit" className="lh-send" disabled={busy || (!input.trim() && !files.length)} aria-label="Enviar"><ArrowUp size={18} /></button>
          </form>
        </aside>
      )}
    </>
  );
}
