import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { globalBalance, piggybankBalance, monthlySummary, cashflowSeries, piggybankProgress, expenseTrackerCompleted, expenseTrackerRemaining, newestFirst } from "../src/lib/finance.ts";

const user = "account";
const date = new Date();
const currentMonth = [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  "05"
].join("-");
const t = (id, type, amount, currency="EUR", bankId=null, kind=null, external=false) => ({
  id, user_id:user, concept:"Test entry", type, amount, currency,
  category: "General", piggybank_id:bankId, operation_kind:kind,
  external, occurred_on:currentMonth
});
const savings = { id:"savings", user_id:user, name:"Savings", type:"savings", goal:100, currency:"EUR" };
const budget = { id:"budget", user_id:user, name:"Budget", type:"budget", goal:0, currency:"EUR" };
const debt = { id:"debt", user_id:user, name:"Debt", type:"expense", goal:50, currency:"EUR" };

test("internal allocation moves money without changing total held", () => {
  const before=[t("salary","income",500)];
  const after=[
    ...before,
    t("allocate-out","expense",200,"EUR",null,"allocate"),
    t("allocate-in","income",200,"EUR","budget","allocate")
  ];
  assert.equal(globalBalance(before,"EUR",[budget]),500);
  assert.equal(globalBalance(after,"EUR",[budget]),300);
  assert.equal(piggybankBalance(budget,after),200);
  assert.equal(globalBalance(after,"EUR",[budget])+piggybankBalance(budget,after),500);
  assert.deepEqual(monthlySummary(after,"EUR"),{income:500,expense:0});
});

test("withdrawal from budget returns cash without counting as earned income", () => {
  const rows=[
    t("salary","income",500),
    t("allocate-out","expense",200,"EUR",null,"allocate"),
    t("allocate-in","income",200,"EUR","budget","allocate"),
    t("withdraw-out","expense",75,"EUR","budget","withdraw"),
    t("withdraw-in","income",75,"EUR",null,"withdraw")
  ];
  assert.equal(globalBalance(rows,"EUR",[budget]),375);
  assert.equal(piggybankBalance(budget,rows),125);
  assert.deepEqual(monthlySummary(rows,"EUR"),{income:500,expense:0});
});

test("spending from budget counts as expense while leaving global cash alone", () => {
  const rows=[
    t("salary","income",500),
    t("allocate-out","expense",200,"EUR",null,"allocate"),
    t("allocate-in","income",200,"EUR","budget","allocate"),
    t("spend","expense",60,"EUR","budget","spend")
  ];
  assert.equal(globalBalance(rows,"EUR",[budget]),300);
  assert.equal(piggybankBalance(budget,rows),140);
  assert.deepEqual(monthlySummary(rows,"EUR"),{income:500,expense:60});
});

test("external top-ups do not create artificial earned income", () => {
  const rows=[
    t("external","income",80,"EUR","budget","external_topup",true)
  ];
  assert.equal(globalBalance(rows,"EUR",[budget]),0);
  assert.equal(piggybankBalance(budget,rows),80);
  assert.deepEqual(monthlySummary(rows,"EUR"),{income:0,expense:0});
});

test("savings overflow returns to global balance as in 1.0", () => {
  const rows=[
    t("salary","income",500),
    t("allocate-out","expense",130,"EUR",null,"allocate"),
    t("allocate-in","income",130,"EUR","savings","allocate")
  ];
  assert.equal(piggybankBalance(savings,rows),100);
  assert.equal(globalBalance(rows,"EUR",[savings]),400);
  assert.equal(globalBalance(rows,"EUR",[savings])+piggybankBalance(savings,rows),500);
});

test("expense tracker retains negative balance until repaid", () => {
  const rows=[
    t("initial-expense","expense",50,"EUR","debt"),
    t("repay","income",20,"EUR","debt","allocate")
  ];
  assert.equal(piggybankBalance(debt,rows),-30);
});

test("exchanging currency changes balances, not monthly income or expense", () => {
  const rows=[
    t("salary","income",500),
    t("exchange-from","expense",60,"EUR",null,"exchange"),
    t("exchange-to","income",66,"USD",null,"exchange")
  ];
  assert.equal(globalBalance(rows,"EUR"),440);
  assert.equal(globalBalance(rows,"USD"),66);
  assert.deepEqual(monthlySummary(rows,"EUR"),{income:500,expense:0});
  assert.deepEqual(monthlySummary(rows,"USD"),{income:0,expense:0});
  const history=cashflowSeries(rows,"EUR",date);
  assert.ok(history.some(month=>month.income>=500 && month.expense===0));
});

test("SQL migration protects grouped operations and requires authentication", () => {
  const here=dirname(fileURLToPath(import.meta.url));
  const sql=readFileSync(join(here,"..","supabase","migrations","202611070003_financial_operations.sql"),"utf8");
  assert.match(sql,/create table public\.financial_operations/i);
  assert.match(sql,/create or replace function public\.apply_financial_operation/i);
  assert.match(sql,/pg_advisory_xact_lock/i);
  assert.match(sql,/security invoker/i);
  assert.match(sql,/operation_id is null/i);
  assert.match(sql,/insufficient_global_balance/);
  assert.match(sql,/insufficient_piggybank_balance/);
  assert.match(sql,/already_applied/);
});

test("budget progress uses remaining balance relative to target", () => {
  const plan={...budget,goal:50};
  assert.equal(piggybankProgress(plan,[t("balance","income",25,"EUR","budget")]),50);
  assert.equal(piggybankProgress({...budget,goal:0},[t("balance","income",25,"EUR","budget")]),0);
  assert.equal(piggybankProgress(plan,[t("balance","income",75,"EUR","budget")]),100);
});

test("an expense tracker completes at its goal and caps displayed progress", () => {
  const opened=[t("expense","expense",50,"EUR","debt")];
  assert.equal(expenseTrackerCompleted(debt,opened),false);
  assert.equal(expenseTrackerRemaining(debt,opened),50);
  const partial=[...opened,t("payment","income",20,"EUR","debt")];
  assert.equal(expenseTrackerRemaining(debt,partial),30);
  assert.equal(piggybankProgress(debt,partial),40);
  const paid=[...opened,t("payment","income",50,"EUR","debt")];
  assert.equal(expenseTrackerCompleted(debt,paid),true);
  assert.equal(expenseTrackerRemaining(debt,paid),0);
  assert.equal(piggybankProgress(debt,paid),100);
});

test("transactions sort by date then real creation timestamp, newest first", () => {
  const older={...t("older","expense",5),occurred_on:"2026-10-20",created_at:"2026-10-20T10:00:00Z"};
  const newer={...t("newer","expense",6),occurred_on:"2026-10-20",created_at:"2026-10-20T17:00:00Z"};
  const oldest={...t("oldest","expense",1),occurred_on:"2026-10-19",created_at:"2026-10-19T20:00:00Z"};
  assert.deepEqual([older,oldest,newer].sort(newestFirst).map(x=>x.id),["newer","older","oldest"]);
});
