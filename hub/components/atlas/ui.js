"use client";
import ThemeToggle from "./ThemeToggle.js";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Layers } from "lucide-react";

export async function api(path, opts = {}) {
  const { body, method, form } = opts;
  const res = await fetch(path, {
    method: method || (body || form ? "POST" : "GET"),
    headers: body ? { "content-type": "application/json" } : undefined,
    body: form ? form : body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (res.status === 401) {
    location.href = "/login?next=" + encodeURIComponent(location.pathname);
    throw new Error("Sessão expirada");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

export function Logo() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <svg viewBox="0 0 24 24" fill="none" stroke="#0a0b12" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
          <path d="M12 7v4M12 11l-6 6M12 11l6 6" />
        </svg>
      </span>
      Atlas
    </span>
  );
}

export function Topbar({ crumbs = [], right }) {
  return (
    <header className="topbar">
      <Link href="/estudos"><Logo /></Link>
      <nav className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} className="row" style={{ gap: 8 }}>
            <span className="sep">/</span>
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span className="cur">{c.label}</span>}
          </span>
        ))}
      </nav>
      <span className="spacer" />
      <Link href="/estudos/review" className="btn ghost sm" aria-label="Revisão"><Layers size={16} /><span className="lbl"> Revisão</span></Link>
      {right}
      <ThemeToggle />
    </header>
  );
}

export function Ring({ value = 0, size = 56, stroke = 5, color = "url(#ringGrad)", children, track = "var(--ring-track)" }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const id = useRef("rg" + Math.random().toString(36).slice(2, 7)).current;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b5cf6" /><stop offset="100%" stopColor="#22d3ee" /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color === "url(#ringGrad)" ? `url(#${id})` : color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: size * 0.27, fontWeight: 700 }}>{children}</div>
    </div>
  );
}

export function Md({ children, sources }) {
  const text = String(children || "").replace(/\[(S\d+(?:\s*[,;]\s*S\d+)*)\]/g, (_, g) => g.split(/[,;]\s*/).map((s) => `[${s.trim()}](cite:${s.trim()})`).join(""));
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(u) => u}
        components={{
          a({ href, children }) {
            if (href?.startsWith("cite:")) {
              const k = href.slice(5);
              const s = sources?.[k];
              return <span className="cite" title={s ? `${s.source} — ${s.locator}` : k}>{k}</span>;
            }
            return <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--link)", textDecoration: "underline" }}>{children}</a>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Polling genérico: chama fn() a cada `ms` enquanto active; devolve [data, reload]. */
export function usePoll(fn, { ms = 2500, active = true, deps = [] } = {}) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const ref = useRef(fn);
  ref.current = fn;
  const reload = useCallback(async () => {
    try {
      setData(await ref.current());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload, ...deps]); // eslint-disable-line
  useEffect(() => {
    if (!active) return;
    const t = setInterval(reload, ms);
    return () => clearInterval(t);
  }, [active, ms, reload]);
  return [data, reload, err];
}

/** Acompanha um job até terminar; devolve o job atual. */
export function useJob(jobId, onDone) {
  const [job, setJob] = useState(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!jobId) return setJob(null);
    let stop = false;
    const tick = async () => {
      try {
        const j = await api(`/api/estudos/jobs/${jobId}`);
        if (stop) return;
        setJob(j);
        if (j.status === "done" || j.status === "error") {
          done.current?.(j);
          return;
        }
      } catch {}
      if (!stop) setTimeout(tick, 1500);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [jobId]);
  return job;
}

export function JobCard({ job, label }) {
  if (!job) return null;
  const err = job.status === "error";
  return (
    <div className={"toast" + (err ? " err" : "")}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{label || job.kind}</span>
        {err ? <span className="chip red">erro</span> : job.status === "done" ? <span className="chip green">pronto</span> : <span className="spinner" />}
      </div>
      <div className="progress"><i style={{ width: `${Math.round((job.progress || 0) * 100)}%` }} /></div>
      <div className="dim" style={{ fontSize: 12.5, marginTop: 7 }}>{job.message}</div>
    </div>
  );
}

export function Diff({ n }) {
  return <span className="diff" title={`Dificuldade ${n}/5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= n ? "on" : ""} />)}</span>;
}

export const STATUS = {
  locked: { label: "Bloqueado", color: "#475569" },
  available: { label: "Disponível", color: "#22d3ee" },
  in_progress: { label: "Em andamento", color: "#8b5cf6" },
  mastered: { label: "Dominado", color: "#fbbf24" },
};

export function timeAgo(ms) {
  if (!ms) return "";
  const s = (Date.now() - ms) / 1000;
  if (s < 90) return "agora";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}


/** Diálogo de confirmação (substitui window.confirm; funciona bem no celular). */
export function ConfirmDialog({ title, body, confirmLabel = "Excluir", danger = true, busy = false, onConfirm, onCancel }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onCancel?.();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel]);
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="card modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 8 }}>{title}</h2>
        <div className="muted" style={{ fontSize: 14.5 }}>{body}</div>
        <div className="row" style={{ marginTop: 20, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className={"btn" + (danger ? " danger-solid" : " primary")} onClick={onConfirm} disabled={busy}>{busy ? <><span className="spinner" /> Excluindo…</> : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
