"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function currency(value) {
  return (value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function useTasksSummary() {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tasks", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const today = todayISO();
        const openCards = (data.cards ?? []).filter((c) => !c.archived && !c.done);
        const overdue = openCards.filter((c) => c.dueDate && c.dueDate < today);
        setSummary({ open: openCards.length, overdue: overdue.length });
      })
      .catch(() => setSummary({ open: null, overdue: null }));
    return () => { cancelled = true; };
  }, []);
  return summary;
}

function useFinanceSummary() {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const today = todayISO();
        const openBills = (data.bills ?? []).filter((b) => !b.archived && b.status !== "paid" && !b.hideFromForecast);
        const overdueTotal = openBills
          .filter((b) => b.dueDate < today || b.status === "overdue")
          .reduce((s, b) => s + b.amount, 0);
        const totalOpen = openBills.reduce((s, b) => s + b.amount, 0);
        setSummary({ totalOpen, overdueTotal });
      })
      .catch(() => setSummary({ totalOpen: null, overdueTotal: null }));
    return () => { cancelled = true; };
  }, []);
  return summary;
}

/**
 * Home / central do Life Hub — ponto de partida da ideia de montar a home
 * com as áreas que o usuário quer ver, em vez do quadro de tarefas abrir
 * direto na raiz. Por enquanto são cartões fixos com resumo ao vivo de cada
 * área; a customização (escolher/reordenar áreas, salvar workspaces) é o
 * próximo passo dessa mesma ideia, não desta leva.
 */
export default function HomeClient() {
  const tasksSummary = useTasksSummary();
  const financeSummary = useFinanceSummary();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="hub-shell">
      <div className="hub-scroll">
        <header className="hub-hero">
          <span className="hub-hero-eyebrow">{greeting}{USER_NAME ? `, ${USER_NAME}` : ""}</span>
          <h1>O que você quer ver agora?</h1>
        </header>

        <div className="hub-grid">
          <Link href="/tarefas" className="hub-card">
            <div className="hub-card-head">
              <span className="hub-card-icon tasks">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3.5" y="4.5" width="6" height="15" rx="1.5" />
                  <rect x="14.5" y="4.5" width="6" height="9" rx="1.5" />
                </svg>
              </span>
              <h2>Tarefas</h2>
            </div>
            {tasksSummary === null ? (
              <p className="hub-card-loading">Carregando…</p>
            ) : (
              <div className="hub-card-stats">
                <div className="hub-stat">
                  <strong>{tasksSummary.open}</strong>
                  <span>em aberto</span>
                </div>
                <div className={`hub-stat${tasksSummary.overdue > 0 ? " danger" : ""}`}>
                  <strong>{tasksSummary.overdue}</strong>
                  <span>atrasadas</span>
                </div>
              </div>
            )}
            <span className="hub-card-cta">Abrir quadro →</span>
          </Link>

          <Link href="/financas" className="hub-card">
            <div className="hub-card-head">
              <span className="hub-card-icon finance">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="18" height="13" rx="2" />
                  <path d="M3 10h18" />
                </svg>
              </span>
              <h2>Finanças</h2>
            </div>
            {financeSummary === null ? (
              <p className="hub-card-loading">Carregando…</p>
            ) : (
              <div className="hub-card-stats">
                <div className="hub-stat">
                  <strong>{currency(financeSummary.totalOpen)}</strong>
                  <span>em aberto</span>
                </div>
                <div className={`hub-stat${financeSummary.overdueTotal > 0 ? " danger" : ""}`}>
                  <strong>{currency(financeSummary.overdueTotal)}</strong>
                  <span>atrasado</span>
                </div>
              </div>
            )}
            <span className="hub-card-cta">Abrir painel →</span>
          </Link>

          <div className="hub-card hub-card-placeholder">
            <div className="hub-card-head">
              <span className="hub-card-icon placeholder">+</span>
              <h2>Próxima área</h2>
            </div>
            <p className="hub-card-loading">Metas, notas, estudos… peça no chat de qualquer área pra planejarmos a próxima.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
