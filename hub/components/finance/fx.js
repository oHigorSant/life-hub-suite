// Utilidades de formatação e pedidos da nova tela de finanças.
export const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const brl0 = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const num = (v) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 0) => `${(v * 100).toFixed(d).replace(".", ",")}%`;
export const monthLabel = (key) => { const [y, m] = key.split("-"); return `${MONTH_NAMES[Number(m) - 1]} ${y}`; };
export const monthShort = (key) => MONTH_NAMES[Number(key.split("-")[1]) - 1].slice(0, 3);
export const dm = (iso) => { const [, m, d] = String(iso).split("-"); return `${d}/${m}`; };
export const todayISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export const ACCOUNT_TYPE_LABELS = { checking: "Conta corrente", savings: "Poupança", credit_card: "Cartão de crédito", cash: "Dinheiro", investment: "Investimento" };

/** Chamada à API de finanças; devolve o JSON ou lança com a mensagem do servidor. */
export async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}
