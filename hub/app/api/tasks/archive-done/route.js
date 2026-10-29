import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

// Limpar concluídas: leva para o arquivo (archived=true, nada é apagado) todos os cards com check
// do quadro (boardId) ou de uma lista (listId). O histórico fica consultável pelo agente.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { boardId, listId } = body ?? {};
  if (typeof boardId !== "string" && typeof listId !== "string") {
    return NextResponse.json({ error: "Informe boardId ou listId." }, { status: 400 });
  }

  const data = await readTasks();
  const now = new Date().toISOString();
  let count = 0;
  for (const c of data.cards) {
    if (c.archived || !c.done) continue;
    if (typeof listId === "string" ? c.listId !== listId : c.boardId !== boardId) continue;
    c.archived = true;
    c.archivedAt = now;
    c.updatedAt = now;
    count += 1;
  }
  if (count > 0) await writeTasks(data);
  return NextResponse.json({ ok: true, count });
}
