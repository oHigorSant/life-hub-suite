import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

// One-directional from the UI (archives). Unarchiving, if ever needed, goes
// through chat — asking to restore a specific card is rare enough not to
// need its own button. Guarda `archivedAt` para o histórico.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { cardId } = body ?? {};
  if (typeof cardId !== "string") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) {
    return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });
  }

  const now = new Date().toISOString();
  card.archived = true;
  card.archivedAt = now;
  card.updatedAt = now;

  await writeTasks(data);
  return NextResponse.json({ ok: true });
}
