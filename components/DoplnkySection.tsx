"use client";

import { useEffect, useMemo, useState } from "react";
import type { Profile, DoplnkyNakup, DoplnkyProdej, DoplnkyCena } from "@/lib/database.types";
import {
  fetchDoplnkyNakup,
  fetchDoplnkyProdej,
  fetchDoplnkyCeny,
  addDoplnkyNakup,
  addDoplnkyProdej,
  setDoplnekCena,
  computeStock,
  fetchProfiles,
} from "@/lib/data";
import { formatKc, parseDigits } from "@/lib/format";
import AuthorBadge from "@/components/AuthorBadge";

type Sub = "kupujeme" | "prodavame" | "sklad";

export default function DoplnkySection({
  profile,
  refreshKey,
  onMutate,
}: {
  profile: Profile;
  refreshKey: number;
  onMutate: () => void;
}) {
  const [sub, setSub] = useState<Sub>("kupujeme");
  const [kupujeme, setKupujeme] = useState<DoplnkyNakup[]>([]);
  const [prodavame, setProdavame] = useState<DoplnkyProdej[]>([]);
  const [ceny, setCeny] = useState<DoplnkyCena[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [item, setItem] = useState("");
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const [dn, dp, dc, profs] = await Promise.all([fetchDoplnkyNakup(), fetchDoplnkyProdej(), fetchDoplnkyCeny(), fetchProfiles()]);
    setKupujeme(dn);
    setProdavame(dp);
    setCeny(dc);
    setProfiles(profs);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const stock = useMemo(() => computeStock(kupujeme, prodavame), [kupujeme, prodavame]);

  async function handleAdd() {
    if (!item.trim() || !qty.trim() || !total.trim()) return;
    setSubmitting(true);
    try {
      const payload = { polozka: item.trim(), pocet_ks: parseDigits(qty), cena_celkem: parseDigits(total), autor_id: profile.id };
      if (sub === "kupujeme") await addDoplnkyNakup(payload);
      else await addDoplnkyProdej(payload);
      setItem("");
      setQty("");
      setTotal("");
      await load();
      onMutate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePriceChange(polozka: string, value: string) {
    const num = parseDigits(value);
    setCeny((prev) => {
      const existing = prev.find((c) => c.polozka === polozka);
      if (existing) return prev.map((c) => (c.polozka === polozka ? { ...c, cena_za_ks: num } : c));
      return [...prev, { polozka, cena_za_ks: num }];
    });
    if (value.trim() !== "") {
      await setDoplnekCena(polozka, num);
      onMutate();
    }
  }

  const records = sub === "kupujeme" ? kupujeme : sub === "prodavame" ? prodavame : [];
  const recordsTotal = records.reduce((s, r) => s + r.cena_celkem, 0);

  return (
    <div>
      <div className="sub-toggle">
        <div className={`sub-pill ${sub === "kupujeme" ? "active" : ""}`} onClick={() => setSub("kupujeme")}>
          Co kupujeme
        </div>
        <div className={`sub-pill ${sub === "prodavame" ? "active" : ""}`} onClick={() => setSub("prodavame")}>
          Co prodáváme
        </div>
        <div className={`sub-pill ${sub === "sklad" ? "active" : ""}`} onClick={() => setSub("sklad")}>
          Skladové zásoby
        </div>
      </div>

      {sub !== "sklad" && (
        <>
          <div className="entry-form">
            <div className="entry-form-title">{sub === "kupujeme" ? "Nový záznam — nákup doplňků" : "Nový záznam — prodej doplňků"}</div>
            <div className="simple-fields">
              <div className="field">
                <label>Položka</label>
                <input type="text" value={item} onChange={(e) => setItem(e.target.value)} placeholder="např. Film Kodak Gold 200" />
              </div>
              <div className="field">
                <label>Počet kusů</label>
                <input type="text" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="např. 10" />
              </div>
              <div className="field">
                <label>{sub === "kupujeme" ? "Za kolik celkem" : "Za kolik jsme prodali"}</label>
                <input type="text" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="např. 1200" />
              </div>
              <button className="btn-add" onClick={handleAdd} disabled={submitting}>
                + Přidat
              </button>
            </div>
          </div>

          <div className="list-header">
            <div className="list-title">{sub === "kupujeme" ? "Nákup doplňků" : "Prodej doplňků"}</div>
            <div className="list-sub">{loading ? "…" : `${records.length} ZÁZNAMŮ`}</div>
          </div>

          <div className="simple-col-headers">
            <div>Položka</div>
            <div>Ks</div>
            <div className="amount">{sub === "kupujeme" ? "Kč celkem" : "Kč prodáno"}</div>
            <div>Vyplnil</div>
          </div>
          <div>
            {records.map((r) => (
              <div className="simple-record" key={r.id}>
                <div className="who">{r.polozka}</div>
                <div className="qty">{r.pocet_ks} ks</div>
                <div className="amount">{formatKc(r.cena_celkem)}</div>
                <div>
                  <AuthorBadge authorId={r.autor_id} profiles={profiles} />
                </div>
              </div>
            ))}
            {!loading && records.length === 0 && <div className="stock-empty">Zatím žádné záznamy.</div>}
          </div>

          <div className="total-row">
            <span>{sub === "kupujeme" ? "Celkem utraceno" : "Celkem utrženo"}</span>
            <b>{formatKc(recordsTotal)}</b>
          </div>
        </>
      )}

      {sub === "sklad" && (
        <div>
          <div className="list-header">
            <div className="list-title">Skladové zásoby</div>
            <div className="list-sub">{stock.length} POLOŽEK</div>
          </div>
          <div className="stock-col-headers" style={{ gridTemplateColumns: "1.4fr 0.7fr 0.7fr 0.7fr 0.9fr" }}>
            <div>Položka</div>
            <div className="amount">Koupeno</div>
            <div className="amount">Prodáno</div>
            <div className="amount">Zbývá</div>
            <div className="amount">Cena/ks</div>
          </div>
          <div>
            {stock.map((s) => {
              const priceEntry = ceny.find((c) => c.polozka.trim().toLowerCase() === s.name.trim().toLowerCase());
              return (
                <div className="stock-row" style={{ gridTemplateColumns: "1.4fr 0.7fr 0.7fr 0.7fr 0.9fr" }} key={s.name}>
                  <div className="who">{s.name}</div>
                  <div className="amount dim">{s.bought} ks</div>
                  <div className="amount dim">{s.sold} ks</div>
                  <div className={`amount ${s.remaining <= 2 ? "low" : ""}`}>{s.remaining} ks</div>
                  <div>
                    <input
                      className="price-input"
                      type="text"
                      defaultValue={priceEntry ? priceEntry.cena_za_ks : ""}
                      placeholder="Kč"
                      onBlur={(e) => handlePriceChange(s.name, e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
            {stock.length === 0 && <div className="stock-empty">Zatím žádné položky na skladě.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
