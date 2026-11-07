import type { Currency, Piggybank, Transaction } from "./models";
import type { Language } from "./i18n";

export function formatMoney(amount: number, currency: Currency, language: Language = "en"): string {
  return new Intl.NumberFormat(language === "es" ? "es-ES" : "en-GB", {
    style: "currency", currency, maximumFractionDigits: 2
  }).format(amount);
}

/** Reproduce CoinFlow 1.0 balance semantics for all three piggybank types. */
export function piggybankBalance(bank: Piggybank, transactions: Transaction[]): number {
  let income = 0;
  let expense = 0;
  for (const transaction of transactions) {
    if (transaction.piggybank_id !== bank.id || transaction.currency !== bank.currency) continue;
    if (transaction.type === "income") income += transaction.amount;
    else expense += transaction.amount;
  }
  // The savings target caps retained funds. Amounts beyond it return to
  // the global balance, just as in CoinFlow 1.0.
  return bank.type === "savings" ? Math.min(income, bank.goal) - expense : income - expense;
}

export function globalBalance(transactions: Transaction[], currency: Currency, piggybanks: Piggybank[] = []): number {
  const direct = transactions.reduce((total, transaction) => {
    if (transaction.currency !== currency || transaction.external || transaction.piggybank_id) return total;
    return total + (transaction.type === "income" ? transaction.amount : -transaction.amount);
  }, 0);
  const overflow = piggybanks.filter(bank => bank.currency === currency && bank.type === "savings")
    .reduce((total, bank) => {
      const incomes = transactions.reduce((sum, t) =>
        t.piggybank_id === bank.id && t.currency === currency && t.type === "income" ? sum + t.amount : sum, 0);
      return total + Math.max(0, incomes - bank.goal);
    }, 0);
  return Math.round((direct + overflow) * 100) / 100;
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

export function cashflowSeries(transactions: Transaction[], currency: Currency, now = new Date(), language: Language = "en") {
  const months = Array.from({ length: 6 }, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      label: new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-GB", { month: "short" }).format(d),
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
  const progress = bank.type === "expense"
    ? transactions.filter(t => t.piggybank_id === bank.id && t.currency === bank.currency && t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0)
    : current;
  return Math.max(0, Math.min(100, progress / bank.goal * 100));
}
