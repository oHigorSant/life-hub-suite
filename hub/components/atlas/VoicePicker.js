"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "./ui.js";
import { Play } from "./icons.js";

const SPEEDS = [0.85, 1, 1.15, 1.3];
const KEY = "atlas.voice";

/** Escolha de voz (Ana e Beto) e velocidade, com pré-escuta. onChange({voiceA, voiceB, speed}). */
export default function VoicePicker({ onChange }) {
  const [info, setInfo] = useState(null);
  const [v, setV] = useState({ voiceA: "", voiceB: "", speed: 1 });
  const [playing, setPlaying] = useState("");
  const [err, setErr] = useState("");
  const audio = useRef();

  useEffect(() => {
    api("/api/estudos/voices").then((d) => {
      setInfo(d);
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
      const ids = new Set(d.voices.map((x) => x.id));
      const pick = (want, i) => (ids.has(want) ? want : d.voices[i]?.id || d.voices[0]?.id || "");
      setV({ voiceA: pick(saved.voiceA, 0), voiceB: pick(saved.voiceB, 1), speed: saved.speed || 1 });
    }).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!v.voiceA) return;
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {}
    onChange?.(v);
  }, [v]); // eslint-disable-line

  async function preview(which) {
    const voice = which === "A" ? v.voiceA : v.voiceB;
    if (!voice) return;
    setErr("");
    audio.current?.pause();
    setPlaying(which);
    try {
      const res = await fetch("/api/estudos/tts/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice, speed: v.speed }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => setPlaying("");
      await a.play();
    } catch (e) {
      setErr(e.message);
      setPlaying("");
    }
  }

  if (!info) return <div className="skeleton" style={{ height: 120 }} />;
  const groups = [["voicestudio", "VoiceStudio"], ["piper", "Piper (local, reserva)"]];
  const Select = ({ label, k, which }) => (
    <div className="field" style={{ marginBottom: 14 }}>
      <label className="label">{label}</label>
      <div className="row nowrap" style={{ gap: 8 }}>
        <select className="select" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })}>
          {groups.map(([eng, name]) => {
            const vs = info.voices.filter((x) => x.engine === eng);
            return vs.length ? <optgroup key={eng} label={name}>{vs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup> : null;
          })}
        </select>
        <button type="button" className="btn" style={{ flex: "none" }} onClick={() => preview(which)} disabled={!v[k] || !!playing} aria-label={`Ouvir ${label}`}>{playing === which ? <span className="spinner" /> : <Play size={15} />}</button>
      </div>
    </div>
  );

  return (
    <div style={{ textAlign: "left" }}>
      {!info.voicestudio.up && (
        <div className="hint" style={{ marginBottom: 12, color: "var(--gold)" }}>
          VoiceStudio offline em {info.voicestudio.url}. {info.piper.available ? "Só as vozes Piper (reserva) estão disponíveis." : "Nenhuma voz disponível."}
        </div>
      )}
      {info.voices.length === 0 ? <div className="muted">Nenhuma voz disponível no momento.</div> : (
        <>
          <Select label="Voz da Ana" k="voiceA" which="A" />
          <Select label="Voz do Beto" k="voiceB" which="B" />
          <div className="field" style={{ marginBottom: 6 }}>
            <label className="label">Velocidade · {v.speed.toFixed(2).replace(/0$/, "")}×</label>
            <div className="seg">{SPEEDS.map((s) => <button key={s} type="button" className={v.speed === s ? "on" : ""} onClick={() => setV({ ...v, speed: s })}>{s}×</button>)}</div>
          </div>
        </>
      )}
      {err && <div style={{ color: "var(--red)", fontSize: 13.5, marginTop: 8 }}>{err}</div>}
    </div>
  );
}
