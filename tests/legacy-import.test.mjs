import test from "node:test";
import assert from "node:assert/strict";
import { parseLegacyData, LegacyDataError } from "../src/lib/legacy-import.ts";
import { globalBalance, piggybankBalance, piggybankProgress } from "../src/lib/finance.ts";

function fixture() {
  return {
    piggybanks: [
      { id: "1733000000000", concept: "Holiday", type: "savings", amount: 100, currency: "€", timestamp: "2026-01-01T12:00:00.000Z" },
      { id: "budget-9", concept: "Groceries", type: "budget", amount: 0, currency: "$", timestamp: "2026-01-01T12:00:00.000Z" },
      { id: "expense-7", concept: "Old debt", created_from_expense: true, amount: 50, currency: "€", timestamp: "2026-01-01T12:00:00.000Z" }
    ],
    transactions: [
      { id: "1", type: "income", concept: "Salary", amount: 300, currency: "€", timestamp: "2026-01-03T12:00:00.000Z", piggybank_id: "", external: false },
      { id: "2", type: "income", concept: "Saving", amount: 130, currency: "€", timestamp: "2026-01-04T12:00:00.000Z", piggybank_id: "1733000000000", external: true },
      { id: "3", type: "expense", concept: "Expense", amount: 50, currency: "€", timestamp: "2026-01-05T12:00:00.000Z", piggybank_id: "expense-7" },
      { id: "4", type: "income", concept: "Debt payment", amount: 20, currency: "€", timestamp: "2026-01-06T12:00:00.000Z", piggybank_id: "expense-7" },
      { id: "5", type: "income", concept: "Budget topup", amount: 200, currency: "$", timestamp: "2026-01-07T12:00:00.000Z", piggybank_id: "budget-9" },
      { id: "6", type: "expense", concept: "Budget spending", amount: 25, currency: "$", timestamp: "2026-01-08T12:00:00.000Z", piggybank_id: "budget-9" },
      { id: "7", type: "expense", concept: "Exchange to USD", amount: 40, currency: "€", timestamp: "2026-01-09T12:00:00.000Z", exchange_ref: true },
      { id: "8", type: "income", concept: "Exchange from EUR", amount: 45, currency: "$", timestamp: "2026-01-09T12:00:00.000Z", exchange_ref: true },
      { id: "9", type: "income", concept: "Zero legacy entry", amount: 0, currency: "€", timestamp: "2026-01-09T12:00:00.000Z" },
      { id: "10", type: "expense", concept: "Archived expense", amount: 10, currency: "€", timestamp: "2026-01-10T12:00:00.000Z", piggybank_id: null, piggybank_name: "Deleted bank", edited: true }
    ]
  };
}

test("1.0 JSON becomes normalized, preserving source ids, types and historic metadata", () => {
  const plan = parseLegacyData(fixture());
  assert.equal(plan.piggybanks.length, 3);
  assert.equal(plan.transactions.length, 10);
  assert.equal(plan.piggybanks[0].legacy_id, "1733000000000");
  assert.equal(plan.piggybanks[2].type, "expense");
  assert.equal(plan.piggybanks[1].currency, "USD");
  assert.equal(plan.transactions[1].piggybank_legacy_id, "1733000000000");
  assert.equal(plan.transactions[1].external, true);
  assert.equal(plan.transactions[9].legacy_record.piggybank_name, "Deleted bank");
  assert.equal(plan.transactions[9].legacy_record.edited, true);
  assert.equal(plan.zeroAmountTransactions, 1);
  assert.equal(plan.exchangeTransactions, 2);
  assert.equal(plan.balances.EUR, 280); // 300 - 40 - 10 + 30 savings overflow
  assert.equal(plan.balances.USD, 45);
});

test("2.0 balances reproduce the savings cap and expense tracker semantics", () => {
  const plan = parseLegacyData(fixture());
  const banks = plan.piggybanks.map(b => ({
    id: b.legacy_id, user_id: "user", name: b.name, type: b.type, goal: b.goal, currency: b.currency
  }));
  const transactions = plan.transactions.map(t => ({
    id: t.legacy_id, user_id: "user", concept: t.concept, type: t.type,
    amount: t.amount, currency: t.currency, category: t.category, occurred_on: t.occurred_on,
    piggybank_id: t.piggybank_legacy_id, external: t.external
  }));
  assert.equal(globalBalance(transactions, "EUR", banks), 280);
  assert.equal(globalBalance(transactions, "USD", banks), 45);
  assert.equal(piggybankBalance(banks[0], transactions), 100);
  assert.equal(piggybankBalance(banks[1], transactions), 175);
  assert.equal(piggybankBalance(banks[2], transactions), -30);
  assert.equal(piggybankProgress(banks[2], transactions), 40);
});

test("bad and ambiguous source records are rejected before upload", () => {
  assert.throws(() => parseLegacyData({ transactions: [] }), LegacyDataError);
  const duplicate = fixture();
  duplicate.transactions.push({ ...duplicate.transactions[0] });
  assert.throws(() => parseLegacyData(duplicate), /duplicate id/);
  const unsupported = fixture();
  unsupported.transactions[0].currency = "£";
  assert.throws(() => parseLegacyData(unsupported), /unsupported currency/);
  const invalid = fixture();
  invalid.transactions[0].amount = 1.234;
  assert.throws(() => parseLegacyData(invalid), /two decimal/);
  const dangling = fixture();
  dangling.transactions[0].piggybank_id = "missing";
  assert.throws(() => parseLegacyData(dangling), /missing piggybank/);
  const crossCurrency = fixture();
  crossCurrency.transactions[1].currency = "$";
  assert.throws(() => parseLegacyData(crossCurrency), /different currencies/);
});
