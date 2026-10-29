"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, Trash2, Pencil, Menu, PenLine } from "lucide-react";
import { useLive } from "../live/liveClient.js";

// Excalidraw é pesado e só roda no navegador; as fontes são servidas de /excalidraw-assets (sem CDN).
const ExcalidrawBoard = dynamic(
  () => {
    window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";
    return import("./ExcalidrawBoard.jsx");
  },
  { ssr: false, loading: () => <p className="qd-loading">Carregando o quadro…</p> }
);

async function api(url, opts = {}) {
  const r = await fetch(url, { cache: "no-store", ...opts, headers: opts.body ? { "content-type": "application/json" } : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

const LAST_KEY = "lh-quadro-ativo";
const sigOf = (elements, app) =>
  `${elements.filter((e) => !e.isDeleted).map((e) => `${e.id}:${e.version}`).join(",")}|${app.viewBackgroundColor ?? "#ffffff"}|${String(app.gridSize ?? "")}`;

export default function QuadrosClient() {
  const [boards, setBoards] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loaded, setLoaded] = useState(null); // { id, scene }
  const [save, setSave] = useState("idle");
  const [error, setError] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const timer = useRef(null);
  const lastSig = useRef("");
  const activeRef = useRef(null);
  activeRef.current = activeId;

  const loadList = useCallback(async () => {
    const r = await api("/api/quadros");
    setBoards(r.boards);
    return r.boards;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        let list = await loadList();
        if (!list.length) {
          await api("/api/quadros", { method: "POST", body: JSON.stringify({ name: "Meu primeiro quadro" }) });
          list = await loadList();
        }
        let saved = null;
        try { saved = localStorage.getItem(LAST_KEY); } catch {}
        setActiveId(list.find((b) => b.id === saved) ? saved : list[0].id);
      } catch (e) { setError(e.message); }
    })();
  }, [loadList]);

  useEffect(() => {
    if (!activeId) return;
    let dead = false;
    setLoaded(null);
    setSave("idle");
    clearTimeout(timer.current);
    try { localStorage.setItem(LAST_KEY, activeId); } catch {}
    api(`/api/quadros/${activeId}`).then((r) => {
      if (dead) return;
      lastSig.current = sigOf(r.scene.elements || [], r.scene.appState || {}); // abrir não conta como edição
      setLoaded({ id: activeId, scene: r.scene });
    }).catch((e) => setError(e.message));
    return () => { dead = true; };
  }, [activeId]);

  useEffect(() => () => clearTimeout(timer.current), []);
  // quadros criados/renomeados/apagados em outra aba (ou pelo agente) aparecem na lista
  useLive(["quadros"], () => { loadList().catch(() => {}); });

  const onSceneChange = useCallback((elements, appState, files) => {
    const live = elements.filter((e) => !e.isDeleted);
    const sig = sigOf(live, appState);
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    const id = activeRef.current;
    setSave("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSave("saving");
      try {
        const used = new Set(live.filter((e) => e.type === "image").map((e) => e.fileId));
        const keep = {};
        for (const [k, v] of Object.entries(files || {})) if (used.has(k)) keep[k] = v;
        const meta = await api(`/api/quadros/${id}`, { method: "PUT", body: JSON.stringify({ scene: { elements: live, appState, files: keep } }) });
        setBoards((list) => list.map((b) => (b.id === id ? meta : b)));
        setSave("saved");
      } catch (e) {
        setSave("error");
        setError(e.message);
      }
    }, 1500);
  }, []);

  async function newBoard() {
    const name = prompt("Nome do quadro:", "Novo quadro");
    if (!name) return;
    const meta = await api("/api/quadros", { method: "POST", body: JSON.stringify({ name }) });
    await loadList();
    setActiveId(meta.id);
    setListOpen(false);
  }
  async function renameBoard(b) {
    const name = prompt("Novo nome:", b.name);
    if (!name || name === b.name) return;
    await api(`/api/quadros/${b.id}`, { method: "PUT", body: JSON.stringify({ name }) });
    await loadList();
  }
  async function removeBoard(b) {
    if (!confirm(`Mover o quadro "${b.name}" para a lixeira?`)) return;
    await api(`/api/quadros/${b.id}`, { method: "DELETE" });
    const list = await loadList();
    if (b.id === activeId) {
      if (list.length) setActiveId(list[0].id);
      else {
        const m = await api("/api/quadros", { method: "POST", body: JSON.stringify({ name: "Meu primeiro quadro" }) });
        await loadList();
        setActiveId(m.id);
      }
    }
  }

  const active = boards.find((b) => b.id === activeId);
  const label = { idle: "", dirty: "Editando…", saving: "Salvando…", saved: "Salvo", error: "Erro ao salvar" }[save];

  return (
    <div className="qd-root">
      <aside className={`qd-list${listOpen ? " open" : ""}`}>
        <button type="button" className="qd-new" onClick={newBoard}><Plus size={15} /> Novo quadro</button>
        <div className="qd-items">
          {boards.map((b) => (
            <div key={b.id} className={`qd-item${b.id === activeId ? " active" : ""}`}>
              <button type="button" className="qd-open" onClick={() => { setActiveId(b.id); setListOpen(false); }}>
                <PenLine size={14} />
                <span className="qd-name">{b.name}</span>
                <span className="qd-sub">{b.elements} elemento(s) · {new Date(b.updatedAt).toLocaleDateString("pt-BR")}</span>
              </button>
              <button type="button" className="qd-ic" onClick={() => renameBoard(b)} aria-label="Renomear"><Pencil size={13} /></button>
              <button type="button" className="qd-ic danger" onClick={() => removeBoard(b)} aria-label="Excluir"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <p className="qd-hint">Tudo que você desenha é salvo automaticamente neste quadro.</p>
      </aside>

      <main className="qd-main">
        <div className="qd-top">
          <button type="button" className="qd-burger" onClick={() => setListOpen(true)} aria-label="Quadros"><Menu size={17} /></button>
          <strong className="qd-title">{active?.name || "Quadros"}</strong>
          <span className={`qd-save ${save}`}>{label}</span>
        </div>
        {error && <div className="qd-error" onClick={() => setError("")}>{error}</div>}
        <div className="qd-canvas">
          {loaded && loaded.id === activeId && (
            <ExcalidrawBoard key={loaded.id} initial={loaded.scene} onSceneChange={onSceneChange} />
          )}
        </div>
      </main>
    </div>
  );
}
