// Helpers para escrever trilhas de forma compacta. Cada trilha vira um track.json (ver scripts/build-tracks.mjs).
//
// Tipos de passo:
//   read   — card de explicação (texto simples com **negrito** e `código`; `code` opcional = bloco de exemplo)
//   quiz   — múltipla escolha (answer = índice da opção certa; `code` opcional mostra um bloco acima)
//   fill   — complete o código: cada `___` do código é uma lacuna; answer = lista na ordem; bank = peças disponíveis
//   order  — coloque as linhas na ordem certa (passe as linhas JÁ na ordem correta; o app embaralha)
//   match  — ligue pares [esquerda, direita]
//   query  — escreva SQL, executado no navegador (SQLite) e comparado com a solução
//   code   — (trilhas não-SQL) alias de quiz sem execução

export const read = (title, body, code) => ({ type: 'read', title, body, ...(code ? { code } : {}) });

export const quiz = (q, options, answer, explain, code) => ({
  type: 'quiz', q, options, answer, explain, ...(code ? { code } : {}),
});

export const fill = (prompt, code, answer, bank, explain) => ({
  type: 'fill', prompt, code, answer, bank: bank || answer, explain,
});

export const order = (prompt, lines, explain) => ({ type: 'order', prompt, lines, explain });

export const match = (prompt, pairs, explain) => ({ type: 'match', prompt, pairs, explain });

// opts: starter, solution (obrigatório), hint, explain, verify, ordered, names, must, mustMsg, setup, dataset:false
export const query = (prompt, opts) => ({ type: 'query', prompt, starter: '', ...opts });

export const lesson = (id, title, icon, steps) => ({ id, title, icon, steps });

export const chapter = (id, title, desc, color, lessons) => ({ id, title, desc, color, lessons });
