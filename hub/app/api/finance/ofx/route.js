import { NextResponse } from "next/server";
import { previewOfx, commitOfx } from "@/lib/finance/ofxImport.js";

export const dynamic = "force-dynamic";

const fail = (e) => NextResponse.json({ error: String(e?.message || e) }, { status: e?.status && Number.isInteger(e.status) ? e.status : 500 });

// POST multipart { file, accountId? }  -> prévia (não grava)
// POST json { op: "commit", accountId | newAccount{name,type}, fileAccountId, rows[], fileName } -> grava os lançamentos
export async function POST(request) {
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const b = await request.json();
      if (b.op !== "commit") return NextResponse.json({ error: "Operação desconhecida." }, { status: 400 });
      return NextResponse.json(await commitOfx(b));
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Arquivo grande demais (máximo 10 MB)." }, { status: 413 });
    const preview = await previewOfx(Buffer.from(await file.arrayBuffer()), String(form.get("accountId") || "") || null);
    return NextResponse.json({ ...preview, fileName: file.name });
  } catch (e) {
    if (!e?.status) console.error("[finance ofx]", e);
    return fail(e);
  }
}
