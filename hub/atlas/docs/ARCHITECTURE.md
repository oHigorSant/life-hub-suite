# Atlas — arquitetura

**Objetivo:** transformar qualquer área do conhecimento (de qualquer material, ou só de uma conversa) numa árvore de habilidades não-linear, com estudo multimodal e medição honesta de domínio.

## Stack
Next.js 16 (App Router, JS) · SQLite nativo do Node (`node:sqlite`, FTS5) · Claude Agent SDK (usa o login do `claude` da máquina) · poppler (`pdftotext`) · ffmpeg + faster-whisper local (áudio/vídeo) · systemd (`atlas.service`, porta 4100).

## Pipeline de conhecimento (`lib/ingest.js`)
1. **Registrar** arquivo/texto/URL → `sources` (status `queued`).
2. **Extrair** por tipo: PDF (`pdftotext`, com OCR por visão se escaneado), imagem (visão), áudio/vídeo (ffmpeg → Whisper com timestamps), URL (HTML→texto), texto.
3. **Chunking** (~2.2k chars) preservando `locator` (página / timestamp) e cabeçalhos.
4. **Map** (paralelo, ~22k chars por chamada): extrai *conceitos* com definição, **metodologia**, **critérios**, **referências** e os `chunk_ids` de evidência.
5. **Reduce**: resumo da fonte, metodologia do autor e outline ("índice inteligente"); hierárquico para livros gigantes.
Tudo roda em *jobs* em background com progresso (`jobs`), sobrevive ao fechar a aba.

## Árvore de habilidades (`lib/roadmap.js`)
O modelo recebe objetivo, nível atual→alvo, orçamento de tempo, outline das fontes e a lista de conceitos (por importância) e devolve nós + arestas `hard`/`soft`. O código **valida** (chaves únicas, arestas só para nós existentes, quebra ciclos), recalcula `tier` pela cadeia `hard`, liga conceitos e **trechos-fonte** a cada nó. `extend` complementa uma árvore existente (chat ou botão).

## Atividades (`lib/activities.js`)
Geradas sob demanda por nó, sempre ancoradas nos trechos do nó e citando `[S#]`: lição, leitura guiada, exercícios, **quiz**, flashcards (SM-2), podcast (roteiro; TTS do navegador por ora), projeto, simulado (monta prova do banco de questões).
**Qualidade do quiz:** (1) gerador com regras duras (Bloom ≥ aplicar, ≥40% dificuldade 4-5, distratores = equívocos reais rotulados, sem "todas as anteriores"); (2) **revisor adversarial** resolve cada questão às cegas e descarta/corrige as ambíguas ou fáceis; (3) correção de respostas abertas por rubrica; (4) cada erro registra o *equívoco* e a *confiança* declarada.

## Progresso (`lib/progress.js`)
Domínio do nó = média ponderada (decaimento 21 d × dificuldade) de `attempts`, encolhida para 0 sem evidência. `passed` ≥ 65% com ≥ 3 questões distintas (libera dependentes); `mastered` ≥ 80%, ≥ 5 questões e ao menos uma de dificuldade ≥ 3 acertada. Nós ficam `locked` até seus pré-requisitos `hard` passarem — mas o aluno pode testar qualquer nó (um quiz aprovado prova o conhecimento e libera o caminho). **Pontos de atenção:** conceitos fracos, equívocos recorrentes, "certeza mas errou", nós parados, nós dominados há >30 dias.

## Acesso
Login por senha (`ATLAS_PASSWORD`, em `.env.local`) → cookie httpOnly com token aleatório; limite de tentativas por IP. Nada de execução de código: o modelo roda **sem ferramentas**, exceto `Read` restrito a `data/uploads/`.

## Para agentes
Veja `AGENTS.md` e `npm run kb -- schema`.

## Próximos passos naturais
Voz neural no podcast via VoiceStudio · FSRS no lugar de SM-2 · teste de nivelamento que "poda" a árvore · visual premium da árvore (ramos orgânicos, animações de conquista) · revisão de questões individuais ("esta questão está errada") · compartilhamento de trilhas.


## Escopo progressivo (graduação do material)
O aluno só conhece **o nó atual + seus ancestrais `hard`**. `lib/scope.js`:
- `conceptHomes`: para cada conceito, o *primeiro run* de trechos onde ele é ensinado (menções posteriores/avançadas são ignoradas).
- `assignScopes`: cada nó recebe só os trechos onde seus conceitos são introduzidos (`node_chunks`), a janela do material (`node_scope`), e conceitos "fora de lugar" (de outra região do material) são movidos para o nó certo.
- `rescopeSubject` (em `roadmap.js`): remove pré-requisitos que contrariam a ordem do material, impede raízes tardias (liga ao que o material ensina logo antes) e dá aos projetos finais o conteúdo dos seus pré-requisitos.
- `scopeFor(nodeId)`: o que já foi visto + lista **FORA DE ESCOPO** (conceitos de nós não vistos e de partes posteriores do material). Toda geração (lição, quiz, cartões…) recebe isso e o revisor de questões descarta o que exigir conteúdo fora de escopo.
- O prompt da árvore recebe cada conceito com `@posição%` no material e a regra "ordem do livro = graduação".

## Motor de inteligência único
Todo raciocínio do app passa por `lib/llm.js` (Claude via Agent SDK, sem ferramentas): um prefixo de PADRÕES (progressão, fidelidade, qualidade, idioma, formato) é aplicado a toda chamada e cada chamada é registrada em `ai_calls`.

## Árvore visual (cable management)
`components/treeLayout.js`: ramos = faixas coloridas; ordem das faixas e dos nós otimizada contra cruzamentos; cada pré-requisito é um fio ortogonal roteado por A* na grade (evita nós/rótulos, penaliza curvas e cruzamentos, agrupa fios do mesmo nó). Soft prerequisites aparecem só no painel do nó.
