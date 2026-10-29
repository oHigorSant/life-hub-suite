"use client";

import { useCallback, useEffect, useState } from "react";
import Board from "@/components/Board";
import ChatPanel from "@/components/ChatPanel";
import { useLive } from "@/components/live/liveClient.js";

export default function TasksClient() {
  const [tasksData, setTasksData] = useState(null);
  const [error, setError] = useState(null);
  // No celular só cabe uma view por vez; no desktop o CSS ignora isso e
  // mostra quadro e chat lado a lado como sempre.
  const [view, setView] = useState("board");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasksData(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // o que o agente (ou outra aba) mudar em tarefas aparece na hora
  useLive(["tasks"], refresh);

  return (
    <div className={`app-shell view-${view}`}>
      <Board tasksData={tasksData} error={error} onChange={refresh} />
      <ChatPanel onMessageHandled={refresh} />
      {/* Só aparece em tela estreita (ver media query no globals.css) */}
      <nav className="mobile-tabs">
        <button
          type="button"
          className={view === "board" ? "active" : ""}
          onClick={() => setView("board")}
        >
          Quadro
        </button>
        <button
          type="button"
          className={view === "chat" ? "active" : ""}
          onClick={() => setView("chat")}
        >
          Chat
        </button>
      </nav>
    </div>
  );
}
