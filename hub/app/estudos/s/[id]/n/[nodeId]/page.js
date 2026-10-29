"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Topbar, Ring, Md, JobCard, api, usePoll, useJob, STATUS, Diff, timeAgo } from "@/components/atlas/ui.js";
import Quiz from "@/components/atlas/Quiz.js";
import Flash from "@/components/atlas/Flash.js";
import VoicePicker from "@/components/atlas/VoicePicker.js";
import { ActivityIcon, Lock, RefreshCw, Sparkles, Check, AlertTriangle, HelpCircle, Target, Bookmark, CheckCircle2, Rocket, Lightbulb, Headphones, SlidersHorizontal, Mic, Play, Pause } from "@/components/atlas/icons.js";

const ORDER = ["lesson", "reading", "exercise", "quiz", "flashcards", "podcast", "project"];

export default function NodePage({ params }) {
  const { id, nodeId } = use(params);
  const [data, reload, err] = usePoll(() => api(`/api/estudos/nodes/${nodeId}`), { ms: 6000 });
  const [type, setType] = useState("lesson");
  const [jobId, setJobId] = useState(null);
  const [genType, setGenType] = useState(null);
  const [pickedAct, setPickedAct] = useState(null);

  const job = useJob(jobId, async (j) => {
    await reload();
    if (j.status === "done") setPickedAct(j.result?.activityId || null);
    setTimeout(() => setJobId(null), j.status === "error" ? 6000 : 800);
  });

  useEffect(() => { setPickedAct(null); }, [type]);
  // voltou à tela com uma geração rodando: retoma o acompanhamento
  useEffect(() => {
    const aj = data?.activeJob;
    if (aj && !jobId) { setJobId(aj.id); setGenType(String(aj.kind).replace("activity:", "")); setType(String(aj.kind).replace("activity:", "")); }
  }, [data?.activeJob?.id]); // eslint-disable-line
  useEffect(() => {
    document.querySelector(".act-btn.on")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [type, !!data]); // eslint-disable-line

  if (err && !data) return <div className="shell"><Topbar /><div className="empty">{err}</div></div>;
  if (!data) return <div className="shell"><Topbar /><div className="page"><div className="skeleton" style={{ height: 420 }} /></div></div>;

  const { node, concepts, activities, types, prereqs, hasSources } = data;
  const st = STATUS[node.status];
  const ofType = activities.filter((a) => a.type === type);
  const current = pickedAct ? activities.find((a) => a.id === pickedAct) : ofType[0];
  const generating = !!jobId && job?.status !== "error" && job?.status !== "done";

  async function generate(t, opts = {}) {
    setGenType(t);
    const r = await api(`/api/estudos/nodes/${nodeId}/activities`, { body: { type: t, opts } });
    setJobId(r.job);
  }

  return (
    <div className="shell">
      <Topbar crumbs={[{ label: "Área", href: `/estudos/s/${id}` }, { label: node.title }]} />
      <main className="page">
        <div className="row between wrap" style={{ marginBottom: 26, alignItems: "flex-start" }}>
          <div style={{ maxWidth: 780 }}>
            <div className="row" style={{ marginBottom: 10 }}>
              <span className="chip" style={{ color: st.color, borderColor: st.color + "66" }}>{st.label}</span>
              <span className="chip">{node.branch}</span>
              <span className="dim" style={{ fontSize: 13 }}>~{node.est_minutes} min</span>
            </div>
            <h1 className="node-h1">{node.title}</h1>
            <p className="muted" style={{ fontSize: 16, margin: "8px 0 0" }}>{node.summary}</p>
          </div>
          <div className="row node-ring">
            <div style={{ textAlign: "right" }}><div style={{ fontSize: 13 }} className="dim">domínio</div><div className="dim" style={{ fontSize: 12 }}>meta 80%</div></div>
            <Ring value={Math.min(1, node.mastery / 0.8)} size={68} stroke={6}>{Math.round(node.mastery * 100)}</Ring>
          </div>
        </div>

        {node.status === "locked" && (
          <div className="card" style={{ marginBottom: 22, borderColor: "rgba(251,191,36,.35)", background: "rgba(251,191,36,.05)" }}>
            <Lock size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Esta habilidade depende de: {prereqs.filter((p) => p.kind === "hard" && !["mastered"].includes(p.status)).map((p) => <Link key={p.id} href={`/estudos/s/${id}/n/${p.id}`} className="chip gold" style={{ marginLeft: 6 }}>{p.title}</Link>)}.
            <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Você pode estudar mesmo assim — e se já sabe, um quiz aqui prova e libera o caminho.</div>
          </div>
        )}

        <div className="room">
          <aside>
            <div className="act-list">
            <div className="eyebrow act-eyebrow" style={{ marginBottom: 10 }}>Como você quer estudar?</div>
            {ORDER.map((t) => {
              const meta = types[t];
              const has = activities.some((a) => a.type === t) || (t === "flashcards" && node.cards > 0);
              return (
                <button key={t} className={"act-btn" + (type === t ? " on" : "")} onClick={() => setType(t)}>
                  <span className="ico"><ActivityIcon type={t} /></span>
                  <span><div className="t">{meta.label}</div><div className="d">{meta.desc}</div></span>
                  {has && <span className="dot" />}
                </button>
              );
            })}
            <Link href={`/estudos/s/${id}?tab=progress`} className="act-btn"><span className="ico"><ActivityIcon type="mock" /></span><span><div className="t">{types.mock.label}</div><div className="d">{types.mock.desc}</div></span></Link>
            </div>

            <div className="card obj-card" style={{ marginTop: 18 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Objetivos</div>
              {node.objectives.map((o, i) => <div key={i} className="objective">{o}</div>)}
              {concepts.length > 0 && <><div className="eyebrow" style={{ margin: "14px 0 8px" }}>Conceitos</div><div className="row wrap" style={{ gap: 6 }}>{concepts.map((c) => <span key={c.id} className={"chip" + (c.attempts && (c.recent_score ?? c.avg_score) < 0.65 ? " red" : c.attempts ? " green" : "")} title={c.definition}>{c.title}</span>)}</div></>}
            </div>
          </aside>

          <section style={{ minWidth: 0 }}>
            {generating && (
              <div style={{ marginBottom: 16 }}><JobCard job={job || { progress: 0.05, message: "Iniciando…", status: "running" }} label={`Gerando ${types[genType]?.label.toLowerCase()}…`} /></div>
            )}
            {job?.status === "error" && <div className="card" style={{ borderColor: "rgba(251,113,133,.5)", marginBottom: 16, color: "var(--red)" }}>Falhou: {job.message}</div>}

            {type === "flashcards" ? (
              <FlashPanel node={node} generate={generate} generating={generating} />
            ) : !current ? (
              <EmptyAct type={type} meta={types[type]} generate={generate} generating={generating} hasSources={hasSources} />
            ) : (
              <>
                <div className="row between wrap" style={{ marginBottom: 14 }}>
                  <div className="dim" style={{ fontSize: 13 }}>{current.title} · {timeAgo(current.created_at)}</div>
                  <div className="row">
                    {ofType.length > 1 && <select className="select" style={{ width: "auto", padding: "5px 10px", fontSize: 13 }} value={current.id} onChange={(e) => setPickedAct(e.target.value)}>{ofType.map((a, i) => <option key={a.id} value={a.id}>Versão {ofType.length - i} · {timeAgo(a.created_at)}</option>)}</select>}
                    <button className="btn sm" disabled={generating} onClick={() => generate(type, type === "quiz" ? { count: 10 } : {})}><RefreshCw size={14} /> {type === "quiz" ? "Novo quiz" : "Nova versão"}</button>
                  </div>
                </div>
                <ActivityView key={current.id} id={current.id} type={type} node={node} onMore={() => generate("quiz", { count: 10 })} onLessonDone={async () => { await api(`/api/estudos/nodes/${nodeId}`, { body: { lesson_done: true } }); reload(); }} />
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function EmptyAct({ type, meta, generate, generating, hasSources }) {
  const [count, setCount] = useState(10);
  const [focus, setFocus] = useState("");
  const [minutes, setMinutes] = useState(8);
  const [voice, setVoice] = useState({});
  return (
    <div className="card" style={{ textAlign: "center", padding: "50px 24px" }}>
      <div className="empty-ico"><ActivityIcon type={type} size={30} /></div>
      <h2 style={{ margin: "10px 0 6px" }}>{meta.label}</h2>
      <p className="muted" style={{ maxWidth: 460, margin: "0 auto 22px" }}>{meta.desc}. {hasSources ? "Gerado a partir do seu material." : "Sem material anexado a esta habilidade — será gerado com conhecimento consolidado da área."}</p>
      {type === "quiz" && (
        <div style={{ maxWidth: 420, margin: "0 auto 18px", textAlign: "left" }}>
          <label className="label">Foco (opcional)</label>
          <input className="input" placeholder="Ex.: casos de borda, interpretação, fórmulas…" value={focus} onChange={(e) => setFocus(e.target.value)} />
          <div className="seg" style={{ marginTop: 12 }}>{[6, 10, 15].map((n) => <button key={n} className={count === n ? "on" : ""} onClick={() => setCount(n)}>{n} questões</button>)}</div>
        </div>
      )}
      {type === "podcast" && (
        <div style={{ maxWidth: 440, margin: "0 auto 20px", textAlign: "left" }}>
          <label className="label">Duração</label>
          <div className="seg" style={{ marginBottom: 18 }}>{[5, 8, 12].map((n) => <button key={n} className={minutes === n ? "on" : ""} onClick={() => setMinutes(n)}>{n} min</button>)}</div>
          <VoicePicker onChange={setVoice} />
        </div>
      )}
      <button className="btn primary lg" disabled={generating} onClick={() => generate(type, type === "quiz" ? { count, focus } : type === "podcast" ? { minutes, ...voice } : {})}>{generating ? <><span className="spinner" /> Gerando…</> : <><Sparkles size={17} /> Gerar {meta.label.toLowerCase()}</>}</button>
      {generating && <div className="dim" style={{ fontSize: 13, marginTop: 12 }}>Isso leva de 30 s a 2 min. Pode navegar — fica pronto em segundo plano.</div>}
    </div>
  );
}

function FlashPanel({ node, generate, generating }) {
  const [tick, setTick] = useState(0);
  const prev = useRef(generating);
  useEffect(() => { if (prev.current && !generating) setTick((t) => t + 1); prev.current = generating; }, [generating]);
  return (
    <div>
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="muted" style={{ fontSize: 14 }}>{node.cards} cartões nesta habilidade · {node.cardsDue} para revisar</div>
        <button className="btn sm" disabled={generating} onClick={() => generate("flashcards", { count: 14 })}><Sparkles size={14} /> {node.cards ? "Mais cartões" : "Gerar cartões"}</button>
      </div>
      {node.cards === 0 ? <div className="card empty">Gere os cartões desta habilidade para começar a repetição espaçada.</div> : <Flash key={tick} query={`?node=${node.id}`} />}
    </div>
  );
}

function ActivityView({ id, type, node, onMore, onLessonDone }) {
  const [a, setA] = useState(null);
  const load = () => api(`/api/estudos/activities/${id}`).then(setA);
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  if (!a) return <div className="skeleton" style={{ height: 380 }} />;
  const c = a.content;
  const src = c.sources || {};

  if (type === "lesson")
    return (
      <div className="card lesson-card">
        <Md sources={src}>{c.markdown}</Md>
        {c.takeaways?.length > 0 && <><div className="eyebrow" style={{ margin: "30px 0 10px" }}>Para fixar</div>{c.takeaways.map((t, i) => <div key={i} className="takeaway"><Check size={16} className="tk-ico" /> <Md sources={src}>{t}</Md></div>)}</>}
        {c.pitfalls?.length > 0 && <><div className="eyebrow" style={{ margin: "24px 0 10px" }}>Armadilhas comuns</div>{c.pitfalls.map((t, i) => <div key={i} className="takeaway pitfall"><AlertTriangle size={16} className="tk-ico" /> <Md sources={src}>{t}</Md></div>)}</>}
        {c.check_yourself?.length > 0 && <><div className="eyebrow" style={{ margin: "24px 0 10px" }}>Teste-se (sem olhar)</div>{c.check_yourself.map((t, i) => <div key={i} className="row nowrap" style={{ padding: "6px 0", alignItems: "flex-start", gap: 10 }}><HelpCircle size={17} style={{ flex: "none", marginTop: 3, color: "var(--violet)" }} /><span>{t}</span></div>)}</>}
        <div className="row" style={{ marginTop: 26 }}>
          <button className="btn primary" onClick={onLessonDone}><Check size={16} /> Li e entendi</button>
          <button className="btn" onClick={onMore}><Target size={16} /> Testar agora com um quiz</button>
        </div>
      </div>
    );

  if (type === "reading")
    return (
      <div className="stack">
        {c.intro && <div className="card"><Md sources={src}>{c.intro}</Md></div>}
        {c.items?.map((it, i) => {
          const s = src[it.label];
          return (
            <div key={i} className="card">
              <div className="row between"><strong className="row nowrap" style={{ gap: 8 }}><Bookmark size={16} style={{ flex: "none", color: "var(--cyan)" }} />{s ? `${s.source} — ${s.locator}` : it.label}</strong>{it.minutes && <span className="chip">{it.minutes} min</span>}</div>
              <p className="muted" style={{ margin: "8px 0" }}>{it.why}</p>
              {it.focus?.map((f, k) => <div key={k} className="objective">{f}</div>)}
            </div>
          );
        })}
        {c.research?.length > 0 && <div className="card"><div className="eyebrow" style={{ marginBottom: 8 }}>Pesquisa sugerida</div>{c.research.map((r, i) => <div key={i} className="objective">{r}</div>)}</div>}
        {c.after && <div className="card" style={{ background: "rgba(52,211,153,.06)" }}><CheckCircle2 size={16} style={{ verticalAlign: -3, marginRight: 8, color: "var(--green)" }} />{c.after}</div>}
      </div>
    );

  if (type === "exercise") return <Exercises c={c} src={src} />;

  if (type === "quiz")
    return (
      <div className="card quiz-card">
        <Quiz key={id} questions={a.questions} title={a.title} onMore={onMore} sources={src} />
      </div>
    );

  if (type === "podcast") return <Podcast c={c} id={id} reload={load} />;

  if (type === "project")
    return (
      <div className="stack">
        <div className="card"><div className="eyebrow" style={{ marginBottom: 8 }}>Desafio</div><Md sources={src}>{c.brief}</Md></div>
        {c.steps?.length > 0 && <div className="card"><div className="eyebrow" style={{ marginBottom: 8 }}>Etapas sugeridas</div>{c.steps.map((s, i) => <div key={i} className="objective">{s}</div>)}</div>}
        {c.rubric?.length > 0 && (
          <div className="card"><div className="eyebrow" style={{ marginBottom: 10 }}>Rubrica</div>
            {c.rubric.map((r, i) => <div key={i} style={{ marginBottom: 14 }}><strong>{r.criterion}</strong><div className="grid rubric-grid" style={{ gap: 8, marginTop: 6 }}>{["insuficiente", "bom", "excelente"].map((l) => <div key={l} className="card" style={{ padding: 10, fontSize: 13 }}><div className={"chip " + (l === "excelente" ? "green" : l === "bom" ? "gold" : "red")} style={{ marginBottom: 6 }}>{l}</div><div className="muted">{r.levels?.[l]}</div></div>)}</div></div>)}
          </div>
        )}
        {c.stretch && <div className="card" style={{ background: "rgba(139,92,246,.07)" }}><Rocket size={16} style={{ verticalAlign: -3, marginRight: 8, color: "var(--violet)" }} /><strong>Para ir além:</strong> {c.stretch}</div>}
      </div>
    );
  return null;
}

function Exercises({ c, src }) {
  const [shown, setShown] = useState({});
  const [hints, setHints] = useState({});
  return (
    <div className="stack">
      {c.problems?.map((p, i) => (
        <div key={i} className="card">
          <div className="row between" style={{ marginBottom: 8 }}><strong>Exercício {i + 1}</strong><Diff n={p.difficulty || 2} /></div>
          <Md sources={src}>{p.prompt}</Md>
          {p.hints?.slice(0, hints[i] || 0).map((h, k) => <div key={k} className="takeaway" style={{ background: "rgba(251,191,36,.07)", borderColor: "rgba(251,191,36,.25)" }}><Lightbulb size={16} className="tk-ico" style={{ color: "var(--gold)" }} /> {h}</div>)}
          <div className="row" style={{ marginTop: 10 }}>
            {p.hints && (hints[i] || 0) < p.hints.length && <button className="btn sm" onClick={() => setHints({ ...hints, [i]: (hints[i] || 0) + 1 })}><Lightbulb size={14} /> Dica {(hints[i] || 0) + 1}</button>}
            <button className="btn sm" onClick={() => setShown({ ...shown, [i]: !shown[i] })}>{shown[i] ? "Esconder resolução" : "Ver resolução"}</button>
          </div>
          {shown[i] && (
            <div style={{ marginTop: 14, animation: "fadeUp .3s var(--ease) both" }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Resolução</div><Md sources={src}>{p.solution}</Md>
              {p.rubric?.length > 0 && <><div className="eyebrow" style={{ margin: "14px 0 6px" }}>Autocorreção — você fez isso?</div>{p.rubric.map((r, k) => <label key={k} className="objective" style={{ cursor: "pointer" }}><input type="checkbox" style={{ marginRight: 8 }} />{r}</label>)}</>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Podcast({ c, id, reload }) {
  const audioRef = useRef();
  const [cur, setCur] = useState(-1);
  const [job, setJob] = useState(null);
  const [err, setErr] = useState("");
  const lines = c.script || [];
  const times = c.audio?.times || [];
  const jobState = useJob(job, () => { setJob(null); reload(); });

  // browser TTS (reserva, quando não há áudio gravado)
  const [playing, setPlaying] = useState(false);
  const stop = useRef(false);
  function speak(idx) {
    if (!("speechSynthesis" in window) || idx >= lines.length) return setPlaying(false);
    const l = lines[idx];
    setCur(idx);
    const u = new SpeechSynthesisUtterance(l.text);
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("pt"));
    if (voices.length) u.voice = voices[l.speaker === "B" ? Math.min(1, voices.length - 1) : 0];
    u.lang = "pt-BR";
    u.onend = () => { if (!stop.current) speak(idx + 1); };
    speechSynthesis.speak(u);
  }
  useEffect(() => () => { stop.current = true; if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }, []);

  const onTime = () => {
    const t = audioRef.current?.currentTime ?? 0;
    const k = times.findIndex(([a, b]) => t >= a && t < b + 0.4);
    if (k >= 0 && k !== cur) setCur(k);
  };
  const seek = (k) => {
    if (c.audio && audioRef.current) { audioRef.current.currentTime = times[k][0]; audioRef.current.play(); }
    else { stop.current = false; setPlaying(true); speechSynthesis.cancel(); speak(k); }
  };
  const [voice, setVoice] = useState({});
  const [pick, setPick] = useState(false);
  async function makeAudio() {
    setErr("");
    try { setJob((await api(`/api/estudos/activities/${id}/audio`, { method: "POST", body: voice })).job); setPick(false); } catch (e) { setErr(e.message); }
  }
  const mm = c.audio ? `${Math.floor(c.audio.duration / 60)}:${String(Math.round(c.audio.duration % 60)).padStart(2, "0")}` : null;

  return (
    <div className="stack">
      <div className="card" style={{ background: "linear-gradient(135deg,rgba(139,92,246,.18),rgba(34,211,238,.1))" }}>
        <div className="row nowrap" style={{ fontWeight: 650, fontSize: 17, marginBottom: 4, gap: 10 }}><Headphones size={20} style={{ flex: "none", color: "var(--cyan)" }} />{c.title}</div>
        {c.audio ? (
          <>
            <div className="dim" style={{ fontSize: 13, marginBottom: 12 }}>Ana e Beto · {mm} · {c.audio.speed && c.audio.speed !== 1 ? `${c.audio.speed}× · ` : ""}{c.audio.engine === "voicestudio" ? "VoiceStudio" : "Piper"}</div>
            <audio ref={audioRef} controls preload="metadata" src={`/api/estudos/audio/${id}`} onTimeUpdate={onTime} style={{ width: "100%" }} />
            <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setPick(!pick)}><SlidersHorizontal size={14} /> Trocar voz ou velocidade</button>
            {pick && (<div style={{ marginTop: 10 }}><VoicePicker onChange={setVoice} /><button className="btn primary" style={{ marginTop: 10 }} disabled={!!job || !voice.voiceA} onClick={makeAudio}>{job ? <><span className="spinner" /> Gravando…</> : <><Mic size={15} /> Regravar com essa voz</>}</button></div>)}
          </>
        ) : (
          <>
            <div className="dim" style={{ fontSize: 13, marginBottom: 12 }}>Este podcast ainda não tem áudio gravado.</div>
            <VoicePicker onChange={setVoice} />
            <div className="row wrap" style={{ marginTop: 12 }}>
              <button className="btn primary" disabled={!!job || !voice.voiceA} onClick={makeAudio}>{job ? <><span className="spinner" /> Gravando…</> : <><Mic size={15} /> Gerar áudio</>}</button>
              <button className="btn" onClick={() => (playing ? (stop.current = true, speechSynthesis.cancel(), setPlaying(false)) : (stop.current = false, setPlaying(true), speechSynthesis.cancel(), speak(Math.max(0, cur))))}>{playing ? <><Pause size={15} /> Pausar</> : <><Play size={15} /> Ouvir com a voz do navegador</>}</button>
            </div>
          </>
        )}
        {jobState && <div style={{ marginTop: 12 }}><JobCard job={jobState} label="Gravando as vozes" /></div>}
        {err && <div style={{ color: "var(--red)", marginTop: 8, fontSize: 13.5 }}>{err}</div>}
      </div>
      {c.pause_questions?.length > 0 && <div className="card"><div className="eyebrow" style={{ marginBottom: 8 }}>Pause e responda</div>{c.pause_questions.map((q, k) => <div key={k} className="objective">{q}</div>)}</div>}
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 10 }}>Transcrição {c.audio && <span className="dim" style={{ textTransform: "none", letterSpacing: 0 }}>· toque numa fala para ir até ela</span>}</div>
        {lines.map((l, k) => (
          <div key={k} className="row" style={{ alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, background: cur === k ? "rgba(139,92,246,.16)" : "transparent", cursor: "pointer", transition: "background .2s" }} onClick={() => seek(k)}>
            <span className={"chip " + (l.speaker === "A" ? "violet" : "cyan")} style={{ flex: "none" }}>{l.speaker === "A" ? "Ana" : "Beto"}</span>
            <span>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
