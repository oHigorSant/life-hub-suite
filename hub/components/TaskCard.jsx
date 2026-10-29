"use client";

import { useEffect, useRef, useState } from "react";
import { LABEL_COLORS, BOARD_COLORS } from "@/lib/constants";

function formatDate(iso) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Clique abre o card; duplo clique (ou o lápis, que aparece no hover) edita o título ali mesmo.
// O arrastar é por ponteiro (feito no Board), então aqui só marcamos o card com data-card-id.
export default function TaskCard({ card, labelsById, dragging, onPointerDown, shouldSuppressClick, onClick, onChange }) {
  const labels = (card.labelIds || []).map((id) => labelsById[id]).filter(Boolean);
  const checklistTotal = card.checklist?.length || 0;
  const checklistDone = card.checklist?.filter((i) => i.done).length || 0;
  const isOverdue = Boolean(card.dueDate) && !card.done && card.dueDate < todayIso();
  const coverColor = card.cover ? LABEL_COLORS[card.cover.value] || BOARD_COLORS[card.cover.value] : null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.title);
  const clickTimer = useRef(null);
  const areaRef = useRef(null);

  useEffect(() => () => clearTimeout(clickTimer.current), []);
  useEffect(() => {
    if (editing && areaRef.current) {
      const el = areaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  async function handleToggleDone(e) {
    e.stopPropagation();
    await fetch("/api/tasks/toggle-done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    onChange();
  }

  function startEdit() {
    clearTimeout(clickTimer.current);
    setDraft(card.title);
    setEditing(true);
  }

  async function commitEdit() {
    const t = draft.trim();
    setEditing(false);
    if (!t || t === card.title) return;
    await fetch("/api/tasks/update-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, title: t }),
    });
    onChange();
  }

  // o 1º clique de um duplo clique não deve abrir o modal: espera um instante
  function handleClick(e) {
    if (editing || shouldSuppressClick?.()) return;
    if (e.target.closest("input, button, textarea")) return;
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(onClick, 210);
  }

  return (
    <div
      className={`task-card${dragging ? " dragging" : ""}${editing ? " editing" : ""}`}
      data-card-id={card.id}
      onPointerDown={editing ? undefined : onPointerDown}
      onClick={handleClick}
      onDoubleClick={(e) => { if (!e.target.closest("input, button, textarea")) startEdit(); }}
    >
      {coverColor && <div className="task-card-cover" style={{ background: coverColor }} />}
      {labels.length > 0 && (
        <div className="task-card-labels">
          {labels.map((label) => (
            <span
              key={label.id}
              className="task-card-label"
              style={{ background: LABEL_COLORS[label.color] || "#b3bac5" }}
              title={label.name}
            />
          ))}
        </div>
      )}
      <div className="task-card-title-row">
        <input
          type="checkbox"
          className="task-card-checkbox"
          checked={card.done}
          onClick={(e) => e.stopPropagation()}
          onChange={handleToggleDone}
        />
        {editing ? (
          <textarea
            ref={areaRef}
            className="task-card-edit"
            value={draft}
            rows={1}
            onChange={(e) => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
            onBlur={commitEdit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); }
              if (e.key === "Escape") { setDraft(card.title); setEditing(false); }
            }}
          />
        ) : (
          <div className={`task-card-title${card.done ? " done" : ""}`}>{card.title}</div>
        )}
        {!editing && (
          <button type="button" className="task-card-pencil" onClick={(e) => { e.stopPropagation(); startEdit(); }} aria-label="Editar título" title="Editar (ou dê dois cliques)">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          </button>
        )}
      </div>
      {(checklistTotal > 0 || card.dueDate) && (
        <div className="task-card-meta">
          {checklistTotal > 0 && (
            <span className="task-card-meta-item">
              {checklistDone}/{checklistTotal}
            </span>
          )}
          {card.dueDate && (
            <span className={`task-card-due${isOverdue ? " overdue" : ""}`}>
              {formatDate(card.dueDate)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
