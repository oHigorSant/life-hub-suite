"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, Trash2, Pencil, Eye, Columns2, Network, ChevronRight, ChevronDown, Folder, FileText, Hash, Link2, X, PanelRight, Menu, CornerDownRight } from "lucide-react";
import Markdown from "./Markdown.jsx";
import { useLive } from "../live/liveClient.js";
import { norm, parseFrontmatter, setFrontmatterKey, splitFrontmatter } from "@/lib/notas/parse.js";

async function api(url, opts = {}) {
  const r = await fetch(url, { cache: "no-store", ...opts, headers: opts.body ? { "content-type": "application/json" } : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Erro ${r.status}`), { status: r.status });
  return j;
}

const TYPE_SUGGESTIONS = ["nota", "conceito", "projeto", "referencia", "diario", "guia", "area", "pessoa", "tarefa"];

function buildTree(list) {
  const root = { folders: {}, notes: [] };
  for (const n of list) {
    const parts = n.path.split("/");
    let cur = root;
    for (const seg of parts.slice(0, -1)) {
      cur.folders[seg] ??= { folders: {}, notes: [], name: seg };
      cur = cur.folders[seg];
    }
    cur.notes.push(n);
  }
  return root;
}

function areaPathName(areas, id) {
  const idx = new Map(areas.map((a) => [a.id, a]));
  const names = [];
  let cur = idx.get(id);
  let guard = 0;
  while (cur && guard++ < 20) { names.unshift(cur.name); cur = cur.parent ? idx.get(cur.parent) : null; }
  return names.join(" > ");
}

export default function NotesClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const openPath = sp.get("n");

  const [notes, setNotes] = useState([]);
  const [areas, setAreas] = useState([]);
  const [cur, setCur] = useState(null); // { path, raw, relations }
  const [save, setSave] = useState("idle");
  const [mode, setMode] = useState("split");
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [tagFilter, setTagFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [folders, setFolders] = useState({});
  const [relOpen, setRelOpen] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [newName, setNewName] = useState(null);
  const [error, setError] = useState("");
  const [suggest, setSuggest] = useState(null);
  const [sugIdx, setSugIdx] = useState(0);
  const timer = useRef(null);
  const taRef = useRef(null);
  const curRef = useRef(null);
  curRef.current = cur;

  const loadList = useCallback(async () => {
    const [n, a] = await Promise.all([api("/api/notas"), api("/api/notas/areas")]);
    setNotes(n.notes);
    setAreas(a.areas);
    return n.notes;
  }, []);

  const loadNote = useCallback(async (path) => {
    try {
      const n = await api(`/api/notas/note?path=${encodeURIComponent(path)}`);
      setCur({ path: n.path, raw: n.raw, relations: n.relations });
      setSave("idle");
      setError("");
    } catch (e) {
      setCur(null);
      setError(e.status === 404 ? "Nota não encontrada." : e.message);
    }
  }, []);

  useEffect(() => { loadList().catch((e) => setError(e.message)); }, [loadList]);

  // mudanças vindas de fora (agente, outra aba, arquivo editado) entram na hora — sem atropelar o que você está digitando
  const saveRef = useRef(save);
  saveRef.current = save;
  useLive(["notas"], () => {
    loadList().catch(() => {});
    const c = curRef.current;
    if (!c) return;
    api(`/api/notas/note?path=${encodeURIComponent(c.path)}`).then((n) => {
      const calm = saveRef.current === "idle" || saveRef.current === "saved";
      setCur((prev) => (prev && prev.path === c.path ? { path: prev.path, raw: calm ? n.raw : prev.raw, relations: n.relations } : prev));
    }).catch(() => {});
  });

  // abre a nota da URL; sem nota na URL, abre a primeira
  useEffect(() => {
    if (openPath) { loadNote(openPath); return; }
    if (notes.length) {
      const first = notes.find((n) => n.path === "Bem-vindo.md") || notes[0];
      router.replace(`/notas?n=${encodeURIComponent(first.path)}`);
    }
  }, [openPath, notes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // busca no conteúdo
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(() => api(`/api/notas?q=${encodeURIComponent(q.trim())}`).then((r) => setResults(r.results)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const titles = useMemo(() => {
    const s = new Set();
    for (const n of notes) { s.add(norm(n.title)); s.add(norm(n.path.split("/").pop().replace(/\.md$/i, ""))); }
    return s;
  }, [notes]);

  const allTags = useMemo(() => {
    const c = new Map();
    for (const n of notes) for (const t of n.tags) c.set(t, (c.get(t) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  }, [notes]);

  const areaOptions = useMemo(() => areas.map((a) => ({ id: a.id, label: areaPathName(areas, a.id) })).sort((a, b) => a.label.localeCompare(b.label)), [areas]);

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      if (tagFilter && !n.tags.includes(tagFilter)) return false;
      if (areaFilter) {
        const chain = [];
        let c = areas.find((a) => a.id === n.area);
        let g = 0;
        while (c && g++ < 20) { chain.push(c.id); c = areas.find((a) => a.id === c.parent); }
        if (!chain.includes(areaFilter)) return false;
      }
      return true;
    });
  }, [notes, tagFilter, areaFilter, areas]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // ---------- salvar ----------
  const scheduleSave = useCallback((path, raw) => {
    setSave("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSave("saving");
      try {
        await api("/api/notas/note", { method: "PUT", body: JSON.stringify({ path, raw }) });
        setSave("saved");
        const n = await api(`/api/notas/note?path=${encodeURIComponent(path)}`);
        setCur((c) => (c && c.path === path ? { ...c, relations: n.relations } : c));
        loadList().catch(() => {});
      } catch (e) {
        setSave("error");
        setError(e.message);
      }
    }, 700);
  }, [loadList]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function updateRaw(raw) {
    setCur((c) => ({ ...c, raw }));
    scheduleSave(curRef.current.path, raw);
  }

  const parts = useMemo(() => (cur ? splitFrontmatter(cur.raw) : { head: "", body: "" }), [cur]);
  const fm = useMemo(() => (cur ? parseFrontmatter(cur.raw).fm : {}), [cur]);
  const fmTags = useMemo(() => (Array.isArray(fm.tags) ? fm.tags : fm.tags ? String(fm.tags).split(",").map((t) => t.trim()).filter(Boolean) : []), [fm]);

  function onBodyChange(e) {
    const body = e.target.value;
    updateRaw(parts.head + body);
    // autocompletar [[ ]]
    const pos = e.target.selectionStart;
    const m = /\[\[([^\]\n]*)$/.exec(body.slice(0, pos));
    if (m) {
      const qn = norm(m[1]);
      const items = notes.filter((n) => !qn || norm(n.title).includes(qn)).slice(0, 6);
      setSuggest(items.length ? { start: pos - m[1].length, query: m[1], items } : null);
      setSugIdx(0);
    } else setSuggest(null);
  }

  function applySuggestion(item) {
    const ta = taRef.current;
    const body = parts.body;
    const pos = ta.selectionStart;
    const before = body.slice(0, suggest.start);
    const after = body.slice(pos).replace(/^[^\]\n]*\]\]/, "");
    const ins = `${item.title}]]`;
    updateRaw(parts.head + before + ins + after);
    setSuggest(null);
    requestAnimationFrame(() => { ta.focus(); const p = before.length + ins.length; ta.setSelectionRange(p, p); });
  }

  function onBodyKeyDown(e) {
    if (!suggest) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSugIdx((i) => (i + 1) % suggest.items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSugIdx((i) => (i - 1 + suggest.items.length) % suggest.items.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applySuggestion(suggest.items[sugIdx]); }
    else if (e.key === "Escape") setSuggest(null);
  }

  // ---------- ações ----------
  const openNote = useCallback((path) => { setListOpen(false); router.push(`/notas?n=${encodeURIComponent(path)}`); }, [router]);

  const openByName = useCallback(async (name) => {
    const k = norm(name);
    const found = notes.find((n) => norm(n.title) === k || norm(n.path.split("/").pop().replace(/\.md$/i, "")) === k);
    if (found) return openNote(found.path);
    try {
      const r = await api("/api/notas/note", { method: "POST", body: JSON.stringify({ path: `${name}.md`, raw: `# ${name}\n\n` }) });
      await loadList();
      openNote(r.path);
    } catch (e) { setError(e.message); }
  }, [notes, openNote, loadList]);

  async function createNote(e) {
    e.preventDefault();
    const name = (newName || "").trim();
    if (!name) return;
    const base = name.split("/").pop();
    try {
      const r = await api("/api/notas/note", { method: "POST", body: JSON.stringify({ path: name, raw: `# ${base}\n\n` }) });
      setNewName(null);
      await loadList();
      openNote(r.path);
    } catch (err) {
      if (err.status === 409) { setNewName(null); openNote(name.endsWith(".md") ? name : `${name}.md`); } else setError(err.message);
    }
  }

  async function removeNote() {
    if (!cur || !confirm(`Mover "${cur.path}" para a lixeira do cofre?`)) return;
    await api(`/api/notas/note?path=${encodeURIComponent(cur.path)}`, { method: "DELETE" });
    const list = await loadList();
    const next = list.find((n) => n.path !== cur.path);
    if (next) openNote(next.path); else { setCur(null); router.replace("/notas"); }
  }

  async function renameCurrent() {
    if (!cur) return;
    const to = prompt("Novo caminho/nome da nota (os [[links]] serão atualizados):", cur.path.replace(/\.md$/i, ""));
    if (!to || to === cur.path.replace(/\.md$/i, "")) return;
    try {
      const r = await api("/api/notas/note", { method: "PATCH", body: JSON.stringify({ from: cur.path, to }) });
      await loadList();
      openNote(r.path);
    } catch (e) { setError(e.message); }
  }

  function setProp(key, value) {
    updateRaw(setFrontmatterKey(cur.raw, key, value));
  }
  function addTag(e) {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    const t = e.currentTarget.value.trim().replace(/^#/, "").toLowerCase();
    e.currentTarget.value = "";
    if (t && !fmTags.includes(t)) setProp("tags", [...fmTags, t]);
  }

  // ---------- render ----------
  const renderFolder = (node, depth, prefix) => (
    <>
      {Object.values(node.folders).sort((a, b) => a.name.localeCompare(b.name)).map((f) => {
        const key = `${prefix}${f.name}/`;
        const open = folders[key] !== false;
        return (
          <div key={key}>
            <button type="button" className="nt-folder" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => setFolders((s) => ({ ...s, [key]: !open }))}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Folder size={14} /> {f.name}
            </button>
            {open && renderFolder(f, depth + 1, key)}
          </div>
        );
      })}
      {node.notes.sort((a, b) => a.title.localeCompare(b.title)).map((n) => (
        <button key={n.path} type="button" className={`nt-item${cur?.path === n.path ? " active" : ""}`} style={{ paddingLeft: 24 + depth * 14 }} onClick={() => openNote(n.path)}>
          <FileText size={14} /> <span>{n.title}</span>
        </button>
      ))}
    </>
  );

  const saveLabel = { idle: "", dirty: "Editando…", saving: "Salvando…", saved: "Salvo", error: "Erro ao salvar" }[save];

  return (
    <div className={`nt-root${relOpen ? "" : " rel-closed"}`}>
      <aside className={`nt-list${listOpen ? " open" : ""}`}>
        <div className="nt-list-head">
          <div className="nt-search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nas notas…" /></div>
          {newName === null ? (
            <button type="button" className="nt-btn primary" onClick={() => setNewName("")}><Plus size={15} /> Nova nota</button>
          ) : (
            <form onSubmit={createNote} className="nt-newform">
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome ou pasta/Nome" />
              <button className="nt-btn primary" type="submit">Criar</button>
              <button className="nt-btn" type="button" onClick={() => setNewName(null)}><X size={14} /></button>
            </form>
          )}
        </div>
        <div className="nt-filters">
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} aria-label="Filtrar por área">
            <option value="">Todas as áreas</option>
            {areaOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {tagFilter && <button type="button" className="nt-chip on" onClick={() => setTagFilter("")}>#{tagFilter} <X size={12} /></button>}
        </div>
        <div className="nt-tree">
          {results ? (
            <>
              <div className="nt-sec">{results.length} resultado(s)</div>
              {results.map((r) => (
                <button key={r.path} className="nt-result" type="button" onClick={() => { setQ(""); openNote(r.path); }}>
                  <strong>{r.title}</strong><span>{r.snippet}</span>
                </button>
              ))}
            </>
          ) : (
            renderFolder(tree, 0, "")
          )}
          {!results && !filtered.length && <p className="nt-empty">Nenhuma nota{tagFilter || areaFilter ? " com esse filtro" : " ainda"}.</p>}
        </div>
        {allTags.length > 0 && !results && (
          <div className="nt-tags">
            <div className="nt-sec">Tags</div>
            <div className="nt-chips">
              {allTags.map(([t, c]) => (
                <button key={t} type="button" className={`nt-chip${tagFilter === t ? " on" : ""}`} onClick={() => setTagFilter(tagFilter === t ? "" : t)}>#{t} <em>{c}</em></button>
              ))}
            </div>
          </div>
        )}
        <Link href="/notas/grafo" className="nt-graphlink"><Network size={16} /> Abrir o grafo</Link>
      </aside>

      <main className="nt-main">
        {error && <div className="nt-error" onClick={() => setError("")}>{error}</div>}
        {!cur ? (
          <div className="nt-blank">
            <button type="button" className="nt-btn mobile-only" onClick={() => setListOpen(true)}><Menu size={16} /> Notas</button>
            <p>{notes.length ? "Selecione uma nota." : "Crie sua primeira nota."}</p>
          </div>
        ) : (
          <>
            <div className="nt-toolbar">
              <button type="button" className="nt-btn mobile-only" onClick={() => setListOpen(true)} aria-label="Lista de notas"><Menu size={16} /></button>
              <div className="nt-path" title={cur.path}>{cur.path}</div>
              <span className={`nt-save ${save}`}>{saveLabel}</span>
              <div className="nt-seg" role="group" aria-label="Modo">
                <button type="button" className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")} title="Editar"><Pencil size={15} /></button>
                <button type="button" className={mode === "split" ? "on" : ""} onClick={() => setMode("split")} title="Dividido"><Columns2 size={15} /></button>
                <button type="button" className={mode === "read" ? "on" : ""} onClick={() => setMode("read")} title="Ler"><Eye size={15} /></button>
              </div>
              <button type="button" className="nt-btn" onClick={renameCurrent} title="Renomear/mover">Renomear</button>
              <button type="button" className="nt-btn danger" onClick={removeNote} title="Mover para a lixeira"><Trash2 size={15} /></button>
              <button type="button" className="nt-btn" onClick={() => setRelOpen((v) => !v)} title="Painel de relações"><PanelRight size={15} /></button>
            </div>

            <div className="nt-props">
              <label>Área
                <input list="nt-areas" defaultValue={fm.area || fm["área"] || ""} key={`a-${cur.path}-${fm.area}`} placeholder="Computação > Sistemas Operacionais > Windows" onBlur={(e) => { if ((fm.area || "") !== e.target.value.trim()) setProp("area", e.target.value.trim()); }} />
                <datalist id="nt-areas">{areaOptions.map((a) => <option key={a.id} value={a.label} />)}</datalist>
              </label>
              <label>Tipo
                <input list="nt-types" defaultValue={fm.tipo || fm.type || ""} key={`t-${cur.path}-${fm.tipo}`} placeholder="nota" onBlur={(e) => { if ((fm.tipo || "") !== e.target.value.trim()) setProp("tipo", e.target.value.trim()); }} />
                <datalist id="nt-types">{TYPE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}</datalist>
              </label>
              <div className="nt-proptags">
                <span>Tags</span>
                {fmTags.map((t) => (
                  <button key={t} type="button" className="nt-chip on" onClick={() => setProp("tags", fmTags.filter((x) => x !== t))} title="Remover">#{t} <X size={12} /></button>
                ))}
                <input onKeyDown={addTag} placeholder="+ tag" />
              </div>
            </div>

            <div className={`nt-panes mode-${mode}`}>
              {mode !== "read" && (
                <div className="nt-editor">
                  <textarea ref={taRef} value={parts.body} onChange={onBodyChange} onKeyDown={onBodyKeyDown} onBlur={() => setTimeout(() => setSuggest(null), 150)} spellCheck={false} placeholder="Escreva em markdown. Use [[ para ligar notas, #tag e @menção." />
                  {suggest && (
                    <div className="nt-suggest">
                      {suggest.items.map((it, i) => (
                        <button key={it.path} type="button" className={i === sugIdx ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); applySuggestion(it); }}>
                          <CornerDownRight size={13} /> {it.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {mode !== "edit" && (
                <div className="nt-preview">
                  <Markdown text={parts.body} titles={titles} onOpenNote={openByName} onTag={(t) => { setTagFilter(t); setListOpen(true); }} />
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {relOpen && cur && (
        <aside className="nt-rel">
          <div className="nt-sec">Citada em ({cur.relations.backlinks.length})</div>
          {cur.relations.backlinks.length === 0 && <p className="nt-empty">Nenhuma nota aponta para cá.</p>}
          {cur.relations.backlinks.map((r) => (
            <button key={r.path + r.kind} type="button" className="nt-rel-item" onClick={() => openNote(r.path)}>
              <Link2 size={13} /> {r.title} <em>{r.kind === "mention" ? "menção" : "link"}</em>
            </button>
          ))}
          <div className="nt-sec">Aponta para ({cur.relations.outgoing.length})</div>
          {cur.relations.outgoing.length === 0 && <p className="nt-empty">Sem links de saída.</p>}
          {cur.relations.outgoing.map((r) => (
            <button key={r.path + r.kind} type="button" className={`nt-rel-item${r.ghost ? " ghost" : ""}`} onClick={() => (r.ghost ? openByName(r.title) : openNote(r.path))}>
              <Link2 size={13} /> {r.title} <em>{r.ghost ? "criar" : r.kind === "mention" ? "menção" : "link"}</em>
            </button>
          ))}
          <div className="nt-sec">Propriedades</div>
          <dl className="nt-meta">
            <dt>Área</dt><dd>{fm.area || "—"}</dd>
            <dt>Tipo</dt><dd>{fm.tipo || fm.type || "nota"}</dd>
            <dt>Palavras</dt><dd>{(parts.body.match(/\S+/g) || []).length}</dd>
          </dl>
          <Link href={`/notas/grafo?foco=${encodeURIComponent(cur.path)}`} className="nt-btn full"><Network size={15} /> Ver no grafo</Link>
        </aside>
      )}
    </div>
  );
}
