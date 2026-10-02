"use client";

import { useEffect, useMemo, useState } from "react";
import type { Profile, Nakup, ProdejStav, DoplnkyNakup, DoplnkyProdej, DoplnkyCena, DilnaNaklad } from "@/lib/database.types";
import {
  fetchActiveNakup,
  fetchProdej,
  fetchDilnaNaklady,
  addProdej,
  setProdejStav,
  deleteProdej,
  updateProdej,
  addProdejPolozka,
  updateProdejPolozka,
  deleteProdejPolozka,
  fetchProfiles,
  fetchDoplnkyNakup,
  fetchDoplnkyProdej,
  fetchDoplnkyCeny,
  computeStock,
  estimateDoplnekUnitPrice,
  netForSale,
  itemCost,
  itemsRevenue,
  totalCost,
  returnToFirm,
  feesOf,
  orderNumber,
  type ProdejFull,
} from "@/lib/data";
import { formatKc, formatDate, parseDigits, todayISO } from "@/lib/format";
import {
  FEE_BALENE,
  FEE_POSTOVNE,
  PRODEJ_STATES,
  PAID_STATES,
  SHIPPING_STATES,
  REASON_STATES,
  DOPRAVCI,
  trackingUrl,
} from "@/lib/labels";
import AuthorBadge from "@/components/AuthorBadge";
import HistoryPanel from "@/components/HistoryPanel";
import DeleteButton from "@/components/DeleteButton";
import ListFilters, {
  EMPTY_FILTERS,
  filtersActive,
  matchesAuthor,
  matchesDate,
  matchesText,
  type Filters,
} from "@/components/ListFilters";

interface FormLine {
  nakupId: number;
  cena: string;
}
interface DoplnekLine {
  polozka: string;
  qty: number;
  price: number;
}
interface ProdejEditForm {
  klient_jmeno: string;
  klient_telefon: string;
  klient_email: string;
  klient_adresa: string;
  datum: string;
  balne: string;
  postovne: string;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// Řádky pro zobrazení objednávky (starší záznamy bez položek se zobrazí jako jedna).
function displayItems(r: ProdejFull) {
  if (r.polozky.length) {
    return r.polozky.map((p) => ({
      id: p.id as number | null,
      name: p.nakup?.co_koupili ?? "?",
      cena: p.cena,
      nakupCena: p.nakup?.kolik_stalo ?? 0,
      dilna: sum(p.naklady.map((x) => x.cena)),
      cost: itemCost(p),
    }));
  }
  const buy = r.nakup?.kolik_stalo ?? 0;
  return [{ id: null as number | null, name: r.polozka, cena: r.cena, nakupCena: buy, dilna: 0, cost: buy }];
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
  const [naklady, setNaklady] = useState<DilnaNaklad[]>([]);
  const [prodejList, setProdejList] = useState<ProdejFull[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [doplnkyNakup, setDoplnkyNakupState] = useState<DoplnkyNakup[]>([]);
  const [doplnkyProdej, setDoplnkyProdejState] = useState<DoplnkyProdej[]>([]);
  const [doplnkyCeny, setDoplnkyCeny] = useState<DoplnkyCena[]>([]);
  const [loading, setLoading] = useState(true);

  // nová objednávka
  const [klientJmeno, setKlientJmeno] = useState("");
  const [klientTelefon, setKlientTelefon] = useState("");
  const [klientEmail, setKlientEmail] = useState("");
  const [klientAdresa, setKlientAdresa] = useState("");
  const [prodejDatum, setProdejDatum] = useState(todayISO());
  const [lines, setLines] = useState<FormLine[]>([]);
  const [addSelect, setAddSelect] = useState("");
  const [balne, setBalne] = useState(String(FEE_BALENE));
  const [postovne, setPostovne] = useState(String(FEE_POSTOVNE));
  const [doplnekLines, setDoplnekLines] = useState<DoplnekLine[]>([]);
  const [doplnekSelect, setDoplnekSelect] = useState("");
  const [doplnekQty, setDoplnekQty] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // úprava existující objednávky
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ProdejEditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editAddSelect, setEditAddSelect] = useState("");
  const [editAddPrice, setEditAddPrice] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  async function load() {
    setLoading(true);
    const [nakup, prodej, profs, dn, dp, dc, nk] = await Promise.all([
      fetchActiveNakup(),
      fetchProdej(),
      fetchProfiles(),
      fetchDoplnkyNakup(),
      fetchDoplnkyProdej(),
      fetchDoplnkyCeny(),
      fetchDilnaNaklady().catch(() => [] as DilnaNaklad[]),
    ]);
    setAvailableNakup(nakup.filter((n) => n.fase === "pripraveno"));
    setProdejList(prodej);
    setProfiles(profs);
    setDoplnkyNakupState(dn);
    setDoplnkyProdejState(dp);
    setDoplnkyCeny(dc);
    setNaklady(nk);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // "→ Nabídnout k prodeji" z Nákupu/Dílny přidá položku do formuláře
  useEffect(() => {
    if (preselectNakupId != null) {
      setLines((prev) => (prev.some((l) => l.nakupId === preselectNakupId) ? prev : [...prev, { nakupId: preselectNakupId, cena: "" }]));
      onPreselectConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectNakupId]);

  const nakladyOf = (nakupId: number) => sum(naklady.filter((x) => x.nakup_id === nakupId).map((x) => x.cena));
  const nakupById = (id: number) => availableNakup.find((n) => n.id === id) ?? null;
  const pickable = availableNakup.filter((n) => !lines.some((l) => l.nakupId === n.id));

  const stock = useMemo(() => computeStock(doplnkyNakup, doplnkyProdej), [doplnkyNakup, doplnkyProdej]);
  const inStock = stock.filter((s) => s.remaining > 0);

  const doplnekUnitPrice = doplnekSelect ? estimateDoplnekUnitPrice(doplnekSelect, doplnkyCeny, doplnkyProdej, doplnkyNakup) : 0;
  const doplnekQtyNum = parseDigits(doplnekQty) || 0;
  const doplnekPreviewTotal = Math.round(doplnekUnitPrice * doplnekQtyNum);
  const doplnekStockRow = stock.find((s) => s.name === doplnekSelect);

  const formItems = lines.map((l) => {
    const n = nakupById(l.nakupId);
    const buy = n?.kolik_stalo ?? 0;
    const dilna = nakladyOf(l.nakupId);
    const price = parseDigits(l.cena);
    return { line: l, nakup: n, buy, dilna, cost: buy + dilna, price, profit: price - buy - dilna };
  });
  const formRevenue = sum(formItems.map((i) => i.price));
  const formCost = sum(formItems.map((i) => i.cost));
  const formReturn = sum(formItems.map((i) => i.buy));
  const doplnkyFormTotal = sum(doplnekLines.map((d) => d.price));
  const fees = parseDigits(balne) + parseDigits(postovne);
  const profit = formRevenue + doplnkyFormTotal - formCost - fees;
  const canSubmit = !submitting && klientJmeno.trim() && lines.length > 0 && lines.every((l) => l.cena.trim());

  function addLine() {
    if (!addSelect) return;
    setLines((prev) => [...prev, { nakupId: parseInt(addSelect, 10), cena: "" }]);
    setAddSelect("");
  }
  const setLinePrice = (nakupId: number, cena: string) => setLines((prev) => prev.map((l) => (l.nakupId === nakupId ? { ...l, cena } : l)));
  const removeLine = (nakupId: number) => setLines((prev) => prev.filter((l) => l.nakupId !== nakupId));

  function addDoplnekLine() {
    if (!doplnekSelect || !doplnekQtyNum) return;
    setDoplnekLines((prev) => [...prev, { polozka: doplnekSelect, qty: doplnekQtyNum, price: doplnekPreviewTotal }]);
    setDoplnekQty("1");
    setDoplnekSelect("");
  }
  const removeDoplnekLine = (i: number) => setDoplnekLines((prev) => prev.filter((_, idx) => idx !== i));

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await addProdej({
        klient_jmeno: klientJmeno.trim(),
        klient_telefon: klientTelefon.trim() || null,
        klient_email: klientEmail.trim() || null,
        klient_adresa: klientAdresa.trim() || null,
        datum: prodejDatum || null,
        balne: parseDigits(balne),
        postovne: parseDigits(postovne),
        autor_id: profile.id,
        polozky: formItems.map((i) => ({ nakup_id: i.line.nakupId, cena: i.price, nazev: i.nakup?.co_koupili ?? "?" })),
        doplnky: doplnekLines.map((d) => ({ polozka: d.polozka, pocet_ks: d.qty, cena: d.price })),
      });
      setKlientJmeno("");
      setKlientTelefon("");
      setKlientEmail("");
      setKlientAdresa("");
      setProdejDatum(todayISO());
      setLines([]);
      setBalne(String(FEE_BALENE));
      setPostovne(String(FEE_POSTOVNE));
      setDoplnekLines([]);
      await load();
      onMutate();
    } catch (e) {
      setSubmitError((e as { message?: string })?.message ?? "Objednávku se nepodařilo uložit.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveProdejField(id: number, fields: Parameters<typeof updateProdej>[1]) {
    await updateProdej(id, fields);
    await load();
    onMutate();
  }

  async function handleStavClick(id: number, stav: ProdejStav) {
    if (stav === "storno" && !window.confirm("Opravdu stornovat? Objednávka se smaže, položky se vrátí do Nákupu a doplňky na sklad.")) return;
    await setProdejStav(id, stav);
    await load();
    onMutate();
  }

  function startEdit(r: ProdejFull) {
    setEditingId(r.id);
    setEditError(null);
    setEditAddSelect("");
    setEditAddPrice("");
    setEditForm({
      klient_jmeno: r.klient_jmeno,
      klient_telefon: r.klient_telefon || "",
      klient_email: r.klient_email || "",
      klient_adresa: r.klient_adresa || "",
      datum: r.datum || "",
      balne: String(r.balne),
      postovne: String(r.postovne),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function saveEdit(id: number) {
    if (!editForm) return;
    setSavingEdit(true);
    try {
      await updateProdej(id, {
        klient_jmeno: editForm.klient_jmeno.trim(),
        klient_telefon: editForm.klient_telefon.trim() || null,
        klient_email: editForm.klient_email.trim() || null,
        klient_adresa: editForm.klient_adresa.trim() || null,
        datum: editForm.datum || null,
        balne: parseDigits(editForm.balne),
        postovne: parseDigits(editForm.postovne),
      });
      setEditingId(null);
      setEditForm(null);
      await load();
      onMutate();
    } finally {
      setSavingEdit(false);
    }
  }

  async function editItemPrice(polozkaId: number, cena: string) {
    await updateProdejPolozka(polozkaId, parseDigits(cena));
    await load();
    onMutate();
  }

  async function removeItem(r: ProdejFull, polozkaId: number) {
    if (r.polozky.length <= 1) {
      setEditError("Objednávka musí mít aspoň jednu položku. Pro zrušení celé objednávky použijte Smazat nebo Storno.");
      return;
    }
    setEditError(null);
    await deleteProdejPolozka(polozkaId);
    await load();
    onMutate();
  }

  async function addItem(prodejId: number) {
    if (!editAddSelect || !editAddPrice.trim()) return;
    await addProdejPolozka(prodejId, parseInt(editAddSelect, 10), parseDigits(editAddPrice));
    setEditAddSelect("");
    setEditAddPrice("");
    await load();
    onMutate();
  }

  const visibleProdej = useMemo(
    () =>
      prodejList.filter(
        (r) =>
          matchesText(filters, r.klient_jmeno, r.polozka, orderNumber(r.id)) &&
          (!filters.status || r.stav === filters.status) &&
          matchesDate(r.datum || r.created_at, filters) &&
          matchesAuthor(r.autor_id, filters)
      ),
    [prodejList, filters]
  );
  const filtered = filtersActive(filters);
  const paidVisible = visibleProdej.filter((r) => PAID_STATES.includes(r.stav));
  const totalNet = sum(paidVisible.map(netForSale));
  const totalReturn = sum(paidVisible.map(returnToFirm));

  return (
    <div>
      <div className="entry-form">
        <div className="entry-form-title">Nová objednávka</div>

        <div className="form-section-label">Zákazník</div>
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
        <div className="prodej-row cols-3" style={{ marginTop: 12 }}>
          <div className="field" style={{ gridColumn: "span 2" }}>
            <label>Adresa</label>
            <input type="text" value={klientAdresa} onChange={(e) => setKlientAdresa(e.target.value)} placeholder="Ulice 123, 700 30 Ostrava" />
          </div>
          <div className="field">
            <label>Datum</label>
            <input type="date" value={prodejDatum} onChange={(e) => setProdejDatum(e.target.value)} />
          </div>
        </div>

        <div className="form-section-label">
          Položky objednávky <span>(z Nákupu — jen &quot;Připraveno k prodeji&quot;; lze přidat víc)</span>
        </div>
        <div className="repair-add-row" style={{ gridTemplateColumns: "1fr auto", marginTop: 0 }}>
          <select className="plain-select" value={addSelect} onChange={(e) => setAddSelect(e.target.value)}>
            <option value="">— vyberte položku —</option>
            {pickable.map((n) => (
              <option key={n.id} value={n.id}>
                {n.co_koupili} (nákup {formatKc(n.kolik_stalo)}
                {nakladyOf(n.id) > 0 ? ` + dílna ${formatKc(nakladyOf(n.id))}` : ""})
              </option>
            ))}
          </select>
          <button className="btn-secondary" onClick={addLine} disabled={!addSelect}>
            + Přidat položku
          </button>
        </div>
        {availableNakup.length === 0 && <div className="ship-hint">Nic není připravené k prodeji. Hotové položky označte v Dílně.</div>}

        {formItems.length > 0 && (
          <div className="order-items" style={{ marginTop: 12 }}>
            <div className="order-item head">
              <div>Položka</div>
              <div>Náklad (nákup + dílna)</div>
              <div>Prodejní cena</div>
              <div className="amount">Zisk</div>
              <div />
            </div>
            {formItems.map((i) => (
              <div className="order-item" key={i.line.nakupId}>
                <div className="who">{i.nakup?.co_koupili ?? "?"}</div>
                <div className="todo-meta">
                  {formatKc(i.buy)} + {formatKc(i.dilna)} = <b>{formatKc(i.cost)}</b>
                </div>
                <input
                  type="text"
                  className="plain-input"
                  value={i.line.cena}
                  onChange={(e) => setLinePrice(i.line.nakupId, e.target.value)}
                  placeholder="Kč"
                />
                <div className={`amount ${i.line.cena.trim() ? (i.profit >= 0 ? "profit-pos" : "profit-neg") : ""}`}>
                  {i.line.cena.trim() ? formatKc(i.profit) : "—"}
                </div>
                <button className="r-remove" onClick={() => removeLine(i.line.nakupId)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="form-section-label">
          Doplňkový prodej <span>(nepovinné, ze skladu doplňků; lze přidat víc)</span>
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
              <span style={{ color: "var(--loss)" }}> · pozor, na skladě je jen {doplnekStockRow.remaining} ks</span>
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
          Poplatky <span>(za celou objednávku; při osobním předání klidně 0)</span>
        </div>
        <div className="prodej-row cols-2">
          <div className="field">
            <label>Balné</label>
            <input type="text" value={balne} onChange={(e) => setBalne(e.target.value)} />
          </div>
          <div className="field">
            <label>Poštovné</label>
            <input type="text" value={postovne} onChange={(e) => setPostovne(e.target.value)} />
          </div>
        </div>

        <div className="form-section-label">Souhrn</div>
        <div className="summary-box">
          <div className="summary-row">
            <span>Prodali jsme za (položky)</span>
            <b>{formatKc(formRevenue)}</b>
          </div>
          <div className="summary-row">
            <span>+ Doplňkový prodej</span>
            <b>{formatKc(doplnkyFormTotal)}</b>
          </div>
          <div className="summary-row dim">
            <span>− Náklad položek (nákup + dílna)</span>
            <b>{formatKc(formCost)}</b>
          </div>
          <div className="summary-row dim">
            <span>− Balné a poštovné</span>
            <b>{formatKc(fees)}</b>
          </div>
          <div className="summary-row total">
            <span>Zisk</span>
            <b className={profit >= 0 ? "profit-pos" : "profit-neg"}>{formatKc(profit)}</b>
          </div>
        </div>

        <div className="prodej-row cols-2" style={{ marginTop: 12 }}>
          <div className="fee-chip">
            <span className="fee-label">Vrátit do firmy (nákupní ceny)</span>
            <span className="fee-value">{formatKc(formReturn)}</span>
          </div>
          <div className="fee-chip">
            <span className="fee-label">Zisk po všech nákladech</span>
            <span className={`fee-value ${profit >= 0 ? "profit-pos" : "profit-neg"}`}>{formatKc(profit)}</span>
          </div>
        </div>

        {submitError && <div className="delete-error" style={{ textAlign: "left", marginTop: 12 }}>{submitError}</div>}
        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-add" onClick={handleSubmit} disabled={!canSubmit}>
            + Vytvořit objednávku
          </button>
        </div>
      </div>

      <div className="list-header">
        <div className="list-title">Objednávky</div>
        <div className="list-sub">
          {loading ? "…" : filtered ? `${visibleProdej.length} Z ${prodejList.length} OBJEDNÁVEK` : `${prodejList.length} OBJEDNÁVEK`}
        </div>
      </div>

      <ListFilters
        filters={filters}
        onChange={setFilters}
        profiles={profiles}
        searchPlaceholder="zákazník, položka nebo číslo objednávky"
        statusLabel="Stav"
        statusOptions={PRODEJ_STATES.filter((s) => s.key !== "storno")}
      />

      <div>
        {visibleProdej.map((r) => {
          const net = netForSale(r);
          const doplnkyTotal = sum(r.doplnky.map((x) => x.cena));
          const items = displayItems(r);
          const isEditing = editingId === r.id;
          const url = trackingUrl(r.dopravce ?? "zasilkovna", r.cislo_zasilky);
          return (
            <div className="sale-card" key={r.id}>
              {isEditing && editForm ? (
                <>
                  <div className="entry-form-title">Úprava {orderNumber(r.id)}</div>
                  <div className="prodej-row cols-3">
                    <div className="field">
                      <label>Jméno</label>
                      <input type="text" value={editForm.klient_jmeno} onChange={(e) => setEditForm({ ...editForm, klient_jmeno: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Telefon</label>
                      <input type="text" value={editForm.klient_telefon} onChange={(e) => setEditForm({ ...editForm, klient_telefon: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Email</label>
                      <input type="text" value={editForm.klient_email} onChange={(e) => setEditForm({ ...editForm, klient_email: e.target.value })} />
                    </div>
                  </div>
                  <div className="prodej-row cols-3" style={{ marginTop: 12 }}>
                    <div className="field" style={{ gridColumn: "span 2" }}>
                      <label>Adresa</label>
                      <input type="text" value={editForm.klient_adresa} onChange={(e) => setEditForm({ ...editForm, klient_adresa: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Datum</label>
                      <input type="date" value={editForm.datum} onChange={(e) => setEditForm({ ...editForm, datum: e.target.value })} />
                    </div>
                  </div>
                  <div className="prodej-row cols-2" style={{ marginTop: 12 }}>
                    <div className="field">
                      <label>Balné</label>
                      <input type="text" value={editForm.balne} onChange={(e) => setEditForm({ ...editForm, balne: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Poštovné</label>
                      <input type="text" value={editForm.postovne} onChange={(e) => setEditForm({ ...editForm, postovne: e.target.value })} />
                    </div>
                  </div>

                  <div className="form-section-label">Položky (změny cen a přidání/odebrání se ukládají hned)</div>
                  {r.polozky.length === 0 ? (
                    <div className="ship-hint">Starší záznam s jednou položkou — cenu položky nelze upravit.</div>
                  ) : (
                    <div className="repair-list">
                      {r.polozky.map((p) => (
                        <div className="repair-item" key={p.id}>
                          <div className="r-desc">{p.nakup?.co_koupili ?? "?"}</div>
                          <input
                            key={`${p.id}-${p.cena}`}
                            type="text"
                            className="plain-input"
                            style={{ width: 110 }}
                            defaultValue={p.cena}
                            onBlur={(e) => parseDigits(e.target.value) !== p.cena && editItemPrice(p.id, e.target.value)}
                          />
                          <button className="r-remove" onClick={() => removeItem(r, p.id)}>
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {r.polozky.length > 0 && (
                    <div className="repair-add-row" style={{ gridTemplateColumns: "1fr 140px auto" }}>
                      <select className="plain-select" value={editAddSelect} onChange={(e) => setEditAddSelect(e.target.value)}>
                        <option value="">— přidat položku —</option>
                        {availableNakup.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.co_koupili} ({formatKc(n.kolik_stalo)})
                          </option>
                        ))}
                      </select>
                      <input type="text" className="plain-input" value={editAddPrice} onChange={(e) => setEditAddPrice(e.target.value)} placeholder="cena Kč" />
                      <button className="btn-secondary" onClick={() => addItem(r.id)}>
                        + Přidat položku
                      </button>
                    </div>
                  )}
                  {editError && <div className="delete-error" style={{ textAlign: "left", marginTop: 8 }}>{editError}</div>}

                  <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button className="btn-secondary" onClick={cancelEdit}>
                      Zavřít
                    </button>
                    <button className="btn-add" onClick={() => saveEdit(r.id)} disabled={savingEdit}>
                      Uložit údaje
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="sale-card-top">
                    <div>
                      <div className="sale-name">
                        <span className="order-no">{orderNumber(r.id)}</span> {r.klient_jmeno}
                      </div>
                      <div className="sale-contact">
                        {formatDate(r.datum)} · {r.klient_adresa || "—"} · {r.klient_telefon || "—"} · {r.klient_email || "—"}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                      <div className="amount" style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                        {formatKc(itemsRevenue(r) + doplnkyTotal)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <AuthorBadge authorId={r.autor_id} profiles={profiles} />
                        <button className="btn-secondary" onClick={() => startEdit(r)}>
                          Upravit
                        </button>
                      </div>
                      <DeleteButton
                        hint={`Položky se vrátí zpět do Nákupu${r.doplnky.length > 0 ? " a doplňky z objednávky na sklad" : ""}.`}
                        onDelete={async () => {
                          await deleteProdej(r.id);
                          await load();
                          onMutate();
                        }}
                      />
                    </div>
                  </div>

                  <div className="order-items" style={{ marginTop: 10 }}>
                    <div className="order-item head view">
                      <div>Položka</div>
                      <div>Náklad (nákup + dílna)</div>
                      <div className="amount">Prodáno za</div>
                      <div className="amount">Zisk</div>
                    </div>
                    {items.map((i, idx) => (
                      <div className="order-item view" key={i.id ?? idx}>
                        <div className="who">{i.name}</div>
                        <div className="todo-meta">
                          {formatKc(i.nakupCena)} + {formatKc(i.dilna)} = <b>{formatKc(i.cost)}</b>
                        </div>
                        <div className="amount">{formatKc(i.cena)}</div>
                        <div className={`amount ${i.cena - i.cost >= 0 ? "profit-pos" : "profit-neg"}`}>{formatKc(i.cena - i.cost)}</div>
                      </div>
                    ))}
                  </div>
                  {r.doplnky.length > 0 && (
                    <div className="sale-repairs" style={{ marginTop: 8, color: "var(--text)" }}>
                      doplňkový prodej:{" "}
                      <span style={{ color: "var(--muted)" }}>{r.doplnky.map((d) => `${d.polozka} × ${d.pocet_ks} ks — ${formatKc(d.cena)}`).join(", ")}</span>
                    </div>
                  )}
                </>
              )}

              <div className="summary-box" style={{ marginTop: 12 }}>
                <div className="summary-row">
                  <span>Prodali jsme za (položky)</span>
                  <b>{formatKc(itemsRevenue(r))}</b>
                </div>
                <div className="summary-row">
                  <span>+ Doplňkový prodej</span>
                  <b>{formatKc(doplnkyTotal)}</b>
                </div>
                <div className="summary-row dim">
                  <span>− Náklad položek (nákup + dílna)</span>
                  <b>{formatKc(totalCost(r))}</b>
                </div>
                <div className="summary-row dim">
                  <span>− Balné a poštovné</span>
                  <b>{formatKc(feesOf(r))}</b>
                </div>
                <div className="summary-row total">
                  <span>Zisk</span>
                  <b className={net >= 0 ? "profit-pos" : "profit-neg"}>{formatKc(net)}</b>
                </div>
              </div>

              <div className="prodej-row cols-2" style={{ marginTop: 10 }}>
                <div className="fee-chip">
                  <span className="fee-label">Vrátit do firmy (nákupní ceny)</span>
                  <span className="fee-value">{formatKc(returnToFirm(r))}</span>
                </div>
                <div className="fee-chip">
                  <span className="fee-label">Zisk po všech nákladech</span>
                  <span className={`fee-value ${net >= 0 ? "profit-pos" : "profit-neg"}`}>{formatKc(net)}</span>
                </div>
              </div>

              <div className="sale-footer" style={{ flexDirection: "column", alignItems: "stretch", gap: 10, marginTop: 14 }}>
                <div className="stage-pills">
                  {PRODEJ_STATES.map((st) => (
                    <div
                      key={st.key}
                      className={`stage-pill ${r.stav === st.key ? "active" : ""} ${r.stav === st.key && st.key === "doruceno" ? "stav-prodano" : ""} ${
                        r.stav === st.key && ["vraceno", "reklamace", "storno"].includes(st.key) ? "stav-storno" : ""
                      }`}
                      onClick={() => handleStavClick(r.id, st.key)}
                    >
                      {st.label}
                    </div>
                  ))}
                </div>

                {SHIPPING_STATES.includes(r.stav) && (
                  <div className="ship-block">
                    <div className="field">
                      <label>Dopravce</label>
                      <select value={r.dopravce ?? "zasilkovna"} onChange={(e) => saveProdejField(r.id, { dopravce: e.target.value })}>
                        {DOPRAVCI.map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Číslo zásilky</label>
                      <input
                        key={`${r.id}-${r.cislo_zasilky ?? ""}`}
                        type="text"
                        defaultValue={r.cislo_zasilky ?? ""}
                        placeholder="např. Z123456789"
                        onBlur={(e) => {
                          const v = e.target.value.trim() || null;
                          if (v !== (r.cislo_zasilky ?? null)) saveProdejField(r.id, { cislo_zasilky: v });
                        }}
                      />
                    </div>
                    {url && (
                      <a className="btn-secondary track-link" href={url} target="_blank" rel="noopener noreferrer">
                        Sledovat zásilku ↗
                      </a>
                    )}
                  </div>
                )}
                {r.stav === "odeslano" && !r.cislo_zasilky && <div className="ship-hint">Zásilka je odeslaná, ale chybí číslo zásilky.</div>}

                {REASON_STATES.includes(r.stav) && (
                  <div className="field">
                    <label>{r.stav === "vraceno" ? "Důvod vrácení" : "Důvod reklamace"}</label>
                    <input
                      key={`${r.id}-${r.duvod_vraceni ?? ""}`}
                      type="text"
                      defaultValue={r.duvod_vraceni ?? ""}
                      placeholder="např. nefunguje blesk, nesedí popis"
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null;
                        if (v !== (r.duvod_vraceni ?? null)) saveProdejField(r.id, { duvod_vraceni: v });
                      }}
                    />
                    {r.stav === "vraceno" && <div className="ship-hint">Vrácené položky se objevily zpět v Nákupu a lze je znovu nabídnout k prodeji.</div>}
                  </div>
                )}

                <HistoryPanel entita="prodej" zaznamId={r.id} profiles={profiles} refreshKey={refreshKey} />
              </div>
            </div>
          );
        })}
        {!loading && prodejList.length === 0 && <div className="stock-empty">Zatím žádné objednávky.</div>}
        {!loading && prodejList.length > 0 && visibleProdej.length === 0 && <div className="stock-empty">Žádná objednávka neodpovídá filtru.</div>}
      </div>

      <div className="total-row">
        <span>Celkový zisk (zaplacené){filtered ? " — podle filtru" : ""}</span>
        <b>{formatKc(totalNet)}</b>
      </div>
      <div className="total-row" style={{ marginTop: 0 }}>
        <span>Vráceno do firmy (nákupní ceny zaplacených){filtered ? " — podle filtru" : ""}</span>
        <b>{formatKc(totalReturn)}</b>
      </div>
    </div>
  );
}
