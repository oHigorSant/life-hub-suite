"use client";
import Link from "next/link";
import { useState } from "react";
import { Topbar, Ring, ConfirmDialog, api, usePoll } from "@/components/atlas/ui.js";
import { Trash2, ArrowRight, Plus, TreeIllustration } from "@/components/atlas/icons.js";

const USER_NAME = process.env.NEXT_PUBLIC_LIFEHUB_USER || "";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Boa madrugada" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default function Home() {
  const [data, reload] = usePoll(() => api("/api/estudos/subjects"), { ms: 6000 });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const subjects = data?.subjects;
  const due = subjects?.reduce((a, s) => a + s.summary.due, 0) || 0;
  const mastered = subjects?.reduce((a, s) => a + s.summary.mastered, 0) || 0;
  const nodes = subjects?.reduce((a, s) => a + s.summary.nodes, 0) || 0;
  const picks = (subjects || []).flatMap((s) => s.today.picks.slice(0, 2).map((p) => ({ ...p, subject: s })));

  return (
    <div className="shell">
      <Topbar />
      <main className="page">
        <section className="hero">
          <div className="eyebrow">{greeting}{USER_NAME ? `, ${USER_NAME}` : ""}</div>
          <h1>O que você vai <span className="grad-text">dominar</span> hoje?</h1>
          <p className="muted" style={{ maxWidth: 620, fontSize: 16.5 }}>
            Suas áreas viram árvores de habilidades: avance pelos ramos que quiser, no ritmo que quiser — o Atlas mede o que você realmente sabe.
          </p>
        </section>

        {subjects && subjects.length > 0 && (
          <div className="stat-row">
            <div className="card stat"><div className="v">{subjects.length}</div><div className="l">áreas de conhecimento</div></div>
            <div className="card stat"><div className="v">{mastered}<span className="dim" style={{ fontSize: 16 }}> / {nodes}</span></div><div className="l">habilidades dominadas</div></div>
            <Link href="/estudos/review" className="card stat hover"><div className="v" style={{ color: due ? "var(--cyan)" : undefined }}>{due}</div><div className="l">cartões para revisar agora <ArrowRight size={12} style={{ verticalAlign: -1 }} /></div></Link>
          </div>
        )}

        {picks.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <div className="row between" style={{ marginBottom: 14 }}><h2>Para hoje</h2></div>
            <div className="grid cols-3">
              {picks.slice(0, 6).map((p) => (
                <Link key={p.id} href={`/estudos/s/${p.subject.id}/n/${p.id}`} className="card hover">
                  <div className="row between" style={{ marginBottom: 10 }}>
                    <span className="chip" style={{ color: p.subject.color, borderColor: p.subject.color + "66" }}>{p.subject.title}</span>
                    <span className="dim" style={{ fontSize: 12.5 }}>~{p.minutes} min</span>
                  </div>
                  <h3>{p.title}</h3>
                  <div className="dim" style={{ fontSize: 13, marginTop: 6 }}>{p.branch} · {p.status === "in_progress" ? "continuar" : "começar"}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="row between" style={{ marginBottom: 14 }}><h2>Suas áreas</h2></div>
        {!subjects ? (
          <div className="grid cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 190 }} />)}</div>
        ) : (
          <div className="grid cols-3">
            {subjects.map((s) => (
              <Link key={s.id} href={`/estudos/s/${s.id}`} className="card hover subject-card" style={{ "--c": s.color }}>
                <div className="ring-wrap"><Ring value={s.summary.percent / 100} size={58}>{s.summary.percent}%</Ring></div>
                <div>
                  <div className="eyebrow" style={{ color: s.color }}>{s.target_level || "do zero ao ápice"}</div>
                  <h2 style={{ margin: "8px 70px 8px 0" }}>{s.title}</h2>
                  <div className="muted" style={{ fontSize: 14, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{s.goal}</div>
                </div>
                <button className="del-btn" aria-label={`Excluir ${s.title}`} title="Excluir área" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setErr(""); setDel(s); }}><Trash2 size={16} /></button>
                <div className="row wrap" style={{ marginTop: 16, paddingRight: 44 }}>
                  <span className="chip">{s.summary.nodes} habilidades</span>
                  <span className="chip green">{s.summary.mastered} dominadas</span>
                  {s.summary.due > 0 && <span className="chip cyan">{s.summary.due} p/ revisar</span>}
                </div>
              </Link>
            ))}
            <Link href="/estudos/new" className="card hover new-card">
              <div><div className="plus">+</div><h3>Nova trilha</h3><div className="dim" style={{ fontSize: 13.5, marginTop: 4 }}>Anexe materiais ou apenas descreva o que quer aprender</div></div>
            </Link>
          </div>
        )}
      </main>
      {del && (
        <ConfirmDialog
          title={`Excluir "${del.title}"?`}
          body={<>Isso apaga a trilha ({del.summary.nodes} habilidades), os materiais enviados, questões, cartões e todo o seu progresso nesta área. <strong>Não dá para desfazer.</strong>{err && <div style={{ color: "var(--red)", marginTop: 10 }}>{err}</div>}</>}
          busy={busy}
          onCancel={() => !busy && setDel(null)}
          onConfirm={async () => {
            setBusy(true);
            try { await api(`/api/estudos/subjects/${del.id}`, { method: "DELETE" }); setDel(null); await reload(); } catch (e) { setErr(e.message); }
            setBusy(false);
          }}
        />
      )}
    </div>
  );
}
