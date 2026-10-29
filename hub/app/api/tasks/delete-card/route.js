import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

// Diferente de archive-card: isso remove o card de verdade de cards[], sem
// volta. Arquivar continua existindo pra quem só quer tirar da vista; isso
// aqui é pra quem realmente não quer guardar o card nem arquivado.
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
  const index = data.cards.findIndex((c) => c.id === cardId);
  if (index === -1) {
    return NextResponse.json({ error: "Card não encontrado." }, { status: 404 });
  }

  data.cards.splice(index, 1);

  await writeTasks(data);
  return NextResponse.json({ ok: true });
}
