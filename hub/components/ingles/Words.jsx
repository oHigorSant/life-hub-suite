"use client";

import { useMemo, useState } from "react";
import { Trash2, Eye, Brain, Wand2, Plus, ChevronDown, ChevronUp, Check } from "lucide-react";
import { api, post } from "./util";
import ReforcoStudy from "./ReforcoStudy";

const GRADES = [
  { g: 0, label: "Errei", cls: "g0" },
  { g: 1, label: "Difícil", cls: "g1" },
  { g: 2, label: "Bom", cls: "g2" },
  { g: 3, label: "Fácil", cls: "g3" },
];

const KINDS = [
  { id: "all", label: "Tudo" },
  { id: "word", label: "Palavras" },
  { id: "expr", label: "Expressões e frases" },
];

const kindOf = (w) => w.kind || (/\s/.test(w.word) ? "expr" : "word");

function dueIn(w) {
  const d = w.due - Date.now();
  if (d <= 0) return "agora";
  const h = d / 36e5;
  if (h < 20) return `em ${Math.max(1, Math.round(h))} h`;
  return `em ${Math.round(h / 24)} d`;
}

function Highlight({ text, word }) {
  const i = (text || "").toLowerCase().indexOf(String(word || "").toLowerCase());
  if (i < 0 || !word) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + word.length)}</mark>{text.slice(i + word.length)}</>;
}

export default function Words({ words, reload, onProgress, onOpenLesson }) {
  const [session, setSession] = useState(null); // { queue, reveal, done }
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState("all");
  const [picked, setPicked] = useState([]);
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(null); // ids em geração
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState({ term: "", tr: "" });
  const due = useMemo(() => words.filter((w) => w.due <= Date.now()).sort((a, b) => a.due - b.due), [words]);

  function startReview() { setSession({ queue: due.slice(0, 20), reveal: false, done: 0 }); }

  async function grade(g) {
    const w = session.queue[0];
    try { await api("/api/ingles/words", { method: "PATCH", body: JSON.stringify({ id: w.id, grade: g }) }); } catch {}
    const rest = g === 0 ? [...session.queue.slice(1), w] : session.queue.slice(1); // errou: volta ao fim da fila
    if (!rest.length) { setSession(null); reload(); onProgress?.(); return; }
    setSession({ queue: rest, reveal: false, done: session.done + (g === 0 ? 0 : 1) });
  }

  async function remove(id) {
    await api(`/api/ingles/words?id=${id}`, { method: "DELETE" });
    setPicked((p) => p.filter((x) => x !== id));
    reload();
  }

  async function addDraft(e) {
    e.preventDefault();
    const term = draft.term.trim();
    if (!term) return;
    try {
      await post("/api/ingles/words", { word: term, translation: draft.tr.trim(), context: "" });
      setDraft({ term: "", tr: "" });
      setMsg("");
      reload();
    } catch (err) { setMsg(err.message); }
  }

  async function generate(ids) {
    if (!ids.length) return;
    setBusy(ids);
    setMsg(`Gerando contextos para ${ids.length} item${ids.length > 1 ? "s" : ""}… pode levar até 1 minuto.`);
    try {
      for (let i = 0; i < ids.length; i += 8) await post("/api/ingles/contexts", { ids: ids.slice(i, i + 8), n: 3 });
      setMsg("Contextos prontos.");
      setOpen((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, true])) }));
      setPicked([]);
      reload();
    } catch (err) { setMsg(`Não foi possível gerar: ${err.message}`); }
    setBusy(null);
  }

  const [sub, setSub] = useState(() => { try { return localStorage.getItem("ing-rf-sub") || "estudo"; } catch { return "estudo"; } });
  const pickSub = (v) => { setSub(v); try { localStorage.setItem("ing-rf-sub", v); } catch {} };
  const switcher = (
    <div className="ing-seg ing-rf-switch" role="tablist" aria-label="Reforço">
      <button type="button" role="tab" aria-selected={sub === "estudo"} className={sub === "estudo" ? "on" : ""} onClick={() => pickSub("estudo")}><Wand2 size={14} /> Estudo inteligente</button>
      <button type="button" role="tab" aria-selected={sub === "itens"} className={sub === "itens" ? "on" : ""} onClick={() => pickSub("itens")}><Brain size={14} /> Itens marcados ({words.length})</button>
    </div>
  );
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const list = words.filter((w) => (kind === "all" || kindOf(w) === kind) && (!filter || w.word.toLowerCase().includes(filter.toLowerCase()) || (w.lesson || "").toLowerCase().includes(filter.toLowerCase())));
  const lvl = (w) => w.level || "minerada";

  if (session) {
    const w = session.queue[0];
    // com contextos novos, a revisão alterna as frases: o termo aparece em situações diferentes a cada vez
    const ctxs = w.contexts || [];
    const ctx = ctxs.length ? ctxs[(w.reps || 0) % ctxs.length] : null;
    return (
      <div className="ing-practice">
        <div className="ing-run-h"><span>Revisão · restam {session.queue.length}</span><button type="button" className="ing-link" onClick={() => { setSession(null); reload(); }}>Encerrar</button></div>
        <div className="ing-flash">
          <div className="ing-flash-w">{w.word}</div>
          <div className="ing-flash-ctx"><Highlight text={ctx ? ctx.en : w.context || ""} word={ctx ? ctx.hit : w.word} /></div>
          {session.reveal ? (
            <div className="ing-flash-back">
              {w.meaning && <p><b>{w.meaning}</b></p>}
              {(ctx ? ctx.pt : w.translation) && <p>{ctx ? ctx.pt : w.translation}</p>}
              {w.usage && <p className="ing-hint">{w.usage}</p>}
              {w.lesson && w.lessonId && <button type="button" className="ing-link" onClick={() => { setSession(null); onOpenLesson?.(w.lessonId); }}>{w.lesson}</button>}
            </div>
          ) : (
            <button type="button" className="ing-btn primary" onClick={() => setSession({ ...session, reveal: true })}><Eye size={15} /> Mostrar significado</button>
          )}
        </div>
        {session.reveal && (
          <div className="ing-grades">
            {GRADES.map((x) => <button key={x.g} type="button" className={`ing-grade ${x.cls}`} onClick={() => grade(x.g)}>{x.label}</button>)}
          </div>
        )}
      </div>
    );
  }

  if (sub === "estudo")
    return (
      <div className="ing-practice wide">
        {switcher}
        <ReforcoStudy words={words} reload={reload} onOpenLesson={onOpenLesson} onProgress={onProgress} />
      </div>
    );

  return (
    <div className="ing-practice wide">
      {switcher}
      <div className="ing-panel-h">
        <h2>Reforço de vocabulário</h2>
        <p>Palavras, expressões e frases que você salvou. No texto, clique numa palavra ou selecione um trecho com o mouse (ou o dedo) para salvar. Marque itens aqui e peça à IA novos contextos de uso: na revisão, o termo aparece em frases diferentes a cada vez. A repetição é espaçada (SM-2, a mesma do Atlas) e cada revisão conta como evidência de domínio da lição de origem.</p>
      </div>
      <div className="ing-row wrap">
        <button type="button" className="ing-btn primary" disabled={!due.length} onClick={startReview}><Brain size={15} /> {due.length ? `Revisar ${Math.min(due.length, 20)} item${due.length > 1 ? "s" : ""}` : "Nada para revisar agora"}</button>
        <button type="button" className="ing-btn" disabled={!picked.length || !!busy} onClick={() => generate(picked)}><Wand2 size={15} /> {busy ? "Gerando…" : `Gerar novos contextos${picked.length ? ` (${picked.length})` : ""}`}</button>
        <div className="ing-seg" role="group" aria-label="Tipo">
          {KINDS.map((k) => <button key={k.id} type="button" className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)}>{k.label}</button>)}
        </div>
        <input className="ing-search" placeholder="Filtrar" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar itens" />
      </div>
      <form className="ing-add" onSubmit={addDraft}>
        <input value={draft.term} onChange={(e) => setDraft({ ...draft, term: e.target.value })} placeholder="Adicionar palavra, expressão ou frase (em inglês)" maxLength={140} aria-label="Termo em inglês" />
        <input value={draft.tr} onChange={(e) => setDraft({ ...draft, tr: e.target.value })} placeholder="Tradução (opcional)" maxLength={200} aria-label="Tradução" />
        <button type="submit" className="ing-btn" disabled={!draft.term.trim()}><Plus size={15} /> Adicionar</button>
      </form>
      <div className="ing-hint">{words.length} itens · {words.filter((w) => kindOf(w) === "expr").length} expressões · {words.filter((w) => lvl(w) === "consolidada").length} consolidados {msg && <b> · {msg}</b>}</div>
      {!words.length && <p className="ing-hint">Nada salvo ainda. Na aba Estudo, selecione um trecho do texto e escolha “Reforço”.</p>}
      <div className="ing-wgrid">
        {list.map((w) => {
          const isOpen = !!open[w.id];
          const k = kindOf(w);
          return (
            <article key={w.id} className={`ing-wcard${picked.includes(w.id) ? " picked" : ""}`}>
              <header>
                <label className="ing-pick" title="Selecionar para gerar contextos">
                  <input type="checkbox" checked={picked.includes(w.id)} onChange={() => toggle(w.id)} aria-label={`Selecionar ${w.word}`} />
                </label>
                <h3>{w.word}</h3>
                <span className="ing-badges">
                  {k === "expr" && <span className="ing-badge">expressão</span>}
                  <span className={`ing-badge lv-${lvl(w)}`}>{lvl(w)}</span>
                </span>
              </header>
              {w.meaning && <p className="ing-wmean">{w.meaning}</p>}
              {w.context && <p className="ing-wctx"><Highlight text={w.context} word={w.word} /></p>}
              {w.translation && <p className="ing-wtr">{w.translation}</p>}
              {w.contexts?.length > 0 && (
                <>
                  <button type="button" className="ing-link left" onClick={() => setOpen((o) => ({ ...o, [w.id]: !o[w.id] }))} aria-expanded={isOpen}>
                    {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {w.contexts.length} novos contextos
                  </button>
                  {isOpen && (
                    <ul className="ing-ctxs">
                      {w.contexts.map((c, i) => (
                        <li key={i}>
                          <span><Highlight text={c.en} word={c.hit} /></span>
                          <small>{c.pt}{c.register ? ` · ${c.register}` : ""}{c.sense ? ` · ${c.sense}` : ""}</small>
                        </li>
                      ))}
                      {w.usage && <li className="use"><small>{w.usage}</small></li>}
                    </ul>
                  )}
                </>
              )}
              <footer>
                <span>{w.lesson ? w.lesson : "Adicionado à mão"} · revisão {dueIn(w)}</span>
                <span className="ing-acts">
                  <button type="button" className="ing-icon" onClick={() => generate([w.id])} disabled={!!busy} aria-label={`Gerar contextos para ${w.word}`} title={w.contexts?.length ? "Gerar novos contextos" : "Gerar contextos com IA"}>{busy?.includes(w.id) ? <Check size={14} /> : <Wand2 size={14} />}</button>
                  <button type="button" className="ing-icon" onClick={() => remove(w.id)} aria-label={`Excluir ${w.word}`} title="Excluir"><Trash2 size={14} /></button>
                </span>
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
