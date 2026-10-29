import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

// Área de trabalho (quadro): renomear e trocar o fundo por uma imagem (enviada para uploads/ ou uma URL https).
// bgImage = null remove a imagem e volta a valer a cor do quadro.
const UPLOAD_URL_RE = /^\/api\/uploads\/[^/\\]{1,200}$/;
const HTTPS_RE = /^https:\/\/[^\s"'<>()]{4,500}$/;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { boardId, name, bgImage } = body ?? {};
  if (typeof boardId !== "string") {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const board = data.boards.find((b) => b.id === boardId);
  if (!board) return NextResponse.json({ error: "Quadro não encontrado." }, { status: 404 });

  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) return NextResponse.json({ error: "O nome não pode ficar vazio." }, { status: 400 });
    board.name = n.slice(0, 80);
  }
  if (bgImage !== undefined) {
    if (bgImage === null || bgImage === "") board.bgImage = null;
    else if (UPLOAD_URL_RE.test(bgImage) || HTTPS_RE.test(bgImage)) board.bgImage = bgImage;
    else return NextResponse.json({ error: "Imagem inválida (use um arquivo enviado ou uma URL https)." }, { status: 400 });
  }

  await writeTasks(data);
  return NextResponse.json({ ok: true, board });
}
