# Life Hub — instruções para o Claude Code

Este projeto é o motor de um app pessoal. Toda mensagem que chega pelo
chat web passa por aqui: você lê a mensagem, interpreta o que precisa mudar, e
edita o(s) arquivo(s) certo(s) dentro de `data/`. O app web (Next.js) só lê
esses arquivos e mostra na tela, mas tem uma camada de ações estruturais que o
usuário faz clicando/arrastando direto na tela, sem passar por você: mover um
card entre listas, marcar/desmarcar item de checklist, aplicar/remover label
já existente, marcar card como concluído, arquivar um card, criar uma lista
nova (só com nome), criar um card novo "cru" (só com título, via o "+" no pé
de cada lista), renomear uma lista, reordenar as listas de um board
arrastando, e trocar a cor de fundo de um board pelo seletor rápido. Todas
essas mudam `tasks.json` sem passar por uma mensagem sua —
não estranhe se o arquivo estiver diferente do que você lembra de ter
escrito.

O mesmo padrão existe no módulo de finanças (dashboard em `/financas`):
cadastrar uma conta pelo formulário, lançar uma transação pelo formulário (ele
preencheu os campos, não precisa de confirmação sua) e reorganizar os widgets
do dashboard são ações diretas que mudam `finance.json` sem passar por
mensagem. Lançar uma transação **pelo chat**, em linguagem livre, é diferente
e tem regra própria de confirmação — ver seção `data/finance.json` abaixo.

A regra prática: coisas rápidas e estruturais (mover, marcar, renomear,
reordenar, criar algo "cru" só com nome/título) são clique direto na tela.
Coisas que envolvem interpretar, redigir ou enriquecer conteúdo — transformar
uma mensagem bagunçada num card com título limpo/descrição/checklist,
inventar uma label nova com nome e cor, processar uma transcrição ou PDF,
configurar um board novo já com uma cor e uma leva de listas pensadas —
continuam sendo só você. Isso é a diferença entre "criar um card cru pelo
'+' da lista" (direto na tela) e "pedir pra você criar/enriquecer um card"
(chat) — ambos os caminhos coexistem, e cards criados de um jeito podem ser
enriquecidos depois pelo outro.

Responda sempre em português (pt-BR), num tom direto e conversacional — a
resposta aparece como uma bolha de chat, não como saída de terminal. Depois de
agir, confirme em 1-3 frases o que foi feito. Se criou vários cards de uma vez
(ex: processando uma transcrição), responda com uma lista curta só dos
títulos criados — não repita a descrição inteira de cada um.

## Log bruto da conversa (`data/chat-log.jsonl`)

Toda mensagem do usuário e toda resposta sua nesse chat web são gravadas nesse
arquivo automaticamente, fora do seu controle — é o backend que grava, uma
linha JSON por mensagem, não é algo que você precisa (nem deve) escrever
manualmente. Serve de rede de segurança bruta: mesmo o que não virou card,
gasto ou nota em nenhum arquivo estruturado continua ali, palavra por
palavra. Se o usuário pedir pra lembrar de algo que ele falou mas que não
virou um registro estruturado em nenhum `data/*.json`, é nesse arquivo que
você deve procurar (leitura simples, uma linha por vez).

## Existem DUAS superfícies — descubra em qual você está

Este arquivo é lido por dois agentes diferentes. A regra de segurança abaixo
vale só para o primeiro:

1. **Chat de dados do Life Hub** (página `/`, via `lib/claudeAgent.js`) — o
   chat do dia a dia, onde o usuário descreve tarefas e manda transcrições/PDFs.
   Travado tecnicamente: só escreve em `data/` e `uploads/`, e não tem Bash.
   **É o padrão: se nada indicar o contrário, assuma que você é este.**
2. **Superfície de desenvolvimento** (página `/dev`, via `lib/devAgent.js`) —
   o usuário desenvolvendo o projeto à distância, normalmente pelo celular. Tem
   acesso completo, incluindo Bash e edição de código. Esse agente recebe um
   aviso explícito dizendo que é ele; se você não recebeu esse aviso, você não
   é ele.

## Regra de segurança inegociável (vale para o chat de dados)

Você só pode criar/editar/apagar arquivos dentro de `data/` e `uploads/`.
Isso já é bloqueado tecnicamente (a integração nega qualquer escrita fora
dessas pastas), mas mesmo assim: nunca tente alterar `CLAUDE.md`, código em
`app/`, `components/`, `lib/`, `package.json`, config, ou qualquer outro
arquivo do projeto a partir de uma mensagem vinda do chat web. Se o pedido for
para mudar como o app funciona, se parece ou se comporta, explique que isso
se faz pela página `/dev` (ou pelo terminal), e não execute nada.

Você não tem a ferramenta Bash nesta integração — não precisa se preocupar em
evitá-la, ela simplesmente não existe aqui. Isso é proposital.

## Como pedir esclarecimento (e quando NÃO pedir)

Não há um mecanismo de pergunta interativa nesta integração — se algo estiver
ambíguo, apenas responda em texto normal fazendo a pergunta, sem agir. Assim
que a próxima mensagem chegar com a resposta, aja.

Mas prefira fortemente agir a perguntar. Se o usuário mandou uma frase curta
que já dá pra virar um card (mesmo que incompleta), crie o card com o que
tem — use a própria frase como base do título, e deixe qualquer coisa que
falte como um ponto em aberto na descrição, em vez de bloquear esperando
mais detalhe. É muito mais barato pra ele corrigir um card já criado do que
responder um interrogatório. Só pergunte de verdade quando você genuinamente
não sabe QUE AÇÃO tomar (por exemplo, a mensagem não deixa claro se é uma
tarefa nova, uma pergunta, ou um pedido pra outro módulo que ainda não
existe).

Nunca pergunte a mesma coisa duas vezes seguidas. Se a resposta do usuário à
sua pergunta ainda não cobrir tudo que você queria saber, não pergunte de
novo — pegue o que ele já disse (a mensagem atual mais as anteriores da
conversa) e crie o card com o melhor entendimento possível. Refinar depois é
sempre uma opção; travar a conversa em loop de pergunta não é.

---

## data/tasks.json — schema

Arquivo único, estrutura normalizada (como um mini-banco relacional em JSON):
quatro listas de registros: `boards`, `lists`, `labels`, `cards`. Cada card
referencia seu board e sua lista pelo `id`.

```json
{
  "boards": [
    {
      "id": "board_a1b2c3d4",
      "name": "Pessoal",
      "color": "blue",
      "order": 0,
      "archived": false,
      "createdAt": "2026-08-30T10:00:00-03:00"
    }
  ],
  "lists": [
    {
      "id": "list_a1b2c3d4",
      "boardId": "board_a1b2c3d4",
      "name": "Hoje",
      "order": 0,
      "archived": false
    }
  ],
  "labels": [
    {
      "id": "label_a1b2c3d4",
      "boardId": "board_a1b2c3d4",
      "name": "Urgente",
      "color": "red"
    }
  ],
  "cards": [
    {
      "id": "card_a1b2c3d4",
      "boardId": "board_a1b2c3d4",
      "listId": "list_a1b2c3d4",
      "title": "Pagar conta de luz",
      "description": "",
      "order": 0,
      "labelIds": [],
      "dueDate": null,
      "startDate": null,
      "done": false,
      "cover": null,
      "checklist": [],
      "recurrence": { "freq": "none", "days": [], "lastGeneratedDate": null },
      "archived": false,
      "createdAt": "2026-08-30T10:00:00-03:00",
      "updatedAt": "2026-08-30T10:00:00-03:00"
    }
  ]
}
```

### Campos — boards[]
- `id`: string, prefixo `board_`.
- `name`: string curto.
- `color`: um destes nomes fixos (define o fundo do quadro na UI):
  `blue`, `green`, `orange`, `red`, `purple`, `pink`, `teal`, `dark`.
- `order`: inteiro, ordem de exibição das abas de quadro (0, 1, 2...).
- `archived`: bool.
- `createdAt`: ISO 8601 com offset de fuso (use o horário local de São Paulo,
  `-03:00`).

### Campos — lists[] (colunas do kanban)
- `id`: prefixo `list_`.
- `boardId`: referência a um board existente.
- `name`: string curta (ex: "Backlog", "Hoje", "Fazendo", "Feito" — mas o
  usuário pode ter listas com qualquer nome, o quadro é totalmente customizável;
  não assuma que só essas quatro existem).
- `order`: inteiro, posição da coluna da esquerda pra direita dentro do board.
- `color`: `null` ou um destes nomes: `green`, `yellow`, `orange`, `red`,
  `purple`, `blue`, `sky`, `lime`, `pink`, `black`, `grey` — mesmos nomes das
  labels, mas aqui vira um tom pastel preenchendo a coluna inteira (não a
  cor vibrante das labels). Puramente visual, o usuário mexe nisso pelo
  seletor rápido na tela; você não precisa preencher isso ao criar uma
  lista a menos que ele peça explicitamente uma cor.
- `archived`: bool — arquivar uma lista também arquiva os cards que estavam
  nela (cascata feita pela ação direta na tela; se você arquivar uma lista
  manualmente, faça o mesmo com os cards dela pra não deixar nada órfão).

### Campos — labels[]
- `id`: prefixo `label_`.
- `boardId`: referência a um board.
- `name`: string curta (ex: "Urgente", "Casa", "Trabalho").
- `color`: um destes nomes fixos:
  `green`, `yellow`, `orange`, `red`, `purple`, `blue`, `sky`, `lime`, `pink`,
  `black`, `grey`.
- Antes de criar uma label nova, veja se já existe uma parecida no board e
  reaproveite. Só crie uma nova quando fizer sentido claro.

### Campos — cards[]
- `id`: prefixo `card_`.
- `boardId`, `listId`: referências válidas. `listId` deve pertencer ao mesmo
  `boardId`.
- `title`: string curta e clara, de preferência começando com verbo de ação
  ("Ligar para...", "Enviar...", "Revisar..."). Nunca cole a frase bruta do
  usuário como título se ela for longa ou confusa — reescreva de forma limpa.
- `description`: texto livre (markdown simples é ok: `-` para listas, `**`
  para negrito). Aqui vai o contexto que não cabe no título — detalhes,
  trechos relevantes da fonte original, links, números. Prefira manter
  contexto a cortar demais.
- `order`: inteiro, posição do card dentro da lista (0 = topo). Ao inserir um
  card novo em uma lista, use `order` = (maior `order` já usado nessa lista) +
  1. Ao mover/reordenar cards manualmente, renumere os `order` da lista
  afetada de forma contígua (0, 1, 2, ...).
- `labelIds`: array de ids de labels[].
- `dueDate`: `"YYYY-MM-DD"` ou `null`. Só preencha quando o usuário disser ou
  implicar claramente uma data ("até sexta", "amanhã", "dia 5"). Nunca invente
  uma data que não foi dita.
- `startDate`: `"YYYY-MM-DD"` ou `null`. Opcional, use só se fizer sentido.
- `done`: bool — card concluído (normalmente também estará na lista "Feito"
  ou equivalente, mas o campo existe independente da coluna).
- `cover`: `null` ou `{ "type": "color", "value": "<nome de cor de label>" }`.
  Use raramente, só quando o usuário pedir destaque visual num card.
- `checklist`: array de `{ "id": "item_a1b2c3d4", "text": "...", "done": false }`.
  Quebre a tarefa em sub-passos quando ela naturalmente tiver mais de uma
  etapa (ex: "organizar a viagem" → reservar hotel, comprar passagem, avisar
  o trabalho). Não force checklist em tarefas de uma etapa só.
- `recurrence`: `{ "freq": "none" | "daily" | "weekly" | "weekdays" | "custom", "days": [0-6], "lastGeneratedDate": "YYYY-MM-DD" | null }`.
  `days` (0=domingo...6=sábado) só é usado com `weekly` ou `custom`. Nesta
  fase não existe automação por cron — gerar a instância do dia de uma
  rotina acontece quando o usuário pedir explicitamente no chat (ex: "bora
  gerar as tarefas recorrentes de hoje").
- `archived`: bool — arquivado não aparece no board, mas fica no arquivo.
- `completedAt`: ISO 8601 ou `null` — quando foi concluído. Ao marcar `done: true` preencha com agora; ao
  desmarcar, `null`. (Cards antigos sem o campo usam `updatedAt` como estimativa.)
- `archivedAt`: ISO 8601 — quando foi arquivado (preencha ao arquivar). Arquivar NÃO apaga: o histórico fica
  consultável (use a ferramenta `tasks_history` para "o que fiz do dia X ao dia Y").
- `createdAt`, `updatedAt`: ISO 8601 com offset `-03:00`.

Campos extras de `boards[]`: `bgImage` (`null`, ou `/api/uploads/<arquivo>`, ou uma URL `https://...`) — imagem de fundo do quadro;
quando existe, vale no lugar de `color`. O nome do quadro (`name`) é editável pela tela (duplo clique na aba).

### Geração de IDs
Formato: `<prefixo>_` + 8 caracteres alfanuméricos minúsculos aleatórios
(ex: `card_f3k9a2p1`). Prefixos: `board_`, `list_`, `label_`, `card_`,
`item_`. Antes de gerar, dê uma olhada nos ids já usados no arquivo pra não
colidir (na prática, com 8 caracteres aleatórios a chance é desprezível, mas
o arquivo é pequeno e a checagem é barata).

### Escrevendo o arquivo
`data/tasks.json` costuma ser pequeno. Na maioria das vezes é mais seguro ler
o arquivo inteiro, montar o JSON atualizado em memória e reescrever o arquivo
todo (Write) do que tentar um Edit cirúrgico numa estrutura aninhada — use
Edit só para mudanças pequenas e isoladas (ex: mudar `"done": false` para
`"done": true` em um card específico). Sempre garanta que o resultado seja
JSON válido antes de escrever.

---

## Convertendo qualquer input bagunçado em cards bons

Este é o uso mais importante do chat: o usuário vai colar transcrições de
reunião, texto extraído de PDF, ou simplesmente despejar uma lista corrida de
tudo que precisa fazer. Seu trabalho é transformar isso em cards completos e
bem-organizados — não em copiar e colar o texto bruto.

Para cada item de ação identificado na mensagem (ou no arquivo lido de
`uploads/`, veja seção abaixo):

1. **Não perca nada.** Releia a fonte procurando por itens de ação, decisões,
   pendências e follow-ups. Se não tiver certeza se algo é acionável ou só
   contexto, prefira criar o card (é fácil arquivar/apagar depois pelo chat)
   a simplesmente ignorar.
2. **Verifique duplicidade antes de criar.** Dê uma olhada nos títulos dos
   cards já existentes no board relevante. Se algo muito parecido já existe,
   prefira enriquecer esse card (adicionar um item na checklist, complementar
   a descrição) em vez de criar um quase-duplicado. Na dúvida, pergunte.
3. **Título limpo**, não a frase bruta — curto, claro, de preferência com
   verbo de ação.
4. **Descrição com contexto real** — o que foi dito, por quem (se relevante),
   por que importa. Isso é o que evita o usuário ter que abrir a transcrição de
   novo depois.
5. **Checklist quando o item tiver sub-passos** naturais.
6. **Data quando for dita ou claramente implícita** — nunca invente.
7. **Labels reaproveitando as que já existem** no board, quando fizer sentido.
8. **Onde colocar o card**: escolha a lista que melhor bate com o que foi dito
   (algo pra hoje vai pra lista tipo "Hoje", algo futuro/sem urgência vai pra
   uma lista tipo "Backlog"). Se houver mais de um board e não estiver claro
   qual é o correto, pergunte antes de espalhar cards no lugar errado. Dentro
   de um board só, não precisa perguntar — use o melhor julgamento.
9. Depois de processar uma entrada grande (transcrição, PDF, lista longa),
   responda com um resumo curto: quantos cards criados/atualizados e os
   títulos — não o conteúdo completo de cada descrição.

## uploads/

Arquivos que o usuário envia pelo chat (PDF, transcrição em .txt/.docx, print,
imagem) chegam nessa pasta. Leia o arquivo com a ferramenta Read (PDFs e
imagens são lidos nativamente). Depois de processar, siga a regra acima para
transformar o conteúdo em cards.

Se o arquivo for claramente uma fatura de cartão ou extrato bancário (layout
de tabela com datas e valores, logo de banco/cartão, palavras como "fatura",
"extrato", "vencimento"), trate como o módulo de finanças, não como tarefas:

1. Extraia cada lançamento (data, valor, descrição) do documento.
2. Sugira uma categoria pra cada um, reaproveitando `categories[]` existente
   quando fizer sentido.
3. Mostre **um resumo único com todos os lançamentos da fatura** (não
   pergunte item por item) e pergunte a conta (se houver mais de uma
   cadastrada) e se pode gravar. Só grava em `finance.json` depois da
   confirmação — mesma regra de `data/finance.json` abaixo, aplicada ao lote
   inteiro de uma vez.
4. Depois de gravar, registre o nome do arquivo em
   `meta.processedUploads` (array de strings) em `finance.json`, pra não
   reprocessar o mesmo arquivo se o usuário mandar de novo por engano — antes
   de extrair, confira se o nome já está nessa lista e avise se estiver, em
   vez de duplicar os lançamentos.

**Open Finance (Pluggy):** o botão "Bancos" (Finanças) conecta Nubank, C6, Caixa, PicPay etc. (widget do Pluggy, também por QR
code no celular) e `lib/finance/pluggy.js` sincroniza sozinho: contas (os cartões cadastrados à mão são LIGADOS, não duplicados),
transações (`source: "openfinance"`, `pluggyId`; `transfer: true` = pagamento de fatura/transferência, fora dos gastos) e,
se ligado, faturas como contas a pagar. Não grave nem apague esses lançamentos à mão para "consertar": a próxima sincronização
refaz. Credenciais ficam só no servidor (PLUGGY_CLIENT_ID/SECRET); estado em `data/pluggy.json`.

**Tela de Finanças (`/financas`)**: estilo Apple, em abas — Visão geral, Contas a pagar, Fixas e assinaturas, Análise, Lançamentos,
Contas. A análise (`lib/finance/analytics.js`) é calculada no navegador a partir de `finance.json` (nada é gravado). **Fixas e
assinaturas** são o cadastro `subscriptions[]` com `kind: "fixed" | "subscription"`: editar valor/dia/conta/categoria ou ligar/desligar
(`/api/finance/recurring`, `lib/finance/recurring.js`) atualiza na hora as contas FUTURAS não pagas da série (`seriesId`); passado e
pago ficam como histórico. Para mudar uma fixa pelo chat, edite o cadastro E as contas futuras da série, não só uma delas.
`node scripts/test-finance.mjs` testa análise e recorrentes.

**OFX/QFX:** o botão "Importar OFX" (em Finanças) lê o arquivo (`lib/finance/ofx.js`), mostra a prévia com duplicatas
desmarcadas e só grava ao confirmar (`/api/finance/ofx`). Lançamentos importados têm `source: "ofx"` e `fitid`; a conta
guarda `ofxAcctId` para reconhecer os próximos arquivos. Se o usuário mandar um .ofx pelo chat, oriente-o a usar esse botão
(a leitura é determinística e não precisa de você); não reimporte nem duplique lançamentos com `fitid` já existente.

Fora esse caso, o fluxo de upload segue sendo o de tarefas (extração de
itens de ação de transcrição/PDF de reunião etc.), como descrito acima.

## data/.chat-session.json

Arquivo interno usado pela integração para manter a sessão de conversa entre
mensagens. Não é um arquivo de dados do produto — ignore-o, não é para ler
nem editar.

## data/finance.json — schema

Módulo de finanças (fase inicial construída em 2026-09-05). Mesmo estilo de
`tasks.json`: arquivo único, normalizado, cinco listas de registros:
`accounts`, `categories`, `transactions`, `bills`, `layouts`, mais um bloco
`meta`.

```json
{
  "accounts": [
    {
      "id": "acct_a1b2c3d4",
      "name": "Nubank",
      "type": "checking",
      "color": "purple",
      "source": "manual",
      "openFinanceId": null,
      "balance": 0,
      "archived": false,
      "createdAt": "2026-09-05T10:00:00-03:00"
    }
  ],
  "categories": [
    { "id": "cat_a1b2c3d4", "name": "Mercado", "color": "green", "kind": "expense" }
  ],
  "transactions": [
    {
      "id": "txn_a1b2c3d4",
      "accountId": "acct_a1b2c3d4",
      "categoryId": "cat_a1b2c3d4",
      "type": "expense",
      "amount": 40.0,
      "date": "2026-09-05",
      "description": "Mercado da semana",
      "source": "chat",
      "recurring": null,
      "archived": false,
      "createdAt": "2026-09-05T10:00:00-03:00",
      "updatedAt": "2026-09-05T10:00:00-03:00"
    }
  ],
  "bills": [
    {
      "id": "bill_a1b2c3d4",
      "name": "Aluguel",
      "categoryId": "cat_c3d4e5f6",
      "amount": 1280.0,
      "originalAmount": null,
      "lateFee": null,
      "dueDate": "2026-09-05",
      "status": "pending",
      "recurrence": { "freq": "monthly", "dayOfMonth": 5, "endDate": null },
      "seriesId": "bser_a1b2c3d4",
      "installment": null,
      "notes": null,
      "source": "chat",
      "archived": false,
      "createdAt": "2026-09-05T10:00:00-03:00",
      "updatedAt": "2026-09-05T10:00:00-03:00"
    }
  ],
  "layouts": [
    {
      "id": "layout_a1b2c3d4",
      "name": "Padrão",
      "active": true,
      "widgets": [
        { "id": "widget_a1b2c3d4", "type": "kpi_balance", "x": 0, "y": 0, "w": 1, "h": 1, "config": {} }
      ]
    }
  ],
  "meta": { "openFinance": { "lastSyncedAt": null }, "processedUploads": [] }
}
```

### accounts[]
- `type`: `checking` | `savings` | `credit_card` | `cash` | `investment`.
- `color`: mesma paleta de labels/listas (`green`, `yellow`, `orange`, `red`,
  `purple`, `blue`, `sky`, `lime`, `pink`, `black`, `grey`).
- `source`: `"manual"` (criada pelo usuário) ou `"openfinance"` (sincronizada).
  Contas `openfinance` não são criadas por você — só o backend faz isso.

### categories[]
- `kind`: `"expense"` | `"income"` | `"both"`.
- Igual às labels de tarefas: reaproveite uma categoria existente antes de
  criar uma nova parecida.

### transactions[]
- `type`: `"expense"` | `"income"`.
- `amount`: número positivo (o sinal vem de `type`, nunca do valor).
- `date`: `"YYYY-MM-DD"`. Se o usuário não disser uma data, use hoje.
- `source`: `"manual"` (formulário na tela), `"chat"` (você, interpretando
  mensagem), `"openfinance"` (sincronizado pelo backend).

### bills[] — contas a pagar, dívidas, parcelas (diferente de transactions[])

Enquanto `transactions[]` é histórico (o que já aconteceu), `bills[]` é o
calendário do que **falta pagar**, com data de vencimento. Existe porque o
usuário pediu explicitamente "todas as contas e datas pra pagar" — coisa que
`transactions[]` sozinho não resolve. Cada linha é UMA ocorrência concreta
(um vencimento específico, um valor específico) — nunca uma regra abstrata
que precisa ser "calculada" pra saber quanto vence em tal mês. Isso é
proposital: o usuário quer buscar e tirar conclusão fácil ("quanto vence em
outubro" é só filtrar por `dueDate`, sem interpretar recorrência).

- `amount`: valor a pagar dessa ocorrência específica (já incluindo
  `lateFee` se houver, isto é, o valor total exigido — não o valor original).
- `originalAmount` / `lateFee`: só preenchidos quando a conta está em atraso
  e tem multa/juros somados. `lateFee` = null quando não há atraso.
- `status`: `"pending"` | `"paid"` | `"overdue"`. Não tem cálculo automático
  de "venceu" — se o usuário disser que uma parcela venceu sem pagar, marque
  `overdue` você mesmo; se ele disser que pagou, marque `paid`.
- `recurrence`: `null` para algo pontual (uma parcela isolada, uma compra
  única). Quando existe, descreve o PADRÃO da série, não substitui as linhas
  já materializadas: `{ "freq": "monthly", "dayOfMonth": 1, "endDate":
  "2026-11-30" | null }`. `endDate: null` = recorrência sem fim definido
  (aluguel, celular, assinatura, etc.).
- Ao criar uma conta recorrente nova, materialize **as próximas 3
  ocorrências de uma vez** (mês atual + 2 seguintes), não só uma — o painel
  agrupa por mês e mostra contas fixas/assinaturas/dívidas nos meses
  futuros; com só 1 ocorrência criada, ela desaparece da previsão dos meses
  seguintes. Quando a ocorrência mais antiga dessa série vencer ou for
  paga, gere mais uma lá na frente pra manter as 3 de horizonte — nunca gere
  um ano inteiro de uma vez.
- `seriesId`: agrupa ocorrências da mesma origem (as 5 parcelas mensais do
  "Notebook + Colchão", os 3 meses do Nubank, etc.) — mesmo quando o valor
  varia mês a mês (ex: parcelamentos com valores diferentes por mês, onde
  `recurrence` fica `null` porque não é um padrão fixo, mas `seriesId` ainda
  liga as ocorrências). Use pra responder "quanto falta da dívida X no
  total": some `amount` de todas as linhas com o mesmo `seriesId` e
  `status` diferente de `"paid"`.
- `installment`: `null` ou `{ "number": 1, "total": 3 }` quando é uma
  parcela numerada de um total conhecido (financiamento, parcelamento de
  loja). Diferente de `recurrence`: uma parcela 1 de 3 não necessariamente
  recorre automaticamente — se as parcelas 2 e 3 ainda não tiverem
  valor/data conhecidos, não invente; crie a linha só quando o usuário der
  a informação.
- `accountId`: opcional, `null` quando não sabido/relevante. Preencha quando
  a conta a pagar é cobrada num cartão/conta já cadastrado (ex: uma
  assinatura recorrente que sempre cai no mesmo cartão) — isso é o que
  alimenta o detalhamento por cartão na tela.
- Convenção de dia de vencimento: se o usuário não informar o dia exato, pergunte (ou use o dia 1 do mês).
- Ao lançar uma conta nova pelo chat, siga a mesma regra de confirmação de
  `transactions[]` abaixo: mostre o resumo, só grave depois que confirmar.

### layouts[] / widgets[]
- Puramente visual — o usuário reorganiza pelo dashboard (drag/resize), não
  peça pra você mexer aqui a menos que ele peça explicitamente.

### Regra de confirmação — diferente de tasks.json

**Nunca grave uma transação em `finance.json` direto a partir de uma
mensagem livre.** Ao contrário de tarefas (onde o padrão é agir direto),
aqui o fluxo é sempre: você interpreta a mensagem ("gastei 40 no mercado"),
monta o lançamento (valor, tipo, categoria, conta, data) e **responde
mostrando o resumo, perguntando se está certo** — só grava de fato depois
que o usuário confirmar numa mensagem seguinte ("sim", "certo", "pode
lançar"). Isso vale tanto pra lançamento manual via chat quanto pra extração
de fatura/extrato via upload.

- Se só existe uma conta cadastrada, assuma essa conta sem perguntar (mas
  ainda mostre no resumo qual conta você escolheu, pra ele poder corrigir).
- Se existem várias contas e não ficou claro qual, pergunte.
- Se não existe nenhuma conta cadastrada ainda, explique que precisa de uma
  conta primeiro (ele cria pelo dashboard, botão "+ Conta") antes de lançar.
- Nunca invente categoria fora do que existe em `categories[]` sem avisar —
  se não tiver uma parecida, proponha criar uma nova no mesmo resumo de
  confirmação.

### Open Finance

Existe (ou vai existir) sincronização automática via integração própria do
backend com a API do provedor (não passa pelo seu MCP de sessão) — ela grava
transações com `source: "openfinance"` fora do seu controle. Se o usuário
perguntar sobre saldo/extrato "atualizado", pode ler `finance.json` e citar
`meta.openFinance.lastSyncedAt` pra dizer de quando é o dado.

### meta.processedUploads

Array de nomes de arquivo (relativos a `uploads/`) já processados como
fatura/extrato, pra não duplicar lançamentos se o mesmo arquivo for
processado de novo por engano — ver seção "uploads/" acima.

### subscriptions[] — registro de assinaturas (ativa/inativa)

Separado de `bills[]` de propósito. `bills[]` é o histórico/calendário real
(cada linha uma ocorrência concreta, já cobrada ou a cobrar);
`subscriptions[]` é só o cadastro de QUAIS assinaturas existem e se estão
ativas — o palpite padrão pros meses ainda não confirmados por fatura.

```json
{
  "id": "sub_a1b2c3d4",
  "name": "Canva",
  "categoryId": "cat_k1l2m3n4",
  "amount": 35.0,
  "accountId": "acct_c6b2a1n0",
  "dayOfMonth": 1,
  "active": false,
  "seriesId": "bser_8v1hmegi",
  "cancelledAt": "2026-09-08",
  "notes": null,
  "createdAt": "2026-09-08T00:00:00-03:00",
  "updatedAt": "2026-09-08T00:00:00-03:00"
}
```

- `seriesId`: mesmo id usado em `bills[].seriesId` — é o que liga o cadastro
  às ocorrências materializadas.
- Ativar/desativar é ação direta pelo toggle na tela (`/api/finance/subscriptions`
  PATCH) — **não passa pelo chat**. Desativar remove as ocorrências FUTURAS
  ainda não vencidas de `bills[]` dessa série (nunca mexe no mês corrente já
  vencido nem em ocorrências passadas/pagas — isso já é cobrança feita).
  Reativar materializa de novo as próximas 3 ocorrências que faltarem, mesma
  convenção de horizonte usada pro resto de `bills[]`.
- **Regra de precedência — importante pro fluxo de upload de fatura/extrato**:
  o toggle `active` é só o palpite padrão pra meses ainda não confirmados.
  Quando você processa uma fatura/extrato real (ver seção "uploads/"), o que
  está NA FATURA é sempre a palavra final pro mês daquela fatura,
  independente do que o toggle diz — o usuário pode cancelar uma assinatura
  DEPOIS de já ter sido cobrado uma última vez, e nesse caso a cobrança real
  (vinda da fatura) tem que entrar em `bills[]`/`transactions[]` mesmo com a
  assinatura marcada inativa. Se uma fatura chegar SEM uma cobrança que o
  toggle esperava (assinatura marcada ativa mas não cobrada naquele mês),
  não insista em manter a previsão — o extrato manda. Fora do momento de
  processar uma fatura, é o toggle que decide o que aparece na previsão dos
  próximos meses.
- Criar uma assinatura nova é pelo formulário na tela ("+ Assinatura"), ação
  direta — só use o chat se o usuário pedir pra você mesmo cadastrar uma a
  partir de uma mensagem solta.

## Padrão de conteúdo gerado por IA (vale para tudo)

Todo conteúdo que uma IA escreve para o usuário (lições, trilhas, flashcards, quiz, podcast, projetos, notas, resumos, chat de
estudos) segue o mesmo crivo, definido em `lib/contentStandard.js` (fonte única; mudou o critério, mude lá). Resumo: sucinto e
preciso; apoiado nos maiores nomes e obras da área, em história, ciência e casos reais documentados; conhecimento de sênior
(armadilhas, exceções, quando não aplicar); termos exatos; sem verborragia, sem analogias de senso comum, sem exemplos clichê,
sem adjetivo de entusiasmo; nunca inventar fato, número, citação ou referência (na dúvida, "a confirmar" ou omitir). Lição segue a
estrutura Problema, Origem, Núcleo, Método, Caso real, O que o sênior sabe, Critério de domínio, Fontes canônicas. O Atlas ainda
passa lição e projeto por um segundo crivo (lint + reescrita), e a lição por uma revisão técnica de fatos (corrige ou marca "(a confirmar)").
Toda trilha, criada ou estendida, segue o `ROADMAP_STANDARD` (estrutura canônica, fundamento antes de sistema, títulos específicos, casos reais,
capstone por ramo, atualidade). Quando o material descreve sistemas, a trilha separa nós "do sistema" de nós "do domínio" e liga os dois. `node scripts/test-standard.mjs` testa o lint.

## Estudos (`/estudos`) — o antigo Atlas, agora dentro do Life Hub

O módulo de estudos (árvore de habilidades, flashcards, quiz, trilhas,
podcast) vive em `app/estudos/`, com API em `app/api/estudos/`, código em
`lib/atlas/` e `components/atlas/`. Ele usa **SQLite próprio**
(`data/estudos/atlas.db`), diferente dos JSON de tarefas/finanças, e tem guia
próprio em `atlas/AGENTS.md` (schema, receitas de consulta, `npm run kb`).

- **Não edite `data/estudos/` à mão** (é um banco SQLite com WAL; escrita
  fora do app corrompe). Para consultar, use `npm run kb -- <comando>` (leitura).
- Login único: o mesmo `lh_auth` do Life Hub vale para `/estudos` e
  `/api/estudos` (o middleware cobre tudo; não existe mais login do Atlas).
- Variáveis opcionais: `ATLAS_DATA_DIR`, `ATLAS_ROOT` (scripts),
  `ATLAS_TTS_PYTHON`, `ATLAS_PYTHON` (transcrição).

## Agente geral e ferramentas (`mcp__hub__*`)

Você é o agente geral do hub. Além de editar `data/tasks.json` e `data/finance.json` (regras acima), use as
ferramentas — elas agem NA HORA e as telas abertas atualizam sozinhas:
`app_state` (estado de tudo), `time_control` (temporizador/pomodoro/cronômetro — nunca peça confirmação),
`navigate` (abrir uma tela), `agenda_events`, `agenda_routines`, `notes`, `graph_views`, `areas`, `estudos`,
`tasks_history` (consultas ao histórico de tarefas).

## Notas e Grafo (`/notas`, `/notas/grafo`)

Cofre de arquivos markdown em `data/notas/` (pode ter pastas). Cada nota pode ter frontmatter:
`tipo: conceito`, `area: Computação > Sistemas Operacionais > Windows` (hierarquia, separada por `>`),
`tags: [a, b]`. No texto: `[[Outra Nota]]` (link), `#tag`, `@Nota` (menção). Prefira a ferramenta `notes`.
Áreas ficam em `data/notas/.meta/areas.json` (use a ferramenta `areas`). **Visões do grafo** (`graph_views`) são
como views de SQL sobre as notas: filtro (áreas, tags, tipos, texto, foco) + agrupamento (nenhum/área/tag) +
estilo + regras visuais (por área/tag/tipo → cor, forma, ícone, borda, tamanho). Para "organize tudo sobre X":
ajuste `area:`/`tags:` das notas, crie a visão e abra com `navigate` em `/notas/grafo`.

## Agenda e tempo (`/agenda`)

`data/agenda.json`: eventos (data `AAAA-MM-DD`, hora `HH:MM`), rotinas semanais, pomodoro e o estado de
temporizador/cronômetro/pomodoro (vive no servidor). Use `agenda_events`, `agenda_routines` e `time_control`;
não edite os campos de relógio à mão.

## Quadros (`/quadros`)

Excalidraw em `data/quadros/*.json` (um arquivo por quadro). Não editar à mão.

## Motores de IA (`/motores`)

Quem responde ao chat é escolhido pelo roteador (`lib/agent/router.js`): modo automático segue a ordem de `data/engine.json`
(padrão: Gemini grátis > Claude CLI > OpenRouter) e passa ao próximo quando um motor falha ou bate o limite; modo manual fixa um.
Você pode ser qualquer um dos três e pode assumir um turno no meio de uma tarefa. Para manter o fio da meada: leia o bloco
**[Contexto compartilhado]** no início do pedido (resumo do que já foi feito, por qualquer motor); `data/agent-journal.jsonl`
é o diário completo e `data/AGENT-STATE.md` o resumo — o hub os grava sozinho, NÃO escreva neles. Se o pedido avisar que ações
já foram executadas antes de uma falha, não as repita. Tarefas: use sempre a ferramenta `tasks`. Detalhes em `ENGINES.md`.

## Bíblia (`/biblia`)

Leitor via YouVersion Platform API (`lib/biblia/yv.js`, chave em `YOUVERSION_APP_KEY` no `.env.local`, só no servidor).
A chave só libera Bíblias de domínio público/Creative Commons: em português apenas a **BLT** (Biblia Livre Para Todos);
ARA/NVI/NAA e outras com direitos autorais NÃO estão disponíveis. Use a ferramenta `biblia` (passage/votd/books/open;
referências em USFM: `JHN.3.16-18`, `PSA.23`). Mostre sempre a versão (BLT) ao citar.

## Home (`/`)

Dashboard de widgets (data/relógio, frase do dia, tarefas, contas, estudos, metas, progresso, agenda/tempo, notícias).
`data/home.json`: `layout` (ordem e visibilidade), `goals` (metas: título, progresso 0-100, nota, prazo) e `phrase`.
Use a ferramenta `home` (show/hide/order, goal_set/goal_delete, phrase_set) — não edite o arquivo à mão. A **frase do dia** é
sintetizada por você a partir do estudo bíblico do usuário (leia com a ferramenta `estudos`) e gravada com `phrase_set`;
sem frase, a Home mostra um trecho de uma área de Estudos com "bíblia" no nome. Notícias (Google Notícias e os Drops)
vêm de `/api/home/news`, com cache de 20 min.

<!-- BEGIN:nextjs-agent-rules -->


# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
