export type NakupFase = "nakoupeno" | "servisovano" | "pripraveno" | "nefunkcni";
export type ProdejStav =
  | "inzerovano"
  | "zamluveno"
  | "zaplaceno"
  | "k_odeslani"
  | "odeslano"
  | "doruceno"
  | "vraceno"
  | "reklamace"
  | "storno";

export type HistorieEntita = "nakup" | "prodej" | "doplnky_nakup" | "doplnky_prodej";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
}

export interface Nakup {
  id: number;
  dodavatel_jmeno: string;
  dodavatel_telefon: string | null;
  dodavatel_email: string | null;
  datum: string | null;
  co_koupili: string;
  kolik_stalo: number;
  fase: NakupFase;
  autor_id: string | null;
  created_at: string;
}

export interface Prodej {
  id: number;
  nakup_id: number | null;
  klient_jmeno: string;
  klient_telefon: string | null;
  klient_email: string | null;
  klient_adresa: string | null;
  polozka: string;
  cena: number;
  datum: string | null;
  stav: ProdejStav;
  autor_id: string | null;
  invoice_number: string | null;
  invoice_vs: string | null;
  invoice_date_issue: string | null;
  invoice_date_due: string | null;
  dopravce: string | null;
  cislo_zasilky: string | null;
  duvod_vraceni: string | null;
  balne: number;
  postovne: number;
  created_at: string;
}

export interface NakupPoznamka {
  id: number;
  nakup_id: number;
  text: string;
  autor_id: string | null;
  created_at: string;
}

export interface ProdejDoplnek {
  id: number;
  prodej_id: number;
  polozka: string;
  pocet_ks: number;
  cena: number;
}

export interface DoplnkyNakup {
  id: number;
  polozka: string;
  pocet_ks: number;
  cena_celkem: number;
  autor_id: string | null;
  created_at: string;
}

export interface DoplnkyProdej {
  id: number;
  prodej_id: number | null;
  polozka: string;
  pocet_ks: number;
  cena_celkem: number;
  autor_id: string | null;
  created_at: string;
}

export interface DoplnkyCena {
  polozka: string;
  cena_za_ks: number;
}

export interface Historie {
  id: number;
  entita: HistorieEntita;
  zaznam_id: number | null;
  nazev: string;
  popis: string;
  autor_id: string | null;
  created_at: string;
}

export type DilnaTyp = "prislusenstvi" | "servis" | "jine";

// Náklad na položku v dílně (příslušenství, servis…).
export interface DilnaNaklad {
  id: number;
  nakup_id: number;
  typ: DilnaTyp;
  popis: string;
  cena: number;
  datum: string | null;
  dorazilo: boolean;
  autor_id: string | null;
  created_at: string;
}

// Jedna položka (foťák, repráky…) v objednávce zákazníka.
export interface ProdejPolozka {
  id: number;
  prodej_id: number;
  nakup_id: number;
  cena: number;
}
