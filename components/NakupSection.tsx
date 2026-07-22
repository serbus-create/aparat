"use client";

import { useEffect, useMemo, useState } from "react";
import type { Profile, Nakup, NakupFase } from "@/lib/database.types";
import { fetchActiveNakup, fetchAllNakup, addNakup, setNakupFase, fetchProfiles } from "@/lib/data";
import { formatKc, formatDate, todayISO, parseDigits } from "@/lib/format";
import AuthorBadge from "@/components/AuthorBadge";

const NAKUP_PHASES: { key: NakupFase; label: string }[] = [
  { key: "nakoupeno", label: "Nakoupeno" },
  { key: "servisovano", label: "Servisováno" },
  { key: "pripraveno", label: "Připraveno k prodeji" },
];

interface Dodavatel {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  count: number;
  total: number;
  lastDate: string | null;
  items: Nakup[];
}

function computeDodavatele(all: Nakup[]): Dodavatel[] {
  const map = new Map<string, Dodavatel>();
  all.forEach((n) => {
    const key = n.dodavatel_jmeno.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, { key, name: n.dodavatel_jmeno, phone: n.dodavatel_telefon, email: n.dodavatel_email, count: 0, total: 0, lastDate: n.datum, items: [] });
    }
    const d = map.get(key)!;
    d.count += 1;
    d.total += n.kolik_stalo;
    d.items.push(n);
    if (n.datum && (!d.lastDate || n.datum > d.lastDate)) d.lastDate = n.datum;
    if (n.dodavatel_telefon) d.phone = n.dodavatel_telefon;
    if (n.dodavatel_email) d.email = n.dodavatel_email;
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export default function NakupSection({
  profile,
  onGoToProdej,
  refreshKey,
  onMutate,
}: {
  profile: Profile;
  onGoToProdej: (nakupId: number) => void;
  refreshKey: number;
  onMutate: () => void;
}) {
  const [sub, setSub] = useState<"nakupy" | "dodavatele">("nakupy");
  const [activeNakup, setActiveNakup] = useState<Nakup[]>([]);
  const [allNakup, setAllNakup] = useState<Nakup[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [jmeno, setJmeno] = useState("");
  const [telefon, setTelefon] = useState("");
  const [email, setEmail] = useState("");
  const [datum, setDatum] = useState(todayISO());
  const [coKoupili, setCoKoupili] = useState("");
  const [cena, setCena] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const [active, all, profs] = await Promise.all([fetchActiveNakup(), fetchAllNakup(), fetchProfiles()]);
    setActiveNakup(active);
    setAllNakup(all);
    setProfiles(profs);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const dodavatele = useMemo(() => computeDodavatele(allNakup), [allNakup]);
  const supplierNames = useMemo(() => [...new Set(allNakup.map((n) => n.dodavatel_jmeno))], [allNakup]);

  function handleNameChange(value: string) {
    setJmeno(value);
    const match = dodavatele.find((d) => d.name.trim().toLowerCase() === value.trim().toLowerCase());
    if (match) {
      if (match.phone) setTelefon(match.phone);
      if (match.email) setEmail(match.email);
    }
  }

  async function handleAdd() {
    if (!jmeno.trim() || !coKoupili.trim() || !cena.trim()) return;
    setSubmitting(true);
    try {
      await addNakup({
        dodavatel_jmeno: jmeno.trim(),
        dodavatel_telefon: telefon.trim() || null,
        dodavatel_email: email.trim() || null,
        datum: datum || null,
        co_koupili: coKoupili.trim(),
        kolik_stalo: parseDigits(cena),
        autor_id: profile.id,
      });
      setJmeno("");
      setTelefon("");
      setEmail("");
      setDatum(todayISO());
      setCoKoupili("");
      setCena("");
      await load();
      onMutate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePhaseClick(id: number, fase: NakupFase) {
    setActiveNakup((prev) => prev.map((n) => (n.id === id ? { ...n, fase } : n)));
    await setNakupFase(id, fase);
    onMutate();
  }

  function toggleDodavatel(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const totalCost = activeNakup.reduce((s, r) => s + r.kolik_stalo, 0);

  return (
    <div>
      <div className="sub-toggle">
        <div className={`sub-pill ${sub === "nakupy" ? "active" : ""}`} onClick={() => setSub("nakupy")}>
          Nákupy
        </div>
        <div className={`sub-pill ${sub === "dodavatele" ? "active" : ""}`} onClick={() => setSub("dodavatele")}>
          Databáze dodavatelů
        </div>
      </div>

      {sub === "nakupy" && (
        <>
          <div className="entry-form">
            <div className="entry-form-title">Nový záznam — nákup</div>

            <div className="form-section-label">Kontakt na dodavatele</div>
            <div className="prodej-row cols-3">
              <div className="field">
                <label>Celé jméno</label>
                <input
                  type="text"
                  value={jmeno}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="např. Jan Novák"
                  list="dodavateleDatalist"
                />
                <datalist id="dodavateleDatalist">
                  {supplierNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label>Telefon</label>
                <input type="text" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="+420 600 123 456" />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jan.novak@email.cz" />
              </div>
            </div>

            <div className="form-section-label">Nákup</div>
            <div className="prodej-row cols-4">
              <div className="field">
                <label>Datum</label>
                <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
              </div>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label>Co jsme koupili</label>
                <input type="text" value={coKoupili} onChange={(e) => setCoKoupili(e.target.value)} placeholder="např. Canon EOS R6 + 24-105" />
              </div>
              <div className="field">
                <label>Kolik to stálo</label>
                <input type="text" value={cena} onChange={(e) => setCena(e.target.value)} placeholder="např. 32000" />
              </div>
            </div>
            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-add" onClick={handleAdd} disabled={submitting}>
                + Přidat
              </button>
            </div>
          </div>

          <div className="list-header">
            <div className="list-title">Nákupy</div>
            <div className="list-sub">{loading ? "…" : `${activeNakup.length} ZÁZNAMŮ`}</div>
          </div>

          <div>
            {activeNakup.map((r) => (
              <div className="buy-card" key={r.id}>
                <div className="buy-card-top">
                  <div>
                    <div className="buy-name">{r.dodavatel_jmeno}</div>
                    <div className="sale-contact">
                      {formatDate(r.datum)} · {r.dodavatel_telefon || "—"} · {r.dodavatel_email || "—"}
                    </div>
                    <div className="buy-item">{r.co_koupili}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <div className="amount" style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
                      {formatKc(r.kolik_stalo)}
                    </div>
                    <AuthorBadge authorId={r.autor_id} profiles={profiles} />
                  </div>
                </div>
                <div className="buy-footer">
                  <div className="stage-pills">
                    {NAKUP_PHASES.map((p) => (
                      <div
                        key={p.key}
                        className={`stage-pill ${r.fase === p.key ? "active" : ""}`}
                        onClick={() => handlePhaseClick(r.id, p.key)}
                      >
                        {p.label}
                      </div>
                    ))}
                  </div>
                  {r.fase === "pripraveno" && (
                    <button className="btn-transfer" onClick={() => onGoToProdej(r.id)}>
                      → Nabídnout k prodeji
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!loading && activeNakup.length === 0 && <div className="stock-empty">Zatím žádné nákupy.</div>}
          </div>

          <div className="total-row">
            <span>Celkem investováno do nákupu</span>
            <b>{formatKc(totalCost)}</b>
          </div>
        </>
      )}

      {sub === "dodavatele" && (
        <div>
          <div className="list-header">
            <div className="list-title">Databáze dodavatelů</div>
            <div className="list-sub">{dodavatele.length} OSOB</div>
          </div>
          <div className="stock-col-headers" style={{ gridTemplateColumns: "1.4fr 1.4fr 0.6fr 0.9fr" }}>
            <div>Jméno / kontakt</div>
            <div>Naposledy koupeno</div>
            <div className="amount">Počet</div>
            <div className="amount">Celkem utraceno</div>
          </div>
          <div>
            {dodavatele.map((d) => {
              const isOpen = expanded.has(d.key);
              return (
                <div className="dodavatel-card" key={d.key}>
                  <div
                    className="stock-row"
                    style={{ gridTemplateColumns: "1.4fr 1.4fr 0.6fr 0.9fr" }}
                    onClick={() => toggleDodavatel(d.key)}
                  >
                    <div>
                      <div className="who">
                        {isOpen ? "▾" : "▸"} {d.name}
                      </div>
                      <div className="sale-contact" style={{ marginTop: 2 }}>
                        {d.phone || "—"} · {d.email || "—"}
                      </div>
                    </div>
                    <div className="amount dim">{formatDate(d.lastDate)}</div>
                    <div className="amount dim">{d.count}×</div>
                    <div className="amount">{formatKc(d.total)}</div>
                  </div>
                  {isOpen && (
                    <div className="dodavatel-detail">
                      {[...d.items]
                        .sort((a, b) => (b.datum || "").localeCompare(a.datum || ""))
                        .map((it) => (
                          <div className="dodavatel-item" key={it.id}>
                            <div className="dodavatel-item-date">{formatDate(it.datum)}</div>
                            <div className="dodavatel-item-mid">
                              <div className="dodavatel-item-name">{it.co_koupili}</div>
                              <div className="dodavatel-item-fase">
                                {NAKUP_PHASES.find((p) => p.key === it.fase)?.label || it.fase}
                              </div>
                            </div>
                            <div className="dodavatel-item-price">{formatKc(it.kolik_stalo)}</div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
            {dodavatele.length === 0 && <div className="stock-empty">Zatím žádní dodavatelé.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
