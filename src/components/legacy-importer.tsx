"use client";

import { useState, type ChangeEvent } from "react";
import { AlertCircle, CheckCircle2, FileJson, FileUp, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { formatMoney } from "@/lib/finance";
import { translate, type Language, type TranslationKey } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase/client";
import { LegacyDataError, parseLegacyData, type LegacyImportPreview } from "@/lib/legacy-import";

const MAX_BYTES = 5 * 1024 * 1024;

type SelectedImport = { name: string; hash: string; preview: LegacyImportPreview };
type Result = { tone: "success" | "error"; message: string };

function errorMessage(error: unknown, language: Language): string {
  const t = (key: TranslationKey) => translate(language, key);
  if (error instanceof LegacyDataError) {
    // Parser reasons are a fixed catalog. Keep row context (e.g. transactions[2]).
    const [context, ...detail] = error.message.split(": ");
    const reason = detail.join(": ") as TranslationKey;
    const translated = reason in legacyReasons ? t(reason) : reason;
    return `${t("Invalid CoinFlow 1.0 file")}: ${context}: ${translated}`;
  }
  return error instanceof Error ? error.message : t("Unable to read this file.");
}

const legacyReasons: Partial<Record<TranslationKey, true>> = {
  "expected an object": true,
  "missing or invalid id": true,
  "invalid id length": true,
  "missing or invalid name/concept": true,
  "amount must be a non-negative number": true,
  "more than two decimal places": true,
  "unsupported currency (only EUR and USD)": true,
  "missing timestamp": true,
  "invalid timestamp": true,
  "expected a boolean": true,
  "unknown piggybank type": true,
  "expected transactions[] and piggybanks[]": true,
  "too many records for a single import": true,
  "the file contains no records": true,
  "duplicate id": true,
  "unknown transaction type": true,
  "the transaction and its piggybank use different currencies": true,
  "references a missing piggybank": true
};

export function LegacyImporter({
  userId,
  language,
  onImported
}: {
  userId: string | null;
  language: Language;
  onImported: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<SelectedImport | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(language, key, params);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setResult(null);
    setSelected(null);
    if (file.size > MAX_BYTES) {
      setResult({ tone: "error", message: t("File exceeds the 5 MB limit.") });
      return;
    }
    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(t("Invalid JSON file."));
      }
      const preview = parseLegacyData(parsed);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      setSelected({ name: file.name.slice(0, 160), hash, preview });
    } catch (error) {
      setResult({ tone: "error", message: errorMessage(error, language) });
    } finally {
      setBusy(false);
    }
  }

  async function importFile() {
    if (busy || !selected) return;
    const api = getSupabase();
    if (!userId || !api) {
      setResult({ tone: "error", message: t("Account required to import.") });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      // One Postgres RPC = one transaction: bank remapping and all entries
      // commit together or all roll back. No service-role key in the client.
      const { data, error } = await api.rpc("import_coinflow_v1", {
        p_hash: selected.hash,
        p_filename: selected.name,
        p_piggybanks: selected.preview.piggybanks,
        p_transactions: selected.preview.transactions
      });
      if (error) {
        if (error.message.includes("overlapping_legacy_records") || error.code === "23505") {
          throw new Error(t("The backup overlaps with previously imported records. No changes were made."));
        }
        if (error.code === "PGRST202" || error.message.includes("import_coinflow_v1")) {
          throw new Error(t("Import requires the new Supabase migration."));
        }
        throw new Error(`${t("Import failed. No records were added.")} ${error.message}`);
      }
      const outcome = data as { status?: string; transactions?: number; piggybanks?: number } | null;
      if (outcome?.status === "already_imported") {
        setResult({ tone: "success", message: t("This file has already been imported into your account.") });
      } else if (outcome?.status === "imported") {
        await onImported();
        setResult({
          tone: "success",
          message: t("Imported {transactions} transactions and {piggybanks} piggybanks.", {
            transactions: outcome.transactions ?? selected.preview.transactions.length,
            piggybanks: outcome.piggybanks ?? selected.preview.piggybanks.length
          })
        });
      } else {
        throw new Error(t("Import failed. No records were added."));
      }
      setSelected(null);
    } catch (error) {
      setResult({ tone: "error", message: errorMessage(error, language) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-card legacy-import-card">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t("DATA TRANSFER")}</span>
          <h2>{t("Import from CoinFlow 1.0")}</h2>
          <p>{t("Move your local data.json into this account.")}</p>
        </div>
        <FileJson size={21} className="legacy-heading-icon" aria-hidden="true" />
      </div>
      {!userId ? (
        <div className="info-note">
          <AlertCircle size={18} aria-hidden="true"/>
          <span>{t("Sign in to import your local data.")}</span>
        </div>
      ) : (
        <>
          <label className="legacy-file-label">
            <FileUp size={18} aria-hidden="true"/>
            <span>{t("Select JSON file")}</span>
            <input
              className="sr-only"
              type="file"
              accept=".json,application/json"
              aria-label={t("Select JSON file")}
              onChange={(event) => void selectFile(event)}
              disabled={busy}
            />
          </label>
          <p className="legacy-help">{t("Choose a data.json file from CoinFlow 1.0 (maximum 5 MB).")}</p>

          {selected && (
            <div className="legacy-preview">
              <div className="legacy-preview-title">
                <div>
                  <span className="eyebrow">{t("Import preview")}</span>
                  <strong>{t("Selected file")}: {selected.name}</strong>
                </div>
                <button className="icon-button" type="button" onClick={() => {setSelected(null);setResult(null);}} aria-label={t("Clear selection")} disabled={busy}>
                  <X size={18}/>
                </button>
              </div>
              <div className="legacy-preview-grid">
                <div><span>{t("Transactions to import")}</span><strong>{selected.preview.transactions.length}</strong></div>
                <div><span>{t("Piggybanks to import")}</span><strong>{selected.preview.piggybanks.length}</strong></div>
                <div><span>EUR</span><strong>{formatMoney(selected.preview.balances.EUR, "EUR", language)}</strong></div>
                <div><span>USD</span><strong>{formatMoney(selected.preview.balances.USD, "USD", language)}</strong></div>
              </div>
              <p className="legacy-help">{t("Original global balances")}. {t("Review the amounts against CoinFlow 1.0 before importing.")}</p>
              {(selected.preview.zeroAmountTransactions > 0 || selected.preview.exchangeTransactions > 0 || selected.preview.orphanedReferences > 0) && (
                <div className="legacy-details">
                  {selected.preview.zeroAmountTransactions > 0 && <span>{t("Zero-amount entries")}: {selected.preview.zeroAmountTransactions}</span>}
                  {selected.preview.exchangeTransactions > 0 && <span>{t("Currency exchange entries")}: {selected.preview.exchangeTransactions}</span>}
                  {selected.preview.orphanedReferences > 0 && <span>{t("Missing piggybank references")}: {selected.preview.orphanedReferences}</span>}
                </div>
              )}
              <div className="legacy-precautions">
                <ShieldCheck size={18} aria-hidden="true"/>
                <span>{t("Your file stays on your device until you confirm. It is not modified.")} {t("Import adds records without replacing existing data. Re-importing the same file is skipped; overlapping backups are rejected.")}</span>
              </div>
              <button className="primary-button legacy-import-submit" type="button" onClick={() => void importFile()} disabled={busy}>
                {busy ? <LoaderCircle size={18} className="spin"/> : <FileUp size={18}/>}
                {busy ? t("Importing…") : t("Import data")}
              </button>
            </div>
          )}
        </>
      )}

      {result && (
        <div className={`legacy-result legacy-result-${result.tone}`} role="status">
          {result.tone === "success" ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}
          <span>{result.message}</span>
        </div>
      )}
      <p className="legacy-help legacy-footer">{t("The 1.0 file's original information (including extra historical fields) is retained with imported entries.")}</p>
    </section>
  );
}
