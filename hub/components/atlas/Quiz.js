"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, Diff, Md, Ring } from "./ui.js";
import { Target, Timer, CheckCircle2, CircleDashed, CircleX, ArrowRight } from "./icons.js";

const LETTERS = "ABCDEF";
const BLOOM = { remember: "Lembrar", understand: "Compreender", apply: "Aplicar", analyze: "Analisar", evaluate: "Avaliar", create: "Criar" };

export default function Quiz({ questions, title = "Quiz", minutes = null, onFinish, onMore, sources }) {
  const [i, setI] = useState(0);
  const [sel, setSel] = useState(null);
  const [text, setText] = useState("");
  const [conf, setConf] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(minutes ? minutes * 60 : null);
  const t0 = useRef(Date.now());
  const q = questions[i];

  useEffect(() => {
    if (left == null || done) return;
    if (left <= 0) return void finish(results);
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, done]); // eslint-disable-line

  useEffect(() => {
    t0.current = Date.now();
    setSel(q?.type === "multi" ? [] : null);
    setText("");
    setConf(null);
    setRes(null);
  }, [i, q?.id]);

  const answer = useMemo(() => (q?.type === "short" || q?.type === "cloze" ? text.trim() : q?.type === "multi" ? sel : sel), [q, text, sel]);
  const canSubmit = q && !res && (q.type === "multi" ? sel?.length > 0 : q.type === "short" || q.type === "cloze" ? text.trim().length > 0 : sel !== null);

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const r = await api(`/api/estudos/questions/${q.id}/answer`, { body: { answer, confidence: conf, timeMs: Date.now() - t0.current } });
      setRes(r);
      setResults((x) => [...x, { q, r, answer }]);
    } catch (e) {
      alert(e.message);
    }
    setBusy(false);
  }

  function next() {
    if (i + 1 >= questions.length) return finish(results);
    setI(i + 1);
  }

  function finish(rs) {
    setDone(true);
    onFinish?.(rs);
  }

  useEffect(() => {
    const h = (e) => {
      if (done || e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.key === "Enter") return void (res ? next() : submit());
      const n = "abcdef".indexOf(e.key.toLowerCase());
      if (!res && n >= 0 && q?.options?.[n]) pick(n);
      if (!res && q?.type === "tf") {
        if (e.key === "v" || e.key === "t") setSel(true);
        if (e.key === "f") setSel(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  function pick(n) {
    if (res) return;
    if (q.type === "multi") setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
    else setSel(n);
  }

  if (!questions.length) return <div className="empty">Nenhuma questão disponível.</div>;

  if (done) {
    const total = results.length || 1;
    const score = results.reduce((a, r) => a + r.r.score, 0) / total;
    const byDiff = [1, 2, 3, 4, 5].map((d) => {
      const rs = results.filter((r) => r.q.difficulty === d);
      return { d, n: rs.length, s: rs.length ? rs.reduce((a, r) => a + r.r.score, 0) / rs.length : null };
    }).filter((x) => x.n);
    const wrong = results.filter((r) => r.r.score < 1);
    return (
      <div style={{ animation: "fadeUp .5s var(--ease) both" }}>
        <div style={{ textAlign: "center", padding: "10px 0 26px" }}>
          <div className="result-ring"><Ring value={score} size={150} stroke={10}><span style={{ fontSize: 34 }}>{Math.round(score * 100)}%</span></Ring></div>
          <h2 style={{ marginTop: 18 }}>{score >= 0.85 ? "Domínio sólido." : score >= 0.65 ? "Bom caminho — com lacunas a fechar." : "Ainda não está lá — e agora você sabe onde."}</h2>
          <p className="muted">{results.filter((r) => r.r.score >= 0.99).length} de {total} totalmente corretas</p>
        </div>
        {byDiff.length > 1 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Por dificuldade</div>
            {byDiff.map((x) => (
              <div key={x.d} className="row" style={{ marginBottom: 8 }}>
                <span style={{ width: 70 }}><Diff n={x.d} /></span>
                <div className="bar" style={{ flex: 1 }}><i style={{ width: `${x.s * 100}%`, background: x.s >= 0.7 ? "var(--grad)" : "linear-gradient(90deg,#fb7185,#f59e0b)" }} /></div>
                <span className="dim" style={{ width: 60, textAlign: "right", fontSize: 13 }}>{Math.round(x.s * 100)}% · {x.n}</span>
              </div>
            ))}
          </div>
        )}
        {wrong.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Para revisar</div>
            {wrong.map((r, k) => (
              <details key={k} style={{ marginBottom: 10 }}>
                <summary style={{ cursor: "pointer", fontWeight: 550 }}>{r.q.prompt.slice(0, 110)}{r.q.prompt.length > 110 ? "…" : ""}</summary>
                <div style={{ padding: "10px 0 4px" }}>
                  {r.r.misconception && <div className="chip red" style={{ marginBottom: 8 }}>Equívoco: {r.r.misconception}</div>}
                  <Md sources={sources}>{r.r.explanation}</Md>
                </div>
              </details>
            ))}
          </div>
        )}
        <div className="row" style={{ justifyContent: "center" }}>
          {onMore && <button className="btn primary" onClick={onMore}><Target size={16} /> Gerar novo quiz (mais difícil)</button>}
        </div>
      </div>
    );
  }

  const isRight = (n) => res && (Array.isArray(res.correct) ? res.correct.includes(n) : false);
  const mm = left != null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : null;

  return (
    <div key={q.id}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="row"><span className="chip violet">{i + 1} / {questions.length}</span><Diff n={q.difficulty} />{q.bloom && <span className="chip">{BLOOM[q.bloom] || q.bloom}</span>}</div>
        {mm && <span className="chip" style={{ color: left < 60 ? "var(--red)" : undefined }}><Timer size={13} style={{ verticalAlign: -2 }} /> {mm}</span>}
      </div>
      <div className="progress" style={{ marginBottom: 6 }}><i style={{ width: `${(i / questions.length) * 100}%` }} /></div>
      <div className="quiz-q"><Md>{q.prompt}</Md></div>

      {(q.type === "mcq" || q.type === "multi") && (
        <>
          {q.type === "multi" && <div className="hint" style={{ marginBottom: 10 }}>Selecione todas as corretas.</div>}
          {q.options.map((o, n) => {
            const chosen = q.type === "multi" ? sel?.includes(n) : sel === n;
            const cls = res ? (isRight(n) ? " right" : chosen ? " wrong" : "") : chosen ? " sel" : "";
            return (
              <button key={n} className={"opt" + cls} disabled={!!res} onClick={() => pick(n)}>
                <span className="k">{LETTERS[n]}</span><span><Md>{o.text}</Md></span>
              </button>
            );
          })}
        </>
      )}
      {q.type === "tf" && (
        <div className="row">
          {[true, false].map((v) => {
            const chosen = sel === v;
            const cls = res ? (res.correct === v ? " right" : chosen ? " wrong" : "") : chosen ? " sel" : "";
            return <button key={String(v)} className={"opt" + cls} style={{ flex: 1, justifyContent: "center" }} disabled={!!res} onClick={() => setSel(v)}>{v ? "Verdadeiro" : "Falso"}</button>;
          })}
        </div>
      )}
      {(q.type === "short" || q.type === "cloze") && (
        q.type === "cloze" ? (
          <input className="input" autoFocus placeholder="Sua resposta" value={text} disabled={!!res} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        ) : (
          <textarea className="textarea" style={{ minHeight: 150 }} autoFocus placeholder="Escreva sua resposta com suas palavras…" value={text} disabled={!!res} onChange={(e) => setText(e.target.value)} />
        )
      )}

      {!res && (
        <>
          <div className="conf">
            Confiança:
            {[["1", "Chute"], ["2", "Acho que sim"], ["3", "Certeza"]].map(([v, l]) => <button key={v} className={conf === Number(v) ? "on" : ""} onClick={() => setConf(Number(v))}>{l}</button>)}
          </div>
          <button className="btn primary lg" disabled={!canSubmit || busy} onClick={submit}>{busy ? <><span className="spinner" /> Corrigindo…</> : "Confirmar"}</button>
        </>
      )}

      {res && (
        <div className={"feedback " + (res.score >= 0.99 ? "good" : res.score >= 0.5 ? "mid" : "bad")}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <strong className="row nowrap" style={{ gap: 8 }}>{res.score >= 0.99 ? <><CheckCircle2 size={18} color="var(--green)" /> Correto</> : res.score >= 0.5 ? <><CircleDashed size={18} color="var(--gold)" /> Parcial ({Math.round(res.score * 100)}%)</> : <><CircleX size={18} color="var(--red)" /> Incorreto</>}</strong>
            {conf === 3 && res.score < 0.5 && <span className="chip red">Certeza, mas errou — ponto de atenção</span>}
          </div>
          {res.feedback && <p style={{ margin: "0 0 10px" }}>{res.feedback}</p>}
          {res.misconception && <div className="chip red" style={{ marginBottom: 10 }}>Equívoco: {res.misconception}</div>}
          {(q.type === "short" || q.type === "cloze") && res.correct && <div className="muted" style={{ marginBottom: 10, fontSize: 14 }}><strong>Gabarito:</strong> {Array.isArray(res.correct) ? res.correct[0] : String(res.correct)}</div>}
          <Md sources={sources}>{res.explanation}</Md>
          <button className="btn primary" style={{ marginTop: 10 }} onClick={next}>{i + 1 >= questions.length ? "Ver resultado" : <>Próxima <ArrowRight size={16} /></>} <span className="kbd">Enter</span></button>
        </div>
      )}
    </div>
  );
}
