"use client";

import { useEffect, useMemo, useState } from "react";
import type { Profile, Nakup, ProdejStav, DoplnkyNakup, DoplnkyProdej, DoplnkyCena } from "@/lib/database.types";
import {
  fetchActiveNakup,
  fetchProdej,
  addProdej,
  setProdejStav,
  fetchProfiles,
  fetchDoplnkyNakup,
  fetchDoplnkyProdej,
  fetchDoplnkyCeny,
  computeStock,
  estimateDoplnekUnitPrice,
  type ProdejFull,
} from "@/lib/data";
import { formatKc, parseDigits } from "@/lib/format";
import { FEE_BALENE, FEE_POSTOVNE } from "@/lib/invoice";
import AuthorBadge from "@/components/AuthorBadge";
import InvoiceModal from "@/components/InvoiceModal";

const PRODEJ_STATES: { key: ProdejStav; label: string }[] = [
  { key: "pripraveno", label: "Připraveno" },
  { key: "inzerovano", label: "Inzerováno" },
  { key: "zamluveno", label: "Zamluveno" },
  { key: "prodano", label: "Prodáno" },
  { key: "storno", label: "Storno" },
];

interface Repair {
  desc: string;
  price: number;
}
interface DoplnekLine {
  polozka: string;
  qty: number;
  price: number;
}

function netForSale(r: ProdejFull): number {
  const repairsTotal = r.opravy.reduce((s, x) => s + x.cena, 0);
  const doplnkyTotal = r.doplnky.reduce((s, x) => s + x.cena, 0);
  const originalCost = r.nakup?.kolik_stalo ?? 0;
  return r.cena + doplnkyTotal - repairsTotal - FEE_BALENE - FEE_POSTOVNE - originalCost;
}

export default function ProdejSection({
  profile,
  refreshKey,
  onMutate,
  preselectNakupId,
  onPreselectConsumed,
}: {
  profile: Profile;
  refreshKey: number;
  onMutate: () => void;
  preselectNakupId: number | null;
  onPreselectConsumed: () => void;
}) {
  const [availableNakup, setAvailableNakup] = useState<Nakup[]>([]);
  const [prodejList, setProdejList] = useState<ProdejFull[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [doplnkyNakup, setDoplnkyNakupState] = useState<DoplnkyNakup[]>([]);
  const [doplnkyProdej, setDoplnkyProdejState] = useState<DoplnkyProdej[]>([]);
  const [doplnkyCeny, setDoplnkyCeny] = useState<DoplnkyCena[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoiceTarget, setInvoiceTarget] = useState<ProdejFull | null>(null);

  const [klientJmeno, setKlientJmeno] = useState("");
  const [klientTelefon, setKlientTelefon] = useState("");
  const [klientEmail, setKlientEmail] = useState("");
  const [klientAdresa, setKlientAdresa] = useState("");
  const [selectedNakupId, setSelectedNakupId] = useState<string>("");
  const [prodejCena, setProdejCena] = useState("");
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [repairDesc, setRepairDesc] = useState("");
  const [repairPrice, setRepairPrice] = useState("");
  const [doplnekLines, setDoplnekLines] = useState<DoplnekLine[]>([]);
  const [doplnekSelect, setDoplnekSelect] = useState("");
  const [doplnekQty, setDoplnekQty] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const [nakup, prodej, profs, dn, dp, dc] = await Promise.all([
      fetchActiveNakup(),
      fetchProdej(),
      fetchProfiles(),
      fetchDoplnkyNakup(),
      fetchDoplnkyProdej(),
      fetchDoplnkyCeny(),
    ]);
    setAvailableNakup(nakup.filter((n) => n.fase === "pripraveno"));
    setProdejList(prodej);
    setProfiles(profs);
    setDoplnkyNakupState(dn);
    setDoplnkyProdejState(dp);
    setDoplnkyCeny(dc);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    if (preselectNakupId != null) {
      setSelectedNakupId(String(preselectNakupId));
      onPreselectConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectNakupId, availableNakup]);

  const selectedNakup = useMemo(
    () => availableNakup.find((n) => n.id === parseInt(selectedNakupId || "-1", 10)) ?? null,
    [availableNakup, selectedNakupId]
  );

  const stock = useMemo(() => computeStock(doplnkyNakup, doplnkyProdej), [doplnkyNakup, doplnkyProdej]);
  const inStock = stock.filter((s) => s.remaining > 0);

  const doplnekUnitPrice = doplnekSelect
    ? estimateDoplnekUnitPrice(doplnekSelect, doplnkyCeny, doplnkyProdej, doplnkyNakup)
    : 0;
  const doplnekQtyNum = parseDigits(doplnekQty) || 0;
  const doplnekPreviewTotal = Math.round(doplnekUnitPrice * doplnekQtyNum);
  const doplnekStockRow = stock.find((s) => s.name === doplnekSelect);

  const price = parseDigits(prodejCena);
  const purchaseCost = selectedNakup?.kolik_stalo ?? 0;
  const doplnkyFormTotal = doplnekLines.reduce((s, d) => s + d.price, 0);
  const repairsFormTotal = repairs.reduce((s, r) => s + r.price, 0);
  const fees = FEE_BALENE + FEE_POSTOVNE;
  const profit = price + doplnkyFormTotal - repairsFormTotal - fees - purchaseCost;
  const itemMargin = selectedNakup ? price - selectedNakup.kolik_stalo : null;

  function addRepair() {
    if (!repairDesc.trim() || !repairPrice.trim()) return;
    setRepairs((prev) => [...prev, { desc: repairDesc.trim(), price: parseDigits(repairPrice) }]);
    setRepairDesc("");
    setRepairPrice("");
  }
  function removeRepair(i: number) {
    setRepairs((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addDoplnekLine() {
    if (!doplnekSelect || !doplnekQtyNum) return;
    setDoplnekLines((prev) => [...prev, { polozka: doplnekSelect, qty: doplnekQtyNum, price: doplnekPreviewTotal }]);
    setDoplnekQty("1");
    setDoplnekSelect("");
  }
  function removeDoplnekLine(i: number) {
    setDoplnekLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    if (!klientJmeno.trim() || !selectedNakup || !prodejCena.trim()) return;
    setSubmitting(true);
    try {
      await addProdej({
        nakup_id: selectedNakup.id,
        klient_jmeno: klientJmeno.trim(),
        klient_telefon: klientTelefon.trim() || null,
        klient_email: klientEmail.trim() || null,
        klient_adresa: klientAdresa.trim() || null,
        polozka: selectedNakup.co_koupili,
        cena: price,
        autor_id: profile.id,
        opravy: repairs.map((r) => ({ popis: r.desc, cena: r.price })),
        doplnky: doplnekLines.map((d) => ({ polozka: d.polozka, pocet_ks: d.qty, cena: d.price })),
      });
      setKlientJmeno("");
      setKlientTelefon("");
      setKlientEmail("");
      setKlientAdresa("");
      setSelectedNakupId("");
      setProdejCena("");
      setRepairs([]);
      setDoplnekLines([]);
      await load();
      onMutate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStavClick(id: number, stav: ProdejStav) {
    await setProdejStav(id, stav);
    await load();
    onMutate();
  }

  const totalNet = prodejList.reduce((s, r) => s + netForSale(r), 0);

  return (
    <div>
      <div className="entry-form">
        <div className="entry-form-title">Nový záznam — prodej</div>

        <div className="form-section-label">Kontakt na klienta</div>
        <div className="prodej-row cols-3">
          <div className="field">
            <label>Jméno</label>
            <input type="text" value={klientJmeno} onChange={(e) => setKlientJmeno(e.target.value)} placeholder="Jan Novák" />
          </div>
          <div className="field">
            <label>Telefon</label>
            <input type="text" value={klientTelefon} onChange={(e) => setKlientTelefon(e.target.value)} placeholder="+420 600 123 456" />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="text" value={klientEmail} onChange={(e) => setKlientEmail(e.target.value)} placeholder="jan.novak@email.cz" />
          </div>
        </div>
        <div className="prodej-row cols-1" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Adresa</label>
            <input type="text" value={klientAdresa} onChange={(e) => setKlientAdresa(e.target.value)} placeholder="Ulice 123, 700 30 Ostrava" />
          </div>
        </div>

        <div className="form-section-label">
          Prodávaná položka <span>(vybírá se z databáze Nákup — jen &quot;Připraveno k prodeji&quot;)</span>
        </div>
        <div className="prodej-row cols-2">
          <div className="field">
            <label>Co prodáváme</label>
            <select value={selectedNakupId} onChange={(e) => setSelectedNakupId(e.target.value)}>
              <option value="">— vyberte položku z Nákupu —</option>
              {availableNakup.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.co_koupili} ({n.dodavatel_jmeno}, nákup {formatKc(n.kolik_stalo)})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Za kolik jsme prodali</label>
            <input type="text" value={prodejCena} onChange={(e) => setProdejCena(e.target.value)} placeholder="např. 58000" />
          </div>
        </div>

        <div className="prodej-row cols-2" style={{ marginTop: 12 }}>
          <div className="fee-chip">
            <span className="fee-label">Nákupní cena</span>
            <span className="fee-value">{selectedNakup ? formatKc(selectedNakup.kolik_stalo) : "— Kč"}</span>
          </div>
          <div className="fee-chip">
            <span className="fee-label">Hrubá marže</span>
            <span className={`fee-value ${itemMargin !== null ? (itemMargin >= 0 ? "profit-pos" : "profit-neg") : ""}`}>
              {itemMargin !== null ? formatKc(itemMargin) : "— Kč"}
            </span>
          </div>
        </div>

        <div className="form-section-label">
          Opravy před prodejem <span>(nepovinné, lze přidat víc)</span>
        </div>
        <div className="repair-add-row">
          <input
            type="text"
            className="plain-input"
            value={repairDesc}
            onChange={(e) => setRepairDesc(e.target.value)}
            placeholder="např. oprava baterky"
          />
          <input type="text" className="plain-input" value={repairPrice} onChange={(e) => setRepairPrice(e.target.value)} placeholder="400" />
          <button className="btn-secondary" onClick={addRepair}>
            + Přidat opravu
          </button>
        </div>
        <div className="repair-list">
          {repairs.map((r, i) => (
            <div className="repair-item" key={i}>
              <div className="r-desc">{r.desc}</div>
              <div className="r-price">{formatKc(r.price)}</div>
              <button className="r-remove" onClick={() => removeRepair(i)}>
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="form-section-label">
          Doplňkový prodej <span>(nepovinné, ze skladu doplňků)</span>
        </div>
        <div className="repair-add-row" style={{ gridTemplateColumns: "1.4fr 100px auto" }}>
          <select className="plain-select" value={doplnekSelect} onChange={(e) => setDoplnekSelect(e.target.value)}>
            <option value="">— vyberte položku ze skladu —</option>
            {inStock.map((s) => {
              const manualPrice = doplnkyCeny.find((c) => c.polozka.trim().toLowerCase() === s.name.trim().toLowerCase());
              return (
                <option key={s.name} value={s.name}>
                  {s.name} (skladem {s.remaining} ks{manualPrice ? `, ${manualPrice.cena_za_ks} Kč/ks` : ""})
                </option>
              );
            })}
          </select>
          <input type="text" className="plain-input" value={doplnekQty} onChange={(e) => setDoplnekQty(e.target.value)} placeholder="ks" />
          <button className="btn-secondary" onClick={addDoplnekLine}>
            + Přidat doplněk
          </button>
        </div>
        {doplnekSelect && doplnekQtyNum > 0 && (
          <div className="sale-fees" style={{ marginTop: 8 }}>
            cena za ks {formatKc(Math.round(doplnekUnitPrice))} · celkem {formatKc(doplnekPreviewTotal)}
            {doplnekStockRow && doplnekQtyNum > doplnekStockRow.remaining && (
              <span style={{ color: "var(--red)" }}> · pozor, na skladě je jen {doplnekStockRow.remaining} ks</span>
            )}
          </div>
        )}
        <div className="repair-list">
          {doplnekLines.map((d, i) => (
            <div className="repair-item" key={i}>
              <div className="r-desc">
                {d.polozka} × {d.qty} ks
              </div>
              <div className="r-price">{formatKc(d.price)}</div>
              <button className="r-remove" onClick={() => removeDoplnekLine(i)}>
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="form-section-label">
          Poplatky <span>(pevné částky)</span>
        </div>
        <div className="prodej-row cols-2">
          <div className="fee-chip">
            <span className="fee-label">Balné</span>
            <span className="fee-value">{FEE_BALENE} Kč</span>
          </div>
          <div className="fee-chip">
            <span className="fee-label">Poštovné</span>
            <span className="fee-value">{FEE_POSTOVNE} Kč</span>
          </div>
        </div>

        <div className="form-section-label">
          Souhrn a rozdělení <span>(počítá se ze všeho výše)</span>
        </div>
        <div className="summary-box">
          <div className="summary-row">
            <span>Za kolik jsme prodali</span>
            <b>{formatKc(price)}</b>
          </div>
          <div className="summary-row">
            <span>+ Doplňkový prodej</span>
            <b>{formatKc(doplnkyFormTotal)}</b>
          </div>
          <div className="summary-row dim">
            <span>− Nákupní cena (od dodavatele)</span>
            <b>{formatKc(purchaseCost)}</b>
          </div>
          <div className="summary-row dim">
            <span>− Opravy před prodejem</span>
            <b>{formatKc(repairsFormTotal)}</b>
          </div>
          <div className="summary-row dim">
            <span>− Balné a poštovné</span>
            <b>{formatKc(fees)}</b>
          </div>
          <div className="summary-row total">
            <span>Marže (100%)</span>
            <b className={profit >= 0 ? "profit-pos" : "profit-neg"}>{formatKc(profit)}</b>
          </div>
        </div>

        <div className="prodej-row cols-3" style={{ marginTop: 12 }}>
          <div className="fee-chip">
            <span className="fee-label">Vrátit do firmy 80%</span>
            <span className="fee-value">{formatKc(Math.round(profit * 0.8))}</span>
          </div>
          <div className="fee-chip">
            <span className="fee-label">CEO 12%</span>
            <span className="fee-value">{formatKc(Math.round(profit * 0.12))}</span>
          </div>
          <div className="fee-chip">
            <span className="fee-label">Zástupce 8%</span>
            <span className="fee-value">{formatKc(Math.round(profit * 0.08))}</span>
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-add" onClick={handleSubmit} disabled={submitting || !selectedNakup || !klientJmeno.trim() || !prodejCena.trim()}>
            + Přidat prodej
          </button>
        </div>
      </div>

      <div className="list-header">
        <div className="list-title">Prodeje</div>
        <div className="list-sub">{loading ? "…" : `${prodejList.length} ZÁZNAMŮ`}</div>
      </div>

      <div>
        {prodejList.map((r) => {
          const net = netForSale(r);
          const repairsTotal = r.opravy.reduce((s, x) => s + x.cena, 0);
          const doplnkyTotal = r.doplnky.reduce((s, x) => s + x.cena, 0);
          return (
            <div className="sale-card" key={r.id}>
              <div className="sale-card-top">
                <div>
                  <div className="sale-name">{r.klient_jmeno}</div>
                  <div className="sale-contact">
                    {r.klient_adresa || "—"} · {r.klient_telefon || "—"} · {r.klient_email || "—"}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <div className="amount" style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                    {formatKc(r.cena)}
                  </div>
                  <AuthorBadge authorId={r.autor_id} profiles={profiles} />
                </div>
              </div>
              <div className="sale-item">{r.polozka}</div>
              <div className="sale-contact" style={{ marginTop: 4 }}>
                koupeno od: <b style={{ color: "var(--gray-1)", fontWeight: 600 }}>{r.nakup?.dodavatel_jmeno || "—"}</b> za{" "}
                {formatKc(r.nakup?.kolik_stalo ?? 0)}
              </div>
              <div className="sale-repairs" style={{ marginTop: 8 }}>
                {r.opravy.length ? r.opravy.map((o) => `${o.popis} — ${formatKc(o.cena)}`).join(", ") : "žádné opravy"}
              </div>
              {r.doplnky.length > 0 && (
                <div className="sale-repairs" style={{ marginTop: 6, color: "var(--gray-1)" }}>
                  doplňkový prodej:{" "}
                  <span style={{ color: "var(--gray-2)" }}>{r.doplnky.map((d) => `${d.polozka} × ${d.pocet_ks} ks — ${formatKc(d.cena)}`).join(", ")}</span>
                </div>
              )}

              <div className="summary-box" style={{ marginTop: 12 }}>
                <div className="summary-row">
                  <span>Za kolik jsme prodali</span>
                  <b>{formatKc(r.cena)}</b>
                </div>
                <div className="summary-row">
                  <span>+ Doplňkový prodej</span>
                  <b>{formatKc(doplnkyTotal)}</b>
                </div>
                <div className="summary-row dim">
                  <span>− Nákupní cena (od dodavatele)</span>
                  <b>{formatKc(r.nakup?.kolik_stalo ?? 0)}</b>
                </div>
                <div className="summary-row dim">
                  <span>− Opravy před prodejem</span>
                  <b>{formatKc(repairsTotal)}</b>
                </div>
                <div className="summary-row dim">
                  <span>− Balné a poštovné</span>
                  <b>{FEE_BALENE + FEE_POSTOVNE} Kč</b>
                </div>
                <div className="summary-row total">
                  <span>Marže (100%)</span>
                  <b className={net >= 0 ? "profit-pos" : "profit-neg"}>{formatKc(net)}</b>
                </div>
              </div>

              <div className="prodej-row cols-3" style={{ marginTop: 10 }}>
                <div className="fee-chip">
                  <span className="fee-label">Vrátit do firmy 80%</span>
                  <span className="fee-value">{formatKc(Math.round(net * 0.8))}</span>
                </div>
                <div className="fee-chip">
                  <span className="fee-label">CEO 12%</span>
                  <span className="fee-value">{formatKc(Math.round(net * 0.12))}</span>
                </div>
                <div className="fee-chip">
                  <span className="fee-label">Zástupce 8%</span>
                  <span className="fee-value">{formatKc(Math.round(net * 0.08))}</span>
                </div>
              </div>

              <div className="sale-footer" style={{ flexDirection: "column", alignItems: "stretch", gap: 10, marginTop: 14 }}>
                <div className="stage-pills">
                  {PRODEJ_STATES.map((s) => (
                    <div
                      key={s.key}
                      className={`stage-pill ${r.stav === s.key ? "active" : ""} ${r.stav === s.key && s.key === "prodano" ? "stav-prodano" : ""} ${
                        r.stav === s.key && s.key === "storno" ? "stav-storno" : ""
                      }`}
                      onClick={() => handleStavClick(r.id, s.key)}
                    >
                      {s.label}
                    </div>
                  ))}
                </div>
                {r.stav === "prodano" && (
                  <button className="btn-invoice" onClick={() => setInvoiceTarget(r)}>
                    🧾 Vystavit fakturu
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!loading && prodejList.length === 0 && <div className="stock-empty">Zatím žádné prodeje.</div>}
      </div>

      <div className="total-row">
        <span>Celkový čistý zisk</span>
        <b>{formatKc(totalNet)}</b>
      </div>

      {invoiceTarget && (
        <InvoiceModal
          prodej={invoiceTarget}
          onClose={() => setInvoiceTarget(null)}
          onUpdated={(fields) => {
            setInvoiceTarget((prev) => (prev ? { ...prev, ...fields } : prev));
            setProdejList((prev) => prev.map((p) => (p.id === invoiceTarget.id ? { ...p, ...fields } : p)));
          }}
        />
      )}
    </div>
  );
}
