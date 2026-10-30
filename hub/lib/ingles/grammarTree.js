// Trilha de gramática (A Jornada do Autodidata) como árvore de habilidades, no modelo do Atlas:
// cada aula é um nó, os ramos agrupam assuntos e os pré-requisitos são "duros" (liberam o nó quando aprovados).
// O nível (tier) sai do maior caminho de pré-requisitos, então a árvore flui de cima para baixo sem ciclos.

export const BRANCHES = [
  "Fundamentos",
  "Verbos essenciais",
  "Presente e passado",
  "Substantivos e adjetivos",
  "Estruturas da frase",
  "Tempos perfeitos e futuro",
  "Vocabulário avançado",
];

// aula: [ramo, pré-requisitos (números de aula)]
const MAP = {
  1: ["Fundamentos", []],
  2: ["Fundamentos", [1]],
  3: ["Fundamentos", [1]],
  4: ["Fundamentos", [3]],
  5: ["Fundamentos", [2]],
  13: ["Fundamentos", [1]],
  14: ["Fundamentos", [13, 6]],
  6: ["Verbos essenciais", [3]],
  38: ["Verbos essenciais", [6, 2]],
  8: ["Verbos essenciais", [6]],
  7: ["Verbos essenciais", [6]],
  9: ["Verbos essenciais", [8]],
  10: ["Verbos essenciais", [8]],
  15: ["Verbos essenciais", [8]],
  16: ["Presente e passado", [3, 10]],
  17: ["Presente e passado", [8]],
  11: ["Presente e passado", [17]],
  12: ["Presente e passado", [11]],
  20: ["Substantivos e adjetivos", [2]],
  21: ["Substantivos e adjetivos", [20]],
  24: ["Substantivos e adjetivos", [20, 3]],
  27: ["Substantivos e adjetivos", [21]],
  28: ["Substantivos e adjetivos", [27]],
  39: ["Substantivos e adjetivos", [20, 16]],
  19: ["Estruturas da frase", [5, 6]],
  18: ["Estruturas da frase", [9, 17]],
  25: ["Estruturas da frase", [17]],
  26: ["Estruturas da frase", [25]],
  37: ["Estruturas da frase", [19, 17]],
  23: ["Estruturas da frase", [18, 11]],
  22: ["Estruturas da frase", [11, 29]],
  42: ["Estruturas da frase", [18, 29]],
  35: ["Estruturas da frase", [31, 12]],
  29: ["Tempos perfeitos e futuro", [11]],
  30: ["Tempos perfeitos e futuro", [29, 25]],
  31: ["Tempos perfeitos e futuro", [29]],
  32: ["Tempos perfeitos e futuro", [31, 30]],
  34: ["Tempos perfeitos e futuro", [7, 25]],
  33: ["Tempos perfeitos e futuro", [29, 7]],
  36: ["Vocabulário avançado", [21]],
  40: ["Vocabulário avançado", [11, 18]],
  41: ["Vocabulário avançado", [17, 19]],
};

/** { [num]: { branch, prereqs:[num], tier } } só para as aulas presentes. */
export function grammarTree(nums) {
  const have = new Set(nums);
  const info = {};
  for (const n of nums) {
    const [branch, req] = MAP[n] || ["Vocabulário avançado", []];
    info[n] = { branch, prereqs: req.filter((r) => have.has(r) && r !== n) };
  }
  const tierOf = (n, seen = new Set()) => {
    if (info[n].tier != null) return info[n].tier;
    if (seen.has(n)) return 0; // segurança contra ciclo
    seen.add(n);
    const t = info[n].prereqs.length ? 1 + Math.max(...info[n].prereqs.map((p) => tierOf(p, seen))) : 0;
    info[n].tier = t;
    return t;
  };
  for (const n of nums) tierOf(n);
  return info;
}
