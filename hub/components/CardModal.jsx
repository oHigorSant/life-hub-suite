"use client";

import { useEffect, useState } from "react";
import { LABEL_COLORS, BOARD_COLORS, RECURRENCE_LABELS, WEEKDAY_LABELS } from "@/lib/constants";

function formatDateLong(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CardModal({ card, list, board, boardLabels, boardLists, onClose, onChange }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card?.title ?? "");
  const [descDraft, setDescDraft] = useState(card?.description ?? "");

  useEffect(() => {
    setConfirmingDelete(false);
    setEditingTitle(false);
    setTitleDraft(card?.title ?? "");
    setDescDraft(card?.description ?? "");
  }, [card?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // edição direta: título, descrição e datas (só envia o campo que mudou)
  async function saveFields(fields) {
    const res = await fetch("/api/tasks/update-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, ...fields }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Não consegui salvar.");
    }
    onChange();
  }
  function commitTitle() {
    setEditingTitle(false);
    const t = titleDraft.trim();
    if (t && t !== card.title) saveFields({ title: t });
    else setTitleDraft(card.title);
  }

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!card) return null;

  const checklist = card.checklist ?? [];
  const checklistDone = checklist.filter((i) => i.done).length;
  const checklistPct = checklist.length > 0 ? Math.round((checklistDone / checklist.length) * 100) : 0;
  const isOverdue = Boolean(card.dueDate) && !card.done && card.dueDate < todayIso();
  const recurrenceLabel = RECURRENCE_LABELS[card.recurrence?.freq] ?? null;

  async function toggleLabel(labelId) {
    await fetch("/api/tasks/toggle-label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, labelId }),
    });
    onChange();
  }

  async function toggleChecklistItem(itemId) {
    await fetch("/api/tasks/toggle-checklist-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, itemId }),
    });
    onChange();
  }

  async function toggleDone() {
    await fetch("/api/tasks/toggle-done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    onChange();
  }

  // Drag-and-drop nativo (HTML5 DnD) não existe em toque — é limitação da
  // própria plataforma web, não dá pra "consertar" com CSS/JS pequeno. Esse
  // select cobre o mesmo resultado (mover card de lista) sem depender de
  // gesto de arrastar, e reusa a mesma rota que o drag do desktop já usa.
  async function moveToList(e) {
    const toListId = e.target.value;
    if (!toListId || toListId === card.listId) return;
    await fetch("/api/tasks/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, toListId, toIndex: 999999 }),
    });
    onChange();
  }

  async function archiveCard() {
    await fetch("/api/tasks/archive-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    onChange();
    onClose();
  }

  async function deleteCard() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    await fetch("/api/tasks/delete-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    onChange();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {card.cover && (
          <div className="modal-cover" style={{ background: LABEL_COLORS[card.cover.value] || BOARD_COLORS[card.cover.value] }} />
        )}

        <div className="modal-body">
          <div className="modal-header-row">
            {editingTitle ? (
              <textarea
                autoFocus
                className="modal-title-edit"
                rows={2}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitTitle(); }
                  if (e.key === "Escape") { e.stopPropagation(); setTitleDraft(card.title); setEditingTitle(false); }
                }}
              />
            ) : (
              <h2 className={`modal-title-click${card.done ? " done" : ""}`} onClick={() => setEditingTitle(true)} title="Clique para editar">{card.title}</h2>
            )}
            <button className="modal-close-btn" onClick={onClose} aria-label="Fechar" type="button">
              ×
            </button>
          </div>
          <div className="modal-subtitle">
            na lista{" "}
            {boardLists?.length > 1 ? (
              <select className="modal-move-select" value={card.listId} onChange={moveToList} aria-label="Mover para outra lista">
                {boardLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            ) : (
              <strong>{list?.name ?? "?"}</strong>
            )}
            {" "}· quadro {board?.name ?? "?"}
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className={`modal-done-toggle${card.done ? " active" : ""}`}
              onClick={toggleDone}
            >
              {card.done ? "Concluído" : "Marcar como concluído"}
            </button>
            <button type="button" className="modal-ghost-btn" onClick={archiveCard}>
              Arquivar
            </button>
            <button
              type="button"
              className={`modal-ghost-btn danger${confirmingDelete ? " confirming" : ""}`}
              onClick={deleteCard}
              onBlur={() => setConfirmingDelete(false)}
            >
              {confirmingDelete ? "Confirmar apagar?" : "Apagar"}
            </button>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Datas</div>
            <div className="modal-dates-row">
              <label className="modal-date-edit">
                Início
                <input type="date" value={card.startDate ?? ""} onChange={(e) => saveFields({ startDate: e.target.value || null })} />
              </label>
              <label className={`modal-date-edit${isOverdue ? " overdue" : ""}`}>
                Prazo
                <input type="date" value={card.dueDate ?? ""} onChange={(e) => saveFields({ dueDate: e.target.value || null })} />
              </label>
            </div>
          </div>

          {recurrenceLabel && (
            <div className="modal-section">
              <div className="modal-section-title">Recorrência</div>
              <div className="modal-subtitle">
                {recurrenceLabel}
                {card.recurrence.days?.length > 0 &&
                  ` (${card.recurrence.days.map((d) => WEEKDAY_LABELS[d]).join(", ")})`}
              </div>
            </div>
          )}

          <div className="modal-section">
            <div className="modal-section-title">Labels</div>
            {boardLabels.length === 0 ? (
              <div className="modal-hint">Nenhuma label neste quadro ainda — peça no chat pra criar uma.</div>
            ) : (
              <div className="modal-labels-row">
                {boardLabels.map((label) => {
                  const active = (card.labelIds ?? []).includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      className={`modal-label-chip${active ? "" : " inactive"}`}
                      style={{ background: LABEL_COLORS[label.color] || "#b3bac5" }}
                      onClick={() => toggleLabel(label.id)}
                    >
                      {label.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Descrição</div>
            <textarea
              className="modal-description-edit"
              rows={Math.min(12, Math.max(3, descDraft.split("\n").length + 1))}
              value={descDraft}
              placeholder="Adicione uma descrição mais detalhada…"
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={() => { if (descDraft !== (card.description ?? "")) saveFields({ description: descDraft }); }}
            />
          </div>

          {checklist.length > 0 && (
            <div className="modal-section">
              <div className="modal-section-title">
                Checklist · {checklistDone}/{checklist.length}
              </div>
              <div className="modal-progress-bar">
                <div className="modal-progress-fill" style={{ width: `${checklistPct}%` }} />
              </div>
              <div className="modal-checklist">
                {checklist.map((item) => (
                  <label key={item.id} className="modal-checklist-item">
                    <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(item.id)} />
                    <span className={item.done ? "done" : ""}>{item.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="modal-footer-hint">
            Clique no título para editar; descrição e datas salvam sozinhas. Checklist e labels novas
            também podem ser pedidas ao Claude.
          </div>
        </div>
      </div>
    </div>
  );
}
