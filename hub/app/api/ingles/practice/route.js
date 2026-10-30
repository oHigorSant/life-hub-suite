import { NextResponse } from "next/server";
import { buildPractice } from "@/lib/ingles/practice";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const p = new URL(req.url).searchParams;
    const out = buildPractice(p.get("lesson") || "", p.get("type") || "cloze", { n: Math.min(15, Number(p.get("n")) || 8), file: p.get("file") || undefined });
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
