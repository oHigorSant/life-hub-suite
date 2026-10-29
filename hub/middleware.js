import { NextResponse } from "next/server";

// Portão de autenticação. Roda antes de qualquer rota que casar com o
// matcher lá embaixo.
//
// O cookie guarda um token aleatório de 32 bytes (não a senha), definido em
// .env.local. Trocar LIFEHUB_AUTH_TOKEN invalida todas as sessões na hora.
//
// Isso é a PRIMEIRA camada, dentro do app. Quando o acesso público entrar no
// ar, o Cloudflare Access vem por cima como segunda camada — de propósito:
// atrás dessas rotas existe execução de código nesta máquina (/dev), e
// depender de uma única config externa como barreira é frágil demais.

const COOKIE_NAME = "lh_auth";

export function middleware(request) {
  const token = process.env.LIFEHUB_AUTH_TOKEN;

  // Sem token configurado o app não sobe protegido — falha fechado em vez de
  // silenciosamente liberar tudo.
  if (!token) {
    return new NextResponse(
      "LIFEHUB_AUTH_TOKEN não configurado em .env.local — acesso bloqueado por segurança.",
      { status: 500 }
    );
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie === token) {
    return NextResponse.next();
  }

  // API responde 401 (o front trata); navegação vai pro login.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Protege tudo, menos o próprio login e os internos do Next.
  //
  // `_next/` precisa sair INTEIRO (não só static/image): em dev o Next usa
  // `_next/hmr` (websocket de hot-reload) e outros caminhos internos, e
  // barrá-los faz a página não hidratar — o React não liga e os botões
  // param de responder. Isso não abre dado nenhum: `_next/` só serve o
  // bundle da aplicação; dado do usuário passa por `/api/*`, que continua
  // protegido.
  // `api/finance/pluggy/webhook` é o aviso do Pluggy (sem cookie): a própria rota exige o segredo na URL.
  matcher: ["/((?!login|api/login|api/finance/pluggy/webhook|_next/|favicon.ico).*)"],
};
