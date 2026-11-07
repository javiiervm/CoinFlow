"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, LockKeyhole } from "lucide-react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { translate, type Language } from "@/lib/i18n";

export default function UpdatePassword() {
  const [language, setLanguage] = useState<Language>("en");
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [working, setWorking] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [message, setMessage] = useState("");
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem("coinflow-language");
    const storedTheme = window.localStorage.getItem("coinflow-theme");
    const lang: Language = storedLanguage === "es" ? "es" : "en";
    setLanguage(lang);
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = storedTheme === "light" ? "light" : "dark";
    document.title = lang === "es" ? "CoinFlow — Cambiar contraseña" : "CoinFlow — Change password";
    const client = getSupabase();
    if (!client) { setReady(true); return; }
    let active = true;
    void client.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setAuthenticated(Boolean(data.user && !error));
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabase();
    if (!client || !authenticated || working) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    setMessage("");
    if (password.length < 8) {
      setMessage(t("Password must have at least 8 characters."));
      return;
    }
    if (password !== confirmation) {
      setMessage(t("Passwords do not match."));
      return;
    }
    setWorking(true);
    const { error } = await client.auth.updateUser({ password });
    setWorking(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setUpdated(true);
  }

  return <main className="password-page">
    <section className="panel password-panel">
      <div className="password-symbol"><LockKeyhole size={22} /></div>
      <span className="eyebrow">COINFLOW</span>
      <h1>{t("Change password")}</h1>
      {!supabaseConfigured || !ready
        ? <p>{t("Checking session…")}</p>
        : updated
          ? <div className="password-success" role="status">
              <CheckCircle2 size={20} />
              <span>{t("Your password has been updated.")}</span>
            </div>
          : authenticated
            ? <>
                <p>{t("Enter a new password for your CoinFlow account.")}</p>
                <form className="form-stack" onSubmit={(event) => void submit(event)}>
                  <label>{t("New password")}
                    <input type="password" minLength={8} autoComplete="new-password"
                      name="password" required />
                  </label>
                  <label>{t("Confirm new password")}
                    <input type="password" minLength={8} autoComplete="new-password"
                      name="confirmation" required />
                  </label>
                  {message && <p className="operation-error" role="alert">{message}</p>}
                  <button className="primary-button" disabled={working}>
                    {working ? t("Saving…") : t("Update password")}
                  </button>
                </form>
              </>
            : <p role="alert">{t("This link has expired or you are not signed in. Request a new password reset email.")}</p>}
      <a className="password-back" href="/"><ArrowLeft size={16} /> {t("Back to CoinFlow")}</a>
    </section>
  </main>;
}
