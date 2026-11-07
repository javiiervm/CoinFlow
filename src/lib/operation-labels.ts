import type { Language } from "./i18n";
import type { Transaction } from "./models";

/** Render DB-generated operation names without translating user-authored notes. */
export function transactionLabel(transaction: Transaction, language: Language): string {
  if (language !== "es" || !transaction.operation_kind) return transaction.concept;
  const prefixes: [string, string][] = [
    ["Transfer to ", "Transferencia a "],
    ["Deposit to ", "Ingreso en "],
    ["External deposit to ", "Aportación externa a "],
    ["Withdrawal from ", "Retirada de "],
    ["Transfer from ", "Transferencia desde "],
    ["Expense from ", "Gasto de "],
    ["Exchange to ", "Cambio a "],
    ["Exchange from ", "Cambio desde "]
  ];
  for (const [english, spanish] of prefixes) {
    if (transaction.concept.startsWith(english)) {
      return spanish + transaction.concept.slice(english.length);
    }
  }
  return transaction.concept;
}
