"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cpu } from "lucide-react";
import { useLive } from "@/components/live/liveClient.js";

const NAMES = { gemini: "Gemini", claude: "Claude", openrouter: "OpenRouter" };

/** Seletor compacto do motor de IA (Automático ou um específico). A configuração completa fica em /motores. */
export default function EnginePicker({ className = "" }) {
  const [st, setSt] = useState(null);
  const load = useCallback(() => {
    fetch("/api/agente/engines", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setSt(j)).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useLive(["engines"], load);
  if (!st) return null;
  const cfg = st.config;
  const value = cfg.mode === "auto" ? "auto" : cfg.manual.engine;
  async function change(v) {
    const config = v === "auto" ? { mode: "auto" } : { mode: "manual", manual: { engine: v } };
    setSt((s) => ({ ...s, config: { ...s.config, mode: config.mode, manual: { ...s.config.manual, ...(config.manual || {}) } } }));
    await fetch("/api/agente/engines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config }) }).catch(() => {});
    load();
  }
  const down = st.engines.filter((e) => e.enabled && !e.available).map((e) => NAMES[e.id]);
  return (
    <span className={`lh-engine ${className}`} title={down.length ? `Em espera: ${down.join(", ")}` : "Todos os motores disponíveis"}>
      <Cpu size={13} />
      <select value={value} onChange={(e) => change(e.target.value)} aria-label="Motor de IA">
        <option value="auto">Automático</option>
        {st.engines.map((e) => <option key={e.id} value={e.id}>{NAMES[e.id]}{e.enabled && !e.available ? " (espera)" : ""}</option>)}
      </select>
      <Link href="/motores" aria-label="Configurar motores" title="Configurar motores">···</Link>
    </span>
  );
}
