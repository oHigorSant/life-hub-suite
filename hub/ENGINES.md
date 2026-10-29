# Motores de IA do Life Hub

Quem responde ao chat é escolhido pelo **roteador** (`lib/agent/router.js`). Estado e configuração ficam em arquivos, nunca na
memória de um motor, para qualquer um assumir um turno sem perder o fio da meada.

## Motores (ordem padrão do modo automático)

1. **Gemini (grátis)** — API do Google AI Studio (`lib/agent/engines/gemini.js`). Pool de chaves (`GEMINI_API_KEY` +
   `GEMINI_API_KEYS`) x lista de modelos (padrão `gemini-3.5-flash-lite`, `gemini-3.5-flash`); cada combinação tem cota própria.
   Os modelos Pro têm cota zero na camada gratuita. (A CLI do Gemini e o Antigravity CLI não servem para o plano AI Plus.)
2. **Claude (CLI)** — Claude Agent SDK, sessão própria (`lib/agent/hubAgent.js`, `engines/claude.js`); modelo padrão Haiku 5.5.
3. **OpenRouter (pago)** — OpenAI-compatível (`engines/openrouter.js`); padrão `qwen/qwen3.7-flash` (o mais barato que acertou
   todas as tarefas de teste; alternativa mais rápida: `deepseek/deepseek-v4.1-flash`).

Modo manual fixa um motor (opcionalmente "rígido": não troca se falhar). `/dev` pode ter ordem própria (`devChain`).
Tudo se escolhe na tela **/motores** e no seletor do chat; salvo em `data/engine.json`.

## Garantias

- **O chat nunca fica mudo:** falha ou limite -> próximo motor; esperas vencidas são reavaliadas numa 2ª passada; se tudo falhar,
  responde dizendo o que houve e quando cada motor volta (os atalhos sem modelo continuam: temporizador, abrir telas).
- **Fio da meada:** o hub grava `data/agent-journal.jsonl` (pedidos, ações, respostas, trocas, por motor) e `data/AGENT-STATE.md`.
  Cada motor que assume recebe o *Contexto compartilhado* (últimas trocas + ações) e, se outro falhou no meio, a lista de ações
  já executadas ("não repita"). Quem usa sessão própria (Claude) só recebe o contexto quando outro motor atendeu antes.
- **Mesmas ferramentas:** as ferramentas do hub (`lib/agent/tools.js`: tasks, notes, agenda, home, biblia...) valem para os
  três; os motores de API têm ainda `read_file/list_files/grep/write_file/edit_file` (+ `bash` só no /dev) com as mesmas
  travas do chat de dados (`engines/toolkit.js`). JSON inválido nunca é gravado e há backup em `data/.backups/`.
- **Privacidade:** na camada gratuita o Google pode treinar com o conteúdo. Com `privacy.geminiPersonal=false` (padrão), no
  automático o Gemini não recebe pedidos do chat sobre dados pessoais (heurística `touchesPersonalData`) e só usa as
  ferramentas seguras (`biblia`, `time_control`, `navigate`). Escolher o Gemini à mão vale como consentimento. Código (/dev) não é dado pessoal.
- **/dev:** antes de cada pedido o hub guarda o código em `~/backups/dev-snapshots` (últimos 8).

## Limites e uso

`engines/usage.js` guarda uso por dia (`data/engine-usage.json`) e esperas (`data/engine-state.json`). Classificação de erros em
`engines/errors.js` (cota diária -> até a virada do dia no Pacífico; por minuto -> alguns segundos; chave inválida -> 1 h; sem
créditos -> 30 min). Painel: widget "IAs e limites" na Home e tela /motores (Claude por janela, Gemini por chave/modelo,
OpenRouter da conta toda se houver `OPENROUTER_MANAGEMENT_KEY`).

## Testes

`node scripts/test-router.mjs` (na VM, em pasta temporária): roteamento, failover, privacidade, travas das ferramentas, prompts.
