"use client";
import { useEffect, useState } from "react";
import { api } from "./ui.js";
import { PartyPopper, CheckCircle2 } from "./icons.js";

const GRADES = [[0, "Errei", "10 min"], [1, "Difícil", "curto"], [2, "Bom", "normal"], [3, "Fácil", "longo"]];

/** Sessão de revisão espaçada. `query` filtra (subject/node). */
export default function Flash({ query = "", onEmpty }) {
  const [deck, setDeck] = useState(null);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [stats, setStats] = useState({ n: 0, ok: 0 });

  const load = async () => {
    const d = await api(`/api/estudos/review${query}`);
    setDeck(d);
    setI(0);
    setFlip(false);
  };
  useEffect(() => { load(); }, [query]); // eslint-disable-line

  const card = deck?.cards[i];

  async function grade(g) {
    if (!card) return;
    api(`/api/estudos/cards/${card.id}/review`, { body: { grade: g } }).catch(() => {});
    setStats((s) => ({ n: s.n + 1, ok: s.ok + (g > 0 ? 1 : 0) }));
    setFlip(false);
    setTimeout(() => setI((x) => x + 1), 120);
  }

  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); setFlip((f) => !f); }
      if (flip && "1234".includes(e.key)) grade(Number(e.key) - 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (!deck) return <div className="skeleton" style={{ height: 340 }} />;
  if (!card) {
    return (
      <div className="empty" style={{ animation: "fadeUp .4s var(--ease) both" }}>
        <div className="empty-ico big">{stats.n ? <PartyPopper size={28} /> : <CheckCircle2 size={28} />}</div>
        <h2 style={{ margin: "10px 0 6px" }}>{stats.n ? "Sessão concluída" : "Nada para revisar agora"}</h2>
        <p className="muted">{stats.n ? `${stats.ok}/${stats.n} lembrados. Os cartões voltam no momento ideal.` : "Quando houver cartões vencidos, eles aparecem aqui."}</p>
        {deck.total > deck.cards.length && <button className="btn primary" onClick={load}>Mais cartões ({deck.total - deck.cards.length})</button>}
      </div>
    );
  }

  return (
    <div>
      <div className="row between"><span className="chip violet">{i + 1} / {deck.cards.length}</span><span className="dim" style={{ fontSize: 13 }}>{card.subject}{card.node ? ` · ${card.node}` : ""}</span></div>
      <div className="progress" style={{ margin: "10px 0" }}><i style={{ width: `${(i / deck.cards.length) * 100}%` }} /></div>
      <div className={"flip" + (flip ? " on" : "")} onClick={() => setFlip(!flip)}>
        <div className="flip-in">
          <div className="face">{card.front}</div>
          <div className="face back">{card.back}</div>
        </div>
      </div>
      {!flip ? (
        <button className="btn lg" style={{ width: "100%" }} onClick={() => setFlip(true)}>Mostrar resposta <span className="kbd">espaço</span></button>
      ) : (
        <div className="grades">
          {GRADES.map(([g, l, s]) => <button key={g} className={"btn" + (g === 0 ? " danger" : "")} onClick={() => grade(g)}>{l}<small>{s} · {g + 1}</small></button>)}
        </div>
      )}
    </div>
  );
}
