import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

// Reorders a list among its siblings within the same board (lists don't
// move between boards). Full renumber, same approach as card move.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { listId, toIndex } = body ?? {};
  if (typeof listId !== "string" || typeof toIndex !== "number") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const list = data.lists.find((l) => l.id === listId);
  if (!list) {
    return NextResponse.json({ error: "Lista não encontrada." }, { status: 404 });
  }

  const siblings = data.lists
    .filter((l) => l.boardId === list.boardId && l.id !== listId)
    .sort((a, b) => a.order - b.order);
  const clampedIndex = Math.max(0, Math.min(toIndex, siblings.length));
  siblings.splice(clampedIndex, 0, list);
  siblings.forEach((l, i) => {
    l.order = i;
  });

  await writeTasks(data);
  return NextResponse.json({ ok: true });
}
