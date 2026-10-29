"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, ExternalLink, Pencil, Trash2, X, ImagePlus, Link2, Upload, RefreshCw, Check, Star, Play, Film, BookOpen, Wrench, Puzzle, Sparkles } from "lucide-react";
import { useLive } from "@/components/live/liveClient.js";

const ICON = { video: Play, filme: Film, livro: BookOpen, projeto: Wrench, hobby: Puzzle, outro: Sparkles };
const ASPECT = { video: "16 / 9", filme: "2 / 3", livro: "2 / 3", projeto: "4 / 3", hobby: "4 / 3", outro: "4 / 3" };

/** imagens externas passam pelo proxy do hub (cache local); enviadas e já locais vão direto */
const imgSrc = (u) => (!u ? "" : u.startsWith("/") ? u : `/api/lazer/img?u=${encodeURIComponent(u)}`);

async function call(body) {
  const r = await fetch("/api/lazer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falhou.");
  return j;
}

export default function LazerClient() {
  const [data, setData] = useState(null);
  const [cat, setCat] = useState("all");
  const [st, setSt] = useState("all");
  const [q, setQ] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState(null);

  const load = () => fetch("/api/lazer", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  useLive(["lazer", "reconnect"], load);

  async function add(e) {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true); setMsg("");
    try {
      const { item } = await call({ op: "add", input: input.trim(), category: cat !== "all" ? cat : undefined });
      setInput("");
      await load();
      if (!item.image) setEdit(item); // sem imagem: já abre para buscar uma
    } catch (err) { setMsg(err.message); }
    setBusy(false);
  }

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.items || []).filter((x) => (cat === "all" || x.category === cat) && (st === "all" || x.status === st) && (!t || `${x.title} ${x.site} ${x.notes}`.toLowerCase().includes(t)));
  }, [data, cat, st, q]);

  if (!data) return <div className="lz"><p className="lz-hint">Carregando…</p></div>;
  const count = (c) => data.items.filter((x) => c === "all" || x.category === c).length;
  const catLabel = Object.fromEntries(data.categories.map((c) => [c.id, c.label]));
  const stLabel = Object.fromEntries(data.statuses.map((s) => [s.id, s.label]));

  return (
    <div className="lz">
      <header className="lz-head">
        <div>
          <h1>Lazer</h1>
          <p className="lz-hint">Vídeos, filmes, livros, projetos e hobbies para o tempo livre. Cole um link do YouTube ou de qualquer site e a miniatura aparece sozinha.</p>
        </div>
      </header>
      <form className="lz-add" onSubmit={add}>
        <Link2 size={16} />
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Cole um link (YouTube, filme, livro, projeto…) ou escreva um título" aria-label="Link ou título" />
        <button type="submit" className="lz-btn primary" disabled={busy || !input.trim()}>{busy ? <RefreshCw size={15} className="lz-spin" /> : <Plus size={15} />} Adicionar</button>
      </form>
      {msg && <p className="lz-err">{msg}</p>}
      <div className="lz-filters">
        <div className="lz-cats" role="tablist" aria-label="Categorias">
          <button type="button" className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>Tudo <em>{count("all")}</em></button>
          {data.categories.map((c) => { const I = ICON[c.id]; return <button key={c.id} type="button" className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}><I size={14} /> {c.label} <em>{count(c.id)}</em></button>; })}
        </div>
        <div className="lz-row">
          <div className="lz-seg">
            <button type="button" className={st === "all" ? "on" : ""} onClick={() => setSt("all")}>Todos</button>
            {data.statuses.map((s) => <button key={s.id} type="button" className={st === s.id ? "on" : ""} onClick={() => setSt(s.id)}>{s.label}</button>)}
          </div>
          <label className="lz-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar" /></label>
        </div>
      </div>
      {!items.length && <p className="lz-empty">{data.items.length ? "Nada com esses filtros." : "Sua galeria está vazia. Cole o primeiro link acima."}</p>}
      <div className="lz-grid">
        {items.map((x) => {
          const I = ICON[x.category] || Sparkles;
          return (
            <article key={x.id} className={`lz-card st-${x.status}`}>
              <button type="button" className="lz-thumb" style={{ aspectRatio: ASPECT[x.category] || "4 / 3" }} onClick={() => (x.url ? window.open(x.url, "_blank", "noopener") : setEdit(x))} aria-label={x.url ? `Abrir ${x.title}` : `Editar ${x.title}`}>
                {x.image ? <img src={imgSrc(x.image)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : <span className="lz-noimg"><I size={30} /></span>}
                {x.category === "video" && x.url && <span className="lz-play"><Play size={18} fill="#fff" /></span>}
                <span className="lz-tag"><I size={12} /> {catLabel[x.category]}</span>
              </button>
              <div className="lz-body">
                <b className="lz-title" title={x.title}>{x.title}</b>
                {x.site && <span className="lz-site">{x.site}</span>}
                <div className="lz-meta">
                  <button type="button" className={`lz-st st-${x.status}`} onClick={() => call({ op: "update", id: x.id, status: x.status === "quero" ? "andamento" : x.status === "andamento" ? "feito" : "quero" }).then(load)} title="Mudar situação">{x.status === "feito" && <Check size={12} />}{stLabel[x.status]}</button>
                  {x.rating ? <span className="lz-rate">{"★".repeat(x.rating)}</span> : null}
                  <span className="lz-acts">
                    {x.url && <a href={x.url} target="_blank" rel="noopener noreferrer" className="lz-icon" aria-label="Abrir link"><ExternalLink size={14} /></a>}
                    <button type="button" className="lz-icon" onClick={() => setEdit(x)} aria-label="Editar"><Pencil size={14} /></button>
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {edit && <EditModal item={edit} data={data} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function EditModal({ item, data, onClose, onSaved }) {
  const [f, setF] = useState({ title: item.title, url: item.url, category: item.category, status: item.status, notes: item.notes || "", image: item.image || "", rating: item.rating || 0 });
  const [q, setQ] = useState(item.title);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function search() {
    setBusy("search"); setErr("");
    try { setResults((await call({ op: "search", q, category: f.category, link: f.url })).results); } catch (e) { setErr(e.message); }
    setBusy("");
  }
  async function fromPage() {
    if (!f.url) return;
    setBusy("page"); setErr("");
    try {
      const m = await call({ op: "meta", url: f.url });
      setF((p) => ({ ...p, image: m.image || p.image, title: p.title && p.title !== "Sem título" ? p.title : m.title || p.title }));
      if (!m.image) setErr("A página não tem imagem de capa. Busque ou envie uma.");
    } catch (e) { setErr(e.message); }
    setBusy("");
  }
  async function upload(file) {
    if (!file) return;
    setBusy("upload"); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha no envio.");
      setF((p) => ({ ...p, image: `/api/uploads/${encodeURIComponent(j.filename)}` }));
    } catch (e) { setErr(e.message); }
    setBusy("");
  }
  async function save() {
    setBusy("save");
    try { await call({ op: "update", id: item.id, ...f, rating: f.rating || null }); onSaved(); } catch (e) { setErr(e.message); setBusy(""); }
  }
  async function remove() {
    if (!confirm(`Excluir "${item.title}"?`)) return;
    await call({ op: "delete", id: item.id });
    onSaved();
  }

  return (
    <div className="lz-modal" role="dialog" aria-modal="true" aria-label="Editar item" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lz-dialog">
        <header><h2>Editar</h2><button type="button" className="lz-icon" onClick={onClose} aria-label="Fechar"><X size={18} /></button></header>
        <div className="lz-form">
          <div className="lz-imgbox" style={{ aspectRatio: ASPECT[f.category] || "4 / 3" }}>
            {f.image ? <img src={imgSrc(f.image)} alt="" /> : <span className="lz-noimg"><ImagePlus size={28} /></span>}
          </div>
          <div className="lz-fields">
            <label>Título<input value={f.title} onChange={set("title")} /></label>
            <label>Link<input value={f.url} onChange={set("url")} placeholder="https://…" /></label>
            <div className="lz-two">
              <label>Categoria<select value={f.category} onChange={set("category")}>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
              <label>Situação<select value={f.status} onChange={set("status")}>{data.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            </div>
            <div className="lz-stars" role="radiogroup" aria-label="Nota">
              {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={n <= f.rating ? "on" : ""} onClick={() => setF({ ...f, rating: f.rating === n ? 0 : n })} aria-label={`${n} estrela${n > 1 ? "s" : ""}`}><Star size={16} /></button>)}
            </div>
            <label>Notas<textarea rows={3} value={f.notes} onChange={set("notes")} placeholder="Por que quero ver, quem indicou, onde parei…" /></label>
          </div>
        </div>
        <section className="lz-imgtools">
          <b>Imagem</b>
          <div className="lz-row wrap">
            <label className="lz-search grow"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())} placeholder="Buscar capa ou foto (título, autor…)" /></label>
            <button type="button" className="lz-btn" onClick={search} disabled={busy === "search"}>{busy === "search" ? <RefreshCw size={14} className="lz-spin" /> : <Search size={14} />} Buscar</button>
            {f.url && <button type="button" className="lz-btn" onClick={fromPage} disabled={busy === "page"}><Link2 size={14} /> Da página</button>}
            <button type="button" className="lz-btn" onClick={() => fileRef.current?.click()} disabled={busy === "upload"}><Upload size={14} /> Enviar</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </div>
          <label className="lz-url">ou cole o endereço de uma imagem<input value={f.image.startsWith("/") ? "" : f.image} onChange={set("image")} placeholder="https://…/imagem.jpg" /></label>
          {results && (
            <div className="lz-results">
              {!results.length && <p className="lz-hint">Nada encontrado. Tente outro termo, ou envie uma imagem.</p>}
              {results.map((r) => (
                <button key={r.url} type="button" className={`lz-res${f.image === r.url ? " on" : ""}`} onClick={() => setF({ ...f, image: r.url })} title={`${r.title} · ${r.source}`}>
                  <img src={imgSrc(r.url)} alt="" loading="lazy" onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }} />
                  <span>{r.source}</span>
                </button>
              ))}
            </div>
          )}
        </section>
        {err && <p className="lz-err">{err}</p>}
        <footer>
          <button type="button" className="lz-btn danger" onClick={remove}><Trash2 size={14} /> Excluir</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="lz-btn" onClick={onClose}>Cancelar</button>
          <button type="button" className="lz-btn primary" onClick={save} disabled={busy === "save"}>Salvar</button>
        </footer>
      </div>
    </div>
  );
}
