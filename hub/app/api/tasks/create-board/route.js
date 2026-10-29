import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";
import { generateId, nowIso } from "@/lib/ids";

// Direct write: board cru (só nome, cor padrão) via o "+" ao lado das abas
// de quadro — mesmo padrão de "+ Adicionar lista"/"+ Adicionar cartão".
// Configurar um board já com cor e uma leva de listas pensadas continua
// sendo só o chat (ver CLAUDE.md).
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { name } = body ?? {};
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const maxOrder = data.boards.reduce((max, b) => Math.max(max, b.order), -1);

  const board = {
    id: generateId("board"),
    name: trimmedName,
    color: "blue",
    order: maxOrder + 1,
    archived: false,
    createdAt: nowIso(),
  };
  data.boards.push(board);

  await writeTasks(data);
  return NextResponse.json({ ok: true, board });
}
