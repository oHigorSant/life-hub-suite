import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { listId, name } = body ?? {};
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (typeof listId !== "string" || !trimmedName) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const list = data.lists.find((l) => l.id === listId);
  if (!list) {
    return NextResponse.json({ error: "Lista não encontrada." }, { status: 404 });
  }

  list.name = trimmedName;

  await writeTasks(data);
  return NextResponse.json({ ok: true });
}
