import { NextResponse } from "next/server";
import { overview } from "@/lib/ingles/progress";

export const dynamic = "force-dynamic";

/** Resumo para o widget da Home (mantém os campos antigos e acrescenta nível, sequência e revisões). */
export async function GET() {
  try {
    const o = overview();
    return NextResponse.json({
      totalLessons: o.totals.lessons,
      completed: o.totals.passed,
      mastered: o.totals.mastered,
      savedWords: o.totals.words,
      dueWords: o.plan.dueWords,
      currentPhase: o.phases.find((p) => !p.graduated)?.name || "Concluído",
      currentLesson: o.current?.title || "",
      currentId: o.current?.id || null,
      level: o.level,
      streak: o.streak,
      today: o.today,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
