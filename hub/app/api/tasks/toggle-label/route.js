import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

// Direct write: applies or removes an EXISTING board label on a card.
// Creating a new label is still chat-only (see CLAUDE.md) — this only
// toggles membership in card.labelIds.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { cardId, labelId } = body ?? {};
  if (typeof cardId !== "string" || typeof labelId !== "string") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) {
    return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });
  }
  const label = data.labels.find((l) => l.id === labelId);
  if (!label) {
    return NextResponse.json({ error: "Label não encontrada." }, { status: 404 });
  }

  card.labelIds = card.labelIds ?? [];
  const idx = card.labelIds.indexOf(labelId);
  let applied;
  if (idx === -1) {
    card.labelIds.push(labelId);
    applied = true;
  } else {
    card.labelIds.splice(idx, 1);
    applied = false;
  }
  card.updatedAt = new Date().toISOString();

  await writeTasks(data);
  return NextResponse.json({ ok: true, applied });
}
