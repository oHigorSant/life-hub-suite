import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

// The one write path the frontend owns directly: dragging a card to a
// different list or a different position. Everything else (creating,
// editing text, deleting) goes through chat. See CLAUDE.md.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { cardId, toListId, toIndex } = body ?? {};
  if (
    typeof cardId !== "string" ||
    typeof toListId !== "string" ||
    typeof toIndex !== "number"
  ) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) {
    return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });
  }
  const destList = data.lists.find((l) => l.id === toListId);
  if (!destList) {
    return NextResponse.json({ error: "Lista de destino não encontrada." }, { status: 404 });
  }

  const fromListId = card.listId;
  card.listId = toListId;
  card.boardId = destList.boardId;

  // Rebuild the destination list's order contiguously with the card inserted
  // at the requested index, then do the same for the source list if it
  // changed. Full renumber is simple and safe at this data scale.
  const destCards = data.cards
    .filter((c) => c.listId === toListId && c.id !== cardId)
    .sort((a, b) => a.order - b.order);
  const clampedIndex = Math.max(0, Math.min(toIndex, destCards.length));
  destCards.splice(clampedIndex, 0, card);
  destCards.forEach((c, i) => {
    c.order = i;
  });

  if (fromListId !== toListId) {
    const sourceCards = data.cards
      .filter((c) => c.listId === fromListId)
      .sort((a, b) => a.order - b.order);
    sourceCards.forEach((c, i) => {
      c.order = i;
    });
  }

  card.updatedAt = new Date().toISOString();

  await writeTasks(data);
  return NextResponse.json({ ok: true });
}
