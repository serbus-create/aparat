-- APARAT — migrace 01: e-shopové stavy prodeje, zásilky, vrácení, historie změn
-- Spusť v Supabase: Dashboard → SQL Editor → New query → vložit a spustit.
-- Skript je bezpečné pustit opakovaně.

-- 1) Nové stavy prodeje (staré hodnoty se převedou: prodano → zaplaceno, pripraveno → inzerovano)
alter table prodej drop constraint if exists prodej_stav_check;
update prodej set stav = 'zaplaceno'  where stav = 'prodano';
update prodej set stav = 'inzerovano' where stav = 'pripraveno';
alter table prodej add constraint prodej_stav_check
  check (stav in ('inzerovano','zamluveno','zaplaceno','k_odeslani','odeslano','doruceno','vraceno','reklamace','storno'));
alter table prodej alter column stav set default 'inzerovano';

-- 2) Zásilka a důvod vrácení / reklamace
alter table prodej
  add column if not exists dopravce text,
  add column if not exists cislo_zasilky text,
  add column if not exists duvod_vraceni text;

-- 3) Doplňky vázané na prodej: smazáním prodeje se zápis v logu skladu smaže a zboží je zpět na skladě
alter table doplnky_prodej
  add column if not exists prodej_id bigint references prodej(id) on delete cascade;

-- 4) Historie změn (kdo a kdy změnil stav, cenu…)
create table if not exists historie (
  id bigint generated always as identity primary key,
  entita text not null check (entita in ('nakup','prodej','doplnky_nakup','doplnky_prodej')),
  zaznam_id bigint,
  nazev text not null,
  popis text not null,
  autor_id uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists historie_zaznam_idx on historie (entita, zaznam_id, created_at desc);

alter table historie enable row level security;
drop policy if exists "Přihlášení uživatelé vidí historii" on historie;
create policy "Přihlášení uživatelé vidí historii" on historie
  for all using (auth.uid() is not null);
