export type Currency = "EUR" | "USD";
export type TransactionKind = "income" | "expense";
export type PiggybankKind = "savings" | "budget" | "expense";

export interface Transaction {
  id: string;
  user_id: string;
  concept: string;
  type: TransactionKind;
  amount: number;
  currency: Currency;
  category: string;
  occurred_on: string;
  piggybank_id: string | null;
  external: boolean;
  created_at?: string;
  legacy_id?: string | null;
  legacy_record?: Record<string, unknown> | null;
}

export interface Piggybank {
  id: string;
  user_id: string;
  name: string;
  type: PiggybankKind;
  goal: number;
  currency: Currency;
  created_at?: string;
  legacy_id?: string | null;
  legacy_record?: Record<string, unknown> | null;
}

export type NewTransaction = Omit<Transaction, "id" | "created_at">;
export type NewPiggybank = Omit<Piggybank, "id" | "created_at">;
