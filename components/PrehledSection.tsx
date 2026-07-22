"use client";

import { useEffect, useMemo, useState } from "react";
import type { Nakup } from "@/lib/database.types";
import { fetchAllNakup, fetchProdej, netForSale, type ProdejFull } from "@/lib/data";
import { formatKc, formatDate } from "@/lib/format";

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function PrehledSection({ refreshKey }: { refreshKey: number }) {
  const [allNakup, setAllNakup] = useState<Nakup[]>([]);
  const [prodejList, setProdejList] = useState<ProdejFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  async function load() {
    setLoading(true);
    const [nakup, prodej] = await Promise.all([fetchAllNakup(), fetchProdej()]);
    setAllNakup(nakup);
    setProdejList(prodej);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const losses = useMemo(
    () =>
      allNakup
        .filter((n) => n.fase === "nefunkcni")
        .map((n) => ({ month: monthKey(n.datum || n.created_at), nakup: n })),
    [allNakup]
  );

  const gains = useMemo(
    () =>
      prodejList
        .filter((r) => r.stav === "prodano")
        .map((r) => ({ month: monthKey(r.datum || r.created_at), prodej: r, net: netForSale(r) })),
    [prodejList]
  );

  const months = useMemo(() => {
    const set = new Set<string>();
    losses.forEach((l) => set.add(l.month));
    gains.forEach((g) => set.add(g.month));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [losses, gains]);

  const filteredLosses = selectedMonth === "all" ? losses : losses.filter((l) => l.month === selectedMonth);
  const filteredGains = selectedMonth === "all" ? gains : gains.filter((g) => g.month === selectedMonth);

  const totalGain = filteredGains.reduce((s, g) => s + g.net, 0);
  const totalLoss = filteredLosses.reduce((s, l) => s + l.nakup.kolik_stalo, 0);
  const balance = totalGain - totalLoss;

  return (
    <div>
      <div className="list-header">
        <div className="list-title">Přehled zisků a ztrát</div>
        <div className="list-sub">{loading ? "…" : `${months.length} MĚSÍCŮ`}</div>
      </div>

      <div className="entry-form">
        <div className="field">
          <label>Měsíc</label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            <option value="all">Celkem (vše)</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>

        <div className="prodej-row cols-3" style={{ marginTop: 18 }}>
          <div className="fee-chip">
            <span className="fee-label">Zisk z prodejů</span>
            <span className={`fee-value ${totalGain >= 0 ? "profit-pos" : "profit-neg"}`}>{formatKc(totalGain)}</span>
          </div>
          <div className="fee-chip">
            <span className="fee-label">Ztráta z nefunkčních</span>
            <span className="fee-value profit-neg">−{formatKc(totalLoss)}</span>
          </div>
          <div className="fee-chip">
            <span className="fee-label">Bilance</span>
            <span className={`fee-value ${balance >= 0 ? "profit-pos" : "profit-neg"}`}>{formatKc(balance)}</span>
          </div>
        </div>
      </div>

      <div className="form-section-label">Prodáno se ziskem</div>
      <div>
        {filteredGains
          .sort((a, b) => (b.prodej.datum || "").localeCompare(a.prodej.datum || ""))
          .map((g) => (
            <div className="simple-record" key={g.prodej.id} style={{ gridTemplateColumns: "0.8fr 1.3fr 1fr 0.8fr" }}>
              <div className="qty">{formatDate(g.prodej.datum)}</div>
              <div className="who">{g.prodej.polozka}</div>
              <div style={{ color: "var(--gray-2)", fontSize: 13 }}>{g.prodej.klient_jmeno}</div>
              <div className={`amount ${g.net >= 0 ? "profit-pos" : "profit-neg"}`}>{formatKc(g.net)}</div>
            </div>
          ))}
        {!loading && filteredGains.length === 0 && <div className="stock-empty">Žádné prodeje v tomto období.</div>}
      </div>

      <div className="form-section-label" style={{ marginTop: 32 }}>
        Nefunkční (ztráta)
      </div>
      <div>
        {filteredLosses
          .sort((a, b) => (b.nakup.datum || "").localeCompare(a.nakup.datum || ""))
          .map((l) => (
            <div className="simple-record" key={l.nakup.id} style={{ gridTemplateColumns: "0.8fr 1.3fr 1fr 0.8fr" }}>
              <div className="qty">{formatDate(l.nakup.datum)}</div>
              <div className="who">{l.nakup.co_koupili}</div>
              <div style={{ color: "var(--gray-2)", fontSize: 13 }}>{l.nakup.dodavatel_jmeno}</div>
              <div className="amount profit-neg">−{formatKc(l.nakup.kolik_stalo)}</div>
            </div>
          ))}
        {!loading && filteredLosses.length === 0 && <div className="stock-empty">Žádné nefunkční položky v tomto období.</div>}
      </div>
    </div>
  );
}
