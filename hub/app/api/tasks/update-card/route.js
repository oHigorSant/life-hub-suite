import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Edição direta de um card (duplo clique no título, ou no modal): título, descrição e datas.
// Campos ausentes não mudam; dueDate/startDate aceitam null para limpar.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { cardId, title, description, dueDate, startDate } = body ?? {};
  if (typeof cardId !== "string") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const card = data.cards.find((c) => c.id === cardId);
  if (!card) return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });

  if (title !== undefined) {
    const t = String(title).trim();
    if (!t) return NextResponse.json({ error: "O título não pode ficar vazio." }, { status: 400 });
    card.title = t.slice(0, 500);
  }
  if (description !== undefined) card.description = String(description).slice(0, 20000);
  for (const [key, value] of [["dueDate", dueDate], ["startDate", startDate]]) {
    if (value === undefined) continue;
    if (value === null || value === "") card[key] = null;
    else if (DATE_RE.test(String(value))) card[key] = String(value);
    else return NextResponse.json({ error: `${key} deve ser AAAA-MM-DD.` }, { status: 400 });
  }

  card.updatedAt = new Date().toISOString();
  await writeTasks(data);
  return NextResponse.json({ ok: true, card });
}
