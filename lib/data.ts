import { createClient } from "@/lib/supabase/client";
import { FEE_BALENE, FEE_POSTOVNE, fazeLabel, stavLabel, dopravceLabel, dilnaTypLabel } from "@/lib/labels";
import { formatKc, formatDate } from "@/lib/format";
import type {
  Profile,
  Nakup,
  NakupFase,
  NakupPoznamka,
  Prodej,
  ProdejStav,
  ProdejPolozka,
  DilnaNaklad,
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
  balne: { label: "Balné", fmt: (v) => formatKc(Number(v)) },
  postovne: { label: "Poštovné", fmt: (v) => formatKc(Number(v)) },
  duvod_vraceni: { label: "Důvod" },
};
const DILNA_LABELS: FieldLabels = {
  typ: { label: "Typ", fmt: (v) => dilnaTypLabel(String(v)) },
  popis: { label: "Popis" },
  cena: { label: "Cena", fmt: (v) => formatKc(Number(v)) },
  datum: { label: "Datum", fmt: (v) => formatDate(String(v)) },
  dorazilo: { label: "Dorazilo", fmt: (v) => (v ? "ano" : "ne") },
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
  const [{ data: nakupData, error: nakupErr }, { data: prodejRows, error: prodejErr }, { data: polozkyRows }] = await Promise.all([
    supabase.from("nakup").select("*").order("datum", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("prodej").select("id, nakup_id, stav"),
    // tabulka vznikne až migrací; bez ní bereme prázdný seznam
    supabase.from("prodej_polozky").select("prodej_id, nakup_id"),
  ]);
  if (nakupErr) throw nakupErr;
  if (prodejErr) throw prodejErr;
  const released = new Set(["storno", "vraceno"]);
  const live = (prodejRows ?? []).filter((p) => !released.has(p.stav as string));
  const liveIds = new Set(live.map((p) => p.id as number));
  const soldSet = new Set<number>();
  live.forEach((p) => p.nakup_id != null && soldSet.add(p.nakup_id as number));
  (polozkyRows ?? []).forEach((x) => liveIds.has(x.prodej_id as number) && soldSet.add(x.nakup_id as number));
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

// Položku z Nákupu nelze smazat, pokud je v nějaké objednávce (Prodej).
// Náklady v dílně a poznámky se smažou spolu s ní.
export async function deleteNakup(id: number): Promise<void> {
  const [{ data: legacy, error: legacyErr }, { data: items }] = await Promise.all([
    supabase.from("prodej").select("klient_jmeno").eq("nakup_id", id).limit(1),
    supabase.from("prodej_polozky").select("prodej_id").eq("nakup_id", id).limit(1),
  ]);
  if (legacyErr) throw legacyErr;
  let klient: string | null = legacy && legacy.length > 0 ? (legacy[0] as { klient_jmeno: string }).klient_jmeno : null;
  if (!klient && items && items.length > 0) {
    const { data: pr } = await supabase.from("prodej").select("klient_jmeno").eq("id", (items[0] as { prodej_id: number }).prodej_id).single();
    klient = (pr as { klient_jmeno: string } | null)?.klient_jmeno ?? "?";
  }
  if (klient) {
    throw new Error(
      `Tuto položku nelze smazat, protože je v objednávce v Prodeji (klient: ${klient}). Nejdřív tu objednávku nebo položku smažte či stornujte.`
    );
  }
  const { data: row } = await supabase.from("nakup").select("co_koupili").eq("id", id).single();
  const { error } = await supabase.from("nakup").delete().eq("id", id);
  if (error) throw error;
  await logChange("nakup", id, (row as { co_koupili: string } | null)?.co_koupili ?? `#${id}`, "Nákup smazán (včetně nákladů v dílně)");
}

// ---------------------------------------------------------------------------
// Dílna — náklady na položku
// ---------------------------------------------------------------------------

export async function fetchDilnaNaklady(): Promise<DilnaNaklad[]> {
  const { data, error } = await supabase.from("dilna_naklady").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data as DilnaNaklad[];
}

export async function addDilnaNaklad(input: {
  nakup_id: number;
  typ: DilnaNaklad["typ"];
  popis: string;
  cena: number;
  datum: string | null;
  dorazilo: boolean;
  autor_id: string | null;
}): Promise<void> {
  const { error } = await supabase.from("dilna_naklady").insert(input);
  if (error) throw error;
  const { data } = await supabase.from("nakup").select("co_koupili, fase").eq("id", input.nakup_id).single();
  const n = data as { co_koupili: string; fase: NakupFase } | null;
  await logChange("nakup", input.nakup_id, n?.co_koupili ?? `#${input.nakup_id}`, `Dílna: přidán náklad „${input.popis}“ (${formatKc(input.cena)})`);
  // první náklad = položka je v dílně
  if (n?.fase === "nakoupeno") await setNakupFase(input.nakup_id, "servisovano");
}

export async function updateDilnaNaklad(
  id: number,
  fields: Partial<{ typ: DilnaNaklad["typ"]; popis: string; cena: number; datum: string | null; dorazilo: boolean }>
): Promise<void> {
  const { data: before } = await supabase.from("dilna_naklady").select("*").eq("id", id).single();
  const { error } = await supabase.from("dilna_naklady").update(fields).eq("id", id);
  if (error) throw error;
  if (before) {
    const b = before as DilnaNaklad;
    const lines = diffLines(b, fields, DILNA_LABELS);
    if (lines.length) {
      const { data: n } = await supabase.from("nakup").select("co_koupili").eq("id", b.nakup_id).single();
      await logChange("nakup", b.nakup_id, (n as { co_koupili: string } | null)?.co_koupili ?? `#${b.nakup_id}`, `Dílna: „${b.popis}“ — ${lines.join("; ")}`);
    }
  }
}

export async function deleteDilnaNaklad(id: number): Promise<void> {
  const { data: before } = await supabase.from("dilna_naklady").select("*").eq("id", id).single();
  const { error } = await supabase.from("dilna_naklady").delete().eq("id", id);
  if (error) throw error;
  if (before) {
    const b = before as DilnaNaklad;
    const { data: n } = await supabase.from("nakup").select("co_koupili").eq("id", b.nakup_id).single();
    await logChange("nakup", b.nakup_id, (n as { co_koupili: string } | null)?.co_koupili ?? `#${b.nakup_id}`, `Dílna: smazán náklad „${b.popis}“ (${formatKc(b.cena)})`);
  }
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

export interface ProdejPolozkaFull extends ProdejPolozka {
  nakup: Nakup | null;
  naklady: DilnaNaklad[];
}

// Objednávka zákazníka: jedna nebo víc položek (foťák, repráky…) + doplňky ze skladu.
export interface ProdejFull extends Prodej {
  doplnky: ProdejDoplnek[];
  polozky: ProdejPolozkaFull[];
  nakup: Nakup | null; // jen starší záznamy s jednou položkou
}

export const orderNumber = (id: number): string => `OBJ-${String(id).padStart(4, "0")}`;

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// Celkový náklad položky = nákupní cena + vše z dílny.
export const itemCost = (p: ProdejPolozkaFull): number => (p.nakup?.kolik_stalo ?? 0) + sum(p.naklady.map((x) => x.cena));

export function itemsRevenue(r: ProdejFull): number {
  return r.polozky.length ? sum(r.polozky.map((p) => p.cena)) : r.cena;
}

export function totalCost(r: ProdejFull): number {
  return r.polozky.length ? sum(r.polozky.map(itemCost)) : r.nakup?.kolik_stalo ?? 0;
}

// Kolik se z objednávky vrací do firmy: nákupní ceny prodaných položek,
// ať je z čeho koupit další zboží.
export function returnToFirm(r: ProdejFull): number {
  return r.polozky.length ? sum(r.polozky.map((p) => p.nakup?.kolik_stalo ?? 0)) : r.nakup?.kolik_stalo ?? 0;
}

export function feesOf(r: ProdejFull): number {
  return (r.balne ?? FEE_BALENE) + (r.postovne ?? FEE_POSTOVNE);
}

export function netForSale(r: ProdejFull): number {
  return itemsRevenue(r) + sum(r.doplnky.map((x) => x.cena)) - totalCost(r) - feesOf(r);
}

export async function fetchProdej(): Promise<ProdejFull[]> {
  const [prodejRes, doplnkyRes, nakupRes, polozkyRes, nakladyRes] = await Promise.all([
    supabase.from("prodej").select("*").order("created_at", { ascending: false }),
    supabase.from("prodej_doplnky").select("*"),
    supabase.from("nakup").select("*"),
    supabase.from("prodej_polozky").select("*"),
    supabase.from("dilna_naklady").select("*"),
  ]);
  if (prodejRes.error) throw prodejRes.error;
  if (doplnkyRes.error) throw doplnkyRes.error;
  if (nakupRes.error) throw nakupRes.error;
  // tabulky z migrace; bez nich pracujeme se starším tvarem záznamu
  const polozky = (polozkyRes.error ? [] : polozkyRes.data) as ProdejPolozka[];
  const naklady = (nakladyRes.error ? [] : nakladyRes.data) as DilnaNaklad[];

  const nakupById = new Map((nakupRes.data as Nakup[]).map((n) => [n.id, n]));

  return (prodejRes.data as Prodej[]).map((p) => ({
    ...p,
    balne: p.balne ?? FEE_BALENE,
    postovne: p.postovne ?? FEE_POSTOVNE,
    doplnky: (doplnkyRes.data as ProdejDoplnek[]).filter((d) => d.prodej_id === p.id),
    polozky: polozky
      .filter((x) => x.prodej_id === p.id)
      .map((x) => ({
        ...x,
        nakup: nakupById.get(x.nakup_id) ?? null,
        naklady: naklady.filter((n) => n.nakup_id === x.nakup_id),
      })),
    nakup: p.nakup_id ? nakupById.get(p.nakup_id) ?? null : null,
  }));
}

export interface NewProdejInput {
  klient_jmeno: string;
  klient_telefon: string | null;
  klient_email: string | null;
  klient_adresa: string | null;
  datum: string | null;
  balne: number;
  postovne: number;
  autor_id: string | null;
  polozky: { nakup_id: number; cena: number; nazev: string }[];
  doplnky: { polozka: string; pocet_ks: number; cena: number }[];
}

const summaryName = (names: string[]) => names.join(" + ");

export async function addProdej(input: NewProdejInput): Promise<Prodej> {
  const { polozky, doplnky, ...prodejFields } = input;

  const { data: prodej, error: prodejErr } = await supabase
    .from("prodej")
    .insert({
      ...prodejFields,
      polozka: summaryName(polozky.map((x) => x.nazev)),
      cena: sum(polozky.map((x) => x.cena)),
      stav: "zamluveno",
    })
    .select()
    .single();
  if (prodejErr) throw prodejErr;
  const prodejRow = prodej as Prodej;

  const { error: polErr } = await supabase
    .from("prodej_polozky")
    .insert(polozky.map((x) => ({ prodej_id: prodejRow.id, nakup_id: x.nakup_id, cena: x.cena })));
  if (polErr) {
    // bez položek by zůstala prázdná objednávka — raději ji hned smažeme
    await supabase.from("prodej").delete().eq("id", prodejRow.id);
    throw polErr;
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

  await logChange(
    "prodej",
    prodejRow.id,
    `${orderNumber(prodejRow.id)} ${prodejRow.polozka}`,
    `Objednávka vytvořena (${polozky.length} ks, ${formatKc(prodejRow.cena)}, klient ${prodejRow.klient_jmeno})`
  );
  return prodejRow;
}

// Souhrnný název a cena objednávky se drží i v tabulce prodej (hledání, seznamy).
async function recalcProdej(prodejId: number): Promise<void> {
  const { data } = await supabase.from("prodej_polozky").select("cena, nakup:nakup_id(co_koupili)").eq("prodej_id", prodejId);
  const rows = (data ?? []) as unknown as { cena: number; nakup: { co_koupili: string } | { co_koupili: string }[] | null }[];
  if (!rows.length) return;
  const nameOf = (n: { co_koupili: string } | { co_koupili: string }[] | null) => (Array.isArray(n) ? n[0]?.co_koupili : n?.co_koupili) ?? "?";
  await supabase
    .from("prodej")
    .update({ polozka: summaryName(rows.map((r) => nameOf(r.nakup))), cena: sum(rows.map((r) => r.cena)) })
    .eq("id", prodejId);
}

async function orderLabel(prodejId: number): Promise<string> {
  const { data } = await supabase.from("prodej").select("polozka").eq("id", prodejId).single();
  return `${orderNumber(prodejId)} ${(data as { polozka: string } | null)?.polozka ?? ""}`.trim();
}

export async function addProdejPolozka(prodejId: number, nakupId: number, cena: number): Promise<void> {
  const { error } = await supabase.from("prodej_polozky").insert({ prodej_id: prodejId, nakup_id: nakupId, cena });
  if (error) throw error;
  await recalcProdej(prodejId);
  const { data: n } = await supabase.from("nakup").select("co_koupili").eq("id", nakupId).single();
  await logChange("prodej", prodejId, await orderLabel(prodejId), `Přidána položka ${(n as { co_koupili: string } | null)?.co_koupili ?? ""} (${formatKc(cena)})`);
}

export async function updateProdejPolozka(id: number, cena: number): Promise<void> {
  const { data: before } = await supabase.from("prodej_polozky").select("*, nakup:nakup_id(co_koupili)").eq("id", id).single();
  const { error } = await supabase.from("prodej_polozky").update({ cena }).eq("id", id);
  if (error) throw error;
  const b = before as unknown as (ProdejPolozka & { nakup: { co_koupili: string } | { co_koupili: string }[] | null }) | null;
  if (b) {
    await recalcProdej(b.prodej_id);
    if (b.cena !== cena) {
      const name = (Array.isArray(b.nakup) ? b.nakup[0]?.co_koupili : b.nakup?.co_koupili) ?? "";
      await logChange("prodej", b.prodej_id, await orderLabel(b.prodej_id), `Cena položky ${name}: ${formatKc(b.cena)} → ${formatKc(cena)}`);
    }
  }
}

export async function deleteProdejPolozka(id: number): Promise<void> {
  const { data: before } = await supabase.from("prodej_polozky").select("*, nakup:nakup_id(co_koupili)").eq("id", id).single();
  const { error } = await supabase.from("prodej_polozky").delete().eq("id", id);
  if (error) throw error;
  const b = before as unknown as (ProdejPolozka & { nakup: { co_koupili: string } | { co_koupili: string }[] | null }) | null;
  if (b) {
    await recalcProdej(b.prodej_id);
    const name = (Array.isArray(b.nakup) ? b.nakup[0]?.co_koupili : b.nakup?.co_koupili) ?? "";
    await logChange("prodej", b.prodej_id, await orderLabel(b.prodej_id), `Položka ${name} odebrána z objednávky — vrací se do Nákupu`);
  }
}

export async function setProdejStav(id: number, stav: ProdejStav): Promise<void> {
  const { data: before } = await supabase.from("prodej").select("stav, polozka").eq("id", id).single();
  const b = before as { stav: ProdejStav; polozka: string } | null;
  const label = b ? `${orderNumber(id)} ${b.polozka}` : `#${id}`;
  if (stav === "storno") {
    // Deleting the prodej row (cascades to položky, doplňky and the linked
    // doplňky sales log) brings the nakup items back into Nákup.
    const { error } = await supabase.from("prodej").delete().eq("id", id);
    if (error) throw error;
    await logChange("prodej", id, label, "Storno — položky vráceny do Nákupu, doplňky zpět na sklad");
    return;
  }
  const { error } = await supabase.from("prodej").update({ stav }).eq("id", id);
  if (error) throw error;
  if (b && b.stav !== stav) await logChange("prodej", id, label, `Stav: ${stavLabel(b.stav)} → ${stavLabel(stav)}`);
}

export async function updateProdej(
  id: number,
  fields: Partial<{
    klient_jmeno: string;
    klient_telefon: string | null;
    klient_email: string | null;
    klient_adresa: string | null;
    datum: string | null;
    dopravce: string | null;
    cislo_zasilky: string | null;
    duvod_vraceni: string | null;
    balne: number;
    postovne: number;
  }>
): Promise<void> {
  const { data: before } = await supabase.from("prodej").select("*").eq("id", id).single();
  const { error } = await supabase.from("prodej").update(fields).eq("id", id);
  if (error) throw error;
  if (before) {
    const lines = diffLines(before, fields, PRODEJ_LABELS);
    if (lines.length) await logChange("prodej", id, `${orderNumber(id)} ${(before as Prodej).polozka}`, `Upraveno — ${lines.join("; ")}`);
  }
}

// Smazání objednávky (položky, doplňky i jejich zápis v logu skladu se smažou
// kaskádou). Nákupní položky se vrátí zpět do Nákupu — stejně jako při stornu.
export async function deleteProdej(id: number): Promise<void> {
  const { data: row } = await supabase.from("prodej").select("polozka").eq("id", id).single();
  const { error } = await supabase.from("prodej").delete().eq("id", id);
  if (error) throw error;
  await logChange(
    "prodej",
    id,
    `${orderNumber(id)} ${(row as { polozka: string } | null)?.polozka ?? ""}`.trim(),
    "Objednávka smazána — položky vráceny do Nákupu, doplňky zpět na sklad"
  );
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
