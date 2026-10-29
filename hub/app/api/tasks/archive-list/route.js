import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

// Soft-delete: archives the list AND cascades archived:true to its cards,
// so nothing is left invisible-but-not-archived. Nothing is actually
// erased — recoverable via chat if needed. Same non-destructive philosophy
// as archive-card.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { listId } = body ?? {};
  if (typeof listId !== "string") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const list = data.lists.find((l) => l.id === listId);
  if (!list) {
    return NextResponse.json({ error: "Lista não encontrada." }, { status: 404 });
  }

  list.archived = true;
  const now = new Date().toISOString();
  for (const card of data.cards) {
    if (card.listId === listId && !card.archived) {
      card.archived = true;
      card.updatedAt = now;
    }
  }

  await writeTasks(data);
  return NextResponse.json({ ok: true });
}
