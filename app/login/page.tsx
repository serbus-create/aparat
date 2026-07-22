"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Nesprávný email nebo heslo.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Nejdřív zadejte email, pak klikněte na odkaz níže.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setLoading(false);
    if (error) {
      setError("Odkaz se nepodařilo odeslat.");
      return;
    }
    setResetSent(true);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand" style={{ justifyContent: "center", marginBottom: 28 }}>
          <div className="brand-dot"></div>
          <div className="brand-name">
            <b>APARAT</b> / interní systém
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jméno@email.cz"
              required
              autoComplete="email"
            />
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Heslo</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && <div className="auth-error">{error}</div>}
          {resetSent && (
            <div className="auth-note">Odkaz na nastavení hesla byl odeslán na email.</div>
          )}

          <button type="submit" className="btn-add" style={{ width: "100%", marginTop: 18 }} disabled={loading}>
            {loading ? "Přihlašuji…" : "Přihlásit se"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleForgotPassword}
          className="auth-forgot"
          disabled={loading}
        >
          Zapomenuté heslo?
        </button>
      </div>
    </div>
  );
}
