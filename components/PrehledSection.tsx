"use client";

import { useEffect, useMemo, useState } from "react";
import type { Nakup, NakupFase, ProdejStav, DoplnkyNakup, DoplnkyProdej, Historie, Profile, DilnaNaklad } from "@/lib/database.types";
import {
  fetchActiveNakup,
  fetchProdej,
  fetchDoplnkyNakup,
  fetchDoplnkyProdej,
  fetchProfiles,
  fetchRecentHistorie,
  fetchDilnaNaklady,
  returnToFirm,
  computeStock,
  netForSale,
  type ProdejFull,
} from "@/lib/data";
import { formatKc, formatDate } from "@/lib/format";
import { NAKUP_PHASES, PRODEJ_STATES, PAID_STATES } from "@/lib/labels";
import { authorName, formatStamp } from "@/components/HistoryPanel";

export type OverviewTarget = "nakup" | "dilna" | "prodej" | "doplnky";

const FAZE = NAKUP_PHASES;
const STAVY = PRODEJ_STATES.filter((st) => st.key !== "storno");

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
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [recent, setRecent] = useState<Historie[]>([]);
  const [naklady, setNaklady] = useState<DilnaNaklad[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [n, p, a, b, profs, hist, nk] = await Promise.all([
        fetchActiveNakup(),
        fetchProdej(),
        fetchDoplnkyNakup(),
        fetchDoplnkyProdej(),
        fetchProfiles(),
        fetchRecentHistorie(15).catch(() => [] as Historie[]),
        fetchDilnaNaklady().catch(() => [] as DilnaNaklad[]),
      ]);
      if (cancelled) return;
      setProfiles(profs);
      setRecent(hist);
      setNaklady(nk);
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
    const dilnaOf = (id: number) => naklady.filter((x) => x.nakup_id === id).reduce((s, x) => s + x.cena, 0);
    const frozenTotal = frozen.reduce((s, n) => s + n.kolik_stalo + dilnaOf(n.id), 0);
    const brokenTotal = nakup.filter((n) => n.fase === "nefunkcni").reduce((s, n) => s + n.kolik_stalo, 0);

    const fazeCount = new Map<NakupFase, number>();
    nakup.forEach((n) => fazeCount.set(n.fase, (fazeCount.get(n.fase) ?? 0) + 1));
    const stavCount = new Map<ProdejStav, number>();
    prodej.forEach((r) => stavCount.set(r.stav, (stavCount.get(r.stav) ?? 0) + 1));

    const month = currentMonthKey();
    const soldThisMonth = prodej.filter((r) => PAID_STATES.includes(r.stav) && prodejMonthKey(r) === month);
    const marginThisMonth = soldThisMonth.reduce((s, r) => s + netForSale(r), 0);
    const returnedThisMonth = soldThisMonth.reduce((s, r) => s + returnToFirm(r), 0);
    const waitingDelivery = naklady.filter((x) => !x.dorazilo);

    const reserved = prodej.filter((r) => r.stav === "zamluveno");
    const toShip = prodej.filter((r) => r.stav === "k_odeslani");
    const complaints = prodej.filter((r) => r.stav === "reklamace");
    const lowStock = computeStock(dn, dp).filter((s) => s.remaining <= LOW_STOCK);
    const stale = frozen
      .map((n) => ({ n, days: daysSince(nakupDate(n)) }))
      .filter((x) => x.days > STALE_DAYS)
      .sort((a, b) => b.days - a.days);

    return { frozenTotal, frozenCount: frozen.length, brokenTotal, fazeCount, stavCount, soldThisMonth, marginThisMonth, returnedThisMonth, waitingDelivery, reserved, toShip, complaints, lowStock, stale };
  }, [nakup, prodej, dn, dp, naklady]);

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
            {stats.frozenCount} neprodaných položek (nákup + dílna)
            {stats.brokenTotal > 0 && <> · nefunkční mimo: {formatKc(stats.brokenTotal)}</>}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Marže — {monthName()}</div>
          <div className={`stat-value ${stats.marginThisMonth >= 0 ? "profit-pos" : "profit-neg"}`}>{formatKc(stats.marginThisMonth)}</div>
          <div className="stat-sub">{stats.soldThisMonth.length} zaplacených objednávek tento měsíc</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vráceno do firmy — {monthName()}</div>
          <div className="stat-value">{formatKc(stats.returnedThisMonth)}</div>
          <div className="stat-sub">nákupní ceny prodaných položek</div>
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
          <span>Zamluvené, ještě nezaplacené</span>
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
          <span>Příslušenství čeká na dodání</span>
          <button className="btn-secondary" onClick={() => onGo("dilna")}>
            → Dílna
          </button>
        </div>
        {stats.waitingDelivery.map((x) => (
          <div className="todo-item" key={x.id}>
            <div className="who">{x.popis}</div>
            <div className="todo-meta">{nakup.find((n) => n.id === x.nakup_id)?.co_koupili ?? "—"}</div>
            <div className="amount">{formatKc(x.cena)}</div>
          </div>
        ))}
        {!loading && stats.waitingDelivery.length === 0 && <div className="todo-empty">Nic k řešení.</div>}
      </div>

      <ProdejTodo title="Zaplacené, čekají na odeslání" rows={stats.toShip} loading={loading} onGo={onGo} />
      <ProdejTodo title="Reklamace" rows={stats.complaints} loading={loading} onGo={onGo} />

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

      <div className="list-header" style={{ marginTop: 36 }}>
        <div className="list-title">Poslední změny</div>
        <div className="list-sub">KDO CO UDĚLAL</div>
      </div>
      <div className="todo-group">
        {recent.map((h) => (
          <div className="history-item feed" key={h.id}>
            <span className="history-when">{formatStamp(h.created_at)}</span>
            <span className="history-who">{authorName(profiles, h.autor_id)}</span>
            <span className="history-what">
              <b>{h.nazev}</b> — {h.popis}
            </span>
          </div>
        ))}
        {!loading && recent.length === 0 && <div className="todo-empty">Zatím žádné zaznamenané změny.</div>}
      </div>
    </div>
  );
}

function ProdejTodo({
  title,
  rows,
  loading,
  onGo,
}: {
  title: string;
  rows: ProdejFull[];
  loading: boolean;
  onGo: (target: OverviewTarget) => void;
}) {
  return (
    <div className="todo-group">
      <div className="todo-head">
        <span>{title}</span>
        <button className="btn-secondary" onClick={() => onGo("prodej")}>
          → Prodej
        </button>
      </div>
      {rows.map((r) => (
        <div className="todo-item" key={r.id}>
          <div className="who">{r.polozka}</div>
          <div className="todo-meta">
            {r.klient_jmeno} · {formatDate(r.datum)}
          </div>
          <div className="amount">{formatKc(r.cena)}</div>
        </div>
      ))}
      {!loading && rows.length === 0 && <div className="todo-empty">Nic k řešení.</div>}
    </div>
  );
}
