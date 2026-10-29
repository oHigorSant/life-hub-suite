# Life Hub + Trilhas — guia para o Claude Code

Você está num repositório com **dois apps** que o dono quer adaptar para o uso dele. Leia este arquivo inteiro antes de mexer.

```
hub/       Life Hub (Next.js 16 · JavaScript/JSX, sem TypeScript) — central pessoal + agente de IA
trilhas/   Trilhas (Vite + React + Express) — aprendizado gamificado com trilhas geradas por IA
docs/      MODULES.md (mapa e receitas por módulo) · TRILHAS.md · ADAPTING.md · DEPLOY.md
scripts/   setup.mjs · run.mjs · check.mjs
```

**Dois `CLAUDE.md` diferentes — não confunda:**
- Este (raiz) é para VOCÊ desenvolvendo o projeto.
- `hub/CLAUDE.md` é o **prompt de runtime do agente do Hub** (ele diz ao agente como editar `data/tasks.json`, finanças etc.). Só edite se o dono quiser mudar o comportamento do agente. Ele também contém um aviso do Next.js 16: antes de escrever código do Hub, consulte `hub/node_modules/next/dist/docs/` (APIs diferentes do que você conhece).

## Primeira sessão — faça nesta ordem

1. Pergunte ao dono: **quais módulos manter** (veja a tabela em `docs/MODULES.md`), qual **idioma** da interface, qual **motor de IA** ele usa (Claude Code logado? chave Gemini? OpenRouter?) e se vai hospedar localmente ou num servidor.
2. `npm run setup` (instala, cria `hub/.env.local` com senha/token aleatórios, compila o Trilhas). Mostre ao dono a senha gerada.
3. `npm run build && npm start` e confirme: Hub em `http://localhost:4000`, Trilhas em `http://localhost:4300` e dentro do Hub em `/trilhas`.
4. Aplique as receitas de remoção dos módulos que ele não quer (`docs/MODULES.md`). Depois `npm run build` e `npm run check`.
5. Peça o nome para a saudação (`NEXT_PUBLIC_LIFEHUB_USER`) e as chaves opcionais; **você nunca lê, imprime nem comita `hub/.env.local`** — peça que o dono edite o arquivo.

## Regras do projeto

- **Dados nunca vão para o git:** `hub/data/`, `hub/uploads/`, `trilhas/data/`, `trilhas/tracks-built/` e `.env*` estão no `.gitignore`. Antes de qualquer commit/push, rode `git status` e confira. Nunca coloque chaves, tokens ou senhas no código — tudo por variável de ambiente (`hub/.env.example` lista as existentes).
- **JavaScript puro (JSX)**, sem TypeScript. Interface em **português do Brasil** e **sem emojis** (ícones SVG: `lucide-react`, registro em `trilhas/src/icons.jsx`; no Hub, ícones inline/lucide). Se o dono quiser outro idioma, veja `docs/ADAPTING.md`.
- **Estado em arquivos** (JSON/Markdown/SQLite em `data/`), não em memória: o agente e as telas leem os mesmos arquivos. Escritas por rotas de API usam arquivo temporário + rename (veja `trilhas/server/index.js` e `hub/lib/*Store.js`).
- **Segurança:** a superfície `/dev` (`hub/app/dev`, `hub/lib/devAgent.js`) dá ao agente edição de código e shell na máquina. Mantenha atrás do login; se o dono não precisar, remova (receita em `docs/MODULES.md`). O middleware (`hub/middleware.js`) falha fechado sem `LIFEHUB_AUTH_TOKEN`.
- Mudou algo que o agente do Hub usa? Atualize `hub/CLAUDE.md` e as descrições das ferramentas em `hub/lib/agent/tools.js`.
- Testes: `npm run check` (valida trilhas + testes do Hub sem rede). Testes que falam com serviços externos (Pluggy, Gemini…) precisam de chaves e rede.
- Ao terminar uma mudança que afeta a interface, **abra no navegador e confira** (celular e desktop): o Trilhas foi desenhado mobile-first.

## Como as peças se conectam

- O Hub faz **proxy** de `/trilhas-app/*` para o Trilhas (`hub/next.config.mjs`, `TRILHAS_URL`), protegido pelo login do Hub. A página `/trilhas` do Hub é um iframe desse proxy (`?embed=1` esconde a sidebar do Trilhas).
- O Trilhas salva as notas do Mentor também no cofre de Notas do Hub, usando o token do Hub (`trilhas/server/hub.js`; padrões `HUB_URL=http://127.0.0.1:4000` e `../hub/.env.local`). Sem Hub, as notas ficam só no Trilhas.
- O **agente do Hub** tem a ferramenta `trilhas` (`hub/lib/agent/tools.js`) que lista, gera e **cria trilhas** pela API do Trilhas. Detalhes e regras pedagógicas em `docs/TRILHAS.md`.
- **Desligar o Trilhas no Hub sem apagar código:** `NEXT_PUBLIC_LIFEHUB_TRILHAS=0` em `hub/.env.local` e rebuild do Hub.
- IA: o Hub escolhe o motor pelo roteador (`hub/lib/agent/router.js`, `ENGINES.md`): Gemini (grátis) → Claude CLI → OpenRouter. O Trilhas (Mentor, dicas, geração de trilhas) usa **só o Claude Code CLI** (`claude -p`, `trilhas/server/generate.js`); se o dono não tem Claude Code, troque esse ponto (um único `runClaude`).

## Quando o dono pedir…

- **"Quero uma trilha de X":** use a ferramenta/rota de criação (`docs/TRILHAS.md`) — ensinar antes de cobrar, ritmo gradual, validação automática. Para trilhas com exercícios de código executável, veja como o SQL foi feito em `trilhas/tracks/sql/`.
- **"Tira o módulo Y" / "adiciona um módulo":** `docs/MODULES.md` e `docs/ADAPTING.md`.
- **"Coloca no servidor / no celular":** `docs/DEPLOY.md`.
- **Algo com dados de terceiros (bancos, Bíblia, TTS):** só com as chaves do próprio dono, nunca as de outra pessoa.
