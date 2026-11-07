"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, BarChart3, CalendarDays,
  CheckCircle2, ChevronDown, CircleHelp, CreditCard, Download, LayoutDashboard,
  LoaderCircle, LockKeyhole, LogOut, Menu, Moon, PiggyBank, Plus, Search,
  Settings2, ShieldCheck, Sparkles, Sun, Target, Trash2, TrendingDown, TrendingUp,
  Wallet, X
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { demoPiggybanksFor, demoTransactionsFor } from "@/lib/demo";
import { categoryLabel, translate, type Language, type TranslationKey, type Translator } from "@/lib/i18n";
import { cashflowSeries, formatMoney, globalBalance, monthlySummary, piggybankBalance, piggybankProgress } from "@/lib/finance";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { LegacyImporter } from "@/components/legacy-importer";
import { FinancialOperationModal, type OperationView } from "@/components/financial-operation-modal";
import { transactionLabel } from "@/lib/operation-labels";
import type { Currency, NewPiggybank, NewTransaction, Piggybank, Transaction, TransactionKind } from "@/lib/models";

type Page = "overview" | "transactions" | "piggybanks" | "analytics" | "settings";
type Dialog = "income" | "expense" | "piggybank" | null;
type AuthMode = "login" | "register" | "recover";
type AuthUser = { id: string; email?: string };

const nav: { id: Page; label: TranslationKey; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "piggybanks", label: "Piggybanks", icon: PiggyBank },
  { id: "analytics", label: "Statistics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings2 }
];

const categories = ["General", "Trabajo", "Alimentación", "Vivienda", "Transporte", "Restauración", "Ocio", "Compras", "Salud", "Ahorro", "Otros"];
const today = () => new Date().toLocaleDateString("en-CA");

function numberFrom(value: FormDataEntryValue | null): number {
  const result = Number(value);
  return Number.isFinite(result) ? Math.round(result * 100) / 100 : NaN;
}

function displayDate(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value + "T12:00:00"));
}

function Brand() {
  return <div className="brand"><div className="brand-symbol"><ArrowLeftRight size={19} strokeWidth={2.6}/></div><span>Coin<span className="brand-highlight">Flow</span></span><span className="brand-version">2.0</span></div>;
}

export function Dashboard() {
  const [page, setPage] = useState<Page>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [dark, setDark] = useState(true);
  const [language, setLanguage] = useState<Language>("en");
  const t: Translator = useCallback((key: TranslationKey, params?: Record<string,string | number>) => translate(language,key,params), [language]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>(() => demoTransactionsFor("en"));
  const [piggybanks, setPiggybanks] = useState<Piggybank[]>(() => demoPiggybanksFor("en"));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [operation, setOperation] = useState<{action: OperationView; bankId?: string} | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authMessage, setAuthMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | TransactionKind>("all");
  const demo = !user;
  const server = getSupabase();

  useEffect(() => {
    const saved = window.localStorage.getItem("coinflow-theme");
    if (saved === "light") setDark(false);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    window.localStorage.setItem("coinflow-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    if (window.localStorage.getItem("coinflow-language") === "es") setLanguage("es");
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === "es" ? "CoinFlow — Finanzas personales" : "CoinFlow — Personal finance";
    window.localStorage.setItem("coinflow-language", language);
  }, [language]);
  useEffect(() => {
    if (!user) {
      setTransactions(demoTransactionsFor(language));
      setPiggybanks(demoPiggybanksFor(language));
    }
  }, [language, user]);

  const refresh = useCallback(async (owner: string) => {
    const api = getSupabase();
    if (!api) return;
    const [tx, banks] = await Promise.all([
      api.from("transactions").select("*").eq("user_id", owner).order("occurred_on", { ascending: false }),
      api.from("piggybanks").select("*").eq("user_id", owner).order("created_at", { ascending: false })
    ]);
    if (tx.error || banks.error) {
      setNotice(t("Unable to load data. Check that the Supabase database migration has been applied."));
      return;
    }
    setTransactions(tx.data as Transaction[]);
    setPiggybanks(banks.data as Piggybank[]);
  }, [t]);

  useEffect(() => {
    const api = getSupabase();
    if (!api) { setAuthReady(true); return; }
    let active = true;
    void api.auth.getUser().then(({ data: { user } }) => {
      if (!active) return;
      setUser(user ? { id: user.id, email: user.email } : null);
      if (user) void refresh(user.id);
      setAuthReady(true);
    });
    const { data: { subscription } } = api.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const current = session?.user;
      setUser(current ? { id: current.id, email: current.email } : null);
      if (current) void refresh(current.id);
      else { setTransactions(demoTransactionsFor(language)); setPiggybanks(demoPiggybanksFor(language)); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [refresh, language]);

  const month = useMemo(() => monthlySummary(transactions, currency), [transactions, currency]);
  const balance = useMemo(() => globalBalance(transactions, currency, piggybanks), [transactions, currency, piggybanks]);
  const series = useMemo(() => cashflowSeries(transactions, currency, new Date(), language), [transactions, currency, language]);
  const visibleTransactions = useMemo(() => transactions
    .filter(t => t.currency === currency)
    .filter(t => kindFilter === "all" || t.type === kindFilter)
    .filter(t => t.concept.toLowerCase().includes(search.toLowerCase()) || categoryLabel(t.category,language).toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => b.occurred_on.localeCompare(a.occurred_on)), [transactions, currency, search, kindFilter, language]);
  const visibleBanks = useMemo(() => piggybanks.filter(b => b.currency === currency), [piggybanks, currency]);
  const bankTotals = useMemo(() => visibleBanks.reduce((s, b) => s + piggybankBalance(b, transactions), 0), [visibleBanks, transactions]);

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!server) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    setBusy(true); setAuthMessage("");
    try {
      if (authMode === "recover") {
        const { error } = await server.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/auth/callback?next=%2Fauth%2Fupdate-password" });
        if (error) throw error;
        setAuthMessage(t("Check your email for a password recovery link."));
      } else if (authMode === "register") {
        const { error } = await server.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/auth/callback" }
        });
        if (error) throw error;
        setAuthMessage(t("Check your email to confirm your account."));
      } else {
        const { error } = await server.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setAuthMessage("");
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : t("Request failed."));
    } finally { setBusy(false); }
  }

  async function addTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !server || !dialog || dialog === "piggybank") return;
    const form = new FormData(event.currentTarget);
    const amount = numberFrom(form.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) { setNotice(t("Enter an amount greater than zero.")); return; }
    const bankId = String(form.get("piggybank_id") || "") || null;
    const bank = piggybanks.find(b => b.id === bankId);
    if (bank && bank.currency !== currency) { setNotice(t("The piggybank and transaction must use the same currency.")); return; }
    const row: NewTransaction = {
      user_id: user.id,
      concept: String(form.get("concept") || "").trim(),
      amount,
      type: dialog,
      currency,
      category: String(form.get("category") || "General"),
      occurred_on: String(form.get("occurred_on") || today()),
      piggybank_id: bankId,
      external: form.get("external") === "on"
    };
    if (!row.concept) return;
    setBusy(true);
    const { error } = await server.from("transactions").insert(row);
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    setDialog(null); setNotice(t("Transaction saved."));
    await refresh(user.id);
  }

  async function addPiggybank(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !server) return;
    const form = new FormData(event.currentTarget);
    const goal = numberFrom(form.get("goal"));
    if (!Number.isFinite(goal) || goal < 0) { setNotice(t("Enter a valid goal.")); return; }
    const type = String(form.get("type")) as Piggybank["type"];
    const row: NewPiggybank = { user_id: user.id, name: String(form.get("name") || "").trim(), currency, goal, type };
    if (!row.name) return;
    setBusy(true);
    const { error } = await server.from("piggybanks").insert(row);
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    setDialog(null); setNotice(t("Piggybank created."));
    await refresh(user.id);
  }

  async function deleteTransaction(id: string) {
    if (!server || !user || !window.confirm(t("Remove this transaction? This cannot be undone."))) return;
    const { error } = await server.from("transactions").delete().eq("id", id).eq("user_id", user.id);
    if (error) { setNotice(error.message); return; }
    await refresh(user.id);
  }

  async function deletePiggybank(id: string) {
    if (transactions.some(transaction => transaction.piggybank_id === id)) {
      setNotice(t("Piggybanks with transaction history cannot be deleted yet."));
      return;
    }
    if (!server || !user || !window.confirm(t("Delete this piggybank? Transactions will remain in history but lose their association."))) return;
    const { error } = await server.from("piggybanks").delete().eq("id", id).eq("user_id", user.id);
    if (error) { setNotice(error.message); return; }
    await refresh(user.id);
  }

  function downloadCSV() {
    const headers = [t("Date"),t("Type"),t("Concept"),t("Category"),t("Amount"),t("Currency"),t("External")];
    const rows = transactions.map(t => [t.occurred_on, t.type, t.concept, t.category, t.amount.toFixed(2), t.currency, t.external ? translate(language,"Yes") : translate(language,"No")]);
    const csv = [headers, ...rows].map(row => row.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(",")).join("\r\n");
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.href = url; link.download = "coinflow-transactions.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const pageTitle: Record<Page, string> = {
    overview: t("Overview"), transactions: t("Transactions"), piggybanks: t("Piggybanks"),
    analytics: t("Statistics"), settings: t("Settings")
  };

  return (
    <div className="shell">
      {menuOpen && <button className="mobile-backdrop" aria-label={t("Close menu")} onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><Brand/><button aria-label={t("Close menu")} className="icon-button mobile-close" onClick={() => setMenuOpen(false)}><X size={18}/></button></div>
        <div className="sidebar-section-label">{t("NAVIGATION")}</div>
        <nav className="sidebar-nav" aria-label={t("Main navigation")}>
          {nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => { setPage(item.id); setMenuOpen(false); }}>
            <item.icon size={19} strokeWidth={1.85}/><span>{t(item.label)}</span>{page === item.id && <span className="nav-dot" />}
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          
          <div className="sidebar-account"><div className="avatar">{user?.email?.slice(0, 1).toUpperCase() || "D"}</div><div className="account-text"><strong>{user ? t("Account") : t("Demo")}</strong><small>{user?.email || t("Sample data")}</small></div><ShieldCheck size={17}/></div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb"><button className="icon-button menu-toggle" aria-label={t("Open menu")} onClick={() => setMenuOpen(true)}><Menu size={21}/></button><span className="breadcrumb-symbol"><LayoutDashboard size={17}/></span><span>{t("Personal")}</span><span className="breadcrumb-separator">/</span><strong>{pageTitle[page]}</strong></div>
          <div className="top-actions">
            <label className="language-select"><span className="sr-only">{t("Language")}</span><select value={language} onChange={e=>setLanguage(e.target.value as Language)} aria-label={t("Language")}><option value="en">English</option><option value="es">Español</option></select></label><div className="currency-control" aria-label={t("Currency")}><button className={currency === "EUR" ? "selected" : ""} onClick={() => setCurrency("EUR")}>EUR</button><button className={currency === "USD" ? "selected" : ""} onClick={() => setCurrency("USD")}>USD</button></div>
            <button className="icon-button" aria-label={dark ? t("Enable light mode") : t("Enable dark mode")} onClick={() => setDark(!dark)}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
            <div className="top-avatar">{user?.email?.charAt(0).toUpperCase() || "D"}</div>
          </div>
        </header>

        <main className="main-content">
          {!authReady && <div className="notice"><LoaderCircle size={17} className="spin"/> {t("Checking session…")}</div>}
          {demo && <div className="demo-banner"><div><Sparkles size={17}/><span><strong>{t("Demo mode")}.</strong> {t("Sample data only. Changes are disabled.")}</span></div><button onClick={() => { setPage("settings"); setAuthMode("register"); }}>{t("Create account")} <ArrowRight size={15}/></button></div>}
          {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Cerrar aviso" onClick={() => setNotice("")}><X size={16}/></button></div>}

          {page === "overview" && <>
            <div className="page-heading"><div><h1>{t("Dashboard")}</h1><p>{t("Balances and recent activity.")}</p></div><div className="heading-actions">
  <button className="outline-button" onClick={() => setOperation({action:"exchange"})} disabled={demo}><ArrowLeftRight size={17}/> {t("Exchange")}</button>
  <button className="primary-button" onClick={() => setDialog("income")} disabled={demo}><Plus size={18}/> {t("New transaction")}</button>
</div></div>
            <div className="metrics-grid">
              <Metric language={language} label={t("Available balance")} amount={balance} currency={currency} icon={Wallet} tone="blue" note={t("Global balance (excluding piggybanks)")} />
              <Metric language={language} label={t("Income this month")} amount={month.income} currency={currency} icon={ArrowDownLeft} tone="green" note={t("Recorded transactions")} />
              <Metric language={language} label={t("Expenses this month")} amount={month.expense} currency={currency} icon={ArrowUpRight} tone="pink" note={t("Recorded transactions")} />
              <Metric language={language} label={t("In piggybanks")} amount={bankTotals} currency={currency} icon={PiggyBank} tone="gold" note={t("{count} piggybanks",{count:visibleBanks.length})} />
            </div>
            <div className="content-grid">
              <section className="panel chart-panel">
                <div className="panel-heading"><div><span className="eyebrow">{t("ACTIVITY")}</span><h2>{t("Cash flow")}</h2><p>{t("Income and expenses over the last six months")}</p></div><span className="period-pill"><CalendarDays size={14}/> {t("6 months")}</span></div>
                <CashflowChart series={series} currency={currency} language={language}/>
                <div className="chart-legend"><span><i className="legend-income"/>{t("Income")}</span><span><i className="legend-expense"/>{t("Expenses")}</span></div>
              </section>
              <section className="panel savings-panel"><div className="panel-heading"><div><span className="eyebrow">{t("SAVINGS")}</span><h2>{t("Your piggybanks")}</h2><p>{t("Current balances")}</p></div><button aria-label={t("View piggybanks")} className="icon-button" onClick={() => setPage("piggybanks")}><ArrowRight size={18}/></button></div>
                <div className="savings-list">{visibleBanks.slice(0,3).map(b => <BankProgress key={b.id} bank={b} transactions={transactions} language={language} />)}{visibleBanks.length === 0 && <p className="empty">{t("No piggybanks for this currency.")}</p>}</div>
                <button className="text-link savings-link" onClick={() => setPage("piggybanks")}>{t("View all piggybanks")} <ArrowRight size={16}/></button>
              </section>
            </div>
            <section className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">{t("ACTIVITY")}</span><h2>{t("Recent transactions")}</h2></div><button className="text-link" onClick={() => setPage("transactions")}>{t("View all")} <ArrowRight size={16}/></button></div><TransactionList language={language} transactions={visibleTransactions.slice(0,5)} currency={currency} onDelete={demo ? undefined : deleteTransaction}/></section>
          </>}

          {page === "transactions" && <>
            <div className="page-heading"><div><h1>{t("Transactions")}</h1><p>{t("All transactions, including piggybank activity.")}</p></div><div className="heading-actions"><button className="outline-button" onClick={() => setOperation({action:"exchange"})} disabled={demo}><ArrowLeftRight size={17}/> {t("Exchange")}</button><button className="outline-button" onClick={downloadCSV}><Download size={17}/> {t("Export CSV")}</button><button className="primary-button" disabled={demo} onClick={() => setDialog("expense")}><Plus size={18}/> {t("Add expense")}</button></div></div>
            <section className="panel"><div className="filter-row"><label className="search-input"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("Search concept or category")} /></label><select className="select-control" value={kindFilter} onChange={e=>setKindFilter(e.target.value as typeof kindFilter)} aria-label={t("Transaction type")}><option value="all">{t("All transactions")}</option><option value="income">{t("Income")}</option><option value="expense">{t("Expenses")}</option></select><button className="outline-button" onClick={() => setDialog("income")} disabled={demo}><Plus size={16}/> {t("Add income")}</button></div><TransactionList language={language} transactions={visibleTransactions} currency={currency} onDelete={demo ? undefined : deleteTransaction}/></section>
          </>}

          {page === "piggybanks" && <>
            <div className="page-heading"><div><h1>{t("Piggybanks")}</h1><p>{t("Balances and targets for each piggybank.")}</p></div><button className="primary-button" onClick={() => setDialog("piggybank")} disabled={demo}><Plus size={18}/> {t("New piggybank")}</button></div>
            <div className="bank-grid">{visibleBanks.map(bank => <div key={bank.id} className={`panel bank-card bank-card-${bank.type}`}><div className="bank-card-top"><div className={`bank-icon bank-icon-${bank.type}`}>{bank.type === "budget" ? <Wallet size={20}/> : bank.type === "expense" ? <TrendingDown size={20}/> : <PiggyBank size={20}/>}</div><span className={`category-pill type-pill type-pill-${bank.type}`}>{bank.type === "budget" ? t("Budget") : bank.type === "expense" ? t("Expense") : t("Saving")}</span></div><h2>{bank.name}</h2><BankProgress bank={bank} transactions={transactions} language={language} expanded/><div className="bank-actions">
    <button type="button" disabled={demo} className="bank-action-button bank-action-primary" onClick={() => setOperation({action:"topup",bankId:bank.id})}>{t("Add funds")}</button>
    {bank.type !== "expense" && <>
      <button type="button" disabled={demo || piggybankBalance(bank, transactions) <= 0} className="bank-action-button" onClick={() => setOperation({action:"withdraw",bankId:bank.id})}>{t("Withdraw")}</button>
      <button type="button" disabled={demo || piggybankBalance(bank, transactions) <= 0} className="bank-action-button" onClick={() => setOperation({action:"spend",bankId:bank.id})}>{t("Spend")}</button>
    </>}
  </div><div className="bank-card-footer"><span>{t("Target:")} {formatMoney(bank.goal, bank.currency,language)}</span>{!demo && <button className="icon-button danger" onClick={() => void deletePiggybank(bank.id)} disabled={transactions.some(row => row.piggybank_id === bank.id)} title={transactions.some(row => row.piggybank_id === bank.id) ? t("Piggybanks with transaction history cannot be deleted yet.") : t("Delete piggybank")} aria-label={t("Delete piggybank {name}",{name:bank.name})}><Trash2 size={17}/></button>}</div></div>)}{visibleBanks.length === 0 && <div className="panel empty-panel">{t("No piggybanks in {currency}.",{currency})}</div>}</div>
            <div className="info-note"><CircleHelp size={18}/><span>{t("Advanced piggybank transfers from CoinFlow 1.0 are not available in this preview. Do not use this build for real accounting.")}</span></div>
          </>}

          {page === "analytics" && <>
            <div className="page-heading"><div><h1>{t("Statistics")}</h1><p>{t("Monthly totals and cash-flow history.")}</p></div></div>
            <div className="metrics-grid metrics-grid-two"><Metric language={language} label={t("Income this month")} amount={month.income} currency={currency} icon={TrendingUp} tone="green" note={t("This month")}/><Metric language={language} label={t("Expenses this month")} amount={month.expense} currency={currency} icon={TrendingDown} tone="pink" note={t("This month")}/></div>
            <section className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">{t("REPORTS")}</span><h2>{t("Six-month history")}</h2></div></div><CashflowChart series={series} currency={currency} language={language}/><div className="chart-legend"><span><i className="legend-income"/>{t("Income")}</span><span><i className="legend-expense"/>{t("Expenses")}</span></div></section>
          </>}

          {page === "settings" && <>
            <div className="page-heading"><div><h1>{t("Settings")}</h1><p>{t("Account and display settings.")}</p></div></div>
            <div className="settings-grid"><section className="panel settings-card"><div className="panel-heading"><div><span className="eyebrow">{t("ACCOUNT")}</span><h2>{user ? t("Signed in") : t("Sign in to CoinFlow")}</h2><p>{user ? user.email : t("Sign in to save and sync your data.")}</p></div><LockKeyhole size={20}/></div>
              {!supabaseConfigured && <div className="info-note">{t("Online accounts are unavailable until Supabase is configured and the database migration is applied.")}</div>}
              {user ? <button className="outline-button" onClick={async () => { await server?.auth.signOut(); setNotice(t("Signed out.")); }}><LogOut size={17}/> {t("Sign out")}</button> :
              <><div className="auth-tabs"><button className={authMode==="login"?"active":""} onClick={()=>{setAuthMode("login");setAuthMessage("");}}>{t("Sign in")}</button><button className={authMode==="register"?"active":""} onClick={()=>{setAuthMode("register");setAuthMessage("");}}>{t("Create account")}</button></div>
              <form className="form-stack" onSubmit={handleAuth}><label>{t("Email")}<input name="email" type="email" placeholder={t("you@example.com")} required autoComplete="email" /></label>{authMode!=="recover" && <label>{t("Password")}<input name="password" type="password" placeholder={t("At least 8 characters")} minLength={8} required autoComplete={authMode==="register"?"new-password":"current-password"}/></label>}
              {authMessage && <p className="form-message" role="status">{authMessage}</p>}
              <button className="primary-button" disabled={!supabaseConfigured || busy}>{busy ? t("Working…") : authMode==="recover" ? t("Send email") : authMode==="register" ? t("Register") : t("Sign in")}</button>
              <button className="text-link" type="button" onClick={()=>{setAuthMode(authMode==="recover"?"login":"recover");setAuthMessage("");}}>{authMode==="recover"?t("Back to sign in"):t("Forgot password?")}</button>
              </form></>}
            </section>
            <section className="panel settings-card"><div className="panel-heading"><div><span className="eyebrow">{t("APPEARANCE & DATA")}</span><h2>{t("Preferences")}</h2></div><Settings2 size={20}/></div><div className="setting-row"><span>{t("Language")}</span><select className="select-control" value={language} onChange={e=>setLanguage(e.target.value as Language)} aria-label={t("Language")}><option value="en">English</option><option value="es">Español</option></select></div><div className="setting-row"><span>{t("Theme")}</span><button className="outline-button" onClick={()=>setDark(!dark)}>{dark?<Sun size={16}/>:<Moon size={16}/>} {dark?t("Dark"):t("Light")}</button></div><div className="setting-row"><span>{t("Display currency")}</span><select className="select-control" value={currency} onChange={e=>setCurrency(e.target.value as Currency)}><option value="EUR">{t("Euro (EUR)")}</option><option value="USD">{t("Dollar (USD)")}</option></select></div><div className="setting-row"><span>{t("Export transactions")}</span><button className="outline-button" onClick={downloadCSV}><Download size={16}/> CSV</button></div><div className="security-footnote"><ShieldCheck size={17}/> {t("User data is protected by Supabase row-level security.")}</div></section><LegacyImporter userId={user?.id ?? null} language={language} onImported={() => user ? refresh(user.id) : Promise.resolve()}/></div>
          </>}

          <footer className="footer"><span>© {new Date().getFullYear()} · {t("CoinFlow 2.0 · Development preview")}</span></footer>
        </main>
      </div>

      {operation && user && <FinancialOperationModal
        action={operation.action}
        bank={operation.bankId ? piggybanks.find(b => b.id === operation.bankId) ?? null : null}
        currency={currency}
        language={language}
        userId={user.id}
        piggybanks={piggybanks}
        transactions={transactions}
        onClose={() => setOperation(null)}
        onSuccess={() => refresh(user.id)}
      />}
      {dialog && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null);}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="eyebrow">{t("NEW")}</span><h2 id="modal-title">{dialog==="piggybank"?t("Create piggybank"):dialog==="income"?t("Add income"):t("Add expense")}</h2></div><button className="icon-button" aria-label={t("Close")} onClick={()=>setDialog(null)}><X size={20}/></button></div>
        {dialog==="piggybank" ? <form className="form-stack" onSubmit={addPiggybank}><label>{t("Piggybank name")}<input name="name" placeholder={t("e.g. Holidays")} required maxLength={120}/></label><label>{t("Type")}<select name="type"><option value="savings">{t("Saving")}</option><option value="budget">{t("Budget")}</option><option value="expense">{t("Expense tracker")}</option></select></label><label>{t("Goal ({currency})",{currency})}<input name="goal" type="number" min="0" step="0.01" defaultValue="0" required/></label><button className="primary-button" type="submit" disabled={busy}>{busy?t("Creating…"):t("Create piggybank")}</button></form> :
        <form className="form-stack" onSubmit={addTransaction}><label>{t("Concept")}<input name="concept" placeholder={dialog==="income"?t("e.g. Salary"):t("e.g. Groceries")} required maxLength={180}/></label><div className="form-pair"><label>{t("Amount ({currency})",{currency})}<input name="amount" type="number" min="0.01" step="0.01" required placeholder={language === "es" ? "0,00" : "0.00"}/></label><label>{t("Date")}<input name="occurred_on" type="date" defaultValue={today()} required/></label></div><label>{t("Category")}<select name="category">{categories.map(c=><option key={c} value={c}>{categoryLabel(c,language)}</option>)}</select></label><label>{t("Source / destination")}<select name="piggybank_id"><option value="">{t("Global balance")}</option>{visibleBanks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="check-label"><input type="checkbox" name="external"/> {t("External transaction (excluded from global balance)")}</label><button className="primary-button" type="submit" disabled={busy}>{busy?t("Saving…"):t("Save transaction")}</button></form>}
      </div></div>}
    </div>
  );
}

function Metric({label,amount,currency,icon:Icon,tone,note,language}: {label:string;amount:number;currency:Currency;icon:typeof Wallet;tone:string;note:string;language:Language}) {
  return <article className="metric panel"><div className="metric-top"><span>{label}</span><div className={`metric-icon tone-${tone}`}><Icon size={19}/></div></div><div className="metric-amount">{formatMoney(amount,currency,language)}</div><div className="metric-note"><span className={`metric-dot tone-${tone}`}/>{note}</div></article>;
}

function CashflowChart({series,currency,language}: {series:ReturnType<typeof cashflowSeries>; currency:Currency;language:Language}) {
  return <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={series} margin={{top:12,right:8,bottom:0,left:-26}}><defs><linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#76aafa" stopOpacity={0.19}/><stop offset="100%" stopColor="#76aafa" stopOpacity={0}/></linearGradient><linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d9a2c7" stopOpacity={0.08}/><stop offset="100%" stopColor="#d9a2c7" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:"var(--muted)",fontSize:13}} tickMargin={12}/><YAxis axisLine={false} tickLine={false} tick={{fill:"var(--muted)",fontSize:12}} tickFormatter={n=>n>=1000?`${Math.round(n/1000)}k`:String(n)}/><Tooltip contentStyle={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:12,color:"var(--text)",fontSize:13}} formatter={(value,name) => [formatMoney(Number(value || 0),currency,language), translate(language,name==="income"?"Income":"Expenses")]}/><Area type="monotone" dataKey="income" stroke="#77acff" fill="url(#incomeGradient)" strokeWidth={2.6} dot={false}/><Area type="monotone" dataKey="expense" stroke="#d99abb" fill="url(#expenseGradient)" strokeWidth={2.4} dot={false}/></AreaChart></ResponsiveContainer></div>;
}

function BankProgress({bank,transactions,language,expanded=false}: {bank:Piggybank;transactions:Transaction[];language:Language;expanded?:boolean}) {
  const balance = piggybankBalance(bank,transactions);
  const progress = piggybankProgress(bank,transactions);
  return <div className={expanded?"bank-progress expanded":"bank-progress"}><div className="bank-progress-top">{!expanded && <div className="bank-progress-name"><i className={`bank-type-dot bank-type-dot-${bank.type}`} aria-hidden="true"/><strong>{bank.name}</strong></div>}<span>{formatMoney(balance,bank.currency,language)}</span></div><div className="progress-track"><div className={`progress-fill progress-fill-${bank.type}`} style={{width:`${progress}%`}}/></div><div className="progress-caption"><span>{translate(language,bank.type==="budget"?"Current budget balance":bank.type==="expense"?"Expense balance":"Savings goal")}</span><span>{bank.type==="budget"?translate(language,"Available"):`${Math.round(progress)}%`}</span></div></div>;
}

function TransactionList({transactions,currency,language,onDelete}: {transactions:Transaction[];currency:Currency;language:Language;onDelete?: (id:string)=>void}) {
  if (!transactions.length) return <div className="empty-panel">{translate(language,"No matching transactions.")}</div>;
  return <div className="transaction-list">{transactions.map(t=><div className="transaction-row" key={t.id}><div className={`transaction-icon ${t.type}`}>{t.type==="income"?<ArrowDownLeft size={20}/>:<ArrowUpRight size={20}/>}</div><div className="transaction-main"><strong>{transactionLabel(t,language)}</strong><span>{categoryLabel(t.category,language)} · {displayDate(t.occurred_on,language)}{t.piggybank_id
  ? " · " + (typeof t.legacy_record?.piggybank_name === "string" && t.legacy_record.piggybank_name
    ? t.legacy_record.piggybank_name : translate(language,"Piggybank"))
  : (typeof t.legacy_record?.piggybank_name === "string" && t.legacy_record.piggybank_name
    ? " · " + t.legacy_record.piggybank_name : "")}{t.external?" · "+translate(language,"External"):""}{t.operation_kind?" · "+translate(language,"Transfer"):""}</span></div><div className={`transaction-amount ${t.type}`}>{t.type==="income"?"+":"−"}{formatMoney(t.amount,currency,language)}</div>{onDelete && !t.operation_id && <button className="icon-button danger" onClick={()=>onDelete(t.id)} aria-label={translate(language,"Delete transaction {name}",{name:t.concept})}><Trash2 size={16}/></button>}</div>)}</div>;
}
