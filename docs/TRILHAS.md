# Trilhas — como funciona e como criar conteúdo

App de aprendizado gamificado: mapa de trilha com capítulos e lições, exercícios de vários tipos, XP, sequência diária (com congelamento), certificado, Mentor de IA, notas e laboratório de SQL. Frontend Vite + React; backend Express pequeno que serve o build, guarda progresso/notas em arquivos e fala com o Claude Code CLI.

```
trilhas/
  src/            interface (App, Lesson, steps, screens, mentor, notes, lab, certificate, practice, store…)
  server/         index.js (rotas) · generate.js (IA via `claude -p`) · mentor.js · notes.js · hub.js · custom.js (API de criação)
  shared/grade.js correção dos exercícios SQL (roda no navegador E no Node)
  tracks/<id>/    trilhas "de autor": meta.js, ch01.js…, dataset.js (banco de exemplo)
  scripts/        build-tracks, validate-tracks, check-pedagogy
  data/           progress.json, notes.json, mentor.json   (NÃO vai para o git)
  tracks-built/   JSONs servidos pelo app (gerados; trilhas criadas por IA/agente também caem aqui)
  tracks-ai/      trilhas prontas geradas por IA (ex.: SQL2, 62 lições), copiadas para tracks-built/ no build
```

Rodar: `npm run build` (gera `tracks-built/` + `dist/`) e `npm start` (porta 4300). Em produção o app usa o prefixo `/trilhas-app/` (build do Vite) e o servidor aceita com ou sem ele.

## Formato de uma trilha
`{ id, title, subtitle, icon, color, language, dataset?, custom?, chapters:[{ id, title, desc, color, lessons:[{ id, title, icon, steps:[…] }] }] }`

Tipos de passo (a UI está em `src/steps.jsx`):
- `read` — `{title, body, code?}` explicação (`**negrito**`, `` `código` ``; textos com 3+ blocos aparecem um bloco por vez)
- `quiz` — `{q, options[], answer: ÍNDICE, explain, code?}`
- `fill` — `{prompt, code com ___, answer[], bank[], explain}`
- `order` — `{prompt, lines[] NA ORDEM CERTA, explain}`
- `match` — `{prompt, pairs[[a,b]…], explain}`
- `input` — `{prompt, answers[], explain}` (o aluno digita; aceita variações)
- `query` — só trilhas com `dataset` (SQL): `{prompt, starter, solution, hint, explain, ordered?, names?, verify?, setup?}`; o app mostra as tabelas usadas e o **resultado esperado** antes do aluno escrever e corrige comparando com a `solution`.

## Regra pedagógica (inegociável): ensinar antes de cobrar
Cada lição: 1-2 `read` (conceito + exemplo) → reconhecimento fácil → prática guiada → prática livre; **no máximo 3 ideias novas por lição**; nada é cobrado sem ter sido explicado num `read` anterior. A trilha de SQL é verificada por script: `npm run validate` (cada solução precisa passar no próprio corretor) e `node scripts/check-pedagogy.mjs sql` (acusa exercício que usa comando ainda não ensinado). O app também insere **práticas obrigatórias** a cada 3 lições (`src/practice.js`).

## Três jeitos de criar uma trilha
1. **De autor (código):** crie `tracks/<id>/meta.js`, `ch01.js`… usando os helpers de `tracks/dsl.js` (`chapter, lesson, read, quiz, fill, order, match, query`) e rode `npm run build:tracks`. Use `tracks/sql/` como modelo (inclui `dataset.js`).
2. **Pela API (o agente do Hub faz assim):** `POST /api/tracks` com o JSON acima, `POST /api/tracks/:id/lessons` para acrescentar lições, `DELETE /api/tracks/:id` (só trilhas criadas por API/IA). A validação (`server/custom.js`) recusa o que viola as regras e explica o erro; aceita só `read, quiz, fill, order, match, input`, lições de 5 a 14 passos começando por `read`.
3. **Geração por IA:** `POST /api/ai/generate {topic, level, chapters}` (ou a aba "Criar") escreve a trilha inteira em segundo plano com o Claude Code; acompanhe em `GET /api/ai/jobs/:id`.

O **agente do Hub** usa a ferramenta `trilhas` (`hub/lib/agent/tools.js`) com ações `list | generate | job_status | create | add_lessons | delete`. A descrição da ferramenta contém as regras pedagógicas e o formato dos passos.

## Outras rotas
`GET /api/tracks`, `GET /api/tracks/:id`, `GET|PUT /api/progress`, `POST /api/mentor/chat`, `GET|DELETE /api/mentor/history`, `GET|POST /api/notes`, `PUT|DELETE /api/notes/:id`, `POST /api/notes/sync`, `POST /api/ai/hint`.

## Recursos (onde mexer)
- **Progresso, XP, sequência e congelamento:** `src/store.jsx` (`advance`: 1 congelamento cobre 1 dia perdido; ganha-se 1 a cada 7 dias, máx. 2). Persistência: `localStorage` + `data/progress.json`.
- **Mapa e práticas:** `src/screens.jsx` (`Path`) e `src/practice.js`.
- **Mentor:** `src/mentor.jsx` + `server/mentor.js` (contexto da lição e do SQL do aluno; cria notas quando o aluno pede). Notas: `server/notes.js`, espelhadas no Hub por `server/hub.js` (`PUT /api/notas/note`).
- **Certificado:** `src/certificate.jsx` (SVG → PNG, compartilhar, imprimir). **Laboratório SQL:** `src/lab.jsx`.
- **Visual:** ícones `src/icons.jsx` (lucide, por nome), ilustrações `src/art.jsx`, estilos `src/styles.css` (tema claro/escuro automático).

## Sem Claude Code?
Mentor, dica da IA e geração por IA chamam `claude -p` em `server/generate.js` (`runClaude`). Para usar outra API, troque só essa função (entrada: texto do prompt; saída: texto). Todo o resto é independente.
