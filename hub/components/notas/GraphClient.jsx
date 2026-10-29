"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, Plus, Maximize2, Download, Palette, Sparkles, FileText, ArrowLeft, Send, X, Crosshair } from "lucide-react";
import { applyView, describeView } from "./viewEngine.js";
import ViewEditor from "./ViewEditor.jsx";
import { useLive } from "../live/liveClient.js";
import { sanitizeView, SHAPES, ICONS, BORDERS } from "@/lib/notas/views.js";

async function api(url, opts = {}) {
  const r = await fetch(url, { cache: "no-store", ...opts, headers: opts.body ? { "content-type": "application/json" } : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

function areaLabel(areas, id) {
  const idx = new Map(areas.map((a) => [a.id, a]));
  const names = [];
  let cur = idx.get(id);
  let g = 0;
  while (cur && g++ < 20) { names.unshift(cur.name); cur = cur.parent ? idx.get(cur.parent) : null; }
  return names.join(" > ");
}

export default function GraphClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const foco = sp.get("foco");

  const [graph, setGraph] = useState(null);
  const [views, setViews] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [areasOpen, setAreasOpen] = useState(false);
  const [areasDraft, setAreasDraft] = useState([]);
  const [sel, setSel] = useState(null);
  const [error, setError] = useState("");
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [reply, setReply] = useState("");
  const [focusId, setFocusId] = useState(foco || "");
  const holder = useRef(null);
  const cyRef = useRef(null);

  const load = useCallback(async () => {
    const [g, v] = await Promise.all([api("/api/notas/graph"), api("/api/notas/views")]);
    setGraph(g);
    setViews(v.views);
    setActiveId((cur) => (cur && v.views.find((x) => x.id === cur) ? cur : v.activeId));
  }, []);

  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  // notas/áreas/visões alteradas (pelo agente, por outra aba ou por arquivo) redesenham o grafo na hora
  useLive(["notas"], () => { load().catch(() => {}); });

  const areaOptions = useMemo(() => (graph ? graph.areas.map((a) => ({ id: a.id, label: areaLabel(graph.areas, a.id) })).sort((a, b) => a.label.localeCompare(b.label)) : []), [graph]);
  const active = useMemo(() => views.find((v) => v.id === activeId) || views[0], [views, activeId]);

  // visão efetiva: rascunho do editor > foco temporário > visão ativa
  const effective = useMemo(() => {
    const base = draft || active;
    if (!base) return null;
    if (focusId) return { ...base, filter: { ...base.filter, focus: focusId, depth: base.filter.focus === focusId ? base.filter.depth : 2 } };
    return base;
  }, [draft, active, focusId]);

  const result = useMemo(() => (graph && effective ? applyView(graph, effective) : null), [graph, effective]);

  // ---------- desenho ----------
  useEffect(() => {
    if (!result || !holder.current) return;
    let dead = false;
    let cy;
    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      if (!window.__lhFcose) {
        const fcose = (await import("cytoscape-fcose")).default;
        cytoscape.use(fcose);
        window.__lhFcose = true;
      }
      if (dead || !holder.current) return;
      cy = cytoscape({ container: holder.current, elements: result.elements, style: result.stylesheet, layout: result.layout, wheelSensitivity: 0.25, minZoom: 0.08, maxZoom: 3 });
      cyRef.current = cy;
      const clear = () => cy.elements().removeClass("faded");
      const light = (n) => {
        clear();
        const keep = n.closedNeighborhood().union(n.ancestors()).union(n.descendants());
        cy.elements().not(keep).addClass("faded");
      };
      cy.on("mouseover", "node", (e) => { if (e.target.data("kind") !== "group") light(e.target); });
      cy.on("mouseout", "node", clear);
      cy.on("tap", "node", (e) => {
        const d = e.target.data();
        setSel({ id: d.id, kind: d.kind, label: d.label, path: d.path, area: d.area, tags: d.tags, type: d.type, degree: d.degree });
      });
      cy.on("tap", (e) => { if (e.target === cy) setSel(null); });
      cy.on("dbltap", 'node[kind = "note"]', (e) => router.push(`/notas?n=${encodeURIComponent(e.target.data("path"))}`));
    })();
    return () => { dead = true; if (cy) cy.destroy(); cyRef.current = null; };
  }, [result, router]);

  // ---------- persistência das visões ----------
  async function persist(nextViews, nextActive) {
    const r = await api("/api/notas/views", { method: "PUT", body: JSON.stringify({ views: nextViews, activeId: nextActive }) });
    setViews(r.views);
    setActiveId(r.activeId);
    return r;
  }
  async function saveDraft(v) {
    const clean = sanitizeView(v);
    const exists = views.some((x) => x.id === clean.id);
    await persist(exists ? views.map((x) => (x.id === clean.id ? clean : x)) : [...views, clean], clean.id);
    setDraft(null);
    setEditing(false);
  }
  async function duplicate(v) {
    const copy = sanitizeView({ ...v, id: `view_${Math.random().toString(36).slice(2, 10)}`, name: `${v.name} (cópia)` });
    await persist([...views, copy], copy.id);
    setDraft(null);
  }
  async function remove(v) {
    if (views.length <= 1 || !confirm(`Excluir a visão "${v.name}"?`)) return;
    const rest = views.filter((x) => x.id !== v.id);
    await persist(rest, rest[0].id);
    setDraft(null);
    setEditing(false);
  }
  async function newView() {
    const v = sanitizeView({ id: `view_${Math.random().toString(36).slice(2, 10)}`, name: "Nova visão", filter: {}, show: { links: true, mentions: true }, group: "area", style: { nodeColorBy: "area", sizeBy: "degree" } });
    await persist([...views, v], v.id);
    setEditing(true);
  }

  // ---------- áreas ----------
  function openAreas() { setAreasDraft(structuredClone(graph.areas.map(({ count, ...a }) => a))); setAreasOpen(true); }
  async function saveAreas() {
    await api("/api/notas/areas", { method: "PUT", body: JSON.stringify({ areas: areasDraft }) });
    setAreasOpen(false);
    await load();
  }

  // ---------- Claude ----------
  async function askClaude(e) {
    e.preventDefault();
    const text = ask.trim();
    if (!text || asking) return;
    setAsking(true);
    setReply("");
    try {
      const r = await api("/api/chat", { method: "POST", body: JSON.stringify({ message: `[Notas e Grafo] ${text}` }) });
      setReply(r.reply || "");
      setAsk("");
      await load();
    } catch (err) {
      setReply(`Erro: ${err.message}`);
    } finally {
      setAsking(false);
    }
  }

  function exportPng() {
    const cy = cyRef.current;
    if (!cy) return;
    const a = document.createElement("a");
    a.href = cy.png({ full: true, scale: 2, bg: effective?.style?.background || "#fafbfc" });
    a.download = `grafo-${(active?.name || "notas").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
  }

  if (error) return <div className="gf-root"><div className="nt-error">{error}</div></div>;
  if (!graph || !active) return <div className="gf-root"><p className="nt-empty" style={{ padding: 24 }}>Carregando grafo…</p></div>;

  const focusNode = focusId ? [...graph.nodes, ...graph.ghosts].find((n) => n.id === focusId) : null;
  const selNode = sel && sel.path ? graph.nodes.find((n) => n.id === sel.path) : null;

  return (
    <div className="gf-root">
      <header className="gf-bar">
        <Link href="/notas" className="nt-btn" title="Voltar às notas"><ArrowLeft size={15} /> Notas</Link>
        <select className="gf-viewsel" value={active.id} onChange={(e) => { setDraft(null); setFocusId(""); persist(views, e.target.value); }} aria-label="Visão">
          {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button type="button" className={`nt-btn${editing ? " on" : ""}`} onClick={() => setEditing((v) => !v)}><SlidersHorizontal size={15} /> Editar visão</button>
        <button type="button" className="nt-btn" onClick={newView}><Plus size={15} /> Nova visão</button>
        <button type="button" className="nt-btn" onClick={openAreas}><Palette size={15} /> Áreas</button>
        <span className="gf-spacer" />
        <span className="gf-count">{result.counts.nodes} nós · {result.counts.edges} ligações{result.counts.groups ? ` · ${result.counts.groups} grupos` : ""}</span>
        <button type="button" className="nt-btn" onClick={() => cyRef.current?.fit(undefined, 40)} title="Ajustar à tela"><Maximize2 size={15} /></button>
        <button type="button" className="nt-btn" onClick={exportPng} title="Exportar imagem"><Download size={15} /></button>
      </header>
      <div className="gf-desc">{active.description || describeView(effective)}</div>
      {focusNode && (
        <div className="gf-focus">
          <Crosshair size={14} /> Foco em <strong>{focusNode.title}</strong> (2 níveis)
          <button type="button" className="nt-btn" onClick={() => { setFocusId(""); router.replace("/notas/grafo"); }}>Sair do foco</button>
        </div>
      )}

      <div className="gf-stage">
        <div className="gf-canvas" ref={holder} style={{ background: effective?.style?.background || "#fafbfc" }} />
        {result.counts.nodes === 0 && <div className="gf-emptymsg">Nenhuma nota corresponde a esta visão.</div>}

        {sel && (
          <div className="gf-sel">
            <button type="button" className="gf-sel-x" onClick={() => setSel(null)} aria-label="Fechar"><X size={14} /></button>
            <strong>{sel.label}</strong>
            {selNode ? (
              <>
                <div className="gf-sel-meta">{areaLabel(graph.areas, selNode.area) || "Sem área"} · {selNode.type} · {selNode.degree} conexões</div>
                {selNode.tags.length > 0 && <div className="nt-chips">{selNode.tags.map((t) => <span key={t} className="nt-chip">#{t}</span>)}</div>}
                <div className="gf-sel-actions">
                  <Link href={`/notas?n=${encodeURIComponent(selNode.id)}`} className="nt-btn primary"><FileText size={14} /> Abrir nota</Link>
                  <button type="button" className="nt-btn" onClick={() => setFocusId(selNode.id)}><Crosshair size={14} /> Focar</button>
                </div>
              </>
            ) : (
              <div className="gf-sel-meta">{sel.kind === "group" ? "Delimitação (área ou tag)" : sel.kind === "tag" ? "Tag" : sel.kind === "ghost" ? "Nota referenciada que ainda não existe" : "Área"}</div>
            )}
          </div>
        )}

        {editing && (
          <ViewEditor
            view={draft || active}
            graph={graph}
            areaOptions={areaOptions}
            onChange={(v) => setDraft(v)}
            onSave={saveDraft}
            onClose={() => { setEditing(false); setDraft(null); }}
            onDuplicate={duplicate}
            onDelete={remove}
            canDelete={views.length > 1}
          />
        )}
      </div>

      <form className="gf-ask" onSubmit={askClaude}>
        <Sparkles size={16} />
        <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder='Peça ao Claude: "organize tudo sobre Back-end numa área e crie uma visão só com isso"' disabled={asking} />
        <button type="submit" className="nt-btn primary" disabled={asking || !ask.trim()}><Send size={14} /> {asking ? "Trabalhando…" : "Enviar"}</button>
      </form>
      {reply && <div className="gf-reply" onClick={() => setReply("")}>{reply}</div>}

      {areasOpen && (
        <div className="gf-modal" onClick={() => setAreasOpen(false)}>
          <div className="gf-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="gf-editor-head"><strong>Áreas (hierarquia e aparência)</strong><button type="button" className="nt-btn" onClick={() => setAreasOpen(false)}><X size={15} /></button></div>
            <p className="gf-hint">As áreas nascem do campo <code>area:</code> das notas (ex.: Computação &gt; Sistemas Operacionais &gt; Windows). Aqui você muda cor, borda, forma, ícone e o pai de cada uma.</p>
            <div className="gf-areas">
              {areasDraft.length === 0 && <p className="nt-empty">Nenhuma área ainda.</p>}
              {[...areasDraft].sort((a, b) => areaLabel(areasDraft, a.id).localeCompare(areaLabel(areasDraft, b.id))).map((a) => {
                const depth = areaLabel(areasDraft, a.id).split(" > ").length - 1;
                const upd = (patch) => setAreasDraft((list) => list.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
                return (
                  <div key={a.id} className="gf-arearow" style={{ marginLeft: depth * 16 }}>
                    <input type="color" value={a.color} onChange={(e) => upd({ color: e.target.value })} aria-label="Cor" />
                    <input value={a.name} onChange={(e) => upd({ name: e.target.value })} aria-label="Nome" />
                    <select value={a.border} onChange={(e) => upd({ border: e.target.value })} aria-label="Borda">{BORDERS.map((b) => <option key={b} value={b}>{b}</option>)}</select>
                    <select value={a.shape || ""} onChange={(e) => upd({ shape: e.target.value || null })} aria-label="Forma dos nós"><option value="">forma —</option>{SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                    <select value={a.icon || ""} onChange={(e) => upd({ icon: e.target.value || null })} aria-label="Ícone"><option value="">ícone —</option>{ICONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                    <select value={a.parent || ""} onChange={(e) => upd({ parent: e.target.value || null })} aria-label="Área pai"><option value="">(raiz)</option>{areasDraft.filter((x) => x.id !== a.id).map((x) => <option key={x.id} value={x.id}>{areaLabel(areasDraft, x.id)}</option>)}</select>
                  </div>
                );
              })}
            </div>
            <div className="gf-editor-foot"><button type="button" className="nt-btn primary" onClick={saveAreas}>Salvar áreas</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
