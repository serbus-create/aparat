import type { NakupFase, ProdejStav } from "@/lib/database.types";

export const FEE_BALENE = 59;
export const FEE_POSTOVNE = 99;

export const NAKUP_PHASES: { key: NakupFase; label: string }[] = [
  { key: "nakoupeno", label: "Nakoupeno" },
  { key: "servisovano", label: "Servisováno" },
  { key: "pripraveno", label: "Připraveno k prodeji" },
  { key: "nefunkcni", label: "Nefunkční" },
];

// Průběh prodeje jako v e-shopu. Storno smaže prodej a vrátí položku do Nákupu.
export const PRODEJ_STATES: { key: ProdejStav; label: string }[] = [
  { key: "inzerovano", label: "Inzerováno" },
  { key: "zamluveno", label: "Zamluveno" },
  { key: "zaplaceno", label: "Zaplaceno" },
  { key: "k_odeslani", label: "K odeslání" },
  { key: "odeslano", label: "Odesláno" },
  { key: "doruceno", label: "Doručeno" },
  { key: "vraceno", label: "Vráceno" },
  { key: "reklamace", label: "Reklamace" },
  { key: "storno", label: "Storno" },
];

// Od těchto stavů už jsou peníze u nás, takže se prodej počítá do zisku.
export const PAID_STATES: ProdejStav[] = ["zaplaceno", "k_odeslani", "odeslano", "doruceno", "reklamace"];

// Stavy, ve kterých už se zásilka řeší (zobrazí se číslo zásilky a dopravce).
export const SHIPPING_STATES: ProdejStav[] = ["zaplaceno", "k_odeslani", "odeslano", "doruceno", "reklamace", "vraceno"];

// Stavy, ve kterých se eviduje důvod.
export const REASON_STATES: ProdejStav[] = ["vraceno", "reklamace"];

export const stavLabel = (key: string): string => PRODEJ_STATES.find((s) => s.key === key)?.label ?? key;
export const fazeLabel = (key: string): string => NAKUP_PHASES.find((p) => p.key === key)?.label ?? key;

export const DOPRAVCI: { key: string; label: string }[] = [
  { key: "zasilkovna", label: "Zásilkovna" },
  { key: "balikovna", label: "Balíkovna" },
  { key: "jiny", label: "Jiný" },
];

export const dopravceLabel = (key: string | null): string => DOPRAVCI.find((d) => d.key === key)?.label ?? "—";

// Odkaz na sledování zásilky (u "Jiný" dopravce odkaz neexistuje).
export function trackingUrl(dopravce: string | null, cislo: string | null): string | null {
  const id = cislo?.trim();
  if (!id) return null;
  if (dopravce === "zasilkovna") return `https://tracking.packeta.com/cs/?id=${encodeURIComponent(id)}`;
  if (dopravce === "balikovna") return `https://www.postaonline.cz/trackandtrace/-/zasilka/cislo?parcelNumbers=${encodeURIComponent(id)}`;
  return null;
}
