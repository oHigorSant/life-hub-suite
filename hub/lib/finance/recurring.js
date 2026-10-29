// Fixas e assinaturas: um cadastro (data.subscriptions[], com kind "fixed" | "subscription") que gera as contas a pagar da série.
// Mudou o valor, o dia, a conta ou ligou/desligou: as contas FUTURAS ainda não pagas da série acompanham na hora.
import { addMonths, daysInMonth, ymOf, norm } from "./analytics.js";

const newId = (p) => p + "_" + Math.random().toString(36).slice(2, 10);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clampDay = (d) => Math.min(Math.max(Math.round(Number(d)) || 1, 1), 28);
const dateOf = (ym, day) => `${ym}-${String(Math.min(day, daysInMonth(ym))).padStart(2, "0")}`;

/** Garante as próximas `count` ocorrências (a partir de hoje) da série; não duplica nem mexe no que já existe no mesmo mês. */
export function ensureUpcoming(data, sub, today, count = 3) {
  data.bills = data.bills || [];
  const have = new Set(data.bills.filter((b) => b.seriesId === sub.seriesId && !b.archived).map((b) => ymOf(b.dueDate)));
  const now = new Date().toISOString();
  let made = 0, ym = ymOf(today), guard = 0;
  while (made < count && guard++ < 12) {
    const due = dateOf(ym, sub.dayOfMonth);
    if (due >= today && !have.has(ym)) {
      data.bills.push({ id: newId("bill"), name: sub.name, categoryId: sub.categoryId, amount: sub.amount, originalAmount: null, lateFee: null, dueDate: due, status: "pending", recurrence: { freq: "monthly", dayOfMonth: sub.dayOfMonth, endDate: null }, seriesId: sub.seriesId, installment: null, notes: sub.kind === "fixed" ? "Conta fixa — gerada pelo cadastro de Fixas e assinaturas." : "Assinatura ativa — gerada pelo cadastro de Fixas e assinaturas.", accountId: sub.accountId ?? null, source: "chat", archived: false, createdAt: now, updatedAt: now });
      made++;
    } else if (due >= today) made++; // mês já coberto conta no horizonte
    ym = addMonths(ym, 1);
  }
  return made;
}

export function createRecurring(data, input, today) {
  const amount = Number(input.amount);
  if (!String(input.name || "").trim() || !(amount > 0)) throw new Error("Nome e valor são obrigatórios.");
  const now = new Date().toISOString();
  const sub = { id: newId("sub"), kind: input.kind === "fixed" ? "fixed" : "subscription", name: String(input.name).trim(), categoryId: input.categoryId || null, amount: round2(amount), accountId: input.accountId || null, dayOfMonth: clampDay(input.dayOfMonth), active: true, seriesId: newId("bser"), cancelledAt: null, notes: null, createdAt: now, updatedAt: now };
  data.subscriptions = data.subscriptions || [];
  data.subscriptions.push(sub);
  ensureUpcoming(data, sub, today);
  return sub;
}

export function updateRecurring(data, id, patch, today) {
  const sub = (data.subscriptions || []).find((s) => s.id === id);
  if (!sub) throw new Error("Cadastro não encontrado.");
  const now = new Date().toISOString();
  if (patch.name !== undefined) { if (!String(patch.name).trim()) throw new Error("Nome vazio."); sub.name = String(patch.name).trim(); }
  if (patch.amount !== undefined) { const a = Number(patch.amount); if (!(a > 0)) throw new Error("Valor inválido."); sub.amount = round2(a); }
  if (patch.dayOfMonth !== undefined) sub.dayOfMonth = clampDay(patch.dayOfMonth);
  if (patch.categoryId !== undefined) sub.categoryId = patch.categoryId || null;
  if (patch.accountId !== undefined) sub.accountId = patch.accountId || null;
  if (patch.payee !== undefined) { const p = String(patch.payee || "").trim(); if (p) sub.payee = p; else delete sub.payee; }
  if (patch.kind !== undefined) sub.kind = patch.kind === "fixed" ? "fixed" : "subscription";
  if (patch.active !== undefined) {
    sub.active = Boolean(patch.active);
    sub.cancelledAt = sub.active ? null : today;
  }
  sub.updatedAt = now;
  const series = (data.bills || []).filter((b) => b.seriesId === sub.seriesId && !b.archived);
  if (!sub.active) {
    // desligou: somem as contas futuras não pagas; o que já venceu ou foi pago fica como histórico
    data.bills = data.bills.filter((b) => !(b.seriesId === sub.seriesId && b.status !== "paid" && b.dueDate > today));
  } else {
    for (const b of series) {
      if (b.status === "paid" || b.dueDate < today) continue; // passado e pago não muda
      b.name = sub.name; b.categoryId = sub.categoryId; b.accountId = sub.accountId; b.amount = sub.amount;
      b.dueDate = dateOf(ymOf(b.dueDate), sub.dayOfMonth);
      b.recurrence = { freq: "monthly", dayOfMonth: sub.dayOfMonth, endDate: null };
      b.updatedAt = now;
    }
    ensureUpcoming(data, sub, today);
  }
  return sub;
}

export function removeRecurring(data, id, today) {
  const sub = (data.subscriptions || []).find((s) => s.id === id);
  if (!sub) throw new Error("Cadastro não encontrado.");
  data.subscriptions = data.subscriptions.filter((s) => s.id !== id);
  data.bills = (data.bills || []).filter((b) => !(b.seriesId === sub.seriesId && b.status !== "paid" && b.dueDate >= today));
  return sub;
}

/** Séries mensais sem fim que foram criadas à mão/pelo chat e ainda não estão no cadastro: entram como fixa ou assinatura. */
export function adoptRecurring(data, today) {
  const known = new Set((data.subscriptions || []).map((s) => s.seriesId));
  const bySeries = new Map();
  for (const b of data.bills || []) { if (b.archived || !b.seriesId || b.source === "openfinance" || known.has(b.seriesId)) continue; (bySeries.get(b.seriesId) || bySeries.set(b.seriesId, []).get(b.seriesId)).push(b); }
  const catName = (id) => (data.categories.find((c) => c.id === id) || {}).name || "";
  let adopted = 0;
  for (const [seriesId, items] of bySeries) {
    const sorted = items.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const first = sorted[0], last = sorted[sorted.length - 1];
    if (!(first.recurrence && first.recurrence.freq === "monthly" && first.recurrence.endDate === null)) continue;
    const now = new Date().toISOString();
    const open = sorted.some((b) => b.status !== "paid");
    data.subscriptions = data.subscriptions || [];
    data.subscriptions.push({ id: newId("sub"), kind: /assinatura|streaming/i.test(norm(catName(first.categoryId))) || /spotify|netflix|prime|disney|youtube|claude|canva|google one|icloud|hbo/i.test(norm(first.name)) ? "subscription" : "fixed", name: first.name, categoryId: first.categoryId, amount: last.amount, accountId: last.accountId ?? null, dayOfMonth: clampDay(first.recurrence.dayOfMonth || Number(first.dueDate.slice(8, 10))), active: open, seriesId, cancelledAt: open ? null : today, notes: null, createdAt: now, updatedAt: now });
    adopted++;
  }
  return adopted;
}
