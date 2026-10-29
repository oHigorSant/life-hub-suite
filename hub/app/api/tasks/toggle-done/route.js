import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

// Direct write: flips card.done. Independent of which list the card is in —
// see the `done` field note in CLAUDE.md's cards[] schema section.
// Guarda `completedAt` (quando foi concluído) para o histórico/consultas ("o que fiz entre os dias X e Y").
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
  card.done = !card.done;
  card.completedAt = card.done ? now : null;
  card.updatedAt = now;

  await writeTasks(data);
  return NextResponse.json({ ok: true, done: card.done });
}
