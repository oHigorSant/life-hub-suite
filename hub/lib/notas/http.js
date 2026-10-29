import { NextResponse } from "next/server";

export function json(data, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Envolve um handler de rota: converte exceções (com .status) em JSON de erro. */
export function handle(fn) {
  return async (request, ctx) => {
    try {
      return await fn(request, ctx);
    } catch (e) {
      const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
      if (status >= 500) console.error("[api notas]", e);
      return json({ error: String(e?.message || e) }, status);
    }
  };
}

export async function body(request) {
  try {
    return await request.json();
  } catch {
    const err = new Error("JSON inválido.");
    err.status = 400;
    throw err;
  }
}
