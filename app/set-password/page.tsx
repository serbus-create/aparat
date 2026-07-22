"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setReady(true);
    });
  }, [router, supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Heslo musí mít alespoň 8 znaků.");
      return;
    }
    if (password !== password2) {
      setError("Hesla se neshodují.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError("Heslo se nepodařilo nastavit.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (!ready) return null;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand" style={{ justifyContent: "center", marginBottom: 12 }}>
          <div className="brand-dot"></div>
          <div className="brand-name">
            <b>APARAT</b> / interní systém
          </div>
        </div>
        <div className="entry-form-title" style={{ textAlign: "center", marginBottom: 24 }}>
          Nastavte si heslo
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Nové heslo</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min. 8 znaků"
              required
              autoComplete="new-password"
            />
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Nové heslo znovu</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="zopakujte heslo"
              required
              autoComplete="new-password"
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-add" style={{ width: "100%", marginTop: 18 }} disabled={loading}>
            {loading ? "Ukládám…" : "Uložit heslo a pokračovat"}
          </button>
        </form>
      </div>
    </div>
  );
}
