"use client";

import { useEffect, useMemo, useState } from "react";
import type { DilnaNaklad, DilnaTyp, Nakup, Profile } from "@/lib/database.types";
import {
  fetchActiveNakup,
  fetchDilnaNaklady,
  fetchProfiles,
  addDilnaNaklad,
  updateDilnaNaklad,
  deleteDilnaNaklad,
  setNakupFase,
} from "@/lib/data";
import { formatKc, formatDate, parseDigits, todayISO } from "@/lib/format";
import { DILNA_TYPY } from "@/lib/labels";
import HistoryPanel from "@/components/HistoryPanel";

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function DilnaCard({
  nakup,
  naklady,
  profile,
  profiles,
  mode,
  refreshKey,
  onChanged,
  onGoToProdej,
}: {
  nakup: Nakup;
  naklady: DilnaNaklad[];
  profile: Profile;
  profiles: Profile[];
  mode: "work" | "ready";
  refreshKey: number;
  onChanged: () => Promise<void>;
  onGoToProdej: (nakupId: number) => void;
}) {
  const [typ, setTyp] = useState<DilnaTyp>("servis");
  const [popis, setPopis] = useState("");
  const [cena, setCena] = useState("");
  const [ceka, setCeka] = useState(false);
  const [busy, setBusy] = useState(false);

  const nakladyTotal = sum(naklady.map((x) => x.cena));
  const pending = naklady.filter((x) => !x.dorazilo);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    if (!popis.trim()) return;
    await run(async () => {
      await addDilnaNaklad({
        nakup_id: nakup.id,
        typ,
        popis: popis.trim(),
        cena: parseDigits(cena),
        datum: todayISO(),
        dorazilo: !ceka,
        autor_id: profile.id,
      });
      setPopis("");
      setCena("");
      setCeka(false);
    });
  }

  async function markReady() {
    if (pending.length > 0 && !window.confirm(`${pending.length}× příslušenství ještě nedorazilo. Přesto označit jako připraveno k prodeji?`)) return;
    await run(() => setNakupFase(nakup.id, "pripraveno"));
  }

  return (
    <div className="buy-card">
      <div className="buy-card-top">
        <div>
          <div className="buy-name">{nakup.co_koupili}</div>
          <div className="sale-contact">
            {nakup.dodavatel_jmeno} · koupeno {formatDate(nakup.datum)}
          </div>
        </div>
        <div className="amount" style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>
          {formatKc(nakup.kolik_stalo)}
        </div>
      </div>

      <div className="form-section-label" style={{ marginTop: 14 }}>
        Náklady v dílně
      </div>
      {naklady.length === 0 && <div className="ship-hint">Zatím nic. Přidejte servis, baterku apod. — položka se tím automaticky přesune do dílny.</div>}
      <div className="repair-list">
        {naklady.map((x) => (
          <div className="naklad-row" key={`${x.id}-${x.popis}-${x.cena}-${x.typ}`}>
            <select
              className="plain-select"
              defaultValue={x.typ}
              onChange={(e) => run(() => updateDilnaNaklad(x.id, { typ: e.target.value as DilnaTyp }))}
            >
              {DILNA_TYPY.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              className="plain-input"
              defaultValue={x.popis}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== x.popis) run(() => updateDilnaNaklad(x.id, { popis: v }));
              }}
            />
            <input
              type="text"
              className="plain-input naklad-cena"
              defaultValue={x.cena}
              onBlur={(e) => {
                const v = parseDigits(e.target.value);
                if (v !== x.cena) run(() => updateDilnaNaklad(x.id, { cena: v }));
              }}
            />
            <label className="naklad-check" title="Příslušenství už dorazilo">
              <input type="checkbox" checked={x.dorazilo} onChange={(e) => run(() => updateDilnaNaklad(x.id, { dorazilo: e.target.checked }))} />
              dorazilo
            </label>
            <button className="r-remove" onClick={() => run(() => deleteDilnaNaklad(x.id))} disabled={busy}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="naklad-row add">
        <select className="plain-select" value={typ} onChange={(e) => setTyp(e.target.value as DilnaTyp)}>
          {DILNA_TYPY.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="plain-input"
          value={popis}
          onChange={(e) => setPopis(e.target.value)}
          placeholder="např. servis závěrky, baterka z Alzy"
        />
        <input type="text" className="plain-input naklad-cena" value={cena} onChange={(e) => setCena(e.target.value)} placeholder="Kč" />
        <label className="naklad-check">
          <input type="checkbox" checked={ceka} onChange={(e) => setCeka(e.target.checked)} />
          čeká na dodání
        </label>
        <button className="btn-secondary" onClick={handleAdd} disabled={busy}>
          + Přidat náklad
        </button>
      </div>

      <div className="summary-box" style={{ marginTop: 14 }}>
        <div className="summary-row dim">
          <span>Nákupní cena</span>
          <b>{formatKc(nakup.kolik_stalo)}</b>
        </div>
        <div className="summary-row dim">
          <span>+ Náklady v dílně</span>
          <b>{formatKc(nakladyTotal)}</b>
        </div>
        <div className="summary-row total">
          <span>Celkem nás stojí</span>
          <b>{formatKc(nakup.kolik_stalo + nakladyTotal)}</b>
        </div>
      </div>

      <div className="buy-footer">
        {pending.length > 0 ? <div className="ship-hint">Čeká na dodání: {pending.map((x) => x.popis).join(", ")}</div> : <span />}
        {mode === "work" ? (
          <button className="btn-transfer" onClick={markReady} disabled={busy}>
            Hotovo → připraveno k prodeji
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn-secondary" onClick={() => run(() => setNakupFase(nakup.id, "servisovano"))} disabled={busy}>
              ↩ Vrátit do dílny
            </button>
            <button className="btn-transfer" onClick={() => onGoToProdej(nakup.id)}>
              → Nabídnout k prodeji
            </button>
          </div>
        )}
      </div>

      <HistoryPanel entita="nakup" zaznamId={nakup.id} profiles={profiles} refreshKey={refreshKey} />
    </div>
  );
}

export default function DilnaSection({
  profile,
  refreshKey,
  onMutate,
  onGoToProdej,
}: {
  profile: Profile;
  refreshKey: number;
  onMutate: () => void;
  onGoToProdej: (nakupId: number) => void;
}) {
  const [nakup, setNakup] = useState<Nakup[]>([]);
  const [naklady, setNaklady] = useState<DilnaNaklad[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [pick, setPick] = useState("");

  async function load() {
    setLoading(true);
    const [n, profs] = await Promise.all([fetchActiveNakup(), fetchProfiles()]);
    setNakup(n);
    setProfiles(profs);
    try {
      setNaklady(await fetchDilnaNaklady());
      setMissingTable(false);
    } catch {
      setNaklady([]);
      setMissingTable(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const waiting = useMemo(() => nakup.filter((n) => n.fase === "nakoupeno"), [nakup]);
  const inDilna = useMemo(() => nakup.filter((n) => n.fase === "servisovano"), [nakup]);
  const ready = useMemo(() => nakup.filter((n) => n.fase === "pripraveno"), [nakup]);

  async function changed() {
    await load();
    onMutate();
  }

  async function takeIn() {
    if (!pick) return;
    await setNakupFase(parseInt(pick, 10), "servisovano");
    setPick("");
    await changed();
  }

  const nakladyOf = (id: number) => naklady.filter((x) => x.nakup_id === id);

  return (
    <div>
      {missingTable && (
        <div className="note" style={{ marginTop: 0, marginBottom: 24 }}>
          <b>Dílna ještě nemá databázi.</b> Ve Supabase (SQL Editor) spusťte soubor <b>supabase/migrace-01-eshop-stavy.sql</b>, pak stránku obnovte.
        </div>
      )}

      <div className="entry-form">
        <div className="entry-form-title">Vzít položku do dílny</div>
        <div className="repair-add-row" style={{ gridTemplateColumns: "1fr auto" }}>
          <select className="plain-select" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">— vyberte z nakoupených v Nákupu —</option>
            {waiting.map((n) => (
              <option key={n.id} value={n.id}>
                {n.co_koupili} ({n.dodavatel_jmeno}, {formatKc(n.kolik_stalo)})
              </option>
            ))}
          </select>
          <button className="btn-add" onClick={takeIn} disabled={!pick}>
            Vzít do dílny
          </button>
        </div>
        <div className="ship-hint" style={{ marginTop: 8 }}>
          Položka se do dílny dostane i sama, jakmile k ní přidáte první náklad.
        </div>
      </div>

      <div className="list-header">
        <div className="list-title">V dílně</div>
        <div className="list-sub">{loading ? "…" : `${inDilna.length} POLOŽEK`}</div>
      </div>
      <div>
        {inDilna.map((n) => (
          <DilnaCard
            key={n.id}
            nakup={n}
            naklady={nakladyOf(n.id)}
            profile={profile}
            profiles={profiles}
            mode="work"
            refreshKey={refreshKey}
            onChanged={changed}
            onGoToProdej={onGoToProdej}
          />
        ))}
        {!loading && inDilna.length === 0 && <div className="stock-empty">V dílně teď nic není.</div>}
      </div>

      <div className="list-header" style={{ marginTop: 36 }}>
        <div className="list-title">Připraveno k prodeji</div>
        <div className="list-sub">{loading ? "…" : `${ready.length} POLOŽEK`}</div>
      </div>
      <div>
        {ready.map((n) => (
          <DilnaCard
            key={n.id}
            nakup={n}
            naklady={nakladyOf(n.id)}
            profile={profile}
            profiles={profiles}
            mode="ready"
            refreshKey={refreshKey}
            onChanged={changed}
            onGoToProdej={onGoToProdej}
          />
        ))}
        {!loading && ready.length === 0 && <div className="stock-empty">Nic není připravené.</div>}
      </div>
    </div>
  );
}
