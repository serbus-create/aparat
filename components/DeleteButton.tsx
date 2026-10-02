"use client";

import { useState } from "react";

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  const err = e as { message?: string; code?: string } | null;
  // 23503 = porušení cizího klíče (záznam je používán jinde)
  if (err?.code === "23503") return "Záznam nelze smazat, protože na něj odkazuje jiný záznam.";
  return err?.message || "Smazání se nepovedlo.";
}

// Dvoukrokové mazání: "Smazat" → "Opravdu smazat?" [Ano, smazat] [Zrušit].
// onDelete může vyhodit Error se srozumitelnou hláškou (zobrazí se pod tlačítkem).
export default function DeleteButton({
  onDelete,
  hint,
}: {
  onDelete: () => Promise<void>;
  hint?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(messageOf(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="delete-wrap">
      {confirming ? (
        <div className="delete-confirm">
          <span className="delete-question">Opravdu smazat?</span>
          <button className="btn-danger" onClick={run} disabled={busy}>
            Ano, smazat
          </button>
          <button className="btn-secondary" onClick={() => setConfirming(false)} disabled={busy}>
            Zrušit
          </button>
        </div>
      ) : (
        <button
          className="btn-secondary danger"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          Smazat
        </button>
      )}
      {confirming && hint && <div className="delete-hint">{hint}</div>}
      {error && <div className="delete-error">{error}</div>}
    </div>
  );
}
