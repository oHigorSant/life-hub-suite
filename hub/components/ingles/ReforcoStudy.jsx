"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Wand2, Play, Square, ChevronLeft, Plus, Check, ChevronRight, Layers, BookOpen, Volume2, Languages, RefreshCw } from "lucide-react";
import { gradeBlank, gradeTyped } from "@/lib/ingles/grade";
import { api, post } from "./util";

const audioSrc = (f) => `/api/ingles/reforco/audio?f=${encodeURIComponent(f)}`;

function Hl({ text, hit }) {
  const i = hit ? text.toLowerCase().indexOf(hit.toLowerCase()) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + hit.length)}</mark>{text.slice(i + hit.length)}</>;
}

/** intercala os exercícios dos temas (um de cada vez) e insere cartões das palavras marcadas a cada 3 itens */
function buildSession(plan, words, themeId) {
  const themes = themeId ? plan.themes.filter((t) => t.id === themeId) : plan.themes;
  const steps = themes.map((t) => ({ type: "lesson", theme: t }));
  const queues = themes.map((t) => t.exercises.map((x) => ({ type: "ex", theme: t, x })));
  const mixed = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) mixed.push(q.shift());
  const marked = new Set(themes.flatMap((t) => t.items.map((i) => i.toLowerCase())));
  const cards = words.filter((w) => marked.has(w.word.toLowerCase()) || (!themeId && (plan.basedOn || []).includes(w.id))).slice(0, themeId ? 6 : 10).map((w) => ({ type: "card", w }));
  mixed.forEach((m, i) => { steps.push(m); if (i % 3 === 2 && cards.length) steps.push(cards.shift()); });
  steps.push(...cards);
  if (!themeId && plan.text) steps.push({ type: "text" });
  return steps;
}

export default function ReforcoStudy({ words, reload, onOpenLesson, onProgress }) {
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState("");
  const [view, setView] = useState({ name: "home" }); // home | theme | text | session
  const audioRef = useRef(null);
  const stopAt = useRef(null);
  const [playing, setPlaying] = useState(null);

  async function load() {
    try { setPlan(await api("/api/ingles/reforco")); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (plan?.status !== "building") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [plan?.status]);

  async function build() {
    setErr("");
    try { setPlan(await post("/api/ingles/reforco", { op: "build" })); } catch (e) { setErr(e.message); }
  }

  function playSeg(seg, key) {
    const a = audioRef.current;
    if (!a || !seg) return;
    if (playing === key) { a.pause(); setPlaying(null); return; }
    a.currentTime = seg[0];
    stopAt.current = seg[1] + 0.1;
    setPlaying(key);
    a.play().catch(() => {});
  }
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const h = () => { if (stopAt.current != null && a.currentTime >= stopAt.current) { a.pause(); stopAt.current = null; setPlaying(null); } };
    a.addEventListener("timeupdate", h);
    return () => a.removeEventListener("timeupdate", h);
  }, [plan?.audio?.file]);

  if (!plan) return <p className="ing-hint">Carregando…</p>;
  const audio = plan.audio?.file && <audio ref={audioRef} src={audioSrc(plan.audio.file)} preload="auto" onPause={() => setPlaying(null)} />;
  const building = plan.status === "building";

  if (view.name === "session") return (
    <>{audio}<Session steps={view.steps} plan={plan} audioRef={audioRef} onExit={() => { setView({ name: "home" }); reload(); onProgress?.(); }} /></>
  );

  if (view.name === "theme") {
    const t = plan.themes.find((x) => x.id === view.id);
    const segs = plan.audio?.examples?.[t.id] || [];
    return (
      <div className="ing-rf">
        {audio}
        <button type="button" className="ing-link left" onClick={() => setView({ name: "home" })}><ChevronLeft size={14} /> Temas</button>
        <h2>{t.title} <span className="ing-badge">{t.kind}</span></h2>
        <p className="ing-rf-why">{t.why}</p>
        <div className="ing-rf-items">{t.items.map((i) => <span key={i} className="ing-chip">{i}</span>)}</div>
        {t.lesson && <div className="ing-rf-lesson ing-md"><ReactMarkdown>{t.lesson}</ReactMarkdown></div>}
        {t.lessonLink && <button type="button" className="ing-link left" onClick={() => onOpenLesson(t.lessonLink)}><BookOpen size={14} /> Aula do livro sobre o tema</button>}
        <h3>Exemplos novos</h3>
        <ul className="ing-ctxs">
          {t.examples.map((e, k) => (
            <li key={k}>
              <span className="ing-rf-ex">
                {segs[k] && <button type="button" className="ing-icon" onClick={() => playSeg(segs[k], `${t.id}:${k}`)} aria-label="Ouvir">{playing === `${t.id}:${k}` ? <Square size={13} /> : <Volume2 size={14} />}</button>}
                <span><Hl text={e.en} hit={e.hit} /></span>
              </span>
              <small>{e.pt}</small>
            </li>
          ))}
        </ul>
        {t.related.length > 0 && (
          <>
            <h3>Do mesmo nicho (você ainda não marcou)</h3>
            <Related items={t.related} words={words} reload={reload} />
          </>
        )}
        <div className="ing-row">
          <button type="button" className="ing-btn primary" disabled={!t.exercises.length} onClick={() => setView({ name: "session", steps: buildSession(plan, words, t.id) })}><Layers size={15} /> Praticar este tema ({t.exercises.length})</button>
        </div>
      </div>
    );
  }

  if (view.name === "text") return (
    <div className="ing-rf">
      {audio}
      <button type="button" className="ing-link left" onClick={() => setView({ name: "home" })}><ChevronLeft size={14} /> Temas</button>
      <TextView plan={plan} audioRef={audioRef} />
    </div>
  );

  return (
    <div className="ing-rf">
      {audio}
      <div className="ing-rf-head">
        <div>
          <h2>Estudo de reforço</h2>
          <p className="ing-hint">A IA lê tudo que você marcou de uma vez, encontra os nichos em que você tem dificuldade (ex.: vários modais = verbos modais) e monta lição, exemplos, termos relacionados, exercícios intercalados e um texto com áudio.</p>
        </div>
        <button type="button" className="ing-btn primary" disabled={building || !words.length} onClick={build}>
          {building ? <><RefreshCw size={15} className="spin" /> Montando…</> : plan.themes ? <><Wand2 size={15} /> Refazer{plan.newItems ? ` (+${plan.newItems} novos)` : ""}</> : <><Wand2 size={15} /> Montar estudo</>}
        </button>
      </div>
      {building && <p className="ing-rf-step">{plan.step || "Trabalhando…"} Isso leva de 1 a 3 minutos; pode sair desta aba.</p>}
      {(err || plan.error) && <p className="ing-err">{err || plan.error}</p>}
      {!plan.themes && !building && <p className="ing-hint">{words.length ? `${words.length} itens marcados prontos para analisar.` : "Marque palavras ou trechos na aba Estudo primeiro."}</p>}
      {plan.themes && (
        <>
          {plan.overview && <p className="ing-rf-over">{plan.overview}</p>}
          {plan.audioNote && <p className="ing-hint">{plan.audioNote}</p>}
          <div className="ing-row wrap">
            <button type="button" className="ing-btn primary" onClick={() => setView({ name: "session", steps: buildSession(plan, words) })}><Layers size={15} /> Estudo completo (tudo misturado)</button>
            {plan.text && <button type="button" className="ing-btn" onClick={() => setView({ name: "text" })}><Languages size={15} /> Texto com seus itens</button>}
            <span className="ing-hint">Montado em {new Date(plan.builtAt).toLocaleString("pt-BR")} com {plan.count} itens.</span>
          </div>
          <div className="ing-rf-themes">
            {plan.themes.map((t, i) => (
              <button key={t.id} type="button" className="ing-rf-theme" onClick={() => setView({ name: "theme", id: t.id })}>
                <span className="ing-rf-n">{i + 1}</span>
                <b>{t.title}</b>
                <span className="ing-badge">{t.kind}</span>
                <span className="ing-rf-why">{t.why}</span>
                <span className="ing-hint">{t.items.length} marcados · {t.exercises.length} exercícios · {t.related.length} novos termos</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Related({ items, words, reload }) {
  const have = new Set(words.map((w) => w.word.toLowerCase()));
  const [added, setAdded] = useState({});
  async function add(r) {
    await post("/api/ingles/words", { word: r.term, context: r.en || "", translation: r.meaning || r.pt || "", lesson: "Estudo de reforço" });
    setAdded((a) => ({ ...a, [r.term]: true }));
    reload();
  }
  return (
    <ul className="ing-ctxs">
      {items.map((r) => (
        <li key={r.term}>
          <span className="ing-rf-ex"><b>{r.term}</b> · <span className="ing-hint">{r.meaning}</span>
            {have.has(r.term.toLowerCase()) || added[r.term] ? <span className="ing-pop-ok dark"><Check size={13} /> no reforço</span>
              : <button type="button" className="ing-link" onClick={() => add(r)}><Plus size={13} /> Reforço</button>}
          </span>
          {r.en && <small><Hl text={r.en} hit={r.term} /> — {r.pt}</small>}
        </li>
      ))}
    </ul>
  );
}

function TextView({ plan, audioRef }) {
  const [cur, setCur] = useState(-1);
  const [pt, setPt] = useState(false);
  const times = plan.audio?.text || [];
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const h = () => { const t = a.currentTime; setCur(times.findIndex((s) => s && t >= s[0] && t <= s[1] + 0.3)); };
    a.addEventListener("timeupdate", h);
    return () => a.removeEventListener("timeupdate", h);
  }, [times]);
  function playAll() {
    const a = audioRef.current;
    if (!a || !times[0]) return;
    a.currentTime = times[0][0];
    a.play().catch(() => {});
    const end = times[times.length - 1]?.[1];
    const stop = () => { if (a.currentTime >= end + 0.2) { a.pause(); a.removeEventListener("timeupdate", stop); } };
    a.addEventListener("timeupdate", stop);
  }
  return (
    <div className="ing-rf-text">
      <h2>{plan.text.title}</h2>
      <div className="ing-row wrap">
        {times.length > 0 && <button type="button" className="ing-btn primary" onClick={playAll}><Play size={15} /> Ouvir o texto</button>}
        <button type="button" className={`ing-chip${pt ? " on" : ""}`} onClick={() => setPt((v) => !v)}><Languages size={14} /> Tradução</button>
      </div>
      <p className="ing-rf-para">
        {plan.text.sentences.map((s, i) => (
          <span key={i} className={`ing-rf-sent${cur === i ? " now" : ""}`} onClick={() => { const a = audioRef.current; if (a && times[i]) { a.currentTime = times[i][0]; a.play().catch(() => {}); } }}>
            <Hl text={s.en} hit={plan.text.uses.find((u) => s.en.toLowerCase().includes(u.toLowerCase()))} />{pt && s.pt ? <small> {s.pt}</small> : null}{" "}
          </span>
        ))}
      </p>
      {pt && !plan.text.sentences.some((s) => s.pt) && <p className="ing-hint">{plan.text.pt}</p>}
    </div>
  );
}

function Session({ steps, plan, audioRef, onExit }) {
  const [i, setI] = useState(0);
  const [res, setRes] = useState([]);
  const step = steps[i];
  const next = () => (i + 1 < steps.length ? setI(i + 1) : setI(steps.length));
  async function score(x, s, type, diff) {
    setRes((r) => [...r, s]);
    try { await post("/api/ingles/progress", { op: "attempt", lesson: "reforco", type, key: x.id, score: s, difficulty: diff }); } catch {}
  }
  if (i >= steps.length) {
    const avg = res.length ? res.reduce((a, b) => a + b, 0) / res.length : 0;
    return (
      <div className="ing-practice"><div className="ing-done">
        <div className="ing-big">{Math.round(avg * 100)}%</div>
        <p>{res.length} itens respondidos. Os temas com mais erros aparecem primeiro quando você refizer o estudo.</p>
        <div className="ing-row"><button type="button" className="ing-btn primary" onClick={onExit}>Voltar aos temas</button></div>
      </div></div>
    );
  }
  return (
    <div className="ing-practice">
      <div className="ing-prog"><i style={{ width: `${(i / steps.length) * 100}%` }} /></div>
      <div className="ing-run-h"><span>{step.theme ? step.theme.title : step.type === "card" ? "Revisão" : "Texto"} · {i + 1}/{steps.length}</span><button type="button" className="ing-link" onClick={onExit}>Sair</button></div>
      {step.type === "lesson" && (
        <div className="ing-q">
          <span className="ing-crumb-g">Mini-lição</span>
          <h3 style={{ margin: "4px 0 8px" }}>{step.theme.title}</h3>
          <div className="ing-md"><ReactMarkdown>{step.theme.lesson || step.theme.why}</ReactMarkdown></div>
          <div className="ing-row"><button type="button" className="ing-btn primary" onClick={next}>Continuar <ChevronRight size={15} /></button></div>
        </div>
      )}
      {step.type === "ex" && <Exercise key={i} x={step.x} onScore={score} onNext={next} />}
      {step.type === "card" && <FlashCard key={i} w={step.w} onNext={next} onScore={(s) => setRes((r) => [...r, s])} />}
      {step.type === "text" && (
        <div className="ing-q">
          <TextView plan={plan} audioRef={audioRef} />
          <div className="ing-row"><button type="button" className="ing-btn primary" onClick={next}>Concluir</button></div>
        </div>
      )}
    </div>
  );
}

function Exercise({ x, onScore, onNext }) {
  const [val, setVal] = useState("");
  const [pick, setPick] = useState(null);
  const [done, setDone] = useState(null); // nota
  function check() {
    if (done != null) return onNext();
    let s = 0, diff = 3;
    if (x.type === "cloze") { s = gradeBlank(x.answer, val); diff = 3; }
    if (x.type === "translate") { s = Math.max(...[x.answer, ...(x.accept || [])].map((a) => gradeTyped(a, val).score)); diff = 4; }
    setDone(s);
    onScore(x, s, `rf-${x.type}`, diff);
  }
  function choose(k) {
    if (pick != null) return;
    setPick(k);
    const s = k === x.answer ? 1 : 0;
    setDone(s);
    onScore(x, s, "rf-mcq", 2);
  }
  return (
    <div className="ing-q">
      {x.type === "mcq" && (
        <>
          <div className="ing-q-line big">{x.prompt}</div>
          <div className="ing-opts">
            {x.options.map((o, k) => <button key={k} type="button" className={`ing-opt${pick != null ? (k === x.answer ? " ok" : k === pick ? " bad" : "") : ""}`} onClick={() => choose(k)}>{o}</button>)}
          </div>
        </>
      )}
      {x.type === "cloze" && (
        <div className="ing-q-line">
          {x.en.split("___")[0]}
          <span className={`ing-blank${done != null ? (done >= 0.7 ? " ok" : " bad") : ""}`}>
            <input autoFocus value={val} disabled={done != null} size={Math.max(5, x.answer.length + 1)} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            {done != null && done < 1 && <em>{x.answer}</em>}
          </span>
          {x.en.split("___")[1]}
        </div>
      )}
      {x.type === "translate" && (
        <>
          <div className="ing-q-line big">{x.pt}</div>
          <textarea autoFocus rows={2} value={val} disabled={done != null} placeholder="Escreva em inglês" onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); check(); } }} autoCapitalize="off" spellCheck={false} />
          {done != null && <p className="ing-q-pt">Resposta: <b>{x.answer}</b>{x.accept?.length ? ` (também: ${x.accept.join("; ")})` : ""} · {Math.round(done * 100)}%</p>}
        </>
      )}
      {done != null && (x.explain || x.pt) && <p className="ing-q-pt">{x.type === "cloze" && x.pt ? `${x.pt} · ` : ""}{x.explain}</p>}
      {(x.type !== "mcq" || done != null) && (
        <div className="ing-row"><button type="button" className="ing-btn primary" onClick={x.type === "mcq" ? onNext : check}>{done != null ? "Continuar" : "Verificar"}</button></div>
      )}
    </div>
  );
}

function FlashCard({ w, onNext, onScore }) {
  const [show, setShow] = useState(false);
  const ctx = w.contexts?.length ? w.contexts[(w.reps || 0) % w.contexts.length] : null;
  async function grade(g) {
    try { await api("/api/ingles/words", { method: "PATCH", body: JSON.stringify({ id: w.id, grade: g }) }); } catch {}
    onScore([0, 0.4, 0.8, 1][g]);
    onNext();
  }
  return (
    <div className="ing-flash">
      <span className="ing-crumb-g">Revisão do que você marcou</span>
      <div className="ing-flash-w">{w.word}</div>
      <div className="ing-flash-ctx"><Hl text={ctx ? ctx.en : w.context || ""} hit={ctx ? ctx.hit : w.word} /></div>
      {show ? (
        <>
          <div className="ing-flash-back">{w.meaning && <p><b>{w.meaning}</b></p>}<p>{ctx ? ctx.pt : w.translation}</p></div>
          <div className="ing-grades">
            {["Errei", "Difícil", "Bom", "Fácil"].map((l, g) => <button key={g} type="button" className={`ing-grade g${g}`} onClick={() => grade(g)}>{l}</button>)}
          </div>
        </>
      ) : <button type="button" className="ing-btn primary" onClick={() => setShow(true)}>Mostrar significado</button>}
    </div>
  );
}
