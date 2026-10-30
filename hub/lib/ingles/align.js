// Alinha o texto da lição (palavras conhecidas) com o reconhecimento do Whisper (palavras com tempo).
// Resultado: intervalo [início, fim] em segundos para CADA palavra do texto → karaokê.
import { norm } from "./text.js";

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const NUM = { 0: "zero", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten" };

function similar(a, b) {
  if (a === b) return 3;
  if (NUM[a] === b || NUM[b] === a) return 3;
  const L = Math.max(a.length, b.length);
  if (L >= 4 && lev(a, b) / L <= 0.3) return 1;
  if (L >= 3 && (a.startsWith(b) || b.startsWith(a)) && Math.min(a.length, b.length) >= 3) return 1;
  return -1;
}

/**
 * Áudio sintetizado frase a frase: o tempo de cada bloco é conhecido; as palavras dividem o trecho em proporção ao tamanho.
 * @param {Array<{b:number,k:string}>} toks tokens da lição (b = índice do bloco)
 * @param {Array<[number, number, number]>} timeline [índice do bloco, início, fim]
 */
export function alignFromTimeline(toks, timeline, duration = 0) {
  const seg = new Map(timeline.map(([b, s, e]) => [b, [s, e]]));
  const spans = new Array(toks.length * 2).fill(-1);
  let i = 0;
  while (i < toks.length) {
    let j = i;
    while (j < toks.length && toks[j].b === toks[i].b) j++;
    const [s, e] = seg.get(toks[i].b) || [null, null];
    if (s != null) {
      const w = toks.slice(i, j).map((t) => Math.max(2, t.k.length) + 1);
      const tot = w.reduce((a, x) => a + x, 0);
      let at = s;
      for (let q = i; q < j; q++) {
        const d = ((e - s) * w[q - i]) / tot;
        spans[2 * q] = +at.toFixed(2);
        spans[2 * q + 1] = +(at + d).toFixed(2);
        at += d;
      }
    }
    i = j;
  }
  // blocos sem fala (não deveria ocorrer): herdam o fim do anterior
  for (let q = 0; q < toks.length; q++) if (spans[2 * q] < 0) { const p = q ? spans[2 * q - 1] : 0; spans[2 * q] = p; spans[2 * q + 1] = p + 0.05; }
  return { spans, coverage: 1, miss: [] };
}

/**
 * @param {string[]} tk palavras do texto, já normalizadas
 * @param {Array<[string, number, number]>} hw palavras ouvidas [palavra, início, fim]
 * @param {number} duration duração do áudio
 * @returns {{ spans: number[], coverage: number }} spans = [s0,e0,s1,e1,...]
 */
export function alignWords(tk, hw, duration) {
  const n = tk.length, m = hw.length;
  const hk = hw.map((w) => norm(w[0]));
  const spans = new Array(n * 2).fill(-1);
  if (!n) return { spans: [], coverage: 0 };
  if (!m) {
    // sem reconhecimento: distribui uniformemente
    for (let i = 0; i < n; i++) { spans[2 * i] = +((i / n) * duration).toFixed(2); spans[2 * i + 1] = +(((i + 1) / n) * duration).toFixed(2); }
    return { spans, coverage: 0 };
  }
  const W = m + 1;
  const H = new Int16Array((n + 1) * W);
  const T = new Uint8Array((n + 1) * W); // 1 diag, 2 cima (token sem par), 3 esquerda (palavra ouvida sobrando)
  const GAP = -1;
  for (let i = 1; i <= n; i++) { H[i * W] = i * GAP; T[i * W] = 2; }
  for (let j = 1; j <= m; j++) { H[j] = j * GAP; T[j] = 3; }
  for (let i = 1; i <= n; i++) {
    const ti = tk[i - 1];
    for (let j = 1; j <= m; j++) {
      const d = H[(i - 1) * W + j - 1] + similar(ti, hk[j - 1]);
      const u = H[(i - 1) * W + j] + GAP;
      const l = H[i * W + j - 1] + GAP;
      let best = d, tr = 1;
      if (u > best) { best = u; tr = 2; }
      if (l > best) { best = l; tr = 3; }
      H[i * W + j] = best;
      T[i * W + j] = tr;
    }
  }
  // volta pelo caminho
  const anchor = new Array(n).fill(-1);
  const exact = new Uint8Array(n);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const tr = i === 0 ? 3 : j === 0 ? 2 : T[i * W + j];
    if (tr === 1) {
      const s = similar(tk[i - 1], hk[j - 1]);
      if (s > 0) { anchor[i - 1] = j - 1; if (s === 3) exact[i - 1] = 1; }
      i--; j--;
    } else if (tr === 2) i--;
    else j--;
  }
  let hits = 0;
  for (let k = 0; k < n; k++) {
    if (anchor[k] >= 0) {
      spans[2 * k] = hw[anchor[k]][1];
      spans[2 * k + 1] = Math.max(hw[anchor[k]][2], hw[anchor[k]][1] + 0.04);
      if (exact[k]) hits++;
    }
  }
  // lacunas: reparte o tempo entre âncoras proporcional ao tamanho da palavra
  let k = 0;
  while (k < n) {
    if (spans[2 * k] >= 0) { k++; continue; }
    let a = k;
    while (k < n && spans[2 * k] < 0) k++;
    const b = k; // [a,b) sem tempo
    const t0 = a > 0 ? spans[2 * (a - 1) + 1] : 0;
    const t1 = b < n ? spans[2 * b] : Math.max(duration, t0);
    const lens = []; let tot = 0;
    for (let q = a; q < b; q++) { const w = Math.max(2, tk[q].length) + 1; lens.push(w); tot += w; }
    const span = Math.max(0, t1 - t0);
    let at = t0;
    for (let q = a; q < b; q++) {
      const dur = (span * lens[q - a]) / tot;
      spans[2 * q] = at;
      spans[2 * q + 1] = at + dur;
      at += dur;
    }
  }
  for (let q = 0; q < spans.length; q++) spans[q] = +spans[q].toFixed(2);
  // garante não-decrescente
  for (let q = 1; q < n; q++) if (spans[2 * q] < spans[2 * q - 1] - 0.001) spans[2 * q] = spans[2 * q - 1];
  const miss = [];
  for (let q = 0; q < n; q++) if (!exact[q]) miss.push(q);
  return { spans, coverage: +(hits / n).toFixed(3), miss };
}
