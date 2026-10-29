# Módulos do Life Hub e como ligar/desligar cada um

Cada módulo é uma fatia vertical: **página** (`hub/app/<rota>`), **componentes**, **lib** (regras/armazenamento), **API** (`hub/app/api/<rota>`), **dados** (`hub/data/...`) e, quando o agente os controla, uma **ferramenta** em `hub/lib/agent/tools.js`. A sidebar fica em `hub/components/Sidebar.jsx` (lista `ALL_AREAS`) e a Home em `hub/components/home/HomeDashboard.jsx` + `hub/lib/home/store.js` (lista `WIDGETS`).

| Módulo | Rota | Código | Dados | Env / dependências |
|---|---|---|---|---|
| Tarefas (kanban) | `/tarefas` | `components/{Board,BoardList,CardModal,TaskCard,TasksClient}.jsx`, `lib/tasksStore.js`, `app/api/tasks` | `data/tasks.json` | — |
| Finanças | `/financas` | `components/finance`, `components/FinanceClient.jsx`, `lib/finance*`, `app/api/finance` | `data/finance.json`, `data/pluggy.json` | `PLUGGY_CLIENT_ID/SECRET` (Open Finance, opcional); `react-pluggy-connect`, `qrcode`, `react-grid-layout` |
| Estudos (árvore de habilidades, flashcards, quiz, podcast) | `/estudos` | `components/atlas`, `lib/atlas`, `app/api/estudos`, `atlas/` (docs e scripts) | `data/estudos/atlas.db` (SQLite via `node:sqlite`) | `ATLAS_*`, `VOICESTUDIO_URL` (voz opcional); usa o motor de IA para gerar conteúdo |
| Notas + Grafo | `/notas`, `/notas/grafo` | `components/notas`, `lib/notas`, `app/api/notas` | `data/notas/*.md` (+ `.meta/`) | `cytoscape`, `cytoscape-fcose` |
| Quadros (Excalidraw) | `/quadros` | `components/quadros`, `lib/quadros`, `app/api/quadros` | `data/quadros/*.json` | `@excalidraw/excalidraw`; `scripts/copy-excalidraw-assets.mjs` roda no pre-build |
| Agenda e tempo | `/agenda` | `components/agenda`, `lib/agenda`, `app/api/agenda` | `data/agenda.json` | — |
| Bíblia | `/biblia` | `components/biblia`, `lib/biblia`, `app/api/biblia` | — | `YOUVERSION_APP_KEY` |
| Lazer (links e ideias para o tempo livre) | `/lazer` | `app/lazer`, `lib/lazer`, `app/api/lazer` | `data/lazer.json`, `data/lazer/cache` | `node-html-parser` |
| Home (widgets) | `/` | `components/home`, `components/HomeClient.jsx`, `lib/home`, `app/api/home` | `data/home.json` | — |
| Motores de IA | `/motores` | `components/motores`, `lib/agent/engines`, `lib/agent/router.js` | `data/engine*.json` | `GEMINI_API_KEY(S)`, `OPENROUTER_API_KEY`; Claude via CLI |
| Agente geral | botão flutuante / `Ctrl+K` | `components/agent`, `lib/agent`, `lib/intents`, `app/api/agente` | `data/agent-journal.jsonl`, `data/chat-log.jsonl` | ao menos um motor de IA |
| Tempo real | (infra) | `lib/live`, `app/api/live`, `components/agent/LiveBridge.jsx` | — | SSE; as telas atualizam sozinhas |
| **/dev** (agente de desenvolvimento) | `/dev` | `app/dev`, `app/api/dev-chat`, `lib/devAgent.js` | `data/dev-log.jsonl` | **Executa código na máquina — privilegiado** |
| **Trilhas** | `/trilhas` | `app/trilhas`, proxy em `next.config.mjs`, widget em `HomeDashboard.jsx`, ferramenta `trilhas` em `lib/agent/tools.js`; app em `trilhas/` | `trilhas/data/` | `TRILHAS_URL`; `NEXT_PUBLIC_LIFEHUB_TRILHAS=0` desliga |

## Receitas

**Desligar o Trilhas no Hub (sem apagar nada):** `NEXT_PUBLIC_LIFEHUB_TRILHAS=0` em `hub/.env.local` → `npm run build`. Para remover de vez: apague `hub/app/trilhas`, a regra `rewrites` em `hub/next.config.mjs`, o widget (`TrilhasWidget` + `case "trilhas"` em `HomeDashboard.jsx`, `trilhas` em `WIDGET_LABEL`/`SPAN`, o item em `lib/home/store.js`), o item da sidebar e a ferramenta `trilhas` (e `TOOL_LABELS.trilhas`) em `lib/agent/`.

**Remover um módulo qualquer (ex.: Bíblia):**
1. Apague `app/<rota>`, `app/api/<rota>`, `components/<mod>`, `lib/<mod>`, scripts `scripts/test-<mod>.mjs`.
2. Sidebar: remova o objeto do módulo em `ALL_AREAS` (`components/Sidebar.jsx`).
3. Home: remova o widget (função `XWidget`, `case`, `WIDGET_LABEL`, `SPAN`, escopo do `useLive`) e a entrada em `lib/home/store.js` e `lib/home/summary.js`.
4. Agente: remova a ferramenta em `lib/agent/tools.js`, a rota em `ROUTES` (mesmo arquivo), o rótulo em `lib/agent/hubAgent.js` (`TOOL_LABELS`) e menções em `hub/CLAUDE.md` e `lib/agent/engines/prompts.js`.
5. Eventos em tempo real: `lib/live/bus.js` (mapeia arquivo → escopo).
6. Dependências só desse módulo: remova do `hub/package.json` e rode `npm install` (atualiza o lock).
7. `npm run build` (falhas de import mostram o que sobrou) e `npm run check`.

**Remover o `/dev`:** apague `app/dev`, `app/api/dev-chat`, `lib/devAgent.js`, a referência em `lib/agent/router.js` (superfície "dev"), `components/DevChat.jsx` e as menções em `hub/CLAUDE.md`. Recomendado se o Hub for exposto fora da sua máquina.

**Sem Claude Code (só Gemini/OpenRouter):** o roteador já cai para o próximo motor disponível; configure as chaves e escolha o motor em `/motores`. O **Trilhas** é a exceção: Mentor, dicas e geração por IA chamam `claude -p` — troque `runClaude` em `trilhas/server/generate.js` por uma chamada à API que o dono preferir.

## Adicionar um módulo novo
Copie a estrutura de um módulo pequeno (Lazer ou Agenda): `app/<rota>/page.js`, `lib/<mod>/store.js` (arquivo em `data/`), `app/api/<mod>/route.js`, item em `ALL_AREAS`, escopo em `lib/live/bus.js`, (opcional) widget na Home e ferramenta para o agente. Documente aqui.
