"use client";

import { Fragment, useRef, useState } from "react";
import TaskCard from "@/components/TaskCard";
import { LIST_PASTEL_COLORS } from "@/lib/constants";

const LIST_COLOR_NAMES = Object.keys(LIST_PASTEL_COLORS);

export default function BoardList({
  list,
  cards,
  labelsById,
  isMobileActive,
  draggingCardId,
  cardDragOver,
  onCardPointerDown,
  shouldSuppressClick,
  onOpenCard,
  onListHeaderDragStart,
  onListHeaderDragEnd,
  onListColumnDragOver,
  onListColumnDrop,
  showDropBefore,
  showDropAfter,
  isDraggingThisList,
  onChange,
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(list.name);
  const [addingCard, setAddingCard] = useState(false);
  const [cardTitleDraft, setCardTitleDraft] = useState("");
  const [insertAt, setInsertAt] = useState(null); // posição (0..n) em que o usuário está criando um card no meio da lista
  const [insertDraft, setInsertDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const cardInputRef = useRef(null);

  const isDragOverCards = cardDragOver?.listId === list.id;
  const doneCount = cards.filter((c) => c.done).length;

  // Posição de cada card dentro de "cards menos o que está sendo arrastado" — é o que o servidor indexa.
  const filteredIndex = new Map();
  for (const c of cards) {
    if (c.id === draggingCardId) continue;
    filteredIndex.set(c.id, filteredIndex.size);
  }
  const filteredCount = filteredIndex.size;

  async function commitRename() {
    const trimmed = nameDraft.trim();
    setEditingName(false);
    if (!trimmed || trimmed === list.name) {
      setNameDraft(list.name);
      return;
    }
    await fetch("/api/tasks/rename-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: list.id, name: trimmed }),
    });
    onChange();
  }

  async function submitNewCard() {
    const trimmed = cardTitleDraft.trim();
    if (!trimmed) {
      setAddingCard(false);
      return;
    }
    setCardTitleDraft("");
    await fetch("/api/tasks/create-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: list.id, title: trimmed }),
    });
    onChange();
    cardInputRef.current?.focus();
  }

  async function submitInsert() {
    const trimmed = insertDraft.trim();
    const at = insertAt;
    setInsertDraft("");
    setInsertAt(null);
    if (!trimmed || at == null) return;
    await fetch("/api/tasks/create-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: list.id, title: trimmed, index: at }),
    });
    onChange();
  }

  async function setListColor(color) {
    setMenuOpen(false);
    if (color === list.color) return;
    await fetch("/api/tasks/set-list-color", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: list.id, color }),
    });
    onChange();
  }

  async function archiveList() {
    setMenuOpen(false);
    await fetch("/api/tasks/archive-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: list.id }),
    });
    onChange();
  }

  async function clearDone() {
    setMenuOpen(false);
    if (!doneCount || !confirm(`Levar ${doneCount} tarefa(s) concluída(s) desta lista para o arquivo?`)) return;
    await fetch("/api/tasks/archive-done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listId: list.id }),
    });
    onChange();
  }

  // Zona entre dois cards: ao passar o mouse aparece um "+" para criar uma tarefa ali.
  const insertSlot = (position) =>
    insertAt === position ? (
      <div className="list-add-card-form list-insert-form">
        <textarea
          autoFocus
          rows={2}
          value={insertDraft}
          placeholder="Título do cartão..."
          onChange={(e) => setInsertDraft(e.target.value)}
          onBlur={() => (insertDraft.trim() ? submitInsert() : (setInsertAt(null), setInsertDraft("")))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitInsert(); }
            if (e.key === "Escape") { setInsertDraft(""); setInsertAt(null); }
          }}
        />
      </div>
    ) : (
      <div className="card-insert" onClick={() => { setInsertAt(position); setInsertDraft(""); }}>
        <button type="button" className="card-insert-btn" aria-label="Adicionar cartão aqui" tabIndex={-1}>+</button>
      </div>
    );

  return (
    <div
      data-list-id={list.id}
      className={`board-list${isDragOverCards ? " drag-over" : ""}${
        showDropBefore ? " list-drop-before" : ""
      }${showDropAfter ? " list-drop-after" : ""}${isDraggingThisList ? " list-dragging" : ""}${
        isMobileActive ? " mobile-active" : ""
      }`}
      style={list.color ? { background: LIST_PASTEL_COLORS[list.color] } : undefined}
      onDragOver={onListColumnDragOver}
      onDrop={onListColumnDrop}
    >
      <div
        className="board-list-header"
        draggable
        onDragStart={onListHeaderDragStart}
        onDragEnd={onListHeaderDragEnd}
      >
        {editingName ? (
          <input
            className="list-name-input"
            value={nameDraft}
            autoFocus
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              }
              if (e.key === "Escape") {
                setNameDraft(list.name);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <span onClick={() => setEditingName(true)}>{list.name}</span>
        )}
        <span className="board-list-count">{cards.length}</span>
        <button
          type="button"
          className="list-menu-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Opções da lista"
        >
          ...
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="list-menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="list-menu-popover">
            <div className="list-menu-title">Cor da lista</div>
            <div className="list-menu-swatches">
              <button
                type="button"
                className={`list-color-swatch list-color-none${!list.color ? " active" : ""}`}
                onClick={() => setListColor(null)}
                aria-label="Sem cor"
              />
              {LIST_COLOR_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`list-color-swatch${list.color === name ? " active" : ""}`}
                  style={{ background: LIST_PASTEL_COLORS[name] }}
                  onClick={() => setListColor(name)}
                  aria-label={name}
                />
              ))}
            </div>
            <button type="button" className="list-menu-archive" onClick={clearDone} disabled={!doneCount}>
              Limpar concluídas{doneCount ? ` (${doneCount})` : ""}
            </button>
            <button type="button" className="list-menu-archive" onClick={archiveList}>
              Arquivar lista
            </button>
          </div>
        </>
      )}

      <div className="board-list-cards">
        {cards.map((card, i) => {
          // Índice entre "cards menos o arrastado" — bate com o que o servidor calcula.
          const idx = filteredIndex.get(card.id);
          return (
            <Fragment key={card.id}>
              {idx !== undefined && (
                <div
                  className={`list-drop-indicator${
                    isDragOverCards && cardDragOver.index === idx ? " active" : ""
                  }`}
                />
              )}
              {!draggingCardId && insertSlot(i)}
              <TaskCard
                card={card}
                labelsById={labelsById}
                dragging={draggingCardId === card.id}
                onPointerDown={(e) => onCardPointerDown(e, card)}
                shouldSuppressClick={shouldSuppressClick}
                onClick={() => onOpenCard(card.id)}
                onChange={onChange}
              />
            </Fragment>
          );
        })}
        <div
          className={`list-drop-indicator${
            isDragOverCards && cardDragOver.index === filteredCount ? " active" : ""
          }`}
        />
      </div>

      {addingCard ? (
        <div className="list-add-card-form">
          <textarea
            ref={cardInputRef}
            autoFocus
            rows={2}
            value={cardTitleDraft}
            placeholder="Título do cartão..."
            onChange={(e) => setCardTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitNewCard();
              }
              if (e.key === "Escape") {
                setCardTitleDraft("");
                setAddingCard(false);
              }
            }}
          />
          <div className="list-add-card-actions">
            <button type="button" onClick={submitNewCard}>
              Adicionar
            </button>
            <button
              type="button"
              className="list-add-card-cancel"
              onClick={() => {
                setCardTitleDraft("");
                setAddingCard(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="list-add-card-trigger" onClick={() => setAddingCard(true)}>
          + Adicionar cartão
        </button>
      )}
    </div>
  );
}
