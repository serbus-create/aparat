"use client";

import { useEffect, useState } from "react";
import type { Historie, HistorieEntita, Profile } from "@/lib/database.types";
import { fetchHistorie } from "@/lib/data";

export function formatStamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`;
}

export function authorName(profiles: Profile[], id: string | null): string {
  return profiles.find((p) => p.id === id)?.full_name.split(" ")[0] ?? "—";
}

// Rozbalovací historie změn jednoho záznamu (kdo a kdy změnil stav, cenu…).
export default function HistoryPanel({
  entita,
  zaznamId,
  profiles,
  refreshKey,
}: {
  entita: HistorieEntita;
  zaznamId: number;
  profiles: Profile[];
  refreshKey: number;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Historie[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchHistorie(entita, zaznamId)
      .then((rows) => !cancelled && setEntries(rows))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [open, entita, zaznamId, refreshKey]);

  return (
    <div className="history-panel">
      <button className="history-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Historie změn
      </button>
      {open && (
        <div className="history-list">
          {entries === null && <div className="history-empty">Načítám…</div>}
          {entries?.length === 0 && <div className="history-empty">Zatím žádné zaznamenané změny.</div>}
          {entries?.map((h) => (
            <div className="history-item" key={h.id}>
              <span className="history-when">{formatStamp(h.created_at)}</span>
              <span className="history-who">{authorName(profiles, h.autor_id)}</span>
              <span className="history-what">{h.popis}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
