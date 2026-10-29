// Notas de exemplo criadas na primeira abertura (todas com a tag #exemplo — apague quando quiser).
export const SEED_NOTES = [
  {
    path: "Bem-vindo.md",
    content: `---
tipo: guia
tags: [exemplo]
---

# Bem-vindo às Notas

Suas notas são **arquivos markdown** (como no Obsidian). Algumas convenções:

- Link para outra nota: [[Windows]] ou [[Linux|o pinguim]] (com apelido).
- Tag: #exemplo #computacao
- Menção: @Windows liga esta nota à nota "Windows".
- Área em hierarquia, no topo do arquivo: \`area: Computação > Sistemas Operacionais > Windows\`.

Abra o **Grafo** para ver tudo conectado, trocar cores e formas, agrupar por área e salvar suas próprias visões.

Notas relacionadas: [[Sistemas Operacionais]], [[Back-end]].
`,
  },
  {
    path: "Computação/Sistemas Operacionais.md",
    content: `---
tipo: conceito
area: Computação > Sistemas Operacionais
tags: [exemplo, computacao]
---

# Sistemas Operacionais

Software que gerencia o hardware e os processos. Exemplos: [[Windows]], [[Linux]].

Veja também [[Back-end]], onde os servidores quase sempre rodam em Linux.
`,
  },
  {
    path: "Computação/Windows.md",
    content: `---
tipo: conceito
area: Computação > Sistemas Operacionais > Windows
tags: [exemplo, so]
---

# Windows

Sistema da Microsoft. Veja [[Sistemas Operacionais]] e compare com [[Linux]].
`,
  },
  {
    path: "Computação/Linux.md",
    content: `---
tipo: conceito
area: Computação > Sistemas Operacionais > Linux
tags: [exemplo, so, servidores]
---

# Linux

Kernel livre, base da maioria dos servidores. Veja [[Sistemas Operacionais]] e @Back-end.
`,
  },
  {
    path: "Computação/Back-end.md",
    content: `---
tipo: area
area: Computação > Back-end
tags: [exemplo, servidores]
---

# Back-end

Lado servidor das aplicações: APIs, bancos de dados, filas. Normalmente roda em [[Linux]].
`,
  },
];
