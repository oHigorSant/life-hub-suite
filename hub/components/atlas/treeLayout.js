// Layout + roteamento ortogonal da árvore de habilidades ("cable management").
//
// 1. Ramos viram faixas horizontais (linhas de metrô); tiers viram colunas.
// 2. A ordem das faixas e dos nós dentro delas minimiza cruzamentos (busca local + baricentro).
// 3. Cada pré-requisito vira um fio ortogonal roteado por A* numa grade, desviando de nós e rótulos,
//    penalizando curvas e cruzamentos, e *agrupando* (bundling) fios que saem do mesmo nó ou chegam ao mesmo nó.

// Fluxo de CIMA PARA BAIXO: nível 1 no topo, ápice embaixo. Ramos = colunas (linhas de metrô).
export const CARD_W = 208;
export const CARD_H = 66;
export const SLOT_W = CARD_W + 40; // largura de um cartão + respiro lateral
export const BRANCH_GAP = 56;
export const ROW_H = 178; // cartão + canal horizontal para os fios
export const G = 12; // lado da célula da grade de roteamento
export const PAD_X = 150; // espaço à esquerda para os rótulos de nível
export const PAD_TOP = 120; // espaço no topo para os nomes dos ramos
const PAD_BOTTOM = 90;

export const LANE_COLORS = ["#a78bfa", "#38bdf8", "#fbbf24", "#34d399", "#f472b6", "#fb923c", "#2dd4bf", "#c084fc", "#a3e635", "#f87171", "#60a5fa", "#e879f9"];

// ---------------------------------------------------------------- ordem das faixas

function orderLanes(nodes, hard) {
  const byBranch = new Map();
  for (const n of nodes) {
    if (!byBranch.has(n.branch)) byBranch.set(n.branch, []);
    byBranch.get(n.branch).push(n);
  }
  const names = [...byBranch.keys()].sort(
    (a, b) => Math.min(...byBranch.get(a).map((n) => n.tier)) - Math.min(...byBranch.get(b).map((n) => n.tier)) || byBranch.get(b).length - byBranch.get(a).length
  );
  const branchOf = new Map(nodes.map((n) => [n.id, n.branch]));
  // pesos entre faixas
  const w = new Map();
  for (const e of hard) {
    const a = branchOf.get(e.f), b = branchOf.get(e.t);
    if (!a || !b || a === b) continue;
    const k = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    w.set(k, (w.get(k) || 0) + 1);
  }
  const cost = (order) => {
    const idx = new Map(order.map((n, i) => [n, i]));
    let c = 0;
    for (const [k, v] of w) {
      const [a, b] = k.split("\u0000");
      c += v * Math.abs(idx.get(a) - idx.get(b));
    }
    return c;
  };
  let best = names.slice();
  let bestC = cost(best);
  // busca local: troca de pares e inserção, com reinícios determinísticos
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const improve = (order) => {
    let c = cost(order);
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < order.length; i++)
        for (let j = 0; j < order.length; j++) {
          if (i === j) continue;
          const t = order.slice();
          const [x] = t.splice(i, 1);
          t.splice(j, 0, x);
          const tc = cost(t);
          if (tc < c - 1e-9) {
            order = t;
            c = tc;
            changed = true;
          }
        }
    }
    return [order, c];
  };
  [best, bestC] = improve(best);
  for (let r = 0; r < 12 && names.length > 2; r++) {
    const start = names.slice().sort(() => rnd() - 0.5);
    const [o, c] = improve(start);
    if (c < bestC) [best, bestC] = [o, c];
  }
  return { order: best, byBranch };
}

// ---------------------------------------------------------------- posições

export function layoutNodes(nodes, hard) {
  const { order, byBranch } = orderLanes(nodes, hard);
  const laneIdx = new Map(order.map((n, i) => [n, i]));
  const preds = new Map(nodes.map((n) => [n.id, []]));
  const succs = new Map(nodes.map((n) => [n.id, []]));
  for (const e of hard) {
    preds.get(e.t)?.push(e.f);
    succs.get(e.f)?.push(e.t);
  }
  const cells = new Map();
  const key = (lane, tier) => `${lane}|${tier}`;
  for (const name of order)
    for (const n of byBranch.get(name).slice().sort((a, b) => a.sort - b.sort)) {
      const k = key(laneIdx.get(name), n.tier);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(n);
    }
  const maxTier = Math.max(0, ...nodes.map((n) => n.tier));
  // largura (em slots) de cada coluna-ramo = maior pilha num mesmo nível
  const slots = order.map((_, lane) => {
    let m = 1;
    for (let t = 0; t <= maxTier; t++) m = Math.max(m, cells.get(key(lane, t))?.length || 0);
    return m;
  });
  const colX = [];
  let x = PAD_X;
  for (let lane = 0; lane < order.length; lane++) {
    colX.push(x);
    x += slots[lane] * SLOT_W + BRANCH_GAP;
  }
  const xEst = new Map();
  const place = (lane, list) => {
    const w = slots[lane] * SLOT_W;
    const left = colX[lane] + (w - list.length * SLOT_W) / 2;
    list.forEach((n, i) => xEst.set(n.id, left + i * SLOT_W + SLOT_W / 2));
  };
  for (const [k, list] of cells) place(Number(k.split("|")[0]), list);
  const bary = (n, nbrs) => {
    const xs = nbrs.map((id) => xEst.get(id)).filter((v) => v != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : xEst.get(n.id);
  };
  for (let it = 0; it < 6; it++) {
    const down = it % 2 === 0;
    for (let ti = 0; ti <= maxTier; ti++) {
      const tier = down ? ti : maxTier - ti;
      for (let lane = 0; lane < order.length; lane++) {
        const list = cells.get(key(lane, tier));
        if (!list || list.length < 2) continue;
        const keyed = list.map((n) => [n, bary(n, down ? preds.get(n.id) : succs.get(n.id))]).sort((a, b) => a[1] - b[1]);
        list.splice(0, list.length, ...keyed.map((q) => q[0]));
        place(lane, list);
      }
    }
  }
  const snap = (v) => Math.round(v / G - 0.5) * G + G / 2;
  const pos = new Map();
  for (const n of nodes) pos.set(n.id, { x: snap(xEst.get(n.id)), y: snap(PAD_TOP + n.tier * ROW_H + CARD_H / 2) });
  const lanes = order.map((name, lane) => ({ name, x: colX[lane], w: slots[lane] * SLOT_W, color: LANE_COLORS[lane % LANE_COLORS.length], index: lane }));
  const levels = Array.from({ length: maxTier + 1 }, (_, t) => ({ tier: t, y: PAD_TOP + t * ROW_H - (ROW_H - CARD_H) / 2, h: ROW_H }));
  return { pos, lanes, levels, width: x - BRANCH_GAP + 60, height: PAD_TOP + maxTier * ROW_H + CARD_H + PAD_BOTTOM };
}

// ---------------------------------------------------------------- roteamento (A* ortogonal)

class Heap {
  constructor() {
    this.f = [];
    this.v = [];
  }
  get size() {
    return this.f.length;
  }
  push(f, v) {
    const F = this.f, V = this.v;
    let i = F.length;
    F.push(f);
    V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= F[i]) break;
      [F[p], F[i]] = [F[i], F[p]];
      [V[p], V[i]] = [V[i], V[p]];
      i = p;
    }
  }
  pop() {
    const F = this.f, V = this.v;
    const top = V[0];
    const lf = F.pop(), lv = V.pop();
    if (F.length) {
      F[0] = lf;
      V[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < F.length && F[l] < F[m]) m = l;
        if (r < F.length && F[r] < F[m]) m = r;
        if (m === i) break;
        [F[m], F[i]] = [F[i], F[m]];
        [V[m], V[i]] = [V[i], V[m]];
        i = m;
      }
    }
    return top;
  }
}

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

export function routeEdges(nodes, hard, pos, width, height) {
  const nx = Math.ceil(width / G) + 6;
  const ny = Math.ceil(height / G) + 6;
  const N = nx * ny;
  const gx = (v) => Math.floor(v / G);
  const obst = new Uint8Array(N);
  const near = new Uint8Array(N);
  const HX = Math.ceil((CARD_W / 2 + 4) / G); // meia-largura do cartão em células
  const HY = Math.ceil((CARD_H / 2 + 4) / G); // meia-altura
  for (const n of nodes) {
    const p = pos.get(n.id);
    if (!p) continue;
    const cx = gx(p.x), cy = gx(p.y);
    for (let y = Math.max(0, cy - HY + 1); y <= Math.min(ny - 1, cy + HY - 1); y++)
      for (let x = Math.max(0, cx - HX + 1); x <= Math.min(nx - 1, cx + HX - 1); x++) obst[y * nx + x] = 1;
  }
  for (let y = 1; y < ny - 1; y++)
    for (let x = 1; x < nx - 1; x++) {
      const i = y * nx + x;
      if (!obst[i] && (obst[i - 1] || obst[i + 1] || obst[i - nx] || obst[i + nx])) near[i] = 1;
    }
  const hSrc = new Int32Array(N).fill(-1), hDst = new Int32Array(N).fill(-1);
  const vSrc = new Int32Array(N).fill(-1), vDst = new Int32Array(N).fill(-1);
  const ids = new Map(nodes.map((n, i) => [n.id, i]));
  const g = new Float32Array(N * 4);
  const parent = new Int32Array(N * 4);
  const stamp = new Uint32Array(N * 4);
  let run = 0;
  const routes = [];
  const list = hard
    .map((e) => ({ ...e, a: pos.get(e.f), b: pos.get(e.t) }))
    .filter((e) => e.a && e.b)
    .sort((p, q) => Math.abs(p.b.x - p.a.x) + Math.abs(p.b.y - p.a.y) - (Math.abs(q.b.x - q.a.x) + Math.abs(q.b.y - q.a.y)));

  for (const e of list) {
    const s = ids.get(e.f), d = ids.get(e.t);
    const sx = gx(e.a.x), sy = gx(e.a.y) + HY; // logo abaixo do cartão de origem
    const tx = gx(e.b.x), ty = gx(e.b.y) - HY; // logo acima do cartão de destino
    const startC = sy * nx + sx, goalC = ty * nx + tx;
    run++;
    const heap = new Heap();
    const s0 = startC * 4 + 1; // começa descendo
    g[s0] = 0;
    stamp[s0] = run;
    parent[s0] = -1;
    heap.push(Math.abs(tx - sx) + Math.abs(ty - sy), s0);
    let found = -1;
    let guard = 0;
    while (heap.size && guard++ < 500000) {
      const st = heap.pop();
      const c = st >> 2, dir = st & 3;
      if (c === goalC && dir === 1) {
        found = st;
        break;
      }
      const cx = c % nx, cy = (c / nx) | 0;
      const base = g[st];
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((dir + 2) & 3)) continue;
        const x = cx + DX[nd], y = cy + DY[nd];
        if (x < 1 || y < 1 || x >= nx - 1 || y >= ny - 1) continue;
        const nc = y * nx + x;
        if (obst[nc]) continue;
        const horiz = nd === 0 || nd === 2;
        let cost = 1;
        if (nd === 3) cost += 2.5; // subir é contra o fluxo
        if (nd !== dir) cost += 5;
        if (near[nc]) cost += 1.4;
        const aS = horiz ? hSrc[nc] : vSrc[nc], aD = horiz ? hDst[nc] : vDst[nc];
        if (aS >= 0) cost += aS === s || aD === d ? -0.65 : 30;
        const pS = horiz ? vSrc[nc] : hSrc[nc], pD = horiz ? vDst[nc] : hDst[nc];
        if (pS >= 0) cost += pS === s || pD === d ? 0.4 : 7;
        const ns = nc * 4 + nd;
        const ng = base + cost;
        if (stamp[ns] !== run || ng < g[ns]) {
          stamp[ns] = run;
          g[ns] = ng;
          parent[ns] = st;
          heap.push(ng + Math.abs(tx - x) + Math.abs(ty - y), ns);
        }
      }
    }
    let cells;
    if (found >= 0) {
      cells = [];
      for (let st = found; st !== -1; st = parent[st]) cells.push(st >> 2);
      cells.reverse();
    } else {
      const my = (sy + ty) >> 1;
      cells = [];
      for (let y = sy; y <= my; y++) cells.push(y * nx + sx);
      for (let x = sx; x !== tx; x += Math.sign(tx - sx)) cells.push(my * nx + x);
      for (let y = my; y <= ty; y++) cells.push(y * nx + tx);
    }
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const prev = cells[i - 1], next = cells[i + 1];
      const horiz = (prev != null && Math.abs(c - prev) === 1) || (next != null && Math.abs(next - c) === 1);
      const vert = (prev != null && Math.abs(c - prev) === nx) || (next != null && Math.abs(next - c) === nx);
      if (horiz) { hSrc[c] = s; hDst[c] = d; }
      if (vert) { vSrc[c] = s; vDst[c] = d; }
    }
    const pts = [[e.a.x, e.a.y + CARD_H / 2]];
    for (const c of cells) pts.push([(c % nx) * G + G / 2, ((c / nx) | 0) * G + G / 2]);
    pts.push([e.b.x, e.b.y - CARD_H / 2 - 7]);
    routes.push({ from: e.f, to: e.t, pts: simplify(pts) });
  }
  return routes;
}

function simplify(pts) {
  const out = [];
  for (const p of pts) {
    if (out.length && out[out.length - 1][0] === p[0] && out[out.length - 1][1] === p[1]) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      if ((a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1])) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/** Caminho SVG com cantos arredondados. */
export function roundedPath(pts, r = 9) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx_, ny_] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx_ - cx, ny_ - cy);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const ax = cx - ((cx - px) / l1) * rr, ay = cy - ((cy - py) / l1) * rr;
    const bx = cx + ((nx_ - cx) / l2) * rr, by = cy + ((ny_ - cy) / l2) * rr;
    d += ` L${ax},${ay} Q${cx},${cy} ${bx},${by}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last[0]},${last[1]}`;
}

export function layoutTree(nodes, edges) {
  const hard = edges.filter((e) => e.kind === "hard");
  const L = layoutNodes(nodes, hard);
  const routes = routeEdges(nodes, hard, L.pos, L.width, L.height);
  return { ...L, routes };
}
