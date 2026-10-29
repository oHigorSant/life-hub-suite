import { NextResponse } from "next/server";
import { sweepStaleJobs } from "./jobs.js";

const g = globalThis;
if (!g.__atlasBooted && process.env.NEXT_PHASE !== "phase-production-build") {
  g.__atlasBooted = true;
  try {
    sweepStaleJobs();
  } catch (e) {
    console.error("[boot]", e);
  }
}

export const ok = (data = {}, status = 200) => NextResponse.json(data, { status });
export const fail = (message, status = 400) => NextResponse.json({ error: message }, { status });

/** Envolve um handler: resolve params (Next 16: Promise) e converte exceções em JSON de erro. */
export function route(fn) {
  return async (request, ctx) => {
    try {
      const params = ctx?.params ? await ctx.params : {};
      return await fn(request, params);
    } catch (e) {
      console.error(`[api ${request.method} ${request.nextUrl?.pathname}]`, e);
      return fail(String(e?.message || e), e?.status || 500);
    }
  };
}

export const dynamic = "force-dynamic";
