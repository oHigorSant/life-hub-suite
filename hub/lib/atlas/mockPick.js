// Escolha das questões do simulado: equilibra entre os nós que TÊM questões e completa até o total pedido.
// (Bug anterior: o limite por nó era dividido pelos nós do ESCOPO, não pelos que têm questão; com 10 nós e só 1 com banco, o simulado saía com 4 de 20.)
export function pickBalanced(ranked, count) {
  const nodesWithQ = new Set(ranked.map((q) => q.node_id)).size || 1;
  const cap = Math.ceil(count / nodesWithQ); // partes iguais entre os nós com banco; o que sobrar completa depois
  const pick = [], perNode = new Map(), left = [];
  for (const q of ranked) {
    if (pick.length >= count) break;
    if ((perNode.get(q.node_id) || 0) >= cap) { left.push(q); continue; }
    perNode.set(q.node_id, (perNode.get(q.node_id) || 0) + 1);
    pick.push(q);
  }
  for (const q of left) { if (pick.length >= count) break; pick.push(q); } // ainda falta: completa com o que sobrou, sem o limite por nó
  return pick;
}