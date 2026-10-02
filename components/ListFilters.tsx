"use client";

import type { Profile } from "@/lib/database.types";

export interface Filters {
  q: string;
  status: string;
  from: string;
  to: string;
  author: string;
}

export const EMPTY_FILTERS: Filters = { q: "", status: "", from: "", to: "", author: "" };

export function filtersActive(f: Filters): boolean {
  return Boolean(f.q || f.status || f.from || f.to || f.author);
}

// Hledání nezávislé na velikosti písmen a diakritice ("novak" najde "Novák").
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function matchesText(f: Filters, ...fields: (string | null | undefined)[]): boolean {
  const q = normalize(f.q.trim());
  if (!q) return true;
  return fields.some((x) => x && normalize(x).includes(q));
}

export function matchesDate(dateStr: string | null | undefined, f: Filters): boolean {
  if (!f.from && !f.to) return true;
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (f.from && d < f.from) return false;
  if (f.to && d > f.to) return false;
  return true;
}

export function matchesAuthor(authorId: string | null, f: Filters): boolean {
  return !f.author || authorId === f.author;
}

export default function ListFilters({
  filters,
  onChange,
  profiles,
  searchPlaceholder,
  statusLabel,
  statusOptions,
  showDate = true,
  showAuthor = true,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  profiles: Profile[];
  searchPlaceholder: string;
  statusLabel?: string;
  statusOptions?: { key: string; label: string }[];
  showDate?: boolean;
  showAuthor?: boolean;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <div className="filter-bar">
      <div className="field filter-search">
        <label>Hledat</label>
        <input type="text" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder={searchPlaceholder} />
      </div>
      {statusOptions && (
        <div className="field">
          <label>{statusLabel ?? "Stav"}</label>
          <select value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Vše</option>
            {statusOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {showDate && (
        <>
          <div className="field">
            <label>Datum od</label>
            <input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div className="field">
            <label>Datum do</label>
            <input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
        </>
      )}
      {showAuthor && (
        <div className="field">
          <label>Zadal</label>
          <select value={filters.author} onChange={(e) => set({ author: e.target.value })}>
            <option value="">Všichni</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
      )}
      {filtersActive(filters) && (
        <button className="btn-secondary filter-reset" onClick={() => onChange(EMPTY_FILTERS)}>
          Zrušit filtry
        </button>
      )}
    </div>
  );
}
