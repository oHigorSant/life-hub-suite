import { NextResponse } from "next/server";
import { loadLessons } from "@/lib/ingles/lessons";
import { computeState } from "@/lib/ingles/progress";
import { loadAlign, availableTypes, pickTrack } from "@/lib/ingles/practice";

export const dynamic = "force-dynamic";

const brief = (l, s) => ({
  id: l.id, group: l.group, phase: l.phase, kind: l.kind, part: l.part, title: l.title, order: l.order,
  words: l.words, minutes: l.minutes, audios: l.audios.length,
  status: s.status, percent: s.percent, mastery: s.mastery, locked: s.status === "locked",
  ...(l.branch ? { branch: l.branch, tier: l.tier, prereqs: s.prereqs, missing: s.missing } : {}),
});

export async function GET(req) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    const { data, state } = computeState();
    if (!id) {
      return NextResponse.json({
        phases: data.phases,
        groups: data.groups.map((g) => ({ id: g.id, phase: g.phase, title: g.title, kind: g.kind, lessons: g.lessons })),
        lessons: data.lessons.map((l) => brief(l, state[l.id])),
      });
    }
    const l = data.byId.get(id);
    if (!l) return NextResponse.json({ error: "Lição não encontrada" }, { status: 404 });
    const align = loadAlign(id);
    const tracks = l.audios.map((a) => {
      const t = align?.audios?.[a.file];
      return { file: a.file, label: a.label, voice: a.voice, accent: a.accent, coverage: t?.coverage ?? null, mode: !t ? "none" : t.words ? "live" : "aligned", duration: t?.duration ?? null };
    });
    const best = pickTrack(align, null);
    const g = data.groups.find((x) => x.id === l.group);
    const idx = g.lessons.indexOf(id);
    return NextResponse.json({
      lesson: { id: l.id, group: l.group, groupTitle: l.groupTitle, phase: l.phase, kind: l.kind, part: l.part, title: l.title, words: l.words, minutes: l.minutes, audios: l.audios.map(({ file, voice, accent, label }) => ({ file, voice, accent, label })), blocks: l.blocks },
      state: state[id],
      tracks,
      types: availableTypes(l, best),
      prev: idx > 0 ? g.lessons[idx - 1] : null,
      next: idx < g.lessons.length - 1 ? g.lessons[idx + 1] : null,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
