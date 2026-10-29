"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Copy, Check, Quote, Search, Sparkles } from "lucide-react";

const STORE = "lh-biblia";

async function api(qs) {
  const r = await fetch(`/api/biblia?${qs}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha ao carregar.");
  return j;
}

function readSaved() {
  try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; }
}

export default function BibliaClient() {
  const [versions, setVersions] = useState([]);
  const [version, setVersion] = useState(null);
  const [books, setBooks] = useState([]);
  const [info, setInfo] = useState(null);
  const [book, setBook] = useState("JHN");
  const [chapter, setChapter] = useState(1);
  const [pass, setPass] = useState(null);
  const [votd, setVotd] = useState(null);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState([]); // versículos selecionados
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const scroller = useRef(null);

  // estado inicial: URL (?r=JHN.3&v=3254) > último lido > padrão
  useEffect(() => {
    const saved = readSaved();
    const q = new URLSearchParams(window.location.search);
    const r = (q.get("r") || "").match(/^([1-3A-Z]{3})\.(\d+)/);
    api("op=versions").then((d) => {
      setVersions(d.versions);
      const want = Number(q.get("v")) || saved.version || d.default;
      setVersion(d.versions.some((x) => x.id === want) ? want : d.default);
    }).catch((e) => setError(e.message));
    if (r) { setBook(r[1]); setChapter(Number(r[2])); }
    else if (saved.book) { setBook(saved.book); setChapter(saved.chapter || 1); }
  }, []);

  useEffect(() => {
    if (!version) return;
    api(`op=books&v=${version}`).then((d) => { setBooks(d.books); setInfo(d.version); }).catch((e) => setError(e.message));
    api(`op=votd&v=${version}`).then(setVotd).catch(() => setVotd(null));
  }, [version]);

  const current = useMemo(() => books.find((b) => b.id === book), [books, book]);

  const load = useCallback(async () => {
    if (!version || !books.length) return;
    setLoading(true); setError(null); setPicked([]);
    try {
      const d = await api(`op=passage&v=${version}&ref=${book}.${chapter}`);
      setPass(d);
      try { localStorage.setItem(STORE, JSON.stringify({ version, book, chapter })); } catch { /* ignora */ }
      scroller.current?.scrollTo({ top: 0 });
    } catch (e) { setError(e.message); setPass(null); }
    setLoading(false);
  }, [version, book, chapter, books.length]);
  useEffect(() => { load(); }, [load]);

  const go = (dir) => {
    const idx = books.findIndex((b) => b.id === book);
    if (dir > 0) {
      if (current && chapter < current.chapters) setChapter(chapter + 1);
      else if (books[idx + 1]) { setBook(books[idx + 1].id); setChapter(1); }
    } else if (chapter > 1) setChapter(chapter - 1);
    else if (books[idx - 1]) { setBook(books[idx - 1].id); setChapter(books[idx - 1].chapters); }
  };
  const pick = (b) => { setBook(b.id); setChapter(1); };

  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return books.filter((b) => !f || b.title.toLowerCase().includes(f) || b.abbr?.toLowerCase().includes(f));
  }, [books, filter]);
  const groups = [["old_testament", "Antigo Testamento"], ["new_testament", "Novo Testamento"], ["deuterocanon", "Deuterocanônicos"]];

  const chosen = (pass?.verses || []).filter((v) => picked.includes(v.n));
  const chosenText = chosen.map((v) => v.text).join(" ");
  const chosenRef = chosen.length ? `${current?.title} ${chapter}:${rangeLabel(chosen.map((v) => v.n))}` : "";
  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 1800); };
  async function copy() {
    await navigator.clipboard?.writeText(`${chosenText} (${chosenRef}${info ? ` · ${info.abbr}` : ""})`).catch(() => {});
    flash("Copiado");
  }
  async function asPhrase() {
    const r = await fetch("/api/home", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "setPhrase", text: chosenText, ref: `${chosenRef}${info ? ` · ${info.abbr}` : ""}` }) });
    flash(r.ok ? "Definida como frase do dia" : "Não foi possível salvar");
  }
  const toggle = (n) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n].sort((a, b) => a - b)));

  // agrupa os versículos por parágrafo
  const paras = useMemo(() => {
    const out = [];
    for (const v of pass?.verses || []) (out[v.p] ??= []).push(v);
    return out.filter(Boolean);
  }, [pass]);

  return (
    <div className="bb">
      <aside className="bb-side">
        <div className="bb-side-head">
          <h1><BookOpen size={18} /> Bíblia</h1>
          <label className="bb-search"><Search size={14} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar livro" aria-label="Buscar livro" /></label>
        </div>
        <div className="bb-books">
          {groups.map(([canon, label]) => {
            const items = list.filter((b) => b.canon === canon);
            if (!items.length) return null;
            return (
              <section key={canon}>
                <h2>{label}</h2>
                {items.map((b) => (
                  <button key={b.id} type="button" className={b.id === book ? "on" : ""} onClick={() => pick(b)}>{b.title}</button>
                ))}
              </section>
            );
          })}
        </div>
      </aside>

      <main className="bb-main" ref={scroller}>
        <div className="bb-inner">
          {votd && (
            <section className="bb-votd">
              <span className="bb-votd-label"><Sparkles size={14} /> Versículo do dia</span>
              <blockquote>{votd.text}</blockquote>
              <button type="button" className="bb-link" onClick={() => { const m = votd.passage_id.match(/^([1-3A-Z]{3})\.(\d+)/); if (m) { setBook(m[1]); setChapter(Number(m[2])); } }}>
                {votd.reference}{votd.version ? ` · ${votd.version}` : ""}
              </button>
            </section>
          )}

          <header className="bb-bar">
            <div>
              <p className="bb-eyebrow">{info?.title || "Carregando"}</p>
              <h2>{current?.title || "—"} <span>{chapter}</span></h2>
            </div>
            <div className="bb-ctrls">
              {versions.length > 1 && (
                <select value={version || ""} onChange={(e) => setVersion(Number(e.target.value))} aria-label="Versão">
                  {versions.map((v) => <option key={v.id} value={v.id}>{v.abbr}</option>)}
                </select>
              )}
              <select value={chapter} onChange={(e) => setChapter(Number(e.target.value))} aria-label="Capítulo">
                {Array.from({ length: current?.chapters || 1 }, (_, i) => <option key={i + 1} value={i + 1}>Capítulo {i + 1}</option>)}
              </select>
              <button type="button" className="bb-round" aria-label="Capítulo anterior" onClick={() => go(-1)}><ChevronLeft size={16} /></button>
              <button type="button" className="bb-round" aria-label="Próximo capítulo" onClick={() => go(1)}><ChevronRight size={16} /></button>
            </div>
          </header>

          {error && <p className="bb-error">{error}</p>}
          {loading && !pass && <div className="bb-skel" aria-busy="true" />}
          <article className={`bb-text${loading ? " is-loading" : ""}`}>
            {paras.map((p, i) => (
              <p key={i}>
                {p.map((v) => (
                  <span key={v.n} className={`bb-v${picked.includes(v.n) ? " on" : ""}`} onClick={() => toggle(v.n)}>
                    <sup>{v.n}</sup>{v.text}{" "}
                  </span>
                ))}
              </p>
            ))}
          </article>
          {info?.copyright && <footer className="bb-copy">{info.abbr} · {info.copyright.split("\n")[0]}</footer>}
        </div>

        {chosen.length > 0 && (
          <div className="bb-sheet" role="toolbar" aria-label="Versículos selecionados">
            <span>{chosenRef}</span>
            <button type="button" onClick={copy}><Copy size={14} /> Copiar</button>
            <button type="button" onClick={asPhrase}><Quote size={14} /> Frase do dia</button>
            <button type="button" className="ghost" onClick={() => setPicked([])}>Limpar</button>
          </div>
        )}
        {toast && <div className="bb-toast"><Check size={14} /> {toast}</div>}
      </main>
    </div>
  );
}

function rangeLabel(nums) {
  const out = []; let s = nums[0], p = nums[0];
  for (const n of nums.slice(1).concat([null])) {
    if (n === p + 1) { p = n; continue; }
    out.push(s === p ? `${s}` : `${s}-${p}`);
    s = p = n;
  }
  return out.join(", ");
}
