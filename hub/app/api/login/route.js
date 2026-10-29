import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// O app fica exposto na internet (Tailscale Funnel), então o login precisa
// aguentar tentativa em massa. Controle em memória (reinicia com o servidor):
// - por IP: 5 erros seguidos bloqueiam aquele IP por 15 min (429).
// - global: cada erro recente atrasa TODAS as tentativas um pouco mais (até
//   ~4s), sem bloquear o dono — um atacante com vários IPs fica lento, mas
//   ninguém consegue travar o login do usuário de fora.
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const g = globalThis;
const byIp = (g.__lhLoginIp ??= new Map()); // ip -> { fails, lockedUntil, last }
const recent = (g.__lhLoginRecent ??= []); // timestamps de erros recentes

function clientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "local";
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a ?? "")).digest();
  const hb = crypto.createHash("sha256").update(String(b ?? "")).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function prune(now) {
  while (recent.length && now - recent[0] > WINDOW_MS) recent.shift();
  if (byIp.size > 5000) {
    for (const [ip, s] of byIp) if (now - s.last > LOCK_MS) byIp.delete(ip);
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const password = process.env.LIFEHUB_PASSWORD;
  const token = process.env.LIFEHUB_AUTH_TOKEN;
  if (!password || !token) {
    return NextResponse.json(
      { error: "Servidor sem LIFEHUB_PASSWORD/LIFEHUB_AUTH_TOKEN configurados." },
      { status: 500 }
    );
  }

  const now = Date.now();
  prune(now);
  const ip = clientIp(request);
  const st = byIp.get(ip) ?? { fails: 0, lockedUntil: 0, last: now };

  if (st.lockedUntil > now) {
    const retry = Math.ceil((st.lockedUntil - now) / 1000);
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos." },
      { status: 429, headers: { "Retry-After": String(retry) } }
    );
  }

  // Atraso base + atraso extra proporcional aos erros recentes (global).
  await new Promise((r) => setTimeout(r, 700 + Math.min(recent.length, 30) * 110));

  if (!safeEqual(body?.password, password)) {
    st.fails += 1;
    st.last = now;
    if (st.fails >= MAX_FAILS) {
      st.lockedUntil = now + LOCK_MS;
      st.fails = 0;
    }
    byIp.set(ip, st);
    recent.push(now);
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  byIp.delete(ip);

  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("lh_auth", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Atrás do Funnel o Next enxerga http interno; o proxy informa o https real
    // em x-forwarded-proto. Em HTTP puro (rede local) não dá pra exigir secure,
    // senão o cookie nem é salvo.
    secure: proto === "https",
    maxAge: 60 * 60 * 24 * 60,
  });
  return res;
}
