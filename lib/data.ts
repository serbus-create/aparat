import { createClient } from "@/lib/supabase/client";
import { FEE_BALENE, FEE_POSTOVNE, fazeLabel, stavLabel, dopravceLabel } from "@/lib/labels";
import { formatKc, formatDate } from "@/lib/format";
import type {
  Profile,
  Nakup,
  NakupFase,
  NakupPoznamka,
  Prodej,
  ProdejStav,
  ProdejOprava,
  ProdejDoplnek,
  DoplnkyNakup,
  DoplnkyProdej,
  DoplnkyCena,
  Historie,
  HistorieEntita,
} from "@/lib/database.types";

const supabase = createClient();

// ---------------------------------------------------------------------------
// Historie změn
// ---------------------------------------------------------------------------

type FieldLabels = Record<string, { label: string; fmt?: (v: unknown) => string }>;

const NAKUP_LABELS: FieldLabels = {
  dodavatel_jmeno: { label: "Dodavatel" },
  dodavatel_telefon: { label: "Telefon" },
  dodavatel_email: { label: "Email" },
  datum: { label: "Datum", fmt: (v) => formatDate(String(v)) },
  co_koupili: { label: "Položka" },
  kolik_stalo: { label: "Cena", fmt: (v) => formatKc(Number(v)) },
};
const PRODEJ_LABELS: FieldLabels = {
  klient_jmeno: { label: "Klient" },
  klient_telefon: { label: "Telefon" },
  klient_email: { label: "Email" },
  klient_adresa: { label: "Adresa" },
  polozka: { label: "Položka" },
  cena: { label: "Cena", fmt: (v) => formatKc(Number(v)) },
  datum: { label: "Datum", fmt: (v) => formatDate(String(v)) },
  dopravce: { label: "Dopravce", fmt: (v) => dopravceLabel(String(v)) },
  cislo_zasilky: { label: "Číslo zásilky" },
  duvod_vraceni: { label: "Důvod" },
};
const DOPLNKY_LABELS: FieldLabels = {
  polozka: { label: "Položka" },
  pocet_ks: { label: "Počet ks" },
  cena_celkem: { label: "Cena celkem", fmt: (v) => formatKc(Number(v)) },
};

function diffLines(before: object, after: object, labels: FieldLabels): string[] {
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const show = (v: unknown, fmt?: (v: unknown) => string) => (v === null || v === undefined || v === "" ? "—" : fmt ? fmt(v) : String(v));
  const out: string[] = [];
  for (const key of Object.keys(a)) {
    const l = labels[key];
    if (!l) continue;
    const was = b[key] ?? null;
    const now = a[key] ?? null;
    if ((was ?? "") === (now ?? "")) continue;
    out.push(`${l.label}: ${show(was, l.fmt)} → ${show(now, l.fmt)}`);
  }
  return out;
}

// Zápis do historie nesmí nikdy shodit samotnou akci, proto chyby ignorujeme.
export async function logChange(entita: HistorieEntita, zaznamId: number | null, nazev: string, popis: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    await supabase.from("historie").insert({
      entita,
      zaznam_id: zaznamId,
      nazev,
      popis,
      autor_id: data.session?.user.id ?? null,
    });
  } catch {
    // historie je doplňková funkce
  }
}

export async function fetchHistorie(entita: HistorieEntita, zaznamId: number): Promise<Historie[]> {
  const { data, error } = await supabase
    .from("historie")
    .select("*")
    .eq("entita", entita)
    .eq("zaznam_id", zaznamId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Historie[];
}

export async function fetchRecentHistorie(limit = 15): Promise<Historie[]> {
  const { data, error } = await supabase.from("historie").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data as Historie[];
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from("profiles").select("*").order("full_name");
  if (error) throw error;
  return data as Profile[];
}

// ---------------------------------------------------------------------------
// Nákup
// ---------------------------------------------------------------------------

// A nakup row counts as "sold" (and disappears from Nákup) while a prodej that
// is not storno/vráceno references it. We never delete nakup rows so storno or a
// return can bring the item back into Nákup.
export async function fetchActiveNakup(): Promise<Nakup[]> {
  const [{ data: nakupData, error: nakupErr }, { data: soldIds, error: soldErr }] =
    await Promise.all([
      supabase.from("nakup").select("*").order("datum", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("prodej").select("nakup_id").not("stav", "in", "(storno,vraceno)"),
    ]);
  if (nakupErr) throw nakupErr;
  if (soldErr) throw soldErr;
  const soldSet = new Set((soldIds ?? []).map((r) => r.nakup_id));
  return (nakupData as Nakup[]).filter((n) => !soldSet.has(n.id));
}

export async function fetchAllNakup(): Promise<Nakup[]> {
  const { data, error } = await supabase
    .from("nakup")
    .select("*")
    .order("datum", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Nakup[];
}

export async function addNakup(input: {
  dodavatel_jmeno: string;
  dodavatel_telefon: string | null;
  dodavatel_email: string | null;
  datum: string | null;
  co_koupili: string;
  kolik_stalo: number;
  autor_id: string | null;
}): Promise<Nakup> {
  const { data, error } = await supabase
    .from("nakup")
    .insert({ ...input, fase: "nakoupeno" })
    .select()
    .single();
  if (error) throw error;
  const row = data as Nakup;
  await logChange("nakup", row.id, row.co_koupili, `Nákup vytvořen (${formatKc(row.kolik_stalo)} od ${row.dodavatel_jmeno})`);
  return row;
}

export async function setNakupFase(id: number, fase: NakupFase): Promise<void> {
  const { data: before } = await supabase.from("nakup").select("fase, co_koupili").eq("id", id).single();
  const { error } = await supabase.from("nakup").update({ fase }).eq("id", id);
  if (error) throw error;
  const b = before as { fase: NakupFase; co_koupili: string } | null;
  if (b && b.fase !== fase) await logChange("nakup", id, b.co_koupili, `Fáze: ${fazeLabel(b.fase)} → ${fazeLabel(fase)}`);
}

export async function updateNakup(
  id: number,
  fields: Partial<{
    dodavatel_jmeno: string;
    dodavatel_telefon: string | null;
    dodavatel_email: string | null;
    datum: string | null;
    co_koupili: string;
    kolik_stalo: number;
  }>
): Promise<void> {
  const { data: before } = await supabase.from("nakup").select("*").eq("id", id).single();
  const { error } = await supabase.from("nakup").update(fields).eq("id", id);
  if (error) throw error;
  if (before) {
    const lines = diffLines(before, fields, NAKUP_LABELS);
    if (lines.length) await logChange("nakup", id, (before as Nakup).co_koupili, `Upraveno — ${lines.join("; ")}`);
  }
}

// Položku z Nákupu nelze smazat, pokud k ní existuje záznam v Prodeji.
export async function deleteNakup(id: number): Promise<void> {
  const { data: linked, error: linkErr } = await supabase
    .from("prodej")
    .select("id, klient_jmeno, stav")
    .eq("nakup_id", id)
    .limit(1);
  if (linkErr) throw linkErr;
  if (linked && linked.length > 0) {
    const p = linked[0] as { klient_jmeno: string };
    throw new Error(
      `Tuto položku nelze smazat, protože k ní existuje záznam v Prodeji (klient: ${p.klient_jmeno}). Nejdřív smažte nebo stornujte ten prodej.`
    );
  }
  const { data: row } = await supabase.from("nakup").select("co_koupili").eq("id", id).single();
  const { error } = await supabase.from("nakup").delete().eq("id", id);
  if (error) throw error;
  await logChange("nakup", id, (row as { co_koupili: string } | null)?.co_koupili ?? `#${id}`, "Nákup smazán");
}

// ---------------------------------------------------------------------------
// Nákup — ruční poznámky
// ---------------------------------------------------------------------------

export async function fetchNakupPoznamky(): Promise<NakupPoznamka[]> {
  const { data, error } = await supabase
    .from("nakup_poznamky")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as NakupPoznamka[];
}

export async function addNakupPoznamka(input: {
  nakup_id: number;
  text: string;
  autor_id: string | null;
}): Promise<void> {
  const { error } = await supabase.from("nakup_poznamky").insert(input);
  if (error) throw error;
}

export async function deleteNakupPoznamka(id: number): Promise<void> {
  const { error } = await supabase.from("nakup_poznamky").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Prodej
// ---------------------------------------------------------------------------

export interface ProdejFull extends Prodej {
  opravy: ProdejOprava[];
  doplnky: ProdejDoplnek[];
  nakup: Nakup | null;
}

export function netForSale(r: ProdejFull): number {
  const repairsTotal = r.opravy.reduce((s, x) => s + x.cena, 0);
  const doplnkyTotal = r.doplnky.reduce((s, x) => s + x.cena, 0);
  const originalCost = r.nakup?.kolik_stalo ?? 0;
  return r.cena + doplnkyTotal - repairsTotal - FEE_BALENE - FEE_POSTOVNE - originalCost;
}

export async function fetchProdej(): Promise<ProdejFull[]> {
  const [{ data: prodejData, error: prodejErr }, { data: opravyData, error: opravyErr }, { data: doplnkyData, error: doplnkyErr }, { data: nakupData, error: nakupErr }] =
    await Promise.all([
      supabase.from("prodej").select("*").order("created_at", { ascending: false }),
      supabase.from("prodej_opravy").select("*"),
      supabase.from("prodej_doplnky").select("*"),
      supabase.from("nakup").select("*"),
    ]);
  if (prodejErr) throw prodejErr;
  if (opravyErr) throw opravyErr;
  if (doplnkyErr) throw doplnkyErr;
  if (nakupErr) throw nakupErr;

  const nakupById = new Map((nakupData as Nakup[]).map((n) => [n.id, n]));

  return (prodejData as Prodej[]).map((p) => ({
    ...p,
    opravy: (opravyData as ProdejOprava[]).filter((o) => o.prodej_id === p.id),
    doplnky: (doplnkyData as ProdejDoplnek[]).filter((d) => d.prodej_id === p.id),
    nakup: p.nakup_id ? nakupById.get(p.nakup_id) ?? null : null,
  }));
}

export interface NewProdejInput {
  nakup_id: number;
  klient_jmeno: string;
  klient_telefon: string | null;
  klient_email: string | null;
  klient_adresa: string | null;
  polozka: string;
  cena: number;
  datum: string | null;
  autor_id: string | null;
  opravy: { popis: string; cena: number }[];
  doplnky: { polozka: string; pocet_ks: number; cena: number }[];
}

export async function addProdej(input: NewProdejInput): Promise<Prodej> {
  const { opravy, doplnky, ...prodejFields } = input;

  const { data: prodej, error: prodejErr } = await supabase
    .from("prodej")
    .insert({ ...prodejFields, stav: "inzerovano" })
    .select()
    .single();
  if (prodejErr) throw prodejErr;
  const prodejRow = prodej as Prodej;

  if (opravy.length) {
    const { error } = await supabase
      .from("prodej_opravy")
      .insert(opravy.map((o) => ({ ...o, prodej_id: prodejRow.id })));
    if (error) throw error;
  }

  if (doplnky.length) {
    const { error } = await supabase
      .from("prodej_doplnky")
      .insert(doplnky.map((d) => ({ prodej_id: prodejRow.id, polozka: d.polozka, pocet_ks: d.pocet_ks, cena: d.cena })));
    if (error) throw error;

    // Mirror into the doplňky sales log so stock is decremented. prodej_id
    // links the rows to this sale, so deleting the sale returns the stock.
    const { error: logErr } = await supabase.from("doplnky_prodej").insert(
      doplnky.map((d) => ({
        prodej_id: prodejRow.id,
        polozka: d.polozka,
        pocet_ks: d.pocet_ks,
        cena_celkem: d.cena,
        autor_id: input.autor_id,
      }))
    );
    if (logErr) throw logErr;
  }

  await logChange("prodej", prodejRow.id, prodejRow.polozka, `Prodej vytvořen (${formatKc(prodejRow.cena)}, klient ${prodejRow.klient_jmeno})`);
  return prodejRow;
}

export async function setProdejStav(id: number, stav: ProdejStav): Promise<void> {
  const { data: before } = await supabase.from("prodej").select("stav, polozka").eq("id", id).single();
  const b = before as { stav: ProdejStav; polozka: string } | null;
  if (stav === "storno") {
    // Deleting the prodej row (cascades to opravy/doplnky and the linked
    // doplňky sales log) brings the nakup item back into Nákup.
    const { error } = await supabase.from("prodej").delete().eq("id", id);
    if (error) throw error;
    await logChange("prodej", id, b?.polozka ?? `#${id}`, "Storno — položka vrácena do Nákupu, doplňky zpět na sklad");
    return;
  }
  const { error } = await supabase.from("prodej").update({ stav }).eq("id", id);
  if (error) throw error;
  if (b && b.stav !== stav) await logChange("prodej", id, b.polozka, `Stav: ${stavLabel(b.stav)} → ${stavLabel(stav)}`);
}

export async function updateProdej(
  id: number,
  fields: Partial<{
    klient_jmeno: string;
    klient_telefon: string | null;
    klient_email: string | null;
    klient_adresa: string | null;
    polozka: string;
    cena: number;
    datum: string | null;
    dopravce: string | null;
    cislo_zasilky: string | null;
    duvod_vraceni: string | null;
  }>
): Promise<void> {
  const { data: before } = await supabase.from("prodej").select("*").eq("id", id).single();
  const { error } = await supabase.from("prodej").update(fields).eq("id", id);
  if (error) throw error;
  if (before) {
    const lines = diffLines(before, fields, PRODEJ_LABELS);
    if (lines.length) await logChange("prodej", id, (before as Prodej).polozka, `Upraveno — ${lines.join("; ")}`);
  }
}

// Smazání prodeje (opravy, doplňky i jejich zápis v logu skladu se smažou
// kaskádou). Nákupní položka se vrátí zpět do Nákupu — stejně jako při stornu.
export async function deleteProdej(id: number): Promise<void> {
  const { data: row } = await supabase.from("prodej").select("polozka").eq("id", id).single();
  const { error } = await supabase.from("prodej").delete().eq("id", id);
  if (error) throw error;
  await logChange("prodej", id, (row as { polozka: string } | null)?.polozka ?? `#${id}`, "Prodej smazán — položka vrácena do Nákupu, doplňky zpět na sklad");
}

export async function addProdejOprava(prodej_id: number, popis: string, cena: number): Promise<void> {
  const { error } = await supabase.from("prodej_opravy").insert({ prodej_id, popis, cena });
  if (error) throw error;
}

export async function updateProdejOprava(id: number, fields: Partial<{ popis: string; cena: number }>): Promise<void> {
  const { error } = await supabase.from("prodej_opravy").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteProdejOprava(id: number): Promise<void> {
  const { error } = await supabase.from("prodej_opravy").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Doplňky
// ---------------------------------------------------------------------------

export async function fetchDoplnkyNakup(): Promise<DoplnkyNakup[]> {
  const { data, error } = await supabase.from("doplnky_nakup").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as DoplnkyNakup[];
}

export async function fetchDoplnkyProdej(): Promise<DoplnkyProdej[]> {
  const { data, error } = await supabase.from("doplnky_prodej").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as DoplnkyProdej[];
}

export async function addDoplnkyNakup(input: {
  polozka: string;
  pocet_ks: number;
  cena_celkem: number;
  autor_id: string | null;
}): Promise<void> {
  const { error } = await supabase.from("doplnky_nakup").insert(input);
  if (error) throw error;
}

export async function addDoplnkyProdej(input: {
  polozka: string;
  pocet_ks: number;
  cena_celkem: number;
  autor_id: string | null;
}): Promise<void> {
  const { error } = await supabase.from("doplnky_prodej").insert(input);
  if (error) throw error;
}

export async function updateDoplnkyNakup(
  id: number,
  fields: Partial<{ polozka: string; pocet_ks: number; cena_celkem: number }>
): Promise<void> {
  const { data: before } = await supabase.from("doplnky_nakup").select("*").eq("id", id).single();
  const { error } = await supabase.from("doplnky_nakup").update(fields).eq("id", id);
  if (error) throw error;
  if (before) {
    const lines = diffLines(before, fields, DOPLNKY_LABELS);
    if (lines.length) await logChange("doplnky_nakup", id, (before as DoplnkyNakup).polozka, `Upraveno — ${lines.join("; ")}`);
  }
}

export async function updateDoplnkyProdej(
  id: number,
  fields: Partial<{ polozka: string; pocet_ks: number; cena_celkem: number }>
): Promise<void> {
  const { data: before } = await supabase.from("doplnky_prodej").select("*").eq("id", id).single();
  const { error } = await supabase.from("doplnky_prodej").update(fields).eq("id", id);
  if (error) throw error;
  if (before) {
    const lines = diffLines(before, fields, DOPLNKY_LABELS);
    if (lines.length) await logChange("doplnky_prodej", id, (before as DoplnkyProdej).polozka, `Upraveno — ${lines.join("; ")}`);
  }
}

// Smazání nákupu doplňku nesmí způsobit záporný stav skladu.
export async function deleteDoplnkyNakup(id: number): Promise<void> {
  const [{ data: row, error: rowErr }, { data: bought, error: bErr }, { data: sold, error: sErr }] = await Promise.all([
    supabase.from("doplnky_nakup").select("*").eq("id", id).single(),
    supabase.from("doplnky_nakup").select("polozka, pocet_ks"),
    supabase.from("doplnky_prodej").select("polozka, pocet_ks"),
  ]);
  if (rowErr) throw rowErr;
  if (bErr) throw bErr;
  if (sErr) throw sErr;
  const target = row as DoplnkyNakup;
  const key = target.polozka.trim().toLowerCase();
  const sum = (rows: { polozka: string; pocet_ks: number }[]) =>
    rows.filter((r) => r.polozka.trim().toLowerCase() === key).reduce((s, r) => s + r.pocet_ks, 0);
  const remainingAfter = sum(bought as { polozka: string; pocet_ks: number }[]) - target.pocet_ks - sum(sold as { polozka: string; pocet_ks: number }[]);
  if (remainingAfter < 0) {
    throw new Error(
      `Tento nákup nelze smazat: ${target.polozka} už z něj bylo prodáno, po smazání by na skladě zbylo ${remainingAfter} ks. Nejdřív upravte nebo smažte odpovídající prodej.`
    );
  }
  const { error } = await supabase.from("doplnky_nakup").delete().eq("id", id);
  if (error) throw error;
  await logChange("doplnky_nakup", id, target.polozka, `Nákup smazán (${target.pocet_ks} ks, ${formatKc(target.cena_celkem)})`);
}

// Zápis, který vznikl z prodeje techniky, se spravuje v Prodeji (smazáním
// prodeje se sám vrátí na sklad).
export async function deleteDoplnkyProdej(id: number): Promise<void> {
  const { data: row, error: rowErr } = await supabase.from("doplnky_prodej").select("*").eq("id", id).single();
  if (rowErr) throw rowErr;
  const target = row as DoplnkyProdej;
  if (target.prodej_id) {
    throw new Error("Tento prodej doplňku patří k prodeji techniky. Smažte nebo stornujte celý prodej v záložce Prodej, doplňky se pak vrátí na sklad.");
  }
  const { error } = await supabase.from("doplnky_prodej").delete().eq("id", id);
  if (error) throw error;
  await logChange("doplnky_prodej", id, target.polozka, `Prodej smazán (${target.pocet_ks} ks, ${formatKc(target.cena_celkem)})`);
}

export async function fetchDoplnkyCeny(): Promise<DoplnkyCena[]> {
  const { data, error } = await supabase.from("doplnky_ceny").select("*");
  if (error) throw error;
  return data as DoplnkyCena[];
}

export async function setDoplnekCena(polozka: string, cena: number): Promise<void> {
  const { error } = await supabase.from("doplnky_ceny").upsert({ polozka, cena_za_ks: cena });
  if (error) throw error;
}

export interface StockRow {
  name: string;
  bought: number;
  sold: number;
  remaining: number;
}

export function computeStock(kupujeme: DoplnkyNakup[], prodavame: DoplnkyProdej[]): StockRow[] {
  const map = new Map<string, StockRow>();
  const keyOf = (s: string) => s.trim().toLowerCase();

  kupujeme.forEach((r) => {
    const key = keyOf(r.polozka);
    if (!map.has(key)) map.set(key, { name: r.polozka.trim(), bought: 0, sold: 0, remaining: 0 });
    map.get(key)!.bought += r.pocet_ks;
  });
  prodavame.forEach((r) => {
    const key = keyOf(r.polozka);
    if (!map.has(key)) map.set(key, { name: r.polozka.trim(), bought: 0, sold: 0, remaining: 0 });
    map.get(key)!.sold += r.pocet_ks;
  });

  return [...map.values()]
    .map((s) => ({ ...s, remaining: s.bought - s.sold }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

export function estimateDoplnekUnitPrice(
  itemName: string,
  ceny: DoplnkyCena[],
  prodavame: DoplnkyProdej[],
  kupujeme: DoplnkyNakup[]
): number {
  const key = itemName.trim().toLowerCase();
  const manual = ceny.find((c) => c.polozka.trim().toLowerCase() === key);
  if (manual) return manual.cena_za_ks;

  const sold = prodavame.filter((r) => r.polozka.trim().toLowerCase() === key);
  if (sold.length) {
    const qty = sold.reduce((s, r) => s + r.pocet_ks, 0);
    const total = sold.reduce((s, r) => s + r.cena_celkem, 0);
    return qty ? total / qty : 0;
  }
  const bought = kupujeme.filter((r) => r.polozka.trim().toLowerCase() === key);
  if (bought.length) {
    const qty = bought.reduce((s, r) => s + r.pocet_ks, 0);
    const total = bought.reduce((s, r) => s + r.cena_celkem, 0);
    return qty ? total / qty : 0;
  }
  return 0;
}
