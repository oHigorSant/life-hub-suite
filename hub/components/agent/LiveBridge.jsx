"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Timer, BellRing, X } from "lucide-react";
import { subscribeLive } from "@/components/live/liveClient.js";
import { useTimeState, beep, notify, primeAudio } from "@/components/agenda/timeEngine.js";
import { fmtDuration } from "@/components/agenda/dates.js";
import "./agent.css";

/**
 * Ligação global do app em tempo real (montada no layout raiz):
 *  - executa comandos de interface vindos do servidor/agente (ex.: abrir uma tela);
 *  - toca o alarme e avisa quando um temporizador/pomodoro termina (em qualquer tela);
 *  - mostra, em qualquer tela, o que está rodando (temporizador, pomodoro, cronômetro).
 */
export default function LiveBridge() {
  const pathname = usePathname();
  if (pathname?.startsWith("/login")) return null;
  return <LiveBridgeInner />;
}

function LiveBridgeInner() {
  const router = useRouter();
  const [toasts, setToasts] = useState([]);
  const { data, nowMs, remainingOf } = useTimeState();

  const pushToast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((l) => [...l.slice(-3), { id, ...t }]);
    if (!t.sticky) setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 6000);
  }, []);

  // o navegador só libera som depois de um gesto do usuário
  useEffect(() => {
    const prime = () => { primeAudio(); window.removeEventListener("pointerdown", prime); window.removeEventListener("keydown", prime); };
    window.addEventListener("pointerdown", prime);
    window.addEventListener("keydown", prime);
    return () => { window.removeEventListener("pointerdown", prime); window.removeEventListener("keydown", prime); };
  }, []);

  useEffect(() => subscribeLive((evt) => {
    if (evt.scope === "ui" && evt.action === "navigate" && typeof evt.to === "string" && evt.to.startsWith("/")) {
      router.push(evt.to);
    } else if (evt.scope === "alarm") {
      beep(evt.kind === "timer" ? 4 : 3);
      if (evt.kind === "timer") {
        const label = evt.label ? ` (${evt.label})` : "";
        notify("Temporizador", `O tempo acabou${label}.`);
        pushToast({ icon: "bell", title: "Temporizador terminou", text: evt.label || "O tempo acabou.", sticky: true });
      } else {
        const t = evt.finished === "focus" ? "Foco concluído" : "Pausa terminou";
        const x = evt.finished === "focus" ? "Hora de uma pausa." : "Vamos voltar ao foco?";
        notify(t, x);
        pushToast({ icon: "bell", title: t, text: x, sticky: true });
      }
    }
  }), [router, pushToast]);

  const running = [];
  if (data) {
    if (data.timer?.running) running.push({ k: "timer", label: data.timer.label ? `Timer · ${data.timer.label}` : "Timer", sec: remainingOf(data.timer) });
    if (data.pomo?.running) running.push({ k: "pomo", label: data.pomo.mode === "focus" ? "Foco" : "Pausa", sec: remainingOf(data.pomo) });
    if (data.stopwatch?.running) running.push({ k: "sw", label: "Cronômetro", sec: Math.floor((data.stopwatch.acc + (nowMs() - data.stopwatch.startedAt)) / 1000) });
  }

  return (
    <>
      {running.length > 0 && (
        <div className="lh-pills">
          {running.map((r) => (
            <Link key={r.k} href="/agenda?v=tempo" className="lh-pill" title="Abrir relógios">
              <Timer size={14} /> <span>{r.label}</span> <strong>{fmtDuration(r.sec)}</strong>
            </Link>
          ))}
        </div>
      )}
      <div className="lh-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="lh-toast">
            <BellRing size={18} />
            <div><strong>{t.title}</strong><span>{t.text}</span></div>
            <button type="button" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} aria-label="Fechar"><X size={14} /></button>
          </div>
        ))}
      </div>
    </>
  );
}
