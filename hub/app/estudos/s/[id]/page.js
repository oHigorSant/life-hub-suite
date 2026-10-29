"use client";
import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Topbar, Ring, Md, JobCard, ConfirmDialog, api, usePoll, useJob, STATUS, timeAgo, Diff } from "@/components/atlas/ui.js";
import Quiz from "@/components/atlas/Quiz.js";
import { Network, Library as LibraryIcon, LineChart, MessagesSquare, Trash2, Plus, Sparkles, Layers, X, ArrowRight, Paperclip, Search, SOURCE_ICON, File, RefreshCw, Timer, AlertTriangle, Clock, BrickWall, TreeIllustration, DocsIllustration } from "@/components/atlas/icons.js";

const SkillTree = dynamic(() => import("@/components/atlas/SkillTree.js"), { ssr: false, loading: () => <div className="empty"><span className="spinner" /></div> });

const TABS = [["tree", Network, "Trilha"], ["library", LibraryIcon, "Biblioteca"], ["progress", LineChart, "Progresso"], ["chat", MessagesSquare, "Mentor"]];

export default function SubjectPage({ params }) {
  const { id } = use(params);
  const [tab, setTab] = useState("tree");
  const [sel, setSel] = useState(null);
  const [data, reload, err] = usePoll(() => api(`/api/estudos/subjects/${id}`), { ms: 3000 });
  const [extra, setExtra] = useState(false);
  const [askDel, setAskDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const t = new URLSearchParams(location.search).get("tab");
    if (t) setTab(t);
  }, []);

  if (err && !data) return <div className="shell"><Topbar /><div className="empty">{err}</div></div>;
  if (!data) return <div className="shell"><Topbar /><div className="page"><div className="skeleton" style={{ height: 400 }} /></div></div>;

  const { subject, summary, nodes, edges, sources, jobs, today } = data;
  const running = jobs.filter((j) => j.status === "running" || j.status === "queued");
  const build = running.find((j) => j.kind === "build" || j.kind === "roadmap");
  const failed = jobs.find((j) => j.status === "error" && Date.now() - j.updated_at < 120000);
  const hasTree = nodes.length > 0;

  return (
    <div className="shell">
      <Topbar crumbs={[{ label: subject.title }]} right={<><button className="btn ghost sm" aria-label="Excluir área" title="Excluir área" onClick={() => setAskDel(true)}><Trash2 size={16} /><span className="lbl"> Excluir</span></button><Link href={`/estudos/new`} className="btn sm" aria-label="Nova trilha"><Plus size={16} /><span className="lbl"> Nova</span></Link></>} />
      <div className="subnav">
        <div className="tabs">{TABS.map(([k, ic, l]) => <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => { setTab(k); setSel(null); history.replaceState(null, "", `?tab=${k}`); }}><span className="ti">{(() => { const I = ic; return <I size={18} />; })()}</span><span className="tl">{l}</span></button>)}</div>
        <span className="spacer sub-extra" />
        <span className="dim sub-extra" style={{ fontSize: 13 }}>{summary.mastered}/{summary.nodes} dominadas</span>
        <span className="sub-extra"><Ring value={summary.percent / 100} size={34} stroke={4}><span style={{ fontSize: 10 }}>{summary.percent}</span></Ring></span>
        {hasTree && <button className="btn sm sub-extra" onClick={() => setExtra(true)}><Plus size={15} /> Expandir trilha</button>}
      </div>

      {!hasTree && (
        <div className="page" style={{ maxWidth: 640 }}>
          {build ? (
            <div className="card" style={{ textAlign: "center", padding: 40 }}>
              <div style={{ marginBottom: 10 }}><TreeIllustration size={130} animated /></div>
              <h2>Construindo sua trilha</h2>
              <p className="muted">Lendo o material, extraindo conceitos e desenhando a árvore. Pode fechar a aba — continua em segundo plano.</p>
              <div className="progress" style={{ marginTop: 20 }}><i style={{ width: `${Math.round(build.progress * 100)}%` }} /></div>
              <div className="dim" style={{ marginTop: 10, fontSize: 13 }}>{build.message}</div>
            </div>
          ) : (
            <div className="card empty">
              <TreeIllustration size={110} />
              <h2>Esta área ainda não tem trilha</h2>
              {failed && <p style={{ color: "var(--red)" }}>Último erro: {failed.message}</p>}
              <p className="muted">Gere a árvore agora (usando seus materiais, se houver).</p>
              <button className="btn primary lg" onClick={async () => { await api(`/api/estudos/subjects/${id}/roadmap`, { body: {} }); reload(); }}><Sparkles size={17} /> Gerar trilha</button>
            </div>
          )}
        </div>
      )}

      {hasTree && tab === "tree" && <TreeTab {...{ id, subject, nodes, edges, sel, setSel, today }} />}
      {hasTree && tab === "tree" && !sel && <button className="btn primary fab" onClick={() => setExtra(true)} aria-label="Expandir trilha"><Plus size={18} /><span className="lbl"> Expandir</span></button>}
      {tab === "library" && <Library {...{ id, sources, reload }} />}
      {hasTree && tab === "progress" && <Progress {...{ id, subject, nodes, summary }} />}
      {tab === "chat" && <Chat {...{ id, subject, reload }} />}

      {askDel && (
        <ConfirmDialog
          title={`Excluir "${subject.title}"?`}
          body={<>Isso apaga a trilha ({summary.nodes} habilidades), os materiais enviados, questões, cartões e todo o seu progresso. <strong>Não dá para desfazer.</strong></>}
          busy={delBusy}
          onCancel={() => !delBusy && setAskDel(false)}
          onConfirm={async () => { setDelBusy(true); try { await api(`/api/estudos/subjects/${id}`, { method: "DELETE" }); router.push("/estudos"); } catch (e) { alert(e.message); setDelBusy(false); } }}
        />
      )}

      {extra && <ExtendModal id={id} onClose={() => setExtra(false)} onDone={reload} />}

      <div className="toast-tray">
        {running.filter((j) => hasTree || j.kind !== "build").slice(0, 3).map((j) => <JobCard key={j.id} job={j} label={jobLabel(j)} />)}
        {failed && hasTree && <JobCard job={failed} label="Falhou" />}
      </div>
    </div>
  );
}

function jobLabel(j) {
  if (j.kind === "ingest") return "Lendo material";
  if (j.kind === "roadmap") return "Desenhando a árvore";
  if (j.kind === "build") return "Montando trilha";
  if (j.kind.startsWith("activity:")) return "Gerando atividade";
  return j.kind;
}

// ---------------------------------------------------------------- árvore

function TreeTab({ id, subject, nodes, edges, sel, setSel, today }) {
  const node = nodes.find((n) => n.id === sel);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  return (
    <div style={{ position: "relative" }}>
      <SkillTree nodes={nodes} edges={edges} selected={sel} onSelect={setSel} color={subject.color} />
      {!node && today.picks.length > 0 && (
        <div className="card tree-today" style={{ position: "absolute", top: 52, right: 16, width: 290, padding: 16, background: "var(--float-bg)", backdropFilter: "blur(14px)" }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Sugestão de hoje</div>
          {today.picks.slice(0, 3).map((p) => (
            <button key={p.id} className="act-btn" style={{ marginBottom: 6, padding: "9px 12px" }} onClick={() => setSel(p.id)}>
              <div><div className="t" style={{ fontSize: 13.5 }}>{p.title}</div><div className="d">{p.branch} · ~{p.minutes} min</div></div>
            </button>
          ))}
          {today.dueCards > 0 && <Link href={`/estudos/review?subject=${id}`} className="btn sm" style={{ width: "100%", marginTop: 4 }}><Layers size={15} /> {today.dueCards} cartões para revisar</Link>}
        </div>
      )}
      {node && (
        <aside className="drawer">
          <div className="sheet-grip" />
          <div className="row between">
            <span className="chip" style={{ color: STATUS[node.status].color, borderColor: STATUS[node.status].color + "66" }}>{STATUS[node.status].label}{node.kind !== "skill" ? ` · ${node.kind === "capstone" ? "projeto final" : "chave"}` : ""}</span>
            <button className="btn ghost sm" onClick={() => setSel(null)} aria-label="Fechar"><X size={18} /></button>
          </div>
          <h2>{node.title}</h2>
          <div className="dim" style={{ fontSize: 13, marginBottom: 14 }}>{node.branch} · nível {node.tier + 1} · ~{node.est_minutes} min</div>
          <p className="muted" style={{ marginTop: 0 }}>{node.summary}</p>
          <div className="row" style={{ margin: "18px 0" }}>
            <Ring value={Math.min(1, node.mastery / 0.8)} size={54}>{Math.round(node.mastery * 100)}</Ring>
            <div style={{ fontSize: 13.5 }} className="muted">Domínio estimado<br /><span className="dim">{node.attempts} respostas · {node.questions} questões · {node.cards} cartões</span></div>
          </div>
          <Link href={`/estudos/s/${id}/n/${node.id}`} className="btn primary lg" style={{ width: "100%" }}>{node.status === "locked" ? "Testar meu conhecimento" : node.started ? "Continuar" : "Começar"} <ArrowRight size={18} /></Link>
          {node.status === "locked" && <div className="hint" style={{ marginTop: 8 }}>Bloqueado por pré-requisitos — mas se você já sabe, passe num quiz aqui e a trilha reconhece.</div>}
          {node.objectives.length > 0 && <><div className="eyebrow" style={{ margin: "24px 0 6px" }}>Ao dominar, você consegue</div>{node.objectives.map((o, i) => <div key={i} className="objective">{o}</div>)}</>}
          {node.prereqs.length > 0 && (
            <>
              <div className="eyebrow" style={{ margin: "22px 0 8px" }}>Pré-requisitos</div>
              {node.prereqs.map((p) => { const t = byId.get(p.id); return <button key={p.id} className="act-btn" style={{ padding: "8px 12px", marginBottom: 6 }} onClick={() => setSel(p.id)}><span className="dot" style={{ margin: 0, background: STATUS[t.status].color, boxShadow: "none" }} /><div><div className="t" style={{ fontSize: 13.5 }}>{t.title}</div><div className="d">{p.kind === "hard" ? "obrigatório" : "recomendado"} · {STATUS[t.status].label}</div></div></button>; })}
            </>
          )}
          {node.unlocks.length > 0 && (
            <>
              <div className="eyebrow" style={{ margin: "22px 0 8px" }}>Abre caminho para</div>
              {node.unlocks.map((p) => { const t = byId.get(p.id); return <button key={p.id} className="act-btn" style={{ padding: "8px 12px", marginBottom: 6 }} onClick={() => setSel(p.id)}><span className="dot" style={{ margin: 0, background: STATUS[t.status].color, boxShadow: "none" }} /><div><div className="t" style={{ fontSize: 13.5 }}>{t.title}</div></div></button>; })}
            </>
          )}
        </aside>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- biblioteca

function Library({ id, sources, reload }) {
  const [files, setFiles] = useState([]);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState(null);
  const [open, setOpen] = useState(null);
  const input = useRef();

  async function add(list = files) {
    if (!list.length && !text.trim() && !url.trim()) return;
    setBusy(true);
    const form = new FormData();
    list.forEach((f) => form.append("files", f));
    if (text.trim()) form.append("text", text);
    if (url.trim()) form.append("url", url.trim());
    try {
      await api(`/api/estudos/subjects/${id}/sources`, { form });
      setFiles([]); setText(""); setUrl("");
      reload();
    } catch (e) { alert(e.message); }
    setBusy(false);
  }

  async function doSearch(e) {
    e?.preventDefault();
    if (!q.trim()) return setHits(null);
    setHits(await api(`/api/estudos/subjects/${id}/search?q=${encodeURIComponent(q)}`));
  }

  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 18 }}><div><h2>Biblioteca</h2><div className="muted" style={{ fontSize: 14 }}>Tudo que você anexa é quebrado em trechos, conceitos, métodos e referências — a base de toda a trilha.</div></div></div>
      <div className="grid cols-2" style={{ marginBottom: 28 }}>
        <div className={"drop" + (over ? " over" : "")} onClick={() => input.current.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); add(Array.from(e.dataTransfer.files)); }}>
          <div className="empty-ico"><Paperclip size={24} /></div><div style={{ fontWeight: 600 }}>Adicionar arquivos</div>
          <div className="dim" style={{ fontSize: 13 }}>pdf · texto · imagem · áudio · vídeo</div>
          <input ref={input} type="file" multiple hidden onChange={(e) => add(Array.from(e.target.files))} />
        </div>
        <div className="card stack">
          <input className="input" placeholder="Colar link (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <textarea className="textarea" style={{ minHeight: 64 }} placeholder="Ou cole um texto/anotação" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn" disabled={busy || (!url.trim() && !text.trim())} onClick={() => add([])}>{busy ? "Enviando…" : "Adicionar"}</button>
        </div>
      </div>

      <form onSubmit={doSearch} className="row" style={{ marginBottom: 18 }}>
        <input className="input" placeholder="Buscar em todo o conhecimento (trechos, conceitos, habilidades)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">Buscar</button>
      </form>
      {hits && (
        <div className="card" style={{ marginBottom: 24 }}>
          {hits.nodes.length > 0 && <><div className="eyebrow" style={{ marginBottom: 8 }}>Habilidades</div>{hits.nodes.map((n) => <Link key={n.id} href={`/estudos/s/${id}/n/${n.id}`} className="act-btn"><div><div className="t">{n.title}</div><div className="d">{n.branch}</div></div></Link>)}</>}
          {hits.concepts.length > 0 && <><div className="eyebrow" style={{ margin: "14px 0 8px" }}>Conceitos</div>{hits.concepts.map((c) => <div key={c.id} style={{ marginBottom: 10 }}><strong>{c.title}</strong><div className="muted" style={{ fontSize: 14 }}>{c.definition}</div></div>)}</>}
          {hits.chunks.length > 0 && <><div className="eyebrow" style={{ margin: "14px 0 8px" }}>Trechos</div>{hits.chunks.map((c) => <div key={c.id} style={{ marginBottom: 12 }}><div className="dim" style={{ fontSize: 12.5 }}>{c.source} — {c.locator}</div><div className="snippet muted" style={{ fontSize: 14 }} dangerouslySetInnerHTML={{ __html: esc(c.snippet) }} /></div>)}</>}
          {!hits.nodes.length && !hits.concepts.length && !hits.chunks.length && <div className="muted">Nada encontrado.</div>}
        </div>
      )}

      {sources.length === 0 ? <div className="empty"><DocsIllustration size={96} /><br />Nenhum material ainda. Anexe algo acima — ou peça ao Mentor uma trilha do zero.</div> : (
        <div className="stack">
          {sources.map((s) => <SourceRow key={s.id} s={s} open={open === s.id} toggle={() => setOpen(open === s.id ? null : s.id)} reload={reload} />)}
        </div>
      )}
    </div>
  );
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/«/g, "<mark>").replace(/»/g, "</mark>");
}


function SourceRow({ s, open, toggle, reload }) {
  const [detail, setDetail] = useState(null);
  const [allC, setAllC] = useState(false);
  const [allO, setAllO] = useState(false);
  useEffect(() => { if (open && !detail) api(`/api/estudos/sources/${s.id}`).then(setDetail); }, [open]); // eslint-disable-line
  const busy = ["queued", "extracting", "analyzing"].includes(s.status);
  return (
    <div className="card src-row">
      <div className="row between" style={{ cursor: "pointer" }} onClick={toggle}>
        <div className="row" style={{ minWidth: 0 }}>
          <span className="src-ico">{(() => { const I = SOURCE_ICON[s.kind] || File; return <I size={20} />; })()}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
            <div className="dim" style={{ fontSize: 12.5 }}>{s.pages ? `${s.pages} págs · ` : s.duration_sec ? `${Math.round(s.duration_sec / 60)} min · ` : ""}{s.chunk_count} trechos · {s.concept_count} conceitos · {timeAgo(s.created_at)}</div>
          </div>
        </div>
        {busy ? <span className="chip cyan"><span className="spinner" style={{ width: 11, height: 11 }} /> {s.status === "analyzing" ? "analisando" : "lendo"}</span> : s.status === "error" ? <span className="chip red">erro</span> : <span className="chip green">pronto</span>}
      </div>
      {s.status === "error" && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{s.error} <button className="btn sm" onClick={async () => { await api(`/api/estudos/sources/${s.id}`, { method: "POST" }); reload(); }}>Tentar de novo</button></div>}
      {open && (
        <div style={{ marginTop: 16, animation: "fadeUp .3s var(--ease) both" }}>
          {s.summary && <p className="muted" style={{ marginTop: 0 }}>{s.summary}</p>}
          {s.methodology && <div className="card" style={{ background: "rgba(139,92,246,.07)", marginBottom: 14 }}><div className="eyebrow" style={{ marginBottom: 6 }}>Metodologia capturada</div>{s.methodology}</div>}
          {s.outline?.length > 0 && <><div className="eyebrow" style={{ marginBottom: 8 }}>Estrutura ({s.outline.length} seções)</div>{s.outline.slice(0, allO ? 200 : 5).map((o, i) => <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}><strong>{o.title}</strong> <span className="dim">{o.locator}</span><div className="muted" style={{ fontSize: 13.5 }}>{o.summary}</div></div>)}{s.outline.length > 5 && <button className="btn ghost sm" onClick={() => setAllO(!allO)}>{allO ? "Mostrar menos" : "Ver estrutura completa"}</button>}</>}
          {detail && <><div className="eyebrow" style={{ margin: "18px 0 8px" }}>Conceitos extraídos ({detail.concepts.length})</div><div className="row wrap" style={{ gap: 6 }}>{detail.concepts.slice(0, allC ? 400 : 18).map((c) => <span key={c.id} className="chip" title={c.definition}>{c.title}</span>)}</div>{detail.concepts.length > 18 && <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setAllC(!allC)}>{allC ? "Mostrar menos" : `Mostrar todos (${detail.concepts.length})`}</button>}</>}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn sm" onClick={async () => { await api(`/api/estudos/sources/${s.id}`, { method: "POST" }); reload(); }}><RefreshCw size={14} /> Reprocessar</button>
            <button className="btn sm danger" onClick={async () => { if (confirm("Remover esta fonte e os conceitos extraídos dela?")) { await api(`/api/estudos/sources/${s.id}`, { method: "DELETE" }); reload(); } }}>Remover</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- progresso

function Progress({ id, subject, nodes, summary }) {
  const [gaps] = usePoll(() => api(`/api/estudos/subjects/${id}/gaps`), { ms: 15000 });
  const [mock, setMock] = useState(null);
  const [busy, setBusy] = useState(false);
  const branches = useMemo(() => {
    const m = new Map();
    for (const n of nodes) {
      const b = m.get(n.branch) || { name: n.branch, total: 0, mastered: 0, mastery: 0 };
      b.total++; b.mastered += n.status === "mastered" ? 1 : 0; b.mastery += Math.min(1, n.mastery / 0.8);
      m.set(n.branch, b);
    }
    return [...m.values()];
  }, [nodes]);

  async function startMock(branch) {
    setBusy(true);
    try { setMock(await api(`/api/estudos/subjects/${id}/mock`, { body: { branch, count: 20 } })); } catch (e) { alert(e.message); }
    setBusy(false);
  }

  if (mock) return (
    <div className="page" style={{ maxWidth: 800 }}>
      <div className="row between" style={{ marginBottom: 20 }}><h2 className="row nowrap" style={{ gap: 10 }}><Timer size={22} /> Simulado</h2><button className="btn sm" onClick={() => setMock(null)}>Sair</button></div>
      {mock.questions.length === 0 ? <div className="empty">Ainda não há questões no banco. Gere quizzes nas habilidades primeiro.</div> : <>{mock.needMore > 0 && <div className="card" style={{ marginBottom: 16, padding: "12px 16px", fontSize: 14 }}>O banco tem só {mock.questions.length} questão(ões) neste escopo (pedimos 20). Gere um Quiz em mais habilidades para o simulado ficar completo.</div>}<Quiz questions={mock.questions} minutes={mock.minutes} onMore={() => setMock(null)} /></>}
    </div>
  );

  return (
    <div className="page">
      <div className="stat-row">
        <div className="card stat"><div className="v grad-text">{summary.percent}%</div><div className="l">da trilha dominada</div></div>
        <div className="card stat"><div className="v">{summary.mastered}<span className="dim" style={{ fontSize: 16 }}> / {summary.nodes}</span></div><div className="l">habilidades dominadas</div></div>
        <div className="card stat"><div className="v">{summary.available}</div><div className="l">disponíveis agora</div></div>
        <Link href={`/estudos/review?subject=${id}`} className="card stat hover"><div className="v" style={{ color: summary.due ? "var(--cyan)" : undefined }}>{summary.due}</div><div className="l">cartões vencidos <ArrowRight size={12} style={{ verticalAlign: -1 }} /></div></Link>
      </div>

      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Por ramo</h3>
          {branches.map((b) => (
            <div key={b.name} style={{ marginBottom: 16 }}>
              <div className="row between nowrap" style={{ marginBottom: 6, fontSize: 14, gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{b.name}</span><span className="dim">{b.mastered}/{b.total}</span>
                <button className="btn ghost sm" style={{ padding: "4px 8px" }} disabled={busy} onClick={() => startMock(b.name)} title="Simulado deste ramo" aria-label={`Simulado do ramo ${b.name}`}><Timer size={16} /></button>
              </div>
              <div className="bar"><i style={{ width: `${(b.mastery / b.total) * 100}%` }} /></div>
            </div>
          ))}
          <button className="btn" disabled={busy} onClick={() => startMock(null)}><Timer size={16} /> Simulado geral</button>
        </div>

        <div className="stack">
          <div className="card">
            <h3 style={{ marginBottom: 6 }}>Pontos de atenção</h3>
            <div className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>Detectados a partir das suas respostas — não de opinião.</div>
            {!gaps ? <div className="skeleton" style={{ height: 80 }} /> : (() => {
              const empty = !gaps.weakConcepts.length && !gaps.misconceptions.length && !gaps.overconfident.length && !gaps.stale.length && !gaps.stuck.length;
              if (empty) return <div className="dim">Nada a apontar ainda. Responda quizzes para o Atlas mapear suas lacunas.</div>;
              return (
                <>
                  {gaps.weakConcepts.map((c) => <div key={c.concept_id} className="row between" style={{ padding: "7px 0", borderBottom: "1px solid var(--border)" }}><span>{c.title}</span><span className="chip red">{Math.round((c.recent_score ?? c.avg_score) * 100)}%</span></div>)}
                  {gaps.misconceptions.length > 0 && <div className="eyebrow" style={{ margin: "16px 0 6px" }}>Equívocos recorrentes</div>}
                  {gaps.misconceptions.map((m, i) => <div key={i} style={{ padding: "7px 0", fontSize: 14 }}><span className="chip">{m.times}×</span> {m.misconception} <span className="dim">— {m.node_title}</span></div>)}
                  {gaps.overconfident.length > 0 && <div className="eyebrow" style={{ margin: "16px 0 6px" }}>Certeza, mas errou</div>}
                  {gaps.overconfident.map((o) => <div key={o.concept_id} className="row nowrap" style={{ padding: "5px 0", fontSize: 14, gap: 8 }}><AlertTriangle size={15} style={{ flex: "none", color: "var(--gold)" }} />{o.title} <span className="dim">({o.times}×)</span></div>)}
                  {gaps.stale.length > 0 && <div className="eyebrow" style={{ margin: "16px 0 6px" }}>Hora de revisitar</div>}
                  {gaps.stale.map((s) => <Link key={s.node_id} href={`/estudos/s/${id}/n/${s.node_id}`} className="row nowrap" style={{ padding: "5px 0", fontSize: 14, gap: 8 }}><Clock size={15} style={{ flex: "none", color: "var(--cyan)" }} />{s.title} <span className="dim">({s.days} dias)</span></Link>)}
                  {gaps.stuck.length > 0 && <div className="eyebrow" style={{ margin: "16px 0 6px" }}>Travado</div>}
                  {gaps.stuck.map((s) => <Link key={s.node_id} href={`/estudos/s/${id}/n/${s.node_id}`} className="row nowrap" style={{ padding: "5px 0", fontSize: 14, gap: 8 }}><BrickWall size={15} style={{ flex: "none", color: "var(--red)" }} />{s.title} <span className="dim">({Math.round(s.mastery * 100)}% após {s.attempts} respostas)</span></Link>)}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- chat

const SUGGEST = ["Faça um quiz difícil sobre o que estou estudando", "Onde estão minhas maiores lacunas?", "Adicione à trilha um ramo sobre aplicações práticas", "Resuma o método do material anexado"];

function Chat({ id, subject, reload }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState([]);
  const end = useRef();
  useEffect(() => { api(`/api/estudos/subjects/${id}/chat`).then((d) => setMsgs(d.messages)); }, [id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(m = text) {
    if (!m.trim() || busy) return;
    setText("");
    setMsgs((x) => [...x, { role: "user", content: m, id: Math.random() }]);
    setBusy(true);
    try {
      const r = await api(`/api/estudos/subjects/${id}/chat`, { body: { message: m } });
      setMsgs((x) => [...x, { role: "assistant", content: r.reply, id: Math.random() }]);
      setJobs((j) => [...j, ...r.jobs]);
      reload();
    } catch (e) {
      setMsgs((x) => [...x, { role: "assistant", content: "**Erro:** " + e.message, id: Math.random() }]);
    }
    setBusy(false);
  }

  return (
    <div className="chat-wrap">
      <div className="chat-log">
        {msgs.length === 0 && (
          <div className="empty">
            <div className="empty-ico big"><MessagesSquare size={28} /></div>
            <h2 style={{ marginBottom: 6 }}>Seu mentor de {subject.title}</h2>
            <p className="muted">Pergunte sobre o material, peça quizzes, ou mande expandir a trilha ("quero mais 10 horas sobre X").</p>
            <div className="seg" style={{ justifyContent: "center", marginTop: 18 }}>{SUGGEST.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m) => <div key={m.id} className={"msg " + m.role}>{m.role === "user" ? m.content : <Md>{m.content}</Md>}</div>)}
        {jobs.map((j) => <JobWatch key={j.id} j={j} id={id} />)}
        {busy && <div className="msg assistant"><span className="spinner" /> <span className="dim">pensando…</span></div>}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="input" placeholder="Pergunte, peça um quiz ou uma nova trilha…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn primary" disabled={busy || !text.trim()}>Enviar</button>
      </form>
    </div>
  );
}

function JobWatch({ j, id }) {
  const job = useJob(j.id);
  if (!job) return null;
  return (
    <div style={{ marginBottom: 12, maxWidth: 420 }}>
      <JobCard job={job} label={j.kind} />
      {job.status === "done" && j.node_id && <Link href={`/estudos/s/${id}/n/${j.node_id}`} className="btn sm" style={{ marginTop: 8 }}>Abrir <ArrowRight size={14} /></Link>}
    </div>
  );
}

// ---------------------------------------------------------------- expandir

function ExtendModal({ id, onClose, onDone }) {
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "var(--overlay)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 20 }} onClick={onClose}>
      <div className="card" style={{ width: 520, maxWidth: "100%", background: "var(--bg-2)" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 6 }}>Expandir a trilha</h2>
        <p className="muted" style={{ marginTop: 0 }}>Descreva o que acrescentar. Os novos nós se conectam aos que já existem.</p>
        <textarea className="textarea" autoFocus placeholder="Ex.: um ramo sobre séries temporais, ~8 horas, nível intermediário" value={p} onChange={(e) => setP(e.target.value)} />
        <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!p.trim() || busy} onClick={async () => { setBusy(true); await api(`/api/estudos/subjects/${id}/roadmap`, { body: { extend: true, prompt: p } }); onDone(); onClose(); }}>Expandir</button>
        </div>
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>Trilha desalinhada com o material? Reconstrua do zero com o motor atual (a ordem do material define a graduação).</div>
          <button className="btn danger sm" disabled={busy} onClick={async () => { if (!confirm("Reconstruir apaga a árvore atual, atividades geradas e o progresso desta área. Continuar?")) return; setBusy(true); await api(`/api/estudos/subjects/${id}/roadmap`, { body: { rebuild: true, prompt: p } }); onDone(); onClose(); }}><RefreshCw size={14} /> Reconstruir a trilha inteira</button>
        </div>
      </div>
    </div>
  );
}
