"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BoardList from "@/components/BoardList";
import CardModal from "@/components/CardModal";
import { BOARD_COLORS, BOARD_SWATCH_COLORS } from "@/lib/constants";

const BOARD_COLOR_NAMES = Object.keys(BOARD_SWATCH_COLORS);

const LIST_DRAG_TYPE = "application/x-listid";
const ACTIVE_BOARD_KEY = "lh-active-board";

const post = (url, body) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function boardBackground(board) {
  if (board?.bgImage) {
    return `linear-gradient(rgba(9,30,66,.22), rgba(9,30,66,.22)), url("${board.bgImage}") center / cover no-repeat`;
  }
  return BOARD_COLORS[board?.color] || BOARD_COLORS.blue;
}

export default function Board({ tasksData, error, onChange }) {
  const [activeBoardId, setActiveBoardId] = useState(null);
  const [activeListId, setActiveListId] = useState(null);
  const [draggingCardId, setDraggingCardId] = useState(null);
  const [cardDragOver, setCardDragOver] = useState(null); // { listId, index }
  const [draggingListId, setDraggingListId] = useState(null);
  const [listDragOverIndex, setListDragOverIndex] = useState(null);
  const [openCardId, setOpenCardId] = useState(null);
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [addingBoard, setAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [renamingBoardId, setRenamingBoardId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [bgBusy, setBgBusy] = useState(false);
  const fileRef = useRef(null);

  // Espelhos síncronos do estado de arrastar (o drop pode chegar antes do React renderizar).
  const cardDragOverRef = useRef(null);
  const listDragOverIndexRef = useRef(null);
  const latest = useRef({ onChange });
  latest.current = { onChange };

  const boards = tasksData?.boards ?? [];
  const sortedBoards = useMemo(
    () => [...boards].filter((b) => !b.archived).sort((a, b) => a.order - b.order),
    [boards]
  );

  // lembra o quadro em que você estava
  useEffect(() => {
    try { const id = localStorage.getItem(ACTIVE_BOARD_KEY); if (id) setActiveBoardId(id); } catch {}
  }, []);
  useEffect(() => {
    if (sortedBoards.length === 0) return;
    if (!activeBoardId || !sortedBoards.some((b) => b.id === activeBoardId)) setActiveBoardId(sortedBoards[0].id);
  }, [activeBoardId, sortedBoards]);
  useEffect(() => {
    if (activeBoardId) { try { localStorage.setItem(ACTIVE_BOARD_KEY, activeBoardId); } catch {} }
  }, [activeBoardId]);

  const activeBoard = sortedBoards.find((b) => b.id === activeBoardId) ?? sortedBoards[0] ?? null;

  const labelsById = useMemo(() => {
    const map = {};
    for (const label of tasksData?.labels ?? []) map[label.id] = label;
    return map;
  }, [tasksData]);

  const listsForBoard = useMemo(() => {
    if (!activeBoard) return [];
    return (tasksData?.lists ?? [])
      .filter((l) => l.boardId === activeBoard.id && !l.archived)
      .sort((a, b) => a.order - b.order);
  }, [tasksData, activeBoard]);

  const displayLists = listsForBoard.filter((l) => l.id !== draggingListId);

  // Visualização segmentada do celular (uma lista por vez) precisa saber qual lista mostrar.
  useEffect(() => {
    if (listsForBoard.length === 0) {
      setActiveListId(null);
      return;
    }
    if (!listsForBoard.some((l) => l.id === activeListId)) {
      setActiveListId(listsForBoard[0].id);
    }
  }, [activeListId, listsForBoard]);

  const cardsByList = useMemo(() => {
    const map = {};
    for (const card of tasksData?.cards ?? []) {
      if (card.archived) continue;
      if (!map[card.listId]) map[card.listId] = [];
      map[card.listId].push(card);
    }
    for (const listId in map) map[listId].sort((a, b) => a.order - b.order);
    return map;
  }, [tasksData]);

  const doneInBoard = useMemo(
    () => (tasksData?.cards ?? []).filter((c) => !c.archived && c.done && c.boardId === activeBoard?.id).length,
    [tasksData, activeBoard]
  );

  const openCard = tasksData?.cards.find((c) => c.id === openCardId) ?? null;
  const openCardList = openCard ? tasksData?.lists.find((l) => l.id === openCard.listId) : null;
  const openCardBoard = openCard ? tasksData?.boards.find((b) => b.id === openCard.boardId) : null;
  const openCardBoardLabels = useMemo(
    () => (tasksData?.labels ?? []).filter((l) => l.boardId === openCard?.boardId),
    [tasksData, openCard]
  );

  // ---------- arrastar cards (por ponteiro, como no Trello) ----------
  // O arrastar nativo do HTML5 travava o card no estado "arrastando" quando um clique tinha um micro-movimento
  // ou a tela recarregava no meio. Aqui o estado é sempre limpo (pointerup/cancel/Esc/blur) e funciona também no toque.
  const dragRef = useRef(null);
  const suppressClickUntil = useRef(0);
  const dragApi = useRef(null);

  if (!dragApi.current) {
    const A = {};
    A.cleanup = (keepState = false) => {
      const d = dragRef.current;
      if (!d) return;
      clearTimeout(d.timer);
      cancelAnimationFrame(d.raf);
      d.ghost?.remove();
      document.body.classList.remove("lh-dragging");
      window.removeEventListener("pointermove", A.move);
      window.removeEventListener("pointerup", A.up);
      window.removeEventListener("pointercancel", A.cancel);
      window.removeEventListener("keydown", A.key);
      window.removeEventListener("blur", A.cancel);
      document.removeEventListener("touchmove", A.preventTouch);
      dragRef.current = null;
      if (!keepState) {
        cardDragOverRef.current = null;
        setCardDragOver(null);
        setDraggingCardId(null);
      }
    };
    A.preventTouch = (e) => { if (dragRef.current?.started) e.preventDefault(); };
    A.begin = () => {
      const d = dragRef.current;
      if (!d || d.started) return;
      d.started = true;
      const ghost = d.el.cloneNode(true);
      ghost.classList.add("task-card-ghost");
      ghost.classList.remove("dragging");
      Object.assign(ghost.style, { position: "fixed", left: "0", top: "0", width: `${d.rect.width}px`, pointerEvents: "none", zIndex: "1000", margin: "0" });
      document.body.appendChild(ghost);
      d.ghost = ghost;
      document.body.classList.add("lh-dragging");
      setDraggingCardId(d.cardId);
      navigator.vibrate?.(15);
      A.position();
      A.target();
      d.raf = requestAnimationFrame(A.loop);
    };
    A.position = () => {
      const d = dragRef.current;
      if (!d?.ghost) return;
      d.ghost.style.transform = `translate(${d.x - d.offsetX}px, ${d.y - d.offsetY}px) rotate(3deg)`;
    };
    A.target = () => {
      const d = dragRef.current;
      if (!d?.started) return;
      let listEl = null;
      for (const el of document.elementsFromPoint(d.x, d.y)) {
        if (el.classList?.contains("board-list")) { listEl = el; break; }
      }
      d.listCardsEl = listEl?.querySelector(".board-list-cards") ?? null;
      let next = null;
      if (listEl) {
        const cards = [...listEl.querySelectorAll(".task-card[data-card-id]")].filter((n) => n.dataset.cardId !== d.cardId);
        let index = cards.findIndex((n) => { const r = n.getBoundingClientRect(); return d.y < r.top + r.height / 2; });
        if (index === -1) index = cards.length;
        next = { listId: listEl.dataset.listId, index };
      }
      const cur = cardDragOverRef.current;
      if (cur?.listId !== next?.listId || cur?.index !== next?.index) {
        cardDragOverRef.current = next;
        setCardDragOver(next);
      }
    };
    A.loop = () => {
      const d = dragRef.current;
      if (!d?.started) return;
      const surface = document.querySelector(".board-surface");
      const edge = 70;
      const speed = (px) => Math.min(20, 3 + px / 5);
      if (surface) {
        const r = surface.getBoundingClientRect();
        if (d.x < r.left + edge) surface.scrollLeft -= speed(r.left + edge - d.x);
        else if (d.x > r.right - edge) surface.scrollLeft += speed(d.x - (r.right - edge));
      }
      if (d.listCardsEl) {
        const r = d.listCardsEl.getBoundingClientRect();
        if (d.y < r.top + 50) d.listCardsEl.scrollTop -= speed(r.top + 50 - d.y);
        else if (d.y > r.bottom - 50) d.listCardsEl.scrollTop += speed(d.y - (r.bottom - 50));
      }
      A.target();
      d.raf = requestAnimationFrame(A.loop);
    };
    A.move = (e) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.x = e.clientX;
      d.y = e.clientY;
      if (!d.started) {
        const dist = Math.hypot(d.x - d.startX, d.y - d.startY);
        if (d.pointerType === "touch") { if (dist > 10) A.cleanup(); } // arrastou o dedo antes do "segurar": é rolagem
        else if (dist > 5) A.begin();
        return;
      }
      A.position();
      A.target();
    };
    A.up = async (e) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const wasDragging = d.started;
      const cardId = d.cardId;
      const target = cardDragOverRef.current;
      A.cleanup(wasDragging); // se arrastou, mantém o marcador até a lista recarregar (sem "pulo")
      if (!wasDragging) return;
      suppressClickUntil.current = Date.now() + 350;
      try {
        if (target) {
          const res = await post("/api/tasks/move", { cardId, toListId: target.listId, toIndex: target.index });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        // o próximo refresh mostra o estado real
      }
      try { await latest.current.onChange(); } catch {}
      cardDragOverRef.current = null;
      setCardDragOver(null);
      setDraggingCardId(null);
    };
    A.cancel = () => A.cleanup();
    A.key = (e) => { if (e.key === "Escape") A.cleanup(); };
    dragApi.current = A;
  }

  function handleCardPointerDown(e, card) {
    if (e.button !== undefined && e.button !== 0) return;
    if (dragRef.current) return;
    if (e.target.closest("input, button, textarea, a")) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const A = dragApi.current;
    dragRef.current = {
      cardId: card.id, pointerId: e.pointerId, pointerType: e.pointerType,
      startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
      offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
      el, rect, started: false, ghost: null, timer: null, raf: 0, listCardsEl: null,
    };
    if (e.pointerType === "touch") dragRef.current.timer = setTimeout(A.begin, 300); // segurar para arrastar
    window.addEventListener("pointermove", A.move);
    window.addEventListener("pointerup", A.up);
    window.addEventListener("pointercancel", A.cancel);
    window.addEventListener("keydown", A.key);
    window.addEventListener("blur", A.cancel);
    document.addEventListener("touchmove", A.preventTouch, { passive: false });
  }

  useEffect(() => () => dragApi.current?.cleanup(), []);

  // ---------- arrastar listas (reordenar colunas) ----------

  function handleListHeaderDragStart(e, listId) {
    e.dataTransfer.setData(LIST_DRAG_TYPE, listId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingListId(listId);
  }

  function handleListHeaderDragEnd() {
    setDraggingListId(null);
    listDragOverIndexRef.current = null;
    setListDragOverIndex(null);
  }

  function handleListColumnDragOver(e, index) {
    if (!e.dataTransfer.types.includes(LIST_DRAG_TYPE)) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientX < rect.left + rect.width / 2;
    const value = before ? index : index + 1;
    listDragOverIndexRef.current = value;
    setListDragOverIndex(value);
  }

  async function handleListColumnDrop(e) {
    if (!e.dataTransfer.types.includes(LIST_DRAG_TYPE)) return;
    e.preventDefault();
    const listId = e.dataTransfer.getData(LIST_DRAG_TYPE);
    const targetIndex = listDragOverIndexRef.current ?? 0;
    listDragOverIndexRef.current = null;
    setDraggingListId(null);
    setListDragOverIndex(null);
    if (!listId) return;

    try {
      const res = await post("/api/tasks/reorder-list", { listId, toIndex: targetIndex });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onChange();
    } catch {
      // o próximo refresh mostra o estado real
    }
  }

  // ---------- quadro: cor, imagem, nome, limpar concluídas ----------

  async function setBoardColor(color) {
    if (!activeBoard) return;
    setBgPickerOpen(false);
    if (activeBoard.bgImage) await post("/api/tasks/update-board", { boardId: activeBoard.id, bgImage: null });
    if (color !== activeBoard.color) await post("/api/tasks/set-board-color", { boardId: activeBoard.id, color });
    onChange();
  }

  async function setBoardImage(value) {
    if (!activeBoard) return;
    setBgBusy(true);
    try {
      const res = await post("/api/tasks/update-board", { boardId: activeBoard.id, bgImage: value });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setImageUrl("");
      setBgPickerOpen(false);
      onChange();
    } catch (err) {
      alert(`Não consegui trocar o fundo: ${err.message}`);
    } finally {
      setBgBusy(false);
    }
  }

  async function uploadBoardImage(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Escolha uma imagem (PNG, JPG, WEBP ou GIF)."); return; }
    setBgBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await setBoardImage(`/api/uploads/${encodeURIComponent(j.filename)}`);
    } catch (err) {
      alert(`Falha ao enviar a imagem: ${err.message}`);
      setBgBusy(false);
    }
  }

  async function commitBoardRename() {
    const id = renamingBoardId;
    const name = renameDraft.trim();
    setRenamingBoardId(null);
    const board = boards.find((b) => b.id === id);
    if (!board || !name || name === board.name) return;
    await post("/api/tasks/update-board", { boardId: id, name });
    onChange();
  }

  async function clearDone() {
    if (!activeBoard || !doneInBoard) return;
    if (!confirm(`Levar ${doneInBoard} tarefa(s) concluída(s) deste quadro para o arquivo? (nada é apagado)`)) return;
    await post("/api/tasks/archive-done", { boardId: activeBoard.id });
    onChange();
  }

  async function submitNewList() {
    const trimmed = newListName.trim();
    if (!trimmed || !activeBoard) {
      setAddingList(false);
      return;
    }
    setNewListName("");
    setAddingList(false);
    await post("/api/tasks/create-list", { boardId: activeBoard.id, name: trimmed });
    onChange();
  }

  async function submitNewBoard() {
    const trimmed = newBoardName.trim();
    setNewBoardName("");
    setAddingBoard(false);
    if (!trimmed) return;
    const res = await post("/api/tasks/create-board", { name: trimmed });
    const data = await res.json();
    if (res.ok && data.board) setActiveBoardId(data.board.id);
    onChange();
  }

  if (error) {
    return (
      <div className="board-area" style={{ background: BOARD_COLORS.dark }}>
        <div className="board-empty">Erro ao carregar tarefas: {error}</div>
      </div>
    );
  }

  if (!tasksData) {
    return (
      <div className="board-area" style={{ background: BOARD_COLORS.blue }}>
        <div className="board-empty">Carregando...</div>
      </div>
    );
  }

  if (!activeBoard) {
    return (
      <div className="board-area" style={{ background: BOARD_COLORS.blue }}>
        <div className="board-empty">
          Nenhum quadro ainda. Peça no chat para criar o seu primeiro quadro.
        </div>
      </div>
    );
  }

  return (
    <div className="board-area" style={{ background: boardBackground(activeBoard) }}>
      <div className="board-topbar">
        <div className="board-topbar-tabs">
          {sortedBoards.map((board) =>
            renamingBoardId === board.id ? (
              <input
                key={board.id}
                autoFocus
                className="board-tab-new-input"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={commitBoardRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitBoardRename();
                  if (e.key === "Escape") setRenamingBoardId(null);
                }}
              />
            ) : (
              <button
                key={board.id}
                className={`board-tab${board.id === activeBoard.id ? " active" : ""}`}
                onClick={() => setActiveBoardId(board.id)}
                onDoubleClick={() => { setRenameDraft(board.name); setRenamingBoardId(board.id); }}
                title="Dois cliques para renomear"
              >
                {board.name}
              </button>
            )
          )}
          {addingBoard ? (
            <input
              autoFocus
              className="board-tab-new-input"
              value={newBoardName}
              placeholder="Nome do quadro..."
              onChange={(e) => setNewBoardName(e.target.value)}
              onBlur={submitNewBoard}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewBoard();
                if (e.key === "Escape") {
                  setNewBoardName("");
                  setAddingBoard(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="board-tab board-tab-new"
              onClick={() => setAddingBoard(true)}
              title="Novo quadro"
              aria-label="Novo quadro"
            >
              +
            </button>
          )}
        </div>
        <div className="board-topbar-actions">
          <button type="button" className="board-bg-btn" onClick={clearDone} disabled={!doneInBoard} title="Leva as tarefas com check para o arquivo">
            Limpar concluídas{doneInBoard ? ` (${doneInBoard})` : ""}
          </button>
          <button type="button" className="board-bg-btn" onClick={() => setBgPickerOpen((v) => !v)}>
            Alterar fundo
          </button>
        </div>
      </div>
      {bgPickerOpen && (
        <>
          <div className="board-bg-popover-backdrop" onClick={() => setBgPickerOpen(false)} />
          <div className="board-bg-popover">
            <div className="board-bg-popover-title">Nome do quadro</div>
            <form
              className="board-bg-row"
              onSubmit={async (e) => {
                e.preventDefault();
                const name = new FormData(e.currentTarget).get("name")?.toString().trim();
                if (name && name !== activeBoard.name) { await post("/api/tasks/update-board", { boardId: activeBoard.id, name }); onChange(); }
                setBgPickerOpen(false);
              }}
            >
              <input name="name" defaultValue={activeBoard.name} key={activeBoard.id} maxLength={80} />
              <button type="submit">Salvar</button>
            </form>

            <div className="board-bg-popover-title">Cor</div>
            <div className="board-bg-swatches">
              {BOARD_COLOR_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`board-bg-swatch${!activeBoard.bgImage && activeBoard.color === name ? " active" : ""}`}
                  style={{ background: BOARD_SWATCH_COLORS[name] }}
                  onClick={() => setBoardColor(name)}
                  aria-label={name}
                />
              ))}
            </div>

            <div className="board-bg-popover-title">Imagem de fundo</div>
            <div className="board-bg-row">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { uploadBoardImage(e.target.files?.[0]); e.target.value = ""; }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={bgBusy}>{bgBusy ? "Enviando…" : "Escolher imagem…"}</button>
              {activeBoard.bgImage && <button type="button" className="danger" onClick={() => setBoardImage(null)} disabled={bgBusy}>Remover</button>}
            </div>
            <form
              className="board-bg-row"
              onSubmit={(e) => { e.preventDefault(); if (imageUrl.trim()) setBoardImage(imageUrl.trim()); }}
            >
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="ou cole o link (https://…)" />
              <button type="submit" disabled={bgBusy || !imageUrl.trim()}>Usar</button>
            </form>
          </div>
        </>
      )}
      {/* Só aparece no celular (ver globals.css): cada lista vira uma aba. */}
      {displayLists.length > 1 && (
        <div className="mobile-list-tabs">
          {displayLists.map((list) => (
            <button
              key={list.id}
              type="button"
              className={`mobile-list-tab${list.id === activeListId ? " active" : ""}`}
              onClick={() => setActiveListId(list.id)}
            >
              {list.name}
              <span className="mobile-list-tab-count">{(cardsByList[list.id] ?? []).length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="board-surface">
        {displayLists.map((list, index) => (
          <BoardList
            key={list.id}
            list={list}
            cards={cardsByList[list.id] ?? []}
            labelsById={labelsById}
            isMobileActive={list.id === activeListId}
            draggingCardId={draggingCardId}
            cardDragOver={cardDragOver}
            onCardPointerDown={handleCardPointerDown}
            shouldSuppressClick={() => Date.now() < suppressClickUntil.current}
            onOpenCard={setOpenCardId}
            onListHeaderDragStart={(e) => handleListHeaderDragStart(e, list.id)}
            onListHeaderDragEnd={handleListHeaderDragEnd}
            onListColumnDragOver={(e) => handleListColumnDragOver(e, index)}
            onListColumnDrop={handleListColumnDrop}
            showDropBefore={listDragOverIndex === index}
            showDropAfter={listDragOverIndex === displayLists.length && index === displayLists.length - 1}
            isDraggingThisList={draggingListId === list.id}
            onChange={onChange}
          />
        ))}

        <div className="board-add-list">
          {addingList ? (
            <div className="list-add-card-form">
              <input
                autoFocus
                value={newListName}
                placeholder="Nome da lista..."
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNewList();
                  if (e.key === "Escape") {
                    setNewListName("");
                    setAddingList(false);
                  }
                }}
                onBlur={submitNewList}
              />
            </div>
          ) : (
            <button type="button" className="board-add-list-trigger" onClick={() => setAddingList(true)}>
              + Adicionar lista
            </button>
          )}
        </div>

        {listsForBoard.length === 0 && !addingList && (
          <div className="board-empty">Este quadro ainda não tem listas.</div>
        )}
      </div>
      {openCard && (
        <CardModal
          card={openCard}
          list={openCardList}
          board={openCardBoard}
          boardLabels={openCardBoardLabels}
          boardLists={listsForBoard}
          onClose={() => setOpenCardId(null)}
          onChange={onChange}
        />
      )}
    </div>
  );
}
