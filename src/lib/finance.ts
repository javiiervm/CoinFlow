import type { Currency, Piggybank, Transaction } from "./models";

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency", currency, maximumFractionDigits: 2
  }).format(amount);
}

export function piggybankBalance(bank: Piggybank, transactions: Transaction[]): number {
  return transactions.reduce((total, transaction) => {
    if (transaction.piggybank_id !== bank.id || transaction.currency !== bank.currency) return total;
    return total + (transaction.type === "income" ? transaction.amount : -transaction.amount);
  }, 0);
}

export function globalBalance(transactions: Transaction[], currency: Currency): number {
  return transactions.reduce((total, transaction) => {
    if (transaction.currency !== currency || transaction.external || transaction.piggybank_id) return total;
    return total + (transaction.type === "income" ? transaction.amount : -transaction.amount);
  }, 0);
}

export function thisMonth(transaction: Transaction, now = new Date()): boolean {
  const date = new Date(transaction.occurred_on + "T12:00:00");
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

export function monthlySummary(transactions: Transaction[], currency: Currency) {
  return transactions.filter((t) => t.currency === currency && !t.external && thisMonth(t))
    .reduce((result, t) => {
      result[t.type] += t.amount;
      return result;
    }, { income: 0, expense: 0 });
}

export function cashflowSeries(transactions: Transaction[], currency: Currency, now = new Date()) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      label: new Intl.DateTimeFormat("es-ES", { month: "short" }).format(d),
      income: 0,
      expense: 0
    };
  });
  transactions.filter((t) => t.currency === currency && !t.external).forEach((t) => {
    const d = new Date(t.occurred_on + "T12:00:00");
    const row = months.find((m) => m.year === d.getFullYear() && m.month === d.getMonth());
    if (row) row[t.type] += t.amount;
  });
  return months;
}

export function piggybankProgress(bank: Piggybank, transactions: Transaction[]): number {
  const current = piggybankBalance(bank, transactions);
  if (bank.type === "budget") return 100;
  if (bank.goal <= 0) return 0;
  return Math.max(0, Math.min(100, (bank.type === "expense" ? current + bank.goal : current) / bank.goal * 100));
}
