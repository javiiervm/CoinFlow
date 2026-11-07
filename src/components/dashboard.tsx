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
import { demoPiggybanks, demoTransactions } from "@/lib/demo";
import { cashflowSeries, formatMoney, globalBalance, monthlySummary, piggybankBalance, piggybankProgress } from "@/lib/finance";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import type { Currency, NewPiggybank, NewTransaction, Piggybank, Transaction, TransactionKind } from "@/lib/models";

type Page = "overview" | "transactions" | "piggybanks" | "analytics" | "settings";
type Dialog = "income" | "expense" | "piggybank" | null;
type AuthMode = "login" | "register" | "recover";
type AuthUser = { id: string; email?: string };

const nav: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Resumen", icon: LayoutDashboard },
  { id: "transactions", label: "Transacciones", icon: ArrowLeftRight },
  { id: "piggybanks", label: "Huchas", icon: PiggyBank },
  { id: "analytics", label: "Estadísticas", icon: BarChart3 },
  { id: "settings", label: "Configuración", icon: Settings2 }
];

const categories = ["General", "Trabajo", "Alimentación", "Vivienda", "Transporte", "Restauración", "Ocio", "Compras", "Salud", "Ahorro", "Otros"];
const today = () => new Date().toLocaleDateString("en-CA");

function numberFrom(value: FormDataEntryValue | null): number {
  const result = Number(value);
  return Number.isFinite(result) ? Math.round(result * 100) / 100 : NaN;
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value + "T12:00:00"));
}

function Brand() {
  return <div className="brand"><div className="brand-symbol"><ArrowLeftRight size={19} strokeWidth={2.6}/></div><span>Coin<span className="brand-highlight">Flow</span></span><span className="brand-version">2.0</span></div>;
}

export function Dashboard() {
  const [page, setPage] = useState<Page>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [dark, setDark] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>(demoTransactions);
  const [piggybanks, setPiggybanks] = useState<Piggybank[]>(demoPiggybanks);
  const [dialog, setDialog] = useState<Dialog>(null);
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

  const refresh = useCallback(async (owner: string) => {
    const api = getSupabase();
    if (!api) return;
    const [tx, banks] = await Promise.all([
      api.from("transactions").select("*").eq("user_id", owner).order("occurred_on", { ascending: false }),
      api.from("piggybanks").select("*").eq("user_id", owner).order("created_at", { ascending: false })
    ]);
    if (tx.error || banks.error) {
      setNotice("No se pudieron cargar los datos. Comprueba que se ha aplicado la migración de Supabase.");
      return;
    }
    setTransactions(tx.data as Transaction[]);
    setPiggybanks(banks.data as Piggybank[]);
  }, []);

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
      else { setTransactions(demoTransactions); setPiggybanks(demoPiggybanks); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [refresh]);

  const month = useMemo(() => monthlySummary(transactions, currency), [transactions, currency]);
  const balance = useMemo(() => globalBalance(transactions, currency), [transactions, currency]);
  const series = useMemo(() => cashflowSeries(transactions, currency), [transactions, currency]);
  const visibleTransactions = useMemo(() => transactions
    .filter(t => t.currency === currency)
    .filter(t => kindFilter === "all" || t.type === kindFilter)
    .filter(t => t.concept.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => b.occurred_on.localeCompare(a.occurred_on)), [transactions, currency, search, kindFilter]);
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
        const { error } = await server.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/auth/callback" });
        if (error) throw error;
        setAuthMessage("Te hemos enviado un correo para recuperar tu acceso.");
      } else if (authMode === "register") {
        const { error } = await server.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/auth/callback" }
        });
        if (error) throw error;
        setAuthMessage("Comprueba tu correo para confirmar tu registro.");
      } else {
        const { error } = await server.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setAuthMessage("");
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "No se pudo completar la solicitud.");
    } finally { setBusy(false); }
  }

  async function addTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !server || !dialog || dialog === "piggybank") return;
    const form = new FormData(event.currentTarget);
    const amount = numberFrom(form.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) { setNotice("Introduce una cantidad válida mayor que cero."); return; }
    const bankId = String(form.get("piggybank_id") || "") || null;
    const bank = piggybanks.find(b => b.id === bankId);
    if (bank && bank.currency !== currency) { setNotice("La hucha debe tener la misma divisa que la transacción."); return; }
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
    setDialog(null); setNotice("Movimiento guardado correctamente.");
    await refresh(user.id);
  }

  async function addPiggybank(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !server) return;
    const form = new FormData(event.currentTarget);
    const goal = numberFrom(form.get("goal"));
    if (!Number.isFinite(goal) || goal < 0) { setNotice("Introduce un objetivo válido."); return; }
    const type = String(form.get("type")) as Piggybank["type"];
    const row: NewPiggybank = { user_id: user.id, name: String(form.get("name") || "").trim(), currency, goal, type };
    if (!row.name) return;
    setBusy(true);
    const { error } = await server.from("piggybanks").insert(row);
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    setDialog(null); setNotice("Hucha creada.");
    await refresh(user.id);
  }

  async function deleteTransaction(id: string) {
    if (!server || !user || !window.confirm("¿Eliminar esta transacción? Esta acción no se puede deshacer.")) return;
    const { error } = await server.from("transactions").delete().eq("id", id).eq("user_id", user.id);
    if (error) { setNotice(error.message); return; }
    await refresh(user.id);
  }

  async function deletePiggybank(id: string) {
    if (!server || !user || !window.confirm("¿Eliminar esta hucha? Sus transacciones conservarán el historial, pero perderán la asociación.")) return;
    const { error } = await server.from("piggybanks").delete().eq("id", id).eq("user_id", user.id);
    if (error) { setNotice(error.message); return; }
    await refresh(user.id);
  }

  function downloadCSV() {
    const headers = ["Fecha", "Tipo", "Concepto", "Categoría", "Cantidad", "Divisa", "Externo"];
    const rows = transactions.map(t => [t.occurred_on, t.type, t.concept, t.category, t.amount.toFixed(2), t.currency, t.external ? "Sí" : "No"]);
    const csv = [headers, ...rows].map(row => row.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(",")).join("\r\n");
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.href = url; link.download = "coinflow-transacciones.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const pageTitle: Record<Page, string> = {
    overview: "Resumen", transactions: "Transacciones", piggybanks: "Huchas",
    analytics: "Estadísticas", settings: "Configuración"
  };

  return (
    <div className="shell">
      {menuOpen && <button className="mobile-backdrop" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><Brand/><button aria-label="Cerrar menú" className="icon-button mobile-close" onClick={() => setMenuOpen(false)}><X size={18}/></button></div>
        <div className="sidebar-section-label">ESPACIO PERSONAL</div>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {nav.map(item => <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => { setPage(item.id); setMenuOpen(false); }}>
            <item.icon size={19} strokeWidth={1.85}/><span>{item.label}</span>{page === item.id && <span className="nav-dot" />}
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-promo"><div className="promo-icon"><Sparkles size={19}/></div><strong>Organiza tus finanzas</strong><p>Un lugar para tu dinero, tus planes y tus objetivos.</p></div>
          <div className="sidebar-account"><div className="avatar">{user?.email?.slice(0, 1).toUpperCase() || "D"}</div><div className="account-text"><strong>{user ? "Mi cuenta" : "Vista de prueba"}</strong><small>{user?.email || "Datos de ejemplo"}</small></div><ShieldCheck size={17}/></div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb"><button className="icon-button menu-toggle" aria-label="Abrir menú" onClick={() => setMenuOpen(true)}><Menu size={21}/></button><span className="breadcrumb-symbol"><LayoutDashboard size={17}/></span><span>Espacio personal</span><span className="breadcrumb-separator">/</span><strong>{pageTitle[page]}</strong></div>
          <div className="top-actions">
            <div className="currency-control" aria-label="Divisa"><button className={currency === "EUR" ? "selected" : ""} onClick={() => setCurrency("EUR")}>EUR</button><button className={currency === "USD" ? "selected" : ""} onClick={() => setCurrency("USD")}>USD</button></div>
            <button className="icon-button" aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"} onClick={() => setDark(!dark)}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
            <div className="top-avatar">{user?.email?.charAt(0).toUpperCase() || "D"}</div>
          </div>
        </header>

        <main className="main-content">
          {!authReady && <div className="notice"><LoaderCircle size={17} className="spin"/> Comprobando sesión…</div>}
          {demo && <div className="demo-banner"><div><Sparkles size={17}/><span><strong>Modo demostración.</strong> Estás viendo datos ficticios; no se guardan cambios ni se sincronizan dispositivos.</span></div><button onClick={() => { setPage("settings"); setAuthMode("register"); }}>Crear cuenta <ArrowRight size={15}/></button></div>}
          {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Cerrar aviso" onClick={() => setNotice("")}><X size={16}/></button></div>}

          {page === "overview" && <>
            <div className="page-heading"><div><span className="eyebrow">PANEL FINANCIERO</span><h1>Tu dinero, <span className="muted-heading">en perspectiva.</span></h1><p>Un resumen de tus finanzas para tomar mejores decisiones.</p></div><button className="primary-button" onClick={() => setDialog("income")} disabled={demo}><Plus size={18}/> Nuevo movimiento</button></div>
            <div className="metrics-grid">
              <Metric label="Saldo disponible" amount={balance} currency={currency} icon={Wallet} tone="blue" note="Saldo global sin huchas" />
              <Metric label="Ingresos del mes" amount={month.income} currency={currency} icon={ArrowDownLeft} tone="green" note="Movimientos registrados" />
              <Metric label="Gastos del mes" amount={month.expense} currency={currency} icon={ArrowUpRight} tone="pink" note="Movimientos registrados" />
              <Metric label="En huchas" amount={bankTotals} currency={currency} icon={PiggyBank} tone="gold" note={`${visibleBanks.length} huchas activas`} />
            </div>
            <div className="content-grid">
              <section className="panel chart-panel">
                <div className="panel-heading"><div><span className="eyebrow">EVOLUCIÓN</span><h2>Flujo de efectivo</h2><p>Ingresos y gastos de los últimos seis meses</p></div><span className="period-pill"><CalendarDays size={14}/> 6 meses</span></div>
                <CashflowChart series={series} currency={currency}/>
                <div className="chart-legend"><span><i className="legend-income"/>Ingresos</span><span><i className="legend-expense"/>Gastos</span></div>
              </section>
              <section className="panel savings-panel"><div className="panel-heading"><div><span className="eyebrow">TUS OBJETIVOS</span><h2>Huchas</h2><p>El progreso de tus planes</p></div><button aria-label="Ver huchas" className="icon-button" onClick={() => setPage("piggybanks")}><ArrowRight size={18}/></button></div>
                <div className="savings-list">{visibleBanks.slice(0,3).map(b => <BankProgress key={b.id} bank={b} transactions={transactions} />)}{visibleBanks.length === 0 && <p className="empty">Todavía no hay huchas en esta divisa.</p>}</div>
                <button className="text-link savings-link" onClick={() => setPage("piggybanks")}>Ver todas las huchas <ArrowRight size={16}/></button>
              </section>
            </div>
            <section className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">ACTIVIDAD</span><h2>Últimas transacciones</h2></div><button className="text-link" onClick={() => setPage("transactions")}>Ver todas <ArrowRight size={16}/></button></div><TransactionList transactions={visibleTransactions.slice(0,5)} currency={currency} onDelete={demo ? undefined : deleteTransaction}/></section>
          </>}

          {page === "transactions" && <>
            <div className="page-heading"><div><span className="eyebrow">MOVIMIENTOS</span><h1>Tus <span className="muted-heading">transacciones.</span></h1><p>Consulta todo lo que entra y sale de tus cuentas.</p></div><div className="heading-actions"><button className="outline-button" onClick={downloadCSV}><Download size={17}/> Exportar CSV</button><button className="primary-button" disabled={demo} onClick={() => setDialog("expense")}><Plus size={18}/> Añadir gasto</button></div></div>
            <section className="panel"><div className="filter-row"><label className="search-input"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por concepto o categoría" /></label><select className="select-control" value={kindFilter} onChange={e=>setKindFilter(e.target.value as typeof kindFilter)} aria-label="Tipo de movimiento"><option value="all">Todos los movimientos</option><option value="income">Ingresos</option><option value="expense">Gastos</option></select><button className="outline-button" onClick={() => setDialog("income")} disabled={demo}><Plus size={16}/> Ingreso</button></div><TransactionList transactions={visibleTransactions} currency={currency} onDelete={demo ? undefined : deleteTransaction}/></section>
          </>}

          {page === "piggybanks" && <>
            <div className="page-heading"><div><span className="eyebrow">PLANIFICACIÓN</span><h1>Tus <span className="muted-heading">huchas.</span></h1><p>Reserva dinero y avanza hacia tus objetivos.</p></div><button className="primary-button" onClick={() => setDialog("piggybank")} disabled={demo}><Plus size={18}/> Nueva hucha</button></div>
            <div className="bank-grid">{visibleBanks.map(bank => <div key={bank.id} className="panel bank-card"><div className="bank-card-top"><div className="bank-icon"><Target size={20}/></div><span className="category-pill">{bank.type === "budget" ? "Presupuesto" : bank.type === "expense" ? "Gasto" : "Ahorro"}</span></div><h2>{bank.name}</h2><BankProgress bank={bank} transactions={transactions} expanded/><div className="bank-card-footer"><span>Meta: {formatMoney(bank.goal, bank.currency)}</span>{!demo && <button className="icon-button danger" onClick={() => void deletePiggybank(bank.id)} title="Eliminar hucha" aria-label={`Eliminar ${bank.name}`}><Trash2 size={17}/></button>}</div></div>)}{visibleBanks.length === 0 && <div className="panel empty-panel">Todavía no tienes huchas en {currency}.</div>}</div>
            <div className="info-note"><CircleHelp size={18}/><span>Esta primera versión permite registrar movimientos directamente en huchas. Las transferencias atómicas entre saldos y las reglas avanzadas de huchas del CoinFlow original se incorporarán en la siguiente fase; todavía no deben utilizarse para contabilidad real.</span></div>
          </>}

          {page === "analytics" && <>
            <div className="page-heading"><div><span className="eyebrow">ANÁLISIS</span><h1>Entiende tus <span className="muted-heading">finanzas.</span></h1><p>Analiza la evolución de tus ingresos y gastos.</p></div></div>
            <div className="metrics-grid metrics-grid-two"><Metric label="Ingresos del mes" amount={month.income} currency={currency} icon={TrendingUp} tone="green" note="Mes actual"/><Metric label="Gastos del mes" amount={month.expense} currency={currency} icon={TrendingDown} tone="pink" note="Mes actual"/></div>
            <section className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">TENDENCIAS</span><h2>Evolución semestral</h2></div></div><CashflowChart series={series} currency={currency}/><div className="chart-legend"><span><i className="legend-income"/>Ingresos</span><span><i className="legend-expense"/>Gastos</span></div></section>
          </>}

          {page === "settings" && <>
            <div className="page-heading"><div><span className="eyebrow">PREFERENCIAS</span><h1>Tu <span className="muted-heading">espacio.</span></h1><p>Acceso a tu cuenta y preferencias de visualización.</p></div></div>
            <div className="settings-grid"><section className="panel settings-card"><div className="panel-heading"><div><span className="eyebrow">CUENTA</span><h2>{user ? "Sesión iniciada" : "Accede a CoinFlow"}</h2><p>{user ? user.email : "Crea tu cuenta para guardar datos en la nube."}</p></div><LockKeyhole size={20}/></div>
              {!supabaseConfigured && <div className="info-note">El registro online aún no está habilitado: configura Supabase y ejecuta la migración SQL antes de abrir la aplicación al público.</div>}
              {user ? <button className="outline-button" onClick={async () => { await server?.auth.signOut(); setNotice("Sesión cerrada."); }}><LogOut size={17}/> Cerrar sesión</button> :
              <><div className="auth-tabs"><button className={authMode==="login"?"active":""} onClick={()=>{setAuthMode("login");setAuthMessage("");}}>Entrar</button><button className={authMode==="register"?"active":""} onClick={()=>{setAuthMode("register");setAuthMessage("");}}>Crear cuenta</button></div>
              <form className="form-stack" onSubmit={handleAuth}><label>Correo electrónico<input name="email" type="email" placeholder="tu@correo.com" required autoComplete="email" /></label>{authMode!=="recover" && <label>Contraseña<input name="password" type="password" placeholder="Mínimo 8 caracteres" minLength={8} required autoComplete={authMode==="register"?"new-password":"current-password"}/></label>}
              {authMessage && <p className="form-message" role="status">{authMessage}</p>}
              <button className="primary-button" disabled={!supabaseConfigured || busy}>{busy ? "Procesando..." : authMode==="recover" ? "Enviar correo" : authMode==="register" ? "Registrarme" : "Iniciar sesión"}</button>
              <button className="text-link" type="button" onClick={()=>{setAuthMode(authMode==="recover"?"login":"recover");setAuthMessage("");}}>{authMode==="recover"?"Volver a iniciar sesión":"¿Has olvidado tu contraseña?"}</button>
              </form></>}
            </section>
            <section className="panel settings-card"><div className="panel-heading"><div><span className="eyebrow">APARIENCIA Y DATOS</span><h2>Preferencias</h2></div><Settings2 size={20}/></div><div className="setting-row"><span>Tema visual</span><button className="outline-button" onClick={()=>setDark(!dark)}>{dark?<Sun size={16}/>:<Moon size={16}/>} {dark?"Oscuro":"Claro"}</button></div><div className="setting-row"><span>Divisa visible</span><select className="select-control" value={currency} onChange={e=>setCurrency(e.target.value as Currency)}><option value="EUR">Euro (EUR)</option><option value="USD">Dólar (USD)</option></select></div><div className="setting-row"><span>Exportar movimientos</span><button className="outline-button" onClick={downloadCSV}><Download size={16}/> CSV</button></div><div className="security-footnote"><ShieldCheck size={17}/> Tu información se separa por usuario mediante políticas de seguridad de Supabase.</div></section></div>
          </>}

          <footer className="footer"><span>© {new Date().getFullYear()} CoinFlow · Versión 2.0 de desarrollo</span><span>Diseñado para tener tus finanzas bajo control.</span></footer>
        </main>
      </div>

      {dialog && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null);}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="eyebrow">NUEVO REGISTRO</span><h2 id="modal-title">{dialog==="piggybank"?"Crear hucha":dialog==="income"?"Añadir ingreso":"Añadir gasto"}</h2></div><button className="icon-button" aria-label="Cerrar" onClick={()=>setDialog(null)}><X size={20}/></button></div>
        {dialog==="piggybank" ? <form className="form-stack" onSubmit={addPiggybank}><label>Nombre de la hucha<input name="name" placeholder="Por ejemplo, vacaciones" required maxLength={120}/></label><label>Tipo<select name="type"><option value="savings">Ahorro</option><option value="budget">Presupuesto</option><option value="expense">Seguimiento de gasto</option></select></label><label>Objetivo ({currency})<input name="goal" type="number" min="0" step="0.01" defaultValue="0" required/></label><button className="primary-button" type="submit" disabled={busy}>{busy?"Guardando…":"Crear hucha"}</button></form> :
        <form className="form-stack" onSubmit={addTransaction}><label>Concepto<input name="concept" placeholder={dialog==="income"?"Ej. Nómina":"Ej. Supermercado"} required maxLength={180}/></label><div className="form-pair"><label>Importe ({currency})<input name="amount" type="number" min="0.01" step="0.01" required placeholder="0,00"/></label><label>Fecha<input name="occurred_on" type="date" defaultValue={today()} required/></label></div><label>Categoría<select name="category">{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></label><label>Destino / origen<select name="piggybank_id"><option value="">Saldo global</option>{visibleBanks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="check-label"><input type="checkbox" name="external"/> Movimiento externo (no afecta al saldo global)</label><button className="primary-button" type="submit" disabled={busy}>{busy?"Guardando…":"Guardar movimiento"}</button></form>}
      </div></div>}
    </div>
  );
}

function Metric({label,amount,currency,icon:Icon,tone,note}: {label:string;amount:number;currency:Currency;icon:typeof Wallet;tone:string;note:string}) {
  return <article className="metric panel"><div className="metric-top"><span>{label}</span><div className={`metric-icon tone-${tone}`}><Icon size={19}/></div></div><div className="metric-amount">{formatMoney(amount,currency)}</div><div className="metric-note"><span className={`metric-dot tone-${tone}`}/>{note}</div></article>;
}

function CashflowChart({series,currency}: {series:ReturnType<typeof cashflowSeries>; currency:Currency}) {
  return <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={series} margin={{top:12,right:8,bottom:0,left:-26}}><defs><linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#76aafa" stopOpacity={0.19}/><stop offset="100%" stopColor="#76aafa" stopOpacity={0}/></linearGradient><linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d9a2c7" stopOpacity={0.08}/><stop offset="100%" stopColor="#d9a2c7" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill:"var(--muted)",fontSize:12}} tickMargin={12}/><YAxis axisLine={false} tickLine={false} tick={{fill:"var(--muted)",fontSize:11}} tickFormatter={n=>n>=1000?`${Math.round(n/1000)}k`:String(n)}/><Tooltip contentStyle={{background:"var(--surface)",border:"1px solid var(--line)",borderRadius:12,color:"var(--text)"}} formatter={(value,name) => [formatMoney(Number(value || 0),currency), name==="income"?"Ingresos":"Gastos"]}/><Area type="monotone" dataKey="income" stroke="#77acff" fill="url(#incomeGradient)" strokeWidth={2.6} dot={false}/><Area type="monotone" dataKey="expense" stroke="#d99abb" fill="url(#expenseGradient)" strokeWidth={2.4} dot={false}/></AreaChart></ResponsiveContainer></div>;
}

function BankProgress({bank,transactions,expanded=false}: {bank:Piggybank;transactions:Transaction[];expanded?:boolean}) {
  const balance = piggybankBalance(bank,transactions);
  const progress = piggybankProgress(bank,transactions);
  return <div className={expanded?"bank-progress expanded":"bank-progress"}><div className="bank-progress-top">{!expanded && <strong>{bank.name}</strong>}<span>{formatMoney(balance,bank.currency)}</span></div><div className="progress-track"><div className="progress-fill" style={{width:`${progress}%`}}/></div><div className="progress-caption"><span>{bank.type==="budget"?"Saldo del presupuesto":bank.type==="expense"?"Balance del gasto":"Objetivo de ahorro"}</span><span>{bank.type==="budget"?"Disponible":`${Math.round(progress)}%`}</span></div></div>;
}

function TransactionList({transactions,currency,onDelete}: {transactions:Transaction[];currency:Currency;onDelete?: (id:string)=>void}) {
  if (!transactions.length) return <div className="empty-panel">No hay movimientos que coincidan con la selección.</div>;
  return <div className="transaction-list">{transactions.map(t=><div className="transaction-row" key={t.id}><div className={`transaction-icon ${t.type}`}>{t.type==="income"?<ArrowDownLeft size={20}/>:<ArrowUpRight size={20}/>}</div><div className="transaction-main"><strong>{t.concept}</strong><span>{t.category} · {displayDate(t.occurred_on)}{t.piggybank_id?" · Hucha":""}{t.external?" · Externo":""}</span></div><div className={`transaction-amount ${t.type}`}>{t.type==="income"?"+":"−"}{formatMoney(t.amount,currency)}</div>{onDelete && <button className="icon-button danger" onClick={()=>onDelete(t.id)} aria-label={`Eliminar movimiento ${t.concept}`}><Trash2 size={16}/></button>}</div>)}</div>;
}
