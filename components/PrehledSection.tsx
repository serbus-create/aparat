"use client";

import { useEffect, useMemo, useState } from "react";
import type { Nakup, NakupFase, ProdejStav, DoplnkyNakup, DoplnkyProdej } from "@/lib/database.types";
import {
  fetchActiveNakup,
  fetchProdej,
  fetchDoplnkyNakup,
  fetchDoplnkyProdej,
  computeStock,
  netForSale,
  type ProdejFull,
} from "@/lib/data";
import { formatKc, formatDate } from "@/lib/format";

export type OverviewTarget = "nakup" | "prodej" | "doplnky";

const FAZE: { key: NakupFase; label: string }[] = [
  { key: "nakoupeno", label: "Nakoupeno" },
  { key: "servisovano", label: "Servisováno" },
  { key: "pripraveno", label: "Připraveno k prodeji" },
  { key: "nefunkcni", label: "Nefunkční" },
];

const STAVY: { key: ProdejStav; label: string }[] = [
  { key: "pripraveno", label: "Připraveno" },
  { key: "inzerovano", label: "Inzerováno" },
  { key: "zamluveno", label: "Zamluveno" },
  { key: "prodano", label: "Prodáno" },
];

const STALE_DAYS = 30;
const LOW_STOCK = 2;

function nakupDate(n: Nakup): Date {
  return n.datum ? new Date(`${n.datum}T00:00:00`) : new Date(n.created_at);
}

function prodejMonthKey(r: ProdejFull): string {
  return (r.datum || r.created_at).slice(0, 7);
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthName(): string {
  const label = new Date().toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function daysSince(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export default function PrehledSection({
  refreshKey,
  onGo,
}: {
  refreshKey: number;
  onGo: (target: OverviewTarget) => void;
}) {
  const [nakup, setNakup] = useState<Nakup[]>([]);
  const [prodej, setProdej] = useState<ProdejFull[]>([]);
  const [dn, setDn] = useState<DoplnkyNakup[]>([]);
  const [dp, setDp] = useState<DoplnkyProdej[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [n, p, a, b] = await Promise.all([fetchActiveNakup(), fetchProdej(), fetchDoplnkyNakup(), fetchDoplnkyProdej()]);
      if (cancelled) return;
      setNakup(n);
      setProdej(p);
      setDn(a);
      setDp(b);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const stats = useMemo(() => {
    const frozen = nakup.filter((n) => n.fase !== "nefunkcni");
    const frozenTotal = frozen.reduce((s, n) => s + n.kolik_stalo, 0);
    const brokenTotal = nakup.filter((n) => n.fase === "nefunkcni").reduce((s, n) => s + n.kolik_stalo, 0);

    const fazeCount = new Map<NakupFase, number>();
    nakup.forEach((n) => fazeCount.set(n.fase, (fazeCount.get(n.fase) ?? 0) + 1));
    const stavCount = new Map<ProdejStav, number>();
    prodej.forEach((r) => stavCount.set(r.stav, (stavCount.get(r.stav) ?? 0) + 1));

    const month = currentMonthKey();
    const soldThisMonth = prodej.filter((r) => r.stav === "prodano" && prodejMonthKey(r) === month);
    const marginThisMonth = soldThisMonth.reduce((s, r) => s + netForSale(r), 0);

    const reserved = prodej.filter((r) => r.stav === "zamluveno");
    const lowStock = computeStock(dn, dp).filter((s) => s.remaining <= LOW_STOCK);
    const stale = frozen
      .map((n) => ({ n, days: daysSince(nakupDate(n)) }))
      .filter((x) => x.days > STALE_DAYS)
      .sort((a, b) => b.days - a.days);

    return { frozenTotal, frozenCount: frozen.length, brokenTotal, fazeCount, stavCount, soldThisMonth, marginThisMonth, reserved, lowStock, stale };
  }, [nakup, prodej, dn, dp]);

  return (
    <div>
      <div className="list-header">
        <div className="list-title">Přehled</div>
        <div className="list-sub">{loading ? "NAČÍTÁM…" : "AKTUÁLNÍ STAV"}</div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Zamrzlé ve skladu</div>
          <div className="stat-value">{formatKc(stats.frozenTotal)}</div>
          <div className="stat-sub">
            {stats.frozenCount} neprodaných položek
            {stats.brokenTotal > 0 && <> · nefunkční mimo: {formatKc(stats.brokenTotal)}</>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Marže — {monthName()}</div>
          <div className={`stat-value ${stats.marginThisMonth >= 0 ? "profit-pos" : "profit-neg"}`}>{formatKc(stats.marginThisMonth)}</div>
          <div className="stat-sub">{stats.soldThisMonth.length} prodaných položek tento měsíc</div>
        </div>
      </div>

      <div className="form-section-label" style={{ marginTop: 28 }}>
        Nákup podle fáze
      </div>
      <div className="stat-grid compact">
        {FAZE.map((f) => (
          <div className="stat-card" key={f.key}>
            <div className="stat-label">{f.label}</div>
            <div className="stat-value">{stats.fazeCount.get(f.key) ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="form-section-label" style={{ marginTop: 28 }}>
        Prodej podle stavu
      </div>
      <div className="stat-grid compact">
        {STAVY.map((s) => (
          <div className="stat-card" key={s.key}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{stats.stavCount.get(s.key) ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="list-header" style={{ marginTop: 36 }}>
        <div className="list-title">Co řešit</div>
      </div>

      <div className="todo-group">
        <div className="todo-head">
          <span>Zamluvené, ještě neprodané</span>
          <button className="btn-secondary" onClick={() => onGo("prodej")}>
            → Prodej
          </button>
        </div>
        {stats.reserved.map((r) => (
          <div className="todo-item" key={r.id}>
            <div className="who">{r.polozka}</div>
            <div className="todo-meta">
              {r.klient_jmeno} · {formatDate(r.datum)}
            </div>
            <div className="amount">{formatKc(r.cena)}</div>
          </div>
        ))}
        {!loading && stats.reserved.length === 0 && <div className="todo-empty">Nic k řešení.</div>}
      </div>

      <div className="todo-group">
        <div className="todo-head">
          <span>Docházející doplňky (skladem {LOW_STOCK} ks nebo méně)</span>
          <button className="btn-secondary" onClick={() => onGo("doplnky")}>
            → Doplňky
          </button>
        </div>
        {stats.lowStock.map((s) => (
          <div className="todo-item" key={s.name}>
            <div className="who">{s.name}</div>
            <div className="todo-meta">koupeno {s.bought} ks · prodáno {s.sold} ks</div>
            <div className="amount profit-neg">{s.remaining} ks</div>
          </div>
        ))}
        {!loading && stats.lowStock.length === 0 && <div className="todo-empty">Nic k řešení.</div>}
      </div>

      <div className="todo-group">
        <div className="todo-head">
          <span>Neprodané v Nákupu starší než {STALE_DAYS} dní</span>
          <button className="btn-secondary" onClick={() => onGo("nakup")}>
            → Nákup
          </button>
        </div>
        {stats.stale.map(({ n, days }) => (
          <div className="todo-item" key={n.id}>
            <div className="who">{n.co_koupili}</div>
            <div className="todo-meta">
              {n.dodavatel_jmeno} · {formatDate(n.datum)} · {days} dní
            </div>
            <div className="amount">{formatKc(n.kolik_stalo)}</div>
          </div>
        ))}
        {!loading && stats.stale.length === 0 && <div className="todo-empty">Nic k řešení.</div>}
      </div>
    </div>
  );
}
