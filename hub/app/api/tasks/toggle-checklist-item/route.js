import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

// Direct write, no chat round-trip — same tier as drag-and-drop. Flips a
// single checklist item's `done`. See CLAUDE.md for the full list of
// structural actions the frontend is allowed to write on its own.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { cardId, itemId } = body ?? {};
  if (typeof cardId !== "string" || typeof itemId !== "string") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) {
    return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });
  }
  const item = (card.checklist ?? []).find((i) => i.id === itemId);
  if (!item) {
    return NextResponse.json({ error: "Item de checklist não encontrado." }, { status: 404 });
  }

  item.done = !item.done;
  card.updatedAt = new Date().toISOString();

  await writeTasks(data);
  return NextResponse.json({ ok: true, done: item.done });
}
