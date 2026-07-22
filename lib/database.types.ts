export type NakupFase = "nakoupeno" | "servisovano" | "pripraveno";
export type ProdejStav = "pripraveno" | "inzerovano" | "zamluveno" | "prodano" | "storno";

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
  stav: ProdejStav;
  autor_id: string | null;
  invoice_number: string | null;
  invoice_vs: string | null;
  invoice_date_issue: string | null;
  invoice_date_due: string | null;
  created_at: string;
}

export interface ProdejOprava {
  id: number;
  prodej_id: number;
  popis: string;
  cena: number;
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
