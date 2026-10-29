# Atlas — guia para agentes (e pessoas) navegarem a base

O conhecimento vive em **SQLite** (`data/atlas.db`) e é espelhado em markdown (`data/vault/<area>/`, gerado por `POST /api/subjects/:id/export`).
Tudo é auto-descrito: `npm run kb -- schema` imprime cada tabela/coluna com seu significado (tabela `schema_docs`).

## Mapa mental
```
subjects (área)
 ├─ sources ──< chunks (trechos com localizador) ──index── chunks_fts (FTS5)
 ├─ concepts (definição, metodologia, critérios, referências) ──< concept_chunks >── chunks   [evidência]
 ├─ nodes (árvore de habilidades)  ──< node_edges (hard|soft)
 │     ├─ node_concepts >── concepts       [o que o nó ensina]
 │     ├─ node_chunks   >── chunks         [material-base do nó]
 │     ├─ activities (lesson|reading|exercise|quiz|flashcards|podcast|project)
 │     ├─ questions ──< attempts           [evidência de domínio; misconception, confidence]
 │     └─ cards ──< reviews                [repetição espaçada]
 └─ events (diário append-only), chat, jobs
```

## Receitas
| Quero… | Faça |
|---|---|
| Entender a área | `kb subjects` → `kb tree <subject>` |
| Achar o que o material diz sobre X | `kb search <subject> "X"` → cada trecho traz `source` + `locator` (página/timestamp) |
| Ver um conceito com método, critérios e referências | `kb concept "<texto>"` (inclui evidências) |
| Tudo sobre uma habilidade | `kb node <nodeId>` |
| Onde o aluno falha | `kb gaps <subject>` ou `SELECT * FROM v_concept_mastery / v_misconceptions` |
| Consulta livre | `kb sql "SELECT …"` (somente leitura) |

## Convenções que evitam erro
- `nodes.tier` é só layout; **a ordem real é `node_edges`** (`hard` bloqueia, `soft` recomenda).
- Domínio (mastery) **não é coluna**: é derivado de `attempts` (decaimento de 21 dias, peso por dificuldade) em `lib/progress.js`. Use as views `v_*` ou a API `/api/subjects/:id`.
- `attempts.score` ∈ [0,1]. `attempts.misconception` só existe quando a resposta revelou um equívoco específico.
- Tempos são **epoch em milissegundos**.
- Toda geração se ancora em `chunks` — ao citar, use `source.title + chunks.locator`.
- Não escreva direto no banco; use a API (`/api/...`) para manter invariantes (tiers, desbloqueios, FTS).

## API HTTP (cookie `atlas_auth` após `POST /api/login`)
`GET /api/subjects` · `GET /api/subjects/:id` (árvore completa com domínio) · `GET /api/subjects/:id/search?q=` · `GET /api/subjects/:id/gaps` ·
`POST /api/subjects/:id/{build,sources,roadmap,chat,mock,export}` · `GET /api/nodes/:id` · `POST /api/nodes/:id/activities {type,opts}` · `GET /api/activities/:id` ·
`POST /api/questions/:id/answer` · `GET /api/review` · `POST /api/cards/:id/review {grade}`
