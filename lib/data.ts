import { createClient } from "@/lib/supabase/client";
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
} from "@/lib/database.types";

const supabase = createClient();

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

// A nakup row counts as "sold" (and disappears from Nákup) once a non-storno
// prodej references it. We never delete nakup rows so storno can un-hide them
// again just by removing the prodej row.
export async function fetchActiveNakup(): Promise<Nakup[]> {
  const [{ data: nakupData, error: nakupErr }, { data: soldIds, error: soldErr }] =
    await Promise.all([
      supabase.from("nakup").select("*").order("datum", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("prodej").select("nakup_id").neq("stav", "storno"),
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
  return data as Nakup;
}

export async function setNakupFase(id: number, fase: NakupFase): Promise<void> {
  const { error } = await supabase.from("nakup").update({ fase }).eq("id", id);
  if (error) throw error;
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
  const { error } = await supabase.from("nakup").update(fields).eq("id", id);
  if (error) throw error;
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
  autor_id: string | null;
  opravy: { popis: string; cena: number }[];
  doplnky: { polozka: string; pocet_ks: number; cena: number }[];
}

export async function addProdej(input: NewProdejInput): Promise<Prodej> {
  const { opravy, doplnky, ...prodejFields } = input;

  const { data: prodej, error: prodejErr } = await supabase
    .from("prodej")
    .insert({ ...prodejFields, stav: "pripraveno" })
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

    // Mirror into the doplňky sales log so stock is decremented.
    const { error: logErr } = await supabase.from("doplnky_prodej").insert(
      doplnky.map((d) => ({
        polozka: d.polozka,
        pocet_ks: d.pocet_ks,
        cena_celkem: d.cena,
        autor_id: input.autor_id,
      }))
    );
    if (logErr) throw logErr;
  }

  return prodejRow;
}

export async function setProdejStav(id: number, stav: ProdejStav): Promise<void> {
  if (stav === "storno") {
    // Deleting the prodej row (cascades to opravy/doplnky) un-hides the
    // underlying nakup row, which is still sitting at fase='pripraveno'.
    const { error } = await supabase.from("prodej").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("prodej").update({ stav }).eq("id", id);
  if (error) throw error;
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
  }>
): Promise<void> {
  const { error } = await supabase.from("prodej").update(fields).eq("id", id);
  if (error) throw error;
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

export async function setProdejInvoice(
  id: number,
  fields: { invoice_number: string; invoice_vs: string; invoice_date_issue: string; invoice_date_due: string }
): Promise<void> {
  const { error } = await supabase.from("prodej").update(fields).eq("id", id);
  if (error) throw error;
}

export async function generateInvoiceNumber(): Promise<{ number: string; vs: string }> {
  const year = new Date().getFullYear();
  const prefix = `FA-${year}-`;
  const { data, error } = await supabase
    .from("prodej")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  let next = 1;
  if (data && data.length && data[0].invoice_number) {
    const lastSeq = parseInt(data[0].invoice_number.slice(prefix.length), 10);
    if (!isNaN(lastSeq)) next = lastSeq + 1;
  }
  const number = `${prefix}${String(next).padStart(4, "0")}`;
  const vs = `${year}${String(next).padStart(4, "0")}`;
  return { number, vs };
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
  const { error } = await supabase.from("doplnky_nakup").update(fields).eq("id", id);
  if (error) throw error;
}

export async function updateDoplnkyProdej(
  id: number,
  fields: Partial<{ polozka: string; pocet_ks: number; cena_celkem: number }>
): Promise<void> {
  const { error } = await supabase.from("doplnky_prodej").update(fields).eq("id", id);
  if (error) throw error;
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
