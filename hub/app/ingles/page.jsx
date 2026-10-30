"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Dumbbell, Brain, BarChart3, Menu, X, CheckCircle2, ChevronLeft, ChevronRight, Lock, Network } from "lucide-react";
import Trilha from "@/components/ingles/Trilha";
import LessonNav from "@/components/ingles/LessonNav";
import Reader from "@/components/ingles/Reader";
import Practice from "@/components/ingles/Practice";
import Words from "@/components/ingles/Words";
import Overview from "@/components/ingles/Overview";
import { api, post, STATUS_LABEL, KIND_LABEL } from "@/components/ingles/util";
import "./ingles.css";

const TABS = [
  { id: "trilha", label: "Trilha", icon: Network },
  { id: "estudo", label: "Estudo", icon: BookOpen },
  { id: "praticar", label: "Praticar", icon: Dumbbell },
  { id: "reforco", label: "Reforço", icon: Brain },
  { id: "progresso", label: "Progresso", icon: BarChart3 },
];

export default function InglesPage() {
  const [index, setIndex] = useState(null);
  const [ov, setOv] = useState(null);
  const [words, setWords] = useState([]);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("estudo");
  const [drawer, setDrawer] = useState(false);
  const [error, setError] = useState("");

  const loadIndex = useCallback(() => api("/api/ingles/lessons").then(setIndex), []);
  const loadOv = useCallback(() => api("/api/ingles/progress").then(setOv).catch(() => {}), []);
  const loadWords = useCallback(() => api("/api/ingles/words").then((w) => setWords(Array.isArray(w) ? w : [])).catch(() => {}), []);
  const loadDetail = useCallback((id) => api(`/api/ingles/lessons?id=${encodeURIComponent(id)}`).then(setDetail), []);

  // primeira carga: índice, progresso e palavras; escolhe a lição da URL, a última aberta ou a recomendada
  useEffect(() => {
    (async () => {
      try {
        const [idx, o] = await Promise.all([loadIndex().then(() => null), loadOv()]);
        loadWords();
      } catch (e) { setError(e.message); }
    })();
  }, []);

  useEffect(() => {
    if (!index || sel) return;
    let want = null;
    try {
      want = new URLSearchParams(location.search).get("l") || localStorage.getItem("ing-last");
    } catch {}
    if (!want || !index.lessons.some((l) => l.id === want)) want = ov?.current?.id || index.lessons[0]?.id;
    if (want) setSel(want);
  }, [index, ov, sel]);

  useEffect(() => {
    if (!sel) return;
    setDetail(null);
    loadDetail(sel).catch((e) => setError(e.message));
    try {
      localStorage.setItem("ing-last", sel);
      const u = new URL(location.href);
      u.searchParams.set("l", sel);
      history.replaceState(null, "", u);
    } catch {}
  }, [sel]);

  const refresh = useCallback(() => {
    loadIndex().catch(() => {});
    loadOv();
    if (sel) loadDetail(sel).catch(() => {});
  }, [sel]);

  function open(id) {
    if (!id) return;
    setSel(id);
    setTab("estudo");
    setDrawer(false);
  }

  async function toggleDone() {
    await post("/api/ingles/progress", { op: detail.state.manual ? "undone" : "done", lesson: sel });
    refresh();
  }

  if (error && !index) return <div className="ing-shell"><p className="ing-err" style={{ padding: 24 }}>{error}</p></div>;
  if (!index) return <div className="ing-shell"><p className="ing-hint" style={{ padding: 24 }}>Carregando o curso…</p></div>;

  const L = detail?.lesson;
  const S = detail?.state;
  const dueCount = ov?.plan?.dueWords || 0;
  const needsLesson = tab === "estudo" || tab === "praticar";

  return (
    <div className="ing-shell">
      <aside className={`ing-aside${drawer ? " open" : ""}`}>
        <header className="ing-aside-head">
          <div>
            <h2>Inglês</h2>
            <p>Curso Mairo Vergara · {index.lessons.length} lições</p>
          </div>
          <button type="button" className="ing-icon only-mobile" onClick={() => setDrawer(false)} aria-label="Fechar lições"><X size={18} /></button>
        </header>
        <LessonNav index={index} overview={ov} selectedId={sel} onSelect={open} />
      </aside>
      {drawer && <div className="ing-scrim" onClick={() => setDrawer(false)} />}

      <main className="ing-main">
        <header className="ing-top">
          <button type="button" className="ing-icon only-mobile" onClick={() => setDrawer(true)} aria-label="Abrir lições"><Menu size={20} /></button>
          <div className="ing-crumb">
            {L ? (
              <>
                <span className="ing-crumb-g">{L.groupTitle} · {KIND_LABEL[L.kind]}</span>
                <h1>{L.title}</h1>
              </>
            ) : <h1>Inglês</h1>}
          </div>
          {S && needsLesson && (
            <div className="ing-top-r">
              <span className={`ing-pill ${S.status}`}>{STATUS_LABEL[S.status]}{S.status !== "locked" && S.attempts ? ` · ${Math.round(S.mastery * 100)}%` : ""}</span>
              <button type="button" className={`ing-btn sm${S.manual ? " on" : ""}`} onClick={toggleDone} title="Marca a lição como já estudada (nivelamento) e libera a próxima parte">
                <CheckCircle2 size={14} /> {S.manual ? "Já estudada" : "Já estudei"}
              </button>
              <div className="ing-step">
                <button type="button" disabled={!detail.prev} onClick={() => open(detail.prev)} aria-label="Parte anterior"><ChevronLeft size={16} /></button>
                <button type="button" disabled={!detail.next} onClick={() => open(detail.next)} aria-label="Próxima parte"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </header>
        <div className="ing-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              <t.icon size={15} /> {t.label}{t.id === "reforco" && dueCount ? <b className="ing-dot">{dueCount}</b> : null}
            </button>
          ))}
        </div>

        {S?.status === "locked" && needsLesson && (
          <div className="ing-lockbar"><Lock size={14} /> Esta parte está bloqueada: aprove a parte anterior (ou marque-a como já estudada). Você pode estudar mesmo assim.</div>
        )}

        <div className="ing-body">
          {needsLesson && !detail && <p className="ing-hint" style={{ padding: 24 }}>Carregando a lição…</p>}
          {tab === "estudo" && detail && (
            <Reader key={L.id} lesson={L} tracks={detail.tracks} state={S} savedWords={words} onWordSaved={() => { loadWords(); loadOv(); }} onProgress={refresh} onOpenReforco={() => setTab("reforco")} />
          )}
          {tab === "praticar" && detail && <Practice key={L.id} lesson={L} types={detail.types} state={S} onProgress={refresh} />}
          {tab === "reforco" && <Words words={words} reload={() => { loadWords(); loadOv(); }} onProgress={refresh} onOpenLesson={open} />}
          {tab === "trilha" && <Trilha index={index} onOpen={open} onPractice={(id) => { setSel(id); setTab("praticar"); setDrawer(false); }} />}
          {tab === "progresso" &&<Overview ov={ov} onOpenLesson={open} onOpenWords={() => setTab("reforco")} reload={loadOv} />}
        </div>
      </main>
    </div>
  );
}
