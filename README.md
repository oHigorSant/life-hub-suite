# Life Hub + Trilhas

Dois apps que funcionam juntos (ou separados):

- **Life Hub** (`hub/`): central pessoal em Next.js com um **agente de IA** que conhece e manipula tudo: tarefas (kanban), finanças, estudos (árvore de habilidades, flashcards, quiz, podcast), notas com grafo, quadros (Excalidraw), agenda e relógios, Bíblia, home de widgets e escolha de motor de IA (Claude Code, Gemini, OpenRouter).
- **Trilhas** (`trilhas/`): app de aprendizado gamificado (estilo Mimo/Duolingo) com trilha de SQL completa (491 passos), Mentor de IA, notas, certificado, laboratório de SQL e **trilhas de qualquer assunto geradas por IA**. Roda sozinho ou dentro do Hub.

Os dados ficam em arquivos (`hub/data/`, `trilhas/data/`): nada de banco externo, nada vai para a nuvem. **Este repositório não contém dados pessoais nem chaves**: cada pessoa cria os próprios.

## Começando

Requisitos: **Node 22+** e, para os recursos de IA, o **Claude Code** instalado e logado (`claude` no terminal) — ou chaves do Gemini/OpenRouter.

```bash
git clone <este-repo> && cd <pasta>
npm run setup     # instala tudo, cria hub/.env.local com senha/token aleatórios, compila o Trilhas
npm run build     # compila o Hub
npm start         # Hub: http://localhost:4000  ·  Trilhas: http://localhost:4300
```

Entre no Hub com a senha que o `setup` imprimiu (também está em `hub/.env.local`). O Trilhas aparece na sidebar do Hub e como widget na Home.

Desenvolvimento: `npm run dev` (Hub com recarga automática + Trilhas servindo o build). Para mexer na interface do Trilhas: `cd trilhas && npm run dev` (Vite em :5173).

Checagens: `npm run check` valida as trilhas (cada exercício de SQL é executado contra a própria solução) e roda os testes do Hub que não precisam de rede.

## O que configurar

Tudo em `hub/.env.local` (modelo em `hub/.env.example`): nome na saudação, chaves de IA, Pluggy (Open Finance), YouVersion (Bíblia), voz do podcast. **Tudo é opcional** além de senha/token. Sem nenhum motor de IA configurado, o Hub funciona como app comum (tarefas, notas, quadros…), só o chat/agente fica indisponível.

## Usando com o Claude Code

Este repositório foi pensado para o Claude Code adaptar:

1. Abra a pasta raiz com `claude`. Ele lê o `CLAUDE.md` (mapa do projeto, regras, receitas).
2. Peça, por exemplo: *"Leia o CLAUDE.md e docs/MODULES.md, rode o setup, e me pergunte quais módulos quero manter"*.
3. Cada módulo tem uma receita de desligar/remover em `docs/MODULES.md`; adaptações comuns (trocar idioma, trocar motor de IA, criar trilhas novas, hospedar) estão em `docs/ADAPTING.md`, `docs/TRILHAS.md` e `docs/DEPLOY.md`.

## Segurança — leia

- O Hub tem uma superfície **/dev** onde o agente edita código e roda comandos **na sua máquina**, e o chat de dados escreve em `hub/data`. Use **senha forte**, não exponha o Hub à internet aberta sem uma camada extra (VPN/Tailscale, Cloudflare Access…) e nunca publique `hub/.env.local` nem `hub/data`.
- O login limita tentativas por IP e é bloqueado quando o token não está configurado (falha fechado).
- O `.gitignore` já exclui `.env*`, `data/` e `uploads/`. Confira com `git status` antes de dar push no seu fork.

## Estrutura

```
hub/       Life Hub (Next.js 16, JavaScript/JSX sem TypeScript)
trilhas/   Trilhas (Vite + React + Express, JavaScript/JSX)
docs/      MODULES.md · TRILHAS.md · ADAPTING.md · DEPLOY.md
scripts/   setup.mjs · run.mjs · check.mjs
CLAUDE.md  guia para o Claude Code que for trabalhar aqui
```
