# Adaptando para outra pessoa

Receitas para o Claude Code aplicar. Depois de qualquer uma: `npm run build` e `npm run check`.

## Identidade
- **Nome na saudação:** `NEXT_PUBLIC_LIFEHUB_USER` em `hub/.env.local` (rebuild).
- **Nome do app/ícone:** `hub/components/Sidebar.jsx` (marca "LH"), `hub/app/layout.js` (título), `trilhas/index.html` + `trilhas/public/manifest.webmanifest` + `trilhas/public/icon.svg`.
- **Cores do Trilhas:** variáveis CSS no topo de `trilhas/src/styles.css` (`--brand` etc.); cores de cada trilha em `meta.js`.

## Idioma
A interface e os prompts estão em português do Brasil. Para trocar: (1) textos de interface em `trilhas/src/*.jsx` e `hub/components`, `hub/app`; (2) **prompts dos agentes**: `hub/CLAUDE.md`, `hub/lib/agent/engines/prompts.js`, `hub/lib/agent/hubAgent.js`, `hub/lib/contentStandard.js`, `trilhas/server/mentor.js`, `trilhas/server/generate.js`; (3) conteúdo das trilhas (`trilhas/tracks/`) e as palavras-chave do verificador pedagógico (`trilhas/scripts/check-pedagogy.mjs` é específico de SQL); (4) comandos rápidos em `hub/lib/intents/parse.js` (reconhecem frases em português) e seus testes. Faça por módulo e valide a cada passo.

## Fuso horário
O Hub assume `America/Sao_Paulo` em vários textos/agenda (`grep -r "America/Sao_Paulo" hub/lib hub/components`). Troque pelo fuso do dono; datas dos JSON usam o offset do fuso (veja `hub/CLAUDE.md`).

## Motor de IA
- **Hub:** `hub/lib/agent/router.js` escolhe entre Gemini → Claude CLI → OpenRouter (`hub/ENGINES.md`). Adicionar um motor = novo arquivo em `hub/lib/agent/engines/` com a mesma interface dos existentes + registro em `engines/config.js`.
- **Trilhas:** só `claude -p` (`trilhas/server/generate.js`, função `runClaude`). Para outra API, reimplemente essa função.
- O Hub lê o arquivo de credenciais do Claude Code (`~/.claude/.credentials.json`, variável `CLAUDE_CREDENTIALS_FILE`) **apenas** para mostrar o uso/limite na tela; sem ele a barra de limites some.

## Trilhas novas e conteúdo
Veja `docs/TRILHAS.md`. A trilha de SQL é o exemplo completo; troque o banco de exemplo em `trilhas/tracks/sql/dataset.js` se preferir outro tema (as soluções dos exercícios são validadas por `npm run validate`, então o script mostra o que quebrar).

## Dados já existentes
O repositório não traz dados. Para começar com algo na Home: crie um board em Tarefas, uma conta em Finanças, etc. Notas de exemplo (`hub/lib/notas/seed.js`) são criadas na primeira abertura de Notas e marcadas com a tag `#exemplo`.

## App no celular
O Trilhas é mobile-first e instalável como PWA (precisa de HTTPS). Para um APK, o caminho mais curto é um wrapper Capacitor apontando para a URL onde o app roda (não incluído aqui; o `.gitignore` já ignora `android/`).
