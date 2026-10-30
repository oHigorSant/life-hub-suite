import { NextResponse } from "next/server";
import { readWords, writeWords, withSrs, reviewWord } from "@/lib/ingles/progress";
import { kindOfTerm } from "@/lib/ingles/terms";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const due = new URL(req.url).searchParams.get("due");
  const t = Date.now();
  const words = readWords().map(withSrs);
  return NextResponse.json(due ? words.filter((w) => w.due <= t).sort((a, b) => a.due - b.due) : words);
}

/** Salva (ou atualiza) uma palavra minerada. Entra na revisão espaçada (SM-2 do Atlas). */
export async function POST(req) {
  try {
    const { word: rawWord, context, translation, lesson, lessonId } = await req.json();
    const word = String(rawWord || "").replace(/\s+/g, " ").trim();
    if (!word) return NextResponse.json({ error: "Termo obrigatório" }, { status: 400 });
    if (word.length > 140) return NextResponse.json({ error: "Trecho longo demais (máx. 140 caracteres)." }, { status: 400 });
    const words = readWords();
    const i = words.findIndex((w) => w.word.toLowerCase() === word.toLowerCase());
    const now = new Date().toISOString();
    const item = withSrs({
      ...(i >= 0 ? words[i] : { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: now, level: "minerada" }),
      word,
      kind: kindOfTerm(word),
      context: context || (i >= 0 ? words[i].context : ""),
      translation: translation || (i >= 0 ? words[i].translation : ""),
      lesson: lesson || (i >= 0 ? words[i].lesson : ""),
      lessonId: lessonId || (i >= 0 ? words[i].lessonId : undefined),
      updatedAt: now,
    });
    if (i >= 0) words[i] = item;
    else words.unshift(item);
    writeWords(words);
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** { id, grade } — 0 errei, 1 difícil, 2 bom, 3 fácil */
export async function PATCH(req) {
  try {
    const { id, grade } = await req.json();
    return NextResponse.json({ ok: true, item: reviewWord(id, Number(grade)) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  writeWords(readWords().filter((w) => w.id !== id));
  return NextResponse.json({ ok: true });
}
