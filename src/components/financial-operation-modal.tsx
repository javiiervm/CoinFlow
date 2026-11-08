"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowLeftRight, ArrowUpRight, CircleAlert, LoaderCircle, X } from "lucide-react";
import { formatMoney, globalBalance, piggybankBalance, expenseTrackerRemaining } from "@/lib/finance";
import { getSupabase } from "@/lib/supabase/client";
import { translate, type Language, type TranslationKey } from "@/lib/i18n";
import type { Currency, FinancialAction, Piggybank, Transaction } from "@/lib/models";

export type OperationView = "topup" | "withdraw" | "spend" | "exchange";

interface Props {
  action: OperationView;
  bank: Piggybank | null;
  currency: Currency;
  language: Language;
  userId: string;
  piggybanks: Piggybank[];
  transactions: Transaction[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

function positiveMoney(text: FormDataEntryValue | null): number | null {
  if (text === null || !/^\d+(?:\.\d{1,2})?$/.test(String(text).trim())) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value <= 99999999999999.99 ? value : null;
}

function toISODate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const errors: Record<string, TranslationKey> = {
  authentication_required: "Please sign in to continue.",
  invalid_operation: "Invalid financial operation.",
  invalid_amount: "Enter a positive amount with no more than two decimal places.",
  invalid_operation_details: "Check the date and details.",
  invalid_exchange: "Choose two different currencies and valid amounts.",
  invalid_bank_operation: "Invalid piggybank operation.",
  piggybank_not_found: "This piggybank is no longer available.",
  currency_mismatch: "The currencies do not match.",
  expense_tracker_withdrawal_not_supported: "Expense trackers can receive funds but cannot be withdrawn.",
  insufficient_global_balance: "There is not enough available balance.",
  insufficient_piggybank_balance: "There is not enough money in this piggybank.",
  idempotency_conflict: "This request was already used for different details."
};

export function FinancialOperationModal({
  action, bank, currency, language, userId, piggybanks, transactions, onClose, onSuccess
}: Props) {
  const [source, setSource] = useState<"balance" | "external">("balance");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const requestId = useRef<string | null>(null);
  const t = (key: TranslationKey) => translate(language, key);
  const targetCurrency: Currency = currency === "EUR" ? "USD" : "EUR";
  const activeCurrency = bank?.currency ?? currency;
  const global = globalBalance(transactions, activeCurrency, piggybanks);
  const bankBalance = bank ? piggybankBalance(bank, transactions) : null;
  const trackerRemaining = bank?.type === "expense" ? expenseTrackerRemaining(bank, transactions) : null;
  const exceedsDebt = action === "topup" && trackerRemaining !== null && amount !== "" && Number(amount) > trackerRemaining;
  const exceedsAvailable =
    amount !== "" && Number.isFinite(Number(amount)) &&
    ((action === "exchange" || (action === "topup" && source === "balance"))
      ? Number(amount) > global
      : (action === "withdraw" || action === "spend") && bankBalance !== null
        ? Number(amount) > bankBalance
        : false);

  const title: Record<OperationView, TranslationKey> = {
    topup: "Add funds to piggybank",
    withdraw: "Move money to balance",
    spend: "Record piggybank expense",
    exchange: "Exchange currencies"
  };

  function clearPendingRequest() {
    requestId.current = null;
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const api = getSupabase();
    if (!api) { setError(t("The database is not configured.")); return; }
    const data = new FormData(event.currentTarget);
    const money = positiveMoney(data.get("amount"));
    const target = action === "exchange" ? positiveMoney(data.get("target_amount")) : null;
    if (money === null || (action === "exchange" && target === null)) {
      setError(t("Enter a positive amount with no more than two decimal places."));
      return;
    }
    const op: FinancialAction = action === "topup"
      ? source === "balance" ? "allocate" : "external_topup"
      : action;
    if (exceedsDebt) {
      setError(t("Repayment cannot exceed the remaining debt."));
      return;
    }
    if (exceedsAvailable) {
      setError(t("There is not enough money in the selected balance."));
      return;
    }

    const id = requestId.current ?? crypto.randomUUID();
    requestId.current = id;
    setBusy(true); setError("");
    try {
      const { data: result, error: databaseError } = await api.rpc("apply_financial_operation", {
        p_request_id: id,
        p_action: op,
        p_amount: money,
        p_bank_id: bank?.id ?? null,
        p_currency: activeCurrency,
        p_target_currency: action === "exchange" ? targetCurrency : null,
        p_target_amount: action === "exchange" ? target : null,
        p_note: String(data.get("note") ?? "").trim(),
        p_date: String(data.get("date") ?? toISODate())
      });
      if (databaseError) {
        const raw = databaseError.message;
        const key = Object.keys(errors).find(key => raw.includes(key));
        throw new Error(key ? t(errors[key]) : raw);
      }
      const status = (result as { status?: string } | null)?.status;
      if (status !== "applied" && status !== "already_applied") throw new Error(t("Unable to save the operation."));
      await onSuccess();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Unable to save the operation."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="modal finance-operation-modal" role="dialog" aria-modal="true" aria-labelledby="finance-operation-title">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{t("MONEY MOVEMENT")}</span>
            <h2 id="finance-operation-title">{t(title[action])}</h2>
          </div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label={t("Close")}><X size={20}/></button>
        </div>
        {bank && <div className="operation-bank-heading">
          <span>{t("Piggybank")}</span>
          <strong>{bank.name}</strong>
          <span>{formatMoney(bankBalance ?? 0, activeCurrency, language)}</span>
        </div>}

        <form className="form-stack" onSubmit={event => void submit(event)} onChange={clearPendingRequest}>
          {action === "topup" && (
            <label>{t("Funds source")}
              <select value={source} onChange={event => { setSource(event.target.value as "balance" | "external"); clearPendingRequest(); }}>
                <option value="balance">{t("Available balance")}</option>
                <option value="external">{t("External funds (not from balance)")}</option>
              </select>
            </label>
          )}
          {action === "exchange" && (
            <div className="operation-summary"><ArrowLeftRight size={18}/>
              <span>{currency}</span><ArrowUpRight size={16}/><span>{targetCurrency}</span>
            </div>
          )}
          <div className="form-pair">
            <label>{action === "exchange" ? t("Amount to exchange") : t("Amount")} ({activeCurrency})
              <input name="amount" value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0.01" step="0.01" placeholder="0.00" required />
            </label>
            <label>{t("Date")}
              <input name="date" type="date" defaultValue={toISODate()} required />
            </label>
          </div>
          {action === "exchange" && (
            <label>{t("Amount received")} ({targetCurrency})
              <input name="target_amount" type="number" min="0.01" step="0.01" placeholder="0.00" required />
            </label>
          )}
          <label>{t("Note (optional)")}
            <input name="note" maxLength={120} placeholder={t("Description")} />
          </label>
          <div className="operation-available">
            <span>{action === "withdraw" || action === "spend" ? t("Piggybank balance") : t("Available balance")}</span>
            <strong>{formatMoney(action === "withdraw" || action === "spend" ? bankBalance ?? 0 : global, activeCurrency, language)}</strong>
          </div>
          {trackerRemaining !== null && <p className="operation-hint">{t("Remaining debt")}: {formatMoney(trackerRemaining,activeCurrency,language)}. {t("Repayments stop when the expense tracker is fully paid.")}</p>}
          {action === "exchange" && <p className="operation-hint">{t("Enter the received amount from your own exchange rate. No automatic conversion is applied.")}</p>}
          {exceedsDebt && <p className="operation-error"><CircleAlert size={16}/>{t("Repayment cannot exceed the remaining debt.")}</p>}
          {exceedsAvailable && <p className="operation-error"><CircleAlert size={16}/>{t("There is not enough money in the selected balance.")}</p>}
          {error && <p role="alert" className="operation-error"><CircleAlert size={16}/>{error}</p>}
          <button className="primary-button" type="submit" disabled={busy || exceedsAvailable || exceedsDebt || trackerRemaining === 0}>
            {busy ? <LoaderCircle className="spin" size={17}/> : <ArrowLeftRight size={17}/>}
            {busy ? t("Saving…") : t("Confirm operation")}
          </button>
        </form>
      </div>
    </div>
  );
}
