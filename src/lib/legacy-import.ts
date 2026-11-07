import type { Currency, PiggybankKind, TransactionKind } from "./models";

/**
 * CoinFlow 1.0 data.json converter. Never uploads anything or mutates its input.
 * Original objects are retained as legacy_record for historical fidelity.
 */
export interface LegacyBankRow {
  legacy_id: string;
  name: string;
  type: PiggybankKind;
  goal: number;
  currency: Currency;
  timestamp: string | null;
  legacy_record: Record<string, unknown>;
}

export interface LegacyTransactionRow {
  legacy_id: string;
  concept: string;
  type: TransactionKind;
  amount: number;
  currency: Currency;
  category: string;
  occurred_on: string;
  timestamp: string;
  external: boolean;
  piggybank_legacy_id: string | null;
  legacy_record: Record<string, unknown>;
}

export interface LegacyImportPreview {
  piggybanks: LegacyBankRow[];
  transactions: LegacyTransactionRow[];
  orphanedReferences: number;
  zeroAmountTransactions: number;
  exchangeTransactions: number;
  balances: Record<Currency, number>;
}

export class LegacyDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegacyDataError";
  }
}

function fail(context: string, detail: string): never {
  throw new LegacyDataError(`${context}: ${detail}`);
}

function object(value: unknown, context: string): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return fail(context, "expected an object");
  }
  return value as Record<string, unknown>;
}

function sourceId(value: unknown, context: string): string {
  if (typeof value !== "string" && !(typeof value === "number" && Number.isSafeInteger(value))) {
    return fail(context, "missing or invalid id");
  }
  const id = String(value);
  if (!id.trim() || id.length > 160) return fail(context, "invalid id length");
  return id;
}

function label(value: unknown, context: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    return fail(context, "missing or invalid name/concept");
  }
  return value.trim();
}

function money(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 99999999999999) {
    return fail(context, "amount must be a non-negative number");
  }
  const rounded = Math.round(value * 100) / 100;
  // Do not silently round genuine fractional cents from the original file.
  if (Math.abs(value - rounded) > 0.000001) return fail(context, "more than two decimal places");
  return rounded;
}

function currency(value: unknown, context: string): Currency {
  if (value === "€" || value === "EUR") return "EUR";
  if (value === "$" || value === "USD") return "USD";
  return fail(context, "unsupported currency (only EUR and USD)");
}

function dateOf(value: unknown, context: string): { occurred_on: string; timestamp: string } {
  if (typeof value !== "string" || !value.trim()) return fail(context, "missing timestamp");
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return fail(context, "invalid timestamp");
  // CoinFlow 1.0 renders dates in the browser's local timezone.
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(timestamp);
  const part = (name: string) => parts.find(p => p.type === name)?.value;
  return {
    timestamp: timestamp.toISOString(),
    occurred_on: `${part("year")}-${part("month")}-${part("day")}`
  };
}

function flag(value: unknown, context: string): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== "boolean") return fail(context, "expected a boolean");
  return value;
}

function bankType(pb: Record<string, unknown>, context: string): PiggybankKind {
  if (pb.created_from_expense === true || pb.type === "expense") return "expense";
  if (pb.type === undefined || pb.type === null || pb.type === "savings") return "savings";
  if (pb.type === "budget") return "budget";
  return fail(context, "unknown piggybank type");
}

export function parseLegacyData(input: unknown): LegacyImportPreview {
  const data = object(input, "data.json");
  if (!Array.isArray(data.transactions) || !Array.isArray(data.piggybanks)) {
    return fail("data.json", "expected transactions[] and piggybanks[]");
  }
  if (data.piggybanks.length > 2000 || data.transactions.length > 10000) {
    return fail("data.json", "too many records for a single import");
  }
  if (data.piggybanks.length + data.transactions.length === 0) {
    return fail("data.json", "the file contains no records");
  }

  const banks: LegacyBankRow[] = [];
  const transactions: LegacyTransactionRow[] = [];
  const bankIds = new Set<string>();
  const transactionIds = new Set<string>();
  data.piggybanks.forEach((unknownBank, index) => {
    const ctx = `piggybanks[${index}]`;
    const bank = object(unknownBank, ctx);
    const legacyId = sourceId(bank.id, ctx);
    if (bankIds.has(legacyId)) return fail(ctx, "duplicate id");
    bankIds.add(legacyId);
    const timestamp = bank.timestamp === undefined || bank.timestamp === null
      ? null : dateOf(bank.timestamp, ctx).timestamp;
    banks.push({
      legacy_id: legacyId,
      name: label(bank.concept, ctx, 120),
      type: bankType(bank, ctx),
      goal: money(bank.amount, ctx),
      currency: currency(bank.currency ?? "€", ctx),
      timestamp,
      legacy_record: bank
    });
  });

  let orphanedReferences = 0;
  let zeroAmountTransactions = 0;
  let exchangeTransactions = 0;
  const bankMap = new Map(banks.map(bank => [bank.legacy_id, bank]));
  data.transactions.forEach((unknownTransaction, index) => {
    const ctx = `transactions[${index}]`;
    const transaction = object(unknownTransaction, ctx);
    const legacyId = sourceId(transaction.id, ctx);
    if (transactionIds.has(legacyId)) return fail(ctx, "duplicate id");
    transactionIds.add(legacyId);
    const kind = transaction.type;
    if (kind !== "income" && kind !== "expense") return fail(ctx, "unknown transaction type");
    const amount = money(transaction.amount, ctx);
    const rowCurrency = currency(transaction.currency ?? "€", ctx);
    const { timestamp, occurred_on } = dateOf(transaction.timestamp, ctx);
    const rawId = transaction.piggybank_id;
    const linkedId = rawId === undefined || rawId === null || rawId === "" ? null : sourceId(rawId, ctx);
    const linkedBank = linkedId ? bankMap.get(linkedId) : undefined;
    if (linkedId && !linkedBank) orphanedReferences++;
    if (linkedBank && linkedBank.currency !== rowCurrency) {
      return fail(ctx, "the transaction and its piggybank use different currencies");
    }
    if (amount === 0) zeroAmountTransactions++;
    if (transaction.exchange_ref === true) exchangeTransactions++;
    const category = typeof transaction.category === "string" && transaction.category.trim()
      ? label(transaction.category, ctx, 80) : "General";
    transactions.push({
      legacy_id: legacyId,
      concept: label(transaction.concept ?? "Transaction", ctx, 180),
      type: kind,
      amount,
      currency: rowCurrency,
      category,
      occurred_on,
      timestamp,
      external: flag(transaction.external, ctx),
      piggybank_legacy_id: linkedBank ? linkedId : null,
      legacy_record: transaction
    });
  });

  // Same balance formula as the local app in main: global transactions,
  // plus savings piggybank overflow (also when the deposit was external).
  const balances: Record<Currency, number> = { EUR: 0, USD: 0 };
  for (const row of transactions) {
    if (!row.external && !row.piggybank_legacy_id) {
      // Orphan references are kept as historical metadata, not counted as
      // a global transaction: reject rather than silently alter balances.
      const originalId = row.legacy_record.piggybank_id;
      if (originalId !== undefined && originalId !== null && originalId !== "" && !bankMap.has(String(originalId))) {
        return fail(`transaction ${row.legacy_id}`, "references a missing piggybank");
      }
      balances[row.currency] += row.type === "income" ? row.amount : -row.amount;
    }
  }
  for (const bank of banks) {
    if (bank.type !== "savings") continue;
    const income = transactions
      .filter(row => row.piggybank_legacy_id === bank.legacy_id && row.type === "income")
      .reduce((sum, row) => sum + row.amount, 0);
    balances[bank.currency] += Math.max(0, income - bank.goal);
  }
  balances.EUR = Math.round(balances.EUR * 100) / 100;
  balances.USD = Math.round(balances.USD * 100) / 100;
  return { piggybanks: banks, transactions, orphanedReferences, zeroAmountTransactions, exchangeTransactions, balances };
}
