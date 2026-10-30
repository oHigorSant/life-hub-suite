// Correção de respostas digitadas (puro: roda no servidor e no navegador).
import { tokenize, norm } from "./text.js";

/** Compara o que o aluno escreveu com o esperado, palavra a palavra (LCS). nota = acertos / max(esperado, digitado). */
export function gradeTyped(expected, typed) {
  const exp = tokenize(expected).map((t) => ({ w: t.w, k: norm(t.w) }));
  const got = tokenize(typed || "").map((t) => norm(t.w));
  const m = exp.length, n = got.length;
  const L = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      L[i][j] = exp[i - 1].k === got[j - 1] ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);
  const hit = new Array(m).fill(false);
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (exp[i - 1].k === got[j - 1]) { hit[i - 1] = true; i--; j--; }
    else if (L[i - 1][j] >= L[i][j - 1]) i--;
    else j--;
  }
  const right = L[m][n];
  const score = m ? right / Math.max(m, n) : 0;
  return { score: Math.round(score * 100) / 100, marks: exp.map((e, k) => ({ w: e.w, ok: hit[k] })), extra: Math.max(0, n - right) };
}

/** Lacuna: aceita a palavra exata ou com erro de uma letra em palavras longas (digitação), sem aceitar outra palavra. */
export function gradeBlank(answer, typed) {
  const a = norm(answer), b = norm(typed || "");
  if (!b) return 0;
  if (a === b) return 1;
  if (a.length >= 6 && b.length >= 5 && editDistance(a, b) <= 1) return 0.7;
  return 0;
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
