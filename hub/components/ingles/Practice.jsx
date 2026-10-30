"use client";

import { useEffect, useRef, useState } from "react";
import { PenLine, Ear, ArrowRightLeft, ListOrdered, Volume2, Check, X, RotateCcw, Zap, ChevronRight } from "lucide-react";
import { gradeBlank, gradeTyped } from "@/lib/ingles/grade";
import { api, post, audioUrl } from "./util";

const TYPES = [
  { id: "cloze", label: "Lacunas", desc: "Complete as palavras que faltam na frase", icon: PenLine },
  { id: "dictation", label: "Ditado", desc: "Ouça a frase e escreva exatamente o que ouviu", icon: Ear },
  { id: "translate", label: "Tradução", desc: "Escolha a tradução certa", icon: ArrowRightLeft },
  { id: "order", label: "Ordenar", desc: "Monte a frase na ordem correta", icon: ListOrdered },
];

export default function Practice({ lesson, types, state, onProgress }) {
  const [phase, setPhase] = useState("menu");
  const [type, setType] = useState(null);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);
  const stopAt = useRef(null);

  async function start(t) {
    setLoading(true);
    setErr("");
    try {
      const j = await api(`/api/ingles/practice?lesson=${encodeURIComponent(lesson.id)}&type=${t}&n=8`);
      if (!j.items.length) throw new Error("Não há itens suficientes para este exercício nesta lição.");
      setType(t); setItems(j.items); setMeta(j); setIdx(0); setResults([]); setPhase("run");
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }

  async function finishItem(item, score, ms) {
    setResults((r) => [...r, { id: item.id, score, diff: item.difficulty }]);
    try { await post("/api/ingles/progress", { op: "attempt", lesson: lesson.id, type: item.type, key: item.id, score, difficulty: item.difficulty, ms }); } catch {}
  }

  function next() {
    if (idx + 1 >= items.length) { setPhase("done"); onProgress?.(); }
    else setIdx(idx + 1);
  }

  function playSeg(seg, rate = 1) {
    const a = audioRef.current;
    if (!a || !seg) return;
    a.playbackRate = rate;
    a.currentTime = seg[0];
    stopAt.current = seg[1];
    a.play().catch(() => {});
  }
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const h = () => { if (stopAt.current != null && a.currentTime >= stopAt.current) { a.pause(); stopAt.current = null; } };
    a.addEventListener("timeupdate", h);
    return () => a.removeEventListener("timeupdate", h);
  }, [phase]);

  if (phase === "menu")
    return (
      <div className="ing-practice">
        <div className="ing-panel-h">
          <h2>Praticar esta lição</h2>
          <p>Nível atual na lição: <b>{state.level.name}</b> · domínio {Math.round(state.mastery * 100)}% · {state.distinct} itens distintos. Os itens que você mais errou aparecem primeiro, e a dificuldade acompanha o seu nível.</p>
        </div>
        <div className="ing-types">
          {TYPES.map((t) => (
            <button key={t.id} type="button" className="ing-type" disabled={!types[t.id] || loading} onClick={() => start(t.id)}>
              <t.icon size={22} />
              <b>{t.label}</b>
              <span>{types[t.id] ? t.desc : t.id === "dictation" ? "Precisa do áudio sincronizado nesta lição" : "Poucos itens nesta lição"}</span>
            </button>
          ))}
        </div>
        {err && <p className="ing-err">{err}</p>}
        <p className="ing-hint">Aprovação: domínio de 65% em pelo menos 3 itens distintos libera a próxima parte. Domínio completo: 80% em 5 itens, incluindo um difícil.</p>
      </div>
    );

  if (phase === "done") {
    const avg = results.length ? results.reduce((a, r) => a + r.score, 0) / results.length : 0;
    const xp = results.reduce((a, r) => a + Math.round(r.score * 10 * r.diff), 0);
    return (
      <div className="ing-practice">
        <div className="ing-done">
          <div className="ing-big">{Math.round(avg * 100)}%</div>
          <p>{results.filter((r) => r.score >= 0.7).length} de {results.length} itens bons · <b>+{xp} XP</b></p>
          <p className="ing-hint">{avg >= 0.8 ? "Ótimo ritmo. Continue nas partes seguintes ou refaça com itens novos." : "Os itens que você errou voltam primeiro na próxima rodada."}</p>
          <div className="ing-row">
            <button type="button" className="ing-btn primary" onClick={() => start(type)}>Nova rodada</button>
            <button type="button" className="ing-btn" onClick={() => setPhase("menu")}>Outro exercício</button>
          </div>
        </div>
      </div>
    );
  }

  const item = items[idx];
  const audio = meta?.track && (
    <audio ref={audioRef} src={audioUrl(meta.track.file)} preload="auto" />
  );
  return (
    <div className="ing-practice">
      <div className="ing-prog"><i style={{ width: `${(idx / items.length) * 100}%` }} /></div>
      <div className="ing-run-h"><span>{TYPES.find((t) => t.id === type).label} · {idx + 1}/{items.length}</span><span className="ing-lvl"><Zap size={13} /> {meta.level.name}</span></div>
      {audio}
      {type === "cloze" && <Cloze key={item.id} item={item} onDone={finishItem} onNext={next} playSeg={playSeg} />}
      {type === "dictation" && <Dictation key={item.id} item={item} onDone={finishItem} onNext={next} playSeg={playSeg} />}
      {type === "translate" && <Translate key={item.id} item={item} onDone={finishItem} onNext={next} playSeg={playSeg} />}
      {type === "order" && <Order key={item.id} item={item} onDone={finishItem} onNext={next} />}
    </div>
  );
}

function useClock() {
  const t0 = useRef(Date.now());
  return () => Date.now() - t0.current;
}

function Cloze({ item, onDone, onNext, playSeg }) {
  const blanks = item.parts.filter((p) => p.blank !== undefined);
  const [vals, setVals] = useState(blanks.map(() => ""));
  const [checked, setChecked] = useState(false);
  const clock = useClock();
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); }, []);
  const scores = blanks.map((b, i) => gradeBlank(b.answer, vals[i]));
  function check() {
    if (checked) return onNext();
    setChecked(true);
    onDone(item, scores.reduce((a, s) => a + s, 0) / scores.length, clock());
  }
  return (
    <div className="ing-q">
      <div className="ing-q-line">
        {item.parts.map((p, k) => {
          if (p.blank === undefined) return <span key={k}>{p.text}</span>;
          const i = p.blank;
          return (
            <span key={k} className={`ing-blank${checked ? (scores[i] >= 0.7 ? " ok" : " bad") : ""}`}>
              <input
                ref={i === 0 ? first : undefined}
                value={vals[i]}
                disabled={checked}
                placeholder={p.hint}
                size={Math.max(4, p.answer.length + 1)}
                onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={(e) => e.key === "Enter" && check()}
                autoCapitalize="off" autoCorrect="off" spellCheck={false}
              />
              {checked && scores[i] < 1 && <em>{p.answer}</em>}
            </span>
          );
        })}
      </div>
      {item.seg && <button type="button" className="ing-btn ghost" onClick={() => playSeg(item.seg)}><Volume2 size={15} /> Ouvir a frase</button>}
      {checked && item.pt && <p className="ing-q-pt">{item.pt}</p>}
      <div className="ing-row"><button type="button" className="ing-btn primary" onClick={check}>{checked ? "Continuar" : "Verificar"} {checked ? <ChevronRight size={15} /> : <Check size={15} />}</button></div>
    </div>
  );
}

function Dictation({ item, onDone, onNext, playSeg }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState(null);
  const clock = useClock();
  const ta = useRef(null);
  useEffect(() => { playSeg(item.seg); ta.current?.focus(); }, []);
  function check() {
    if (res) return onNext();
    const g = gradeTyped(item.expected, text);
    setRes(g);
    onDone(item, g.score, clock());
  }
  return (
    <div className="ing-q">
      <div className="ing-row">
        <button type="button" className="ing-btn" onClick={() => playSeg(item.seg)}><Volume2 size={15} /> Ouvir</button>
        <button type="button" className="ing-btn ghost" onClick={() => playSeg(item.seg, 0.7)}>Devagar</button>
      </div>
      {!res ? (
        <textarea
          ref={ta} rows={3} value={text} placeholder="Escreva o que você ouviu"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); check(); } }}
          autoCapitalize="off" autoCorrect="off" spellCheck={false}
        />
      ) : (
        <div className="ing-marks">
          {res.marks.map((m, i) => <span key={i} className={m.ok ? "ok" : "bad"}>{m.w} </span>)}
          <p className="ing-q-pt">Você escreveu: {text || "(nada)"} · {Math.round(res.score * 100)}%</p>
        </div>
      )}
      <div className="ing-row"><button type="button" className="ing-btn primary" onClick={check}>{res ? "Continuar" : "Verificar"}</button></div>
    </div>
  );
}

function Translate({ item, onDone, onNext, playSeg }) {
  const [pick, setPick] = useState(null);
  const clock = useClock();
  function choose(i) {
    if (pick !== null) return;
    setPick(i);
    onDone(item, i === item.answer ? 1 : 0, clock());
  }
  return (
    <div className="ing-q">
      <div className="ing-q-line big">{item.prompt}</div>
      {item.seg && <button type="button" className="ing-btn ghost" onClick={() => playSeg(item.seg)}><Volume2 size={15} /> Ouvir</button>}
      <div className="ing-opts">
        {item.options.map((o, i) => (
          <button key={i} type="button" className={`ing-opt${pick !== null ? (i === item.answer ? " ok" : i === pick ? " bad" : "") : ""}`} onClick={() => choose(i)}>{o}</button>
        ))}
      </div>
      {pick !== null && <div className="ing-row"><button type="button" className="ing-btn primary" onClick={onNext}>Continuar <ChevronRight size={15} /></button></div>}
    </div>
  );
}

function Order({ item, onDone, onNext }) {
  const [pool, setPool] = useState(item.words.map((w, i) => ({ w, i })));
  const [chosen, setChosen] = useState([]);
  const [res, setRes] = useState(null);
  const clock = useClock();
  const norm = (s) => s.replace(/[^\p{L}\p{N}']/gu, "").toLowerCase();
  function check() {
    if (res) return onNext();
    const exp = item.expected.split(/\s+/);
    const hits = chosen.filter((c, k) => norm(c.w) === norm(exp[k] || "")).length;
    const score = hits / exp.length;
    setRes({ score });
    onDone(item, score, clock());
  }
  return (
    <div className="ing-q">
      <div className="ing-order-box">
        {chosen.map((c) => <button key={c.i} type="button" className={`ing-w${res ? (norm(c.w) === norm(item.expected.split(/\s+/)[chosen.indexOf(c)] || "") ? " ok" : " bad") : ""}`} disabled={!!res} onClick={() => { setChosen(chosen.filter((x) => x !== c)); setPool([...pool, c]); }}>{c.w}</button>)}
        {!chosen.length && <span className="ing-hint">Toque nas palavras abaixo na ordem certa</span>}
      </div>
      <div className="ing-order-pool">
        {pool.map((c) => <button key={c.i} type="button" className="ing-w" onClick={() => { setPool(pool.filter((x) => x !== c)); setChosen([...chosen, c]); }}>{c.w}</button>)}
      </div>
      {res && <p className="ing-q-pt">{item.expected}{item.pt ? ` — ${item.pt}` : ""}</p>}
      <div className="ing-row">
        {!res && <button type="button" className="ing-btn ghost" onClick={() => { setPool(item.words.map((w, i) => ({ w, i }))); setChosen([]); }}><RotateCcw size={14} /> Limpar</button>}
        <button type="button" className="ing-btn primary" disabled={!res && pool.length > 0} onClick={check}>{res ? "Continuar" : "Verificar"}</button>
      </div>
    </div>
  );
}
