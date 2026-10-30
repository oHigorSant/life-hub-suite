"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, RotateCcw, RotateCw, Repeat, Languages, Type, EyeOff, Headphones, Plus, Check, Sparkles, Wand2 } from "lucide-react";
import { lessonTokens } from "@/lib/ingles/text";
import { api, post, audioUrl, fmtTime, Tracker, findIndexAt, loadPrefs, savePrefs } from "./util";

const RATES = [0.75, 0.9, 1, 1.1, 1.25];
const MODES = [
  { id: "karaoke", label: "Karaokê", icon: Sparkles },
  { id: "read", label: "Leitura", icon: Type },
  { id: "blind", label: "Escuta", icon: EyeOff },
];

export default function Reader({ lesson, tracks, state, savedWords, onWordSaved, onProgress, onOpenReforco }) {
  const audioRef = useRef(null);
  const wrapRef = useRef(null);
  const tokEls = useRef([]);
  const blockEls = useRef([]);
  const liveEls = useRef([]);
  const tracker = useRef(null);
  const blockTracker = useRef(null);
  const liveTracker = useRef(null);
  const follow = useRef(true);
  const playedSec = useRef(0);
  const lastTick = useRef(0);
  const listenedSent = useRef(new Set());

  const prefs = useMemo(() => (typeof window === "undefined" ? {} : loadPrefs()), []);
  const [trackIdx, setTrackIdx] = useState(0);
  const [rate, setRate] = useState(prefs.rate || 1);
  const [mode, setMode] = useState(prefs.mode || "karaoke");
  const [showPt, setShowPt] = useState(prefs.showPt ?? true);
  const [size, setSize] = useState(prefs.size || 20);
  const [loopSent, setLoopSent] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [al, setAl] = useState(null); // { spans, coverage, words }
  const [pop, setPop] = useState(null); // { gi, x, y }
  const [saved, setSaved] = useState(null);

  const track = tracks[Math.min(trackIdx, tracks.length - 1)];
  const toks = useMemo(() => lessonTokens(lesson.blocks), [lesson.id]);
  const tokMap = useMemo(() => {
    const m = new Map();
    toks.forEach((t, gi) => {
      const k = `${t.b}:${t.f}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push({ ...t, gi });
    });
    return m;
  }, [toks]);

  // linhas de exibição: parágrafos agrupam frases consecutivas do mesmo parágrafo
  const rows = useMemo(() => {
    const out = [];
    lesson.blocks.forEach((b, bi) => {
      const last = out[out.length - 1];
      if (b.t === "sent" && last?.kind === "par" && last.p === b.p) last.items.push(bi);
      else if (b.t === "sent") out.push({ kind: "par", p: b.p, items: [bi] });
      else if (b.t === "word" && last?.kind === "words") last.items.push(bi);
      else if (b.t === "word") out.push({ kind: "words", items: [bi] });
      else out.push({ kind: b.t, items: [bi] });
    });
    return out;
  }, [lesson.id]);

  const aligned = al && al.coverage >= 0.55 && !al.words;
  const live = al && al.words;

  // ---------------------------------------------------------------- carregar o alinhamento da voz escolhida
  useEffect(() => {
    setAl(null);
    if (!track || track.mode === "none") return;
    let dead = false;
    api(`/api/ingles/align?lesson=${encodeURIComponent(lesson.id)}&file=${encodeURIComponent(track.file)}`)
      .then((j) => !dead && setAl(j))
      .catch(() => {});
    return () => { dead = true; };
  }, [lesson.id, track?.file]);

  // ---------------------------------------------------------------- trackers (palavra atual / frase atual / transcrição ao vivo)
  useEffect(() => {
    tracker.current?.reset();
    blockTracker.current?.reset();
    liveTracker.current?.reset();
    tracker.current = blockTracker.current = liveTracker.current = null;
    if (!al) return;
    if (!al.words && al.spans?.length === toks.length * 2) {
      const starts = toks.map((_, i) => al.spans[2 * i]);
      tracker.current = new Tracker((i) => tokEls.current[i], starts);
      const order = [];
      const bstart = [];
      toks.forEach((t, gi) => { if (t.f === "en" && order[order.length - 1] !== t.b) { order.push(t.b); bstart.push(al.spans[2 * gi]); } });
      blockTracker.current = new Tracker((k) => blockEls.current[order[k]], bstart, { read: false });
      blockTracker.current.order = order;
      blockTracker.current.bstart = bstart;
    } else if (al.words) {
      liveTracker.current = new Tracker((i) => liveEls.current[i], al.words.map((w) => w[1]));
    }
    const a = audioRef.current;
    if (a) update(a.currentTime);
  }, [al, toks]);

  const update = useCallback((t) => {
    setTime(t);
    tracker.current?.set(t);
    liveTracker.current?.set(t);
    const bt = blockTracker.current;
    if (bt) {
      const before = bt.cur;
      const k = bt.set(t);
      if (k !== before && k >= 0 && follow.current) {
        const el = blockEls.current[bt.order[k]];
        const box = wrapRef.current;
        if (el && box) {
          const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
          if (r.top < b.top + 80 || r.bottom > b.bottom - 120) el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
      if (loopSent && k >= 0) {
        const end = blockEnd(k);
        if (t > end) seek(bt.bstart[k]);
      }
    }
    const lv = liveTracker.current;
    if (lv && lv.cur >= 0 && follow.current) {
      const el = liveEls.current[lv.cur];
      const box = wrapRef.current;
      if (el && box) {
        const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
        if (r.top < b.top + 80 || r.bottom > b.bottom - 120) el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }, [loopSent]);

  function blockEnd(k) {
    const bt = blockTracker.current;
    const order = bt.order;
    let last = -1;
    toks.forEach((t, gi) => { if (t.b === order[k] && t.f === "en") last = gi; });
    return last >= 0 ? al.spans[2 * last + 1] + 0.05 : Infinity;
  }

  function seek(t, play = false) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, t);
    update(a.currentTime);
    if (play && a.paused) a.play().catch(() => {});
  }

  // quadro a quadro enquanto toca
  useEffect(() => {
    if (!playing) return;
    let raf;
    const tick = () => {
      const a = audioRef.current;
      if (a) update(a.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, update]);

  // ---------------------------------------------------------------- áudio
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.playbackRate = rate;
  }, [rate, track?.file]);

  useEffect(() => {
    savePrefs({ ...loadPrefs(), rate, mode, showPt, size });
  }, [rate, mode, showPt, size]);

  const flushListen = useCallback((complete) => {
    if (!track) return;
    const secs = playedSec.current;
    if (secs < 3 && !complete) return;
    playedSec.current = 0;
    if (complete && listenedSent.current.has(track.file)) { complete = false; }
    if (complete) listenedSent.current.add(track.file);
    post("/api/ingles/progress", { op: "listen", lesson: lesson.id, file: track.file, seconds: secs, complete }).then(() => complete && onProgress?.()).catch(() => {});
  }, [lesson.id, track?.file]);

  useEffect(() => () => flushListen(false), [flushListen]);
  useEffect(() => { setPlaying(false); setTime(0); playedSec.current = 0; }, [lesson.id, track?.file]);

  function onPlay() { setPlaying(true); follow.current = true; lastTick.current = performance.now(); }
  function onPause() { setPlaying(false); flushListen(false); }
  function onEnded() { setPlaying(false); flushListen(true); }
  function onTimeUpdate() {
    const a = audioRef.current;
    if (!a) return;
    const now = performance.now();
    if (!a.paused) playedSec.current += Math.min(1, (now - lastTick.current) / 1000);
    lastTick.current = now;
    if (a.duration && a.currentTime / a.duration >= 0.85 && !listenedSent.current.has(track.file)) flushListen(true);
    if (a.paused) update(a.currentTime);
  }

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }

  useEffect(() => {
    const h = (e) => {
      if (e.code !== "Space" || e.target.closest?.("input, textarea, select, button, [contenteditable]")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  function jumpBlock(dir) {
    const bt = blockTracker.current;
    if (!bt) return seek((audioRef.current?.currentTime || 0) + dir * 5);
    const k = Math.max(0, Math.min(bt.bstart.length - 1, (bt.cur < 0 ? 0 : bt.cur) + dir));
    seek(bt.bstart[k], true);
  }

  // ---------------------------------------------------------------- palavra clicada
  // ---------------------------------------------------------------- trecho selecionado (expressão ou frase)
  const [selPop, setSelPop] = useState(null); // { text, bi, x, y, state }

  function readSelection() {
    const s = window.getSelection();
    const box = wrapRef.current;
    if (!s || s.isCollapsed || !box || !box.contains(s.anchorNode) || !box.contains(s.focusNode)) return setSelPop(null);
    const raw = s.toString().replace(/\s+/g, " ").trim();
    const text = raw.replace(/^[\s"'“”‘’,.;:!?()\-–—]+|[\s"“”,;:()\-–—]+$/g, "");
    if (!text || text.length > 140 || !/[A-Za-z]/.test(text)) return setSelPop(null);
    const el = (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement)?.closest("[data-bi]");
    if (!el) return setSelPop(null);
    const r = s.getRangeAt(0).getBoundingClientRect();
    const b = box.getBoundingClientRect();
    setPop(null);
    setSelPop({ text, bi: Number(el.dataset.bi), x: r.left - b.left + r.width / 2, y: r.top - b.top + box.scrollTop, state: "idle" });
  }

  async function saveSelection(withAi) {
    const sp = selPop;
    const b = lesson.blocks[sp.bi];
    setSelPop({ ...sp, state: "saving" });
    try {
      const r = await post("/api/ingles/words", { word: sp.text, context: b.en, translation: b.pt || b.def || "", lesson: `${lesson.groupTitle} · ${lesson.title}`, lessonId: lesson.id });
      onWordSaved?.();
      if (!withAi) return setSelPop({ ...sp, state: "saved" });
      setSelPop({ ...sp, state: "generating" });
      await post("/api/ingles/contexts", { ids: [r.item.id], n: 3 });
      onWordSaved?.();
      setSelPop({ ...sp, state: "generated" });
    } catch (e) {
      setSelPop({ ...sp, state: "error", error: e.message });
    }
  }

  function onTok(gi, e) {
    if (window.getSelection()?.toString().trim()) return; // arrastou para selecionar um trecho: não é clique de palavra
    e.stopPropagation();
    if (aligned && al.spans[2 * gi] >= 0) seek(al.spans[2 * gi], true);
    const box = wrapRef.current.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    setPop({ gi, x: r.left - box.left + r.width / 2, y: r.top - box.top + wrapRef.current.scrollTop });
    setSaved(null);
  }

  const savedSet = useMemo(() => new Set(savedWords.map((w) => w.word.toLowerCase())), [savedWords]);

  async function saveWord() {
    const t = toks[pop.gi];
    const b = lesson.blocks[t.b];
    const word = t.w.replace(/'s$/i, "");
    await post("/api/ingles/words", { word, context: b.en, translation: b.pt || b.def || "", lesson: `${lesson.groupTitle} · ${lesson.title}`, lessonId: lesson.id });
    setSaved(word);
    onWordSaved?.();
  }

  // ---------------------------------------------------------------- render
  function renderField(bi, field, text) {
    const list = tokMap.get(`${bi}:${field}`);
    if (!list) return text;
    const out = [];
    let at = 0;
    for (const t of list) {
      if (t.i > at) out.push(text.slice(at, t.i));
      const lower = t.w.toLowerCase();
      out.push(
        <span
          key={t.gi}
          ref={(el) => { tokEls.current[t.gi] = el; }}
          className={`ing-tok${savedSet.has(lower) ? " saved" : ""}`}
          onClick={(e) => onTok(t.gi, e)}
        >
          {text.slice(t.i, t.i + t.n)}
        </span>
      );
      at = t.i + t.n;
    }
    if (at < text.length) out.push(text.slice(at));
    return out;
  }

  const blockRef = (bi) => (el) => { blockEls.current[bi] = el; if (el) el.dataset.bi = bi; };

  const body = (
    <div
      className={`ing-text mode-${mode}${showPt ? "" : " no-pt"}`}
      style={{ "--ing-fs": `${size}px` }}
      onClick={() => setPop(null)}
    >
      {rows.map((row, ri) => {
        if (row.kind === "h") return <h3 key={ri} className="ing-h">{lesson.blocks[row.items[0]].en}</h3>;
        if (row.kind === "note") return <p key={ri} className="ing-note">{lesson.blocks[row.items[0]].pt}</p>;
        if (row.kind === "par")
          return (
            <p key={ri} className="ing-par">
              {row.items.map((bi) => (
                <span key={bi} ref={blockRef(bi)} className="ing-sent">{renderField(bi, "en", lesson.blocks[bi].en)}{" "}</span>
              ))}
            </p>
          );
        if (row.kind === "words")
          return (
            <div key={ri} className="ing-words">
              {row.items.map((bi) => (
                <span key={bi} ref={blockRef(bi)} className="ing-wordchip">
                  <b>{renderField(bi, "en", lesson.blocks[bi].en)}</b>
                  <i>{lesson.blocks[bi].ipa}</i>
                </span>
              ))}
            </div>
          );
        if (row.kind === "card") {
          const b = lesson.blocks[row.items[0]];
          return (
            <div key={ri} className="ing-card" ref={blockRef(row.items[0])}>
              <div className="ing-card-front">{renderField(row.items[0], "en", b.en)}</div>
              {b.def && <div className="ing-card-def">{renderField(row.items[0], "def", b.def)}</div>}
              {b.back && <div className="ing-card-back">{renderField(row.items[0], "back", b.back)}</div>}
            </div>
          );
        }
        const bi = row.items[0];
        const b = lesson.blocks[bi];
        return (
          <div key={ri} className="ing-pair" ref={blockRef(bi)}>
            <div className="ing-en">{renderField(bi, "en", b.en)}</div>
            {b.pt && <div className="ing-pt">{b.pt}</div>}
          </div>
        );
      })}
    </div>
  );

  const popTok = pop ? toks[pop.gi] : null;
  const pct = dur ? (time / dur) * 100 : 0;

  return (
    <div className="ing-reader">
      <div className="ing-player">
        <div className="ing-player-top">
          <button type="button" className="ing-play" onClick={toggle} aria-label={playing ? "Pausar" : "Tocar"} title={playing ? "Pausar (espaço)" : "Tocar (espaço)"}>
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <div className="ing-seek">
            <input
              type="range" min={0} max={dur || 0} step={0.05} value={Math.min(time, dur || 0)}
              style={{ "--pct": `${pct}%` }}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Posição"
            />
            <div className="ing-seek-t"><span>{fmtTime(time)}</span><span>{fmtTime(dur)}</span></div>
          </div>
          <div className="ing-ctl">
            <button type="button" onClick={() => jumpBlock(-1)} title="Frase anterior" aria-label="Frase anterior"><SkipBack size={16} /></button>
            <button type="button" onClick={() => seek((audioRef.current?.currentTime || 0) - 5)} title="Voltar 5 s" aria-label="Voltar 5 segundos"><RotateCcw size={16} /></button>
            <button type="button" onClick={() => seek((audioRef.current?.currentTime || 0) + 5)} title="Avançar 5 s" aria-label="Avançar 5 segundos"><RotateCw size={16} /></button>
            <button type="button" onClick={() => jumpBlock(1)} title="Próxima frase" aria-label="Próxima frase"><SkipForward size={16} /></button>
            <button type="button" className={loopSent ? "on" : ""} onClick={() => setLoopSent((v) => !v)} title="Repetir a frase atual" aria-label="Repetir a frase atual" disabled={!aligned}><Repeat size={16} /></button>
          </div>
        </div>
        <div className="ing-player-bar">
          <label className="ing-sel" title="Voz">
            <Headphones size={14} />
            <select value={trackIdx} onChange={(e) => setTrackIdx(Number(e.target.value))}>
              {tracks.map((t, i) => <option key={t.file} value={i}>{t.label}</option>)}
            </select>
          </label>
          <div className="ing-seg" role="group" aria-label="Velocidade">
            {RATES.map((r) => <button key={r} type="button" className={r === rate ? "on" : ""} onClick={() => setRate(r)}>{r}x</button>)}
          </div>
          <div className="ing-seg" role="group" aria-label="Modo de leitura">
            {MODES.map((m) => (
              <button key={m.id} type="button" className={m.id === mode ? "on" : ""} onClick={() => setMode(m.id)} title={m.id === "karaoke" ? "Palavra falada destacada em tempo real" : m.id === "blind" ? "Esconde o inglês: treine só a escuta" : "Texto sem destaque"}>
                <m.icon size={14} /> {m.label}
              </button>
            ))}
          </div>
          {lesson.blocks.some((b) => b.pt) && (
            <button type="button" className={`ing-chip${showPt ? " on" : ""}`} onClick={() => setShowPt((v) => !v)}><Languages size={14} /> Português</button>
          )}
          <div className="ing-seg" role="group" aria-label="Tamanho do texto">
            <button type="button" onClick={() => setSize((s) => Math.max(14, s - 2))} aria-label="Diminuir texto">A-</button>
            <button type="button" onClick={() => setSize((s) => Math.min(30, s + 2))} aria-label="Aumentar texto">A+</button>
          </div>
        </div>
        <div className="ing-mode-note">
          {track?.mode === "aligned" && al && aligned && <span><Sparkles size={12} /> Karaokê sincronizado ({Math.round(al.coverage * 100)}% das palavras casadas com a fala)</span>}
          {track?.mode === "live" && <span>O texto do curso não acompanha a fala desta aula; o karaokê usa a transcrição automática do áudio.</span>}
          {track?.mode === "none" && <span>Este áudio ainda não foi sincronizado; leitura sem destaque.</span>}
        </div>
        <audio
          ref={audioRef}
          src={track ? audioUrl(track.file) : undefined}
          preload="metadata"
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
          onTimeUpdate={onTimeUpdate}
          onSeeked={() => update(audioRef.current.currentTime)}
          onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); e.currentTarget.playbackRate = rate; }}
        />
      </div>

      <div
        className="ing-scroll"
        ref={wrapRef}
        onWheel={() => { follow.current = false; }}
        onTouchMove={() => { follow.current = false; }}
        onMouseUp={() => setTimeout(readSelection, 20)}
        onTouchEnd={() => setTimeout(readSelection, 250)}
        onKeyUp={(e) => e.shiftKey && setTimeout(readSelection, 20)}
      >
        {live && mode !== "blind" && (
          <div className="ing-live" style={{ "--ing-fs": `${size}px` }}>
            <div className="ing-live-h">Transcrição automática do áudio</div>
            <p>
              {al.words.map((w, i) => (
                <span key={i} ref={(el) => { liveEls.current[i] = el; }} className="ing-tok" onClick={() => seek(w[1], true)}>{w[0]} </span>
              ))}
            </p>
          </div>
        )}
        {body}
        {pop && popTok && (
          <div className="ing-pop" style={{ left: pop.x, top: pop.y }} onClick={(e) => e.stopPropagation()}>
            <b>{popTok.w}</b>
            {lesson.blocks[popTok.b].pt && <span className="ing-pop-pt">{lesson.blocks[popTok.b].pt}</span>}
            {saved || savedSet.has(popTok.w.toLowerCase()) ? (
              <span className="ing-pop-ok"><Check size={13} /> No reforço</span>
            ) : (
              <button type="button" onClick={saveWord}><Plus size={13} /> Adicionar ao reforço</button>
            )}
          </div>
        )}
        {selPop && (
          <div className="ing-pop sel" style={{ left: selPop.x, top: selPop.y }} onClick={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()}>
            <b>“{selPop.text}”</b>
            <span className="ing-pop-pt">{selPop.text.split(/\s+/).length > 1 ? "Expressão ou frase" : "Palavra"}</span>
            {selPop.state === "idle" && (
              <div className="ing-pop-row">
                <button type="button" onClick={() => saveSelection(false)}><Plus size={13} /> Reforço</button>
                <button type="button" className="ai" onClick={() => saveSelection(true)}><Wand2 size={13} /> Reforço + novos contextos</button>
              </div>
            )}
            {selPop.state === "saving" && <span className="ing-pop-pt">Salvando…</span>}
            {selPop.state === "generating" && <span className="ing-pop-pt">Gerando contextos com IA (até 1 min)…</span>}
            {(selPop.state === "saved" || selPop.state === "generated") && (
              <span className="ing-pop-ok"><Check size={13} /> {selPop.state === "generated" ? "Contextos prontos" : "No reforço"}{" "}
                {onOpenReforco && <button type="button" className="lnk" onClick={onOpenReforco}>ver</button>}
              </span>
            )}
            {selPop.state === "error" && <span className="ing-pop-err">{selPop.error}</span>}
          </div>
        )}
        <div style={{ height: 120 }} />
      </div>
    </div>
  );
}
