-- Kalkulation und Richtpreise ------------------------------------------------------
-- Beides sind Preise und damit nur für Büro und Chef sichtbar.

-- Standardwerte des Kalkulationsrechners, eine Zeile pro Firma.
create table calc_settings (
  company_id uuid primary key references companies (id) on delete cascade,
  wage_cents integer not null default 1500 check (wage_cents >= 0),
  ancillary_percent numeric(5, 1) not null default 80 check (ancillary_percent >= 0),
  material_percent numeric(5, 1) not null default 5 check (material_percent >= 0),
  overhead_percent numeric(5, 1) not null default 12 check (overhead_percent >= 0),
  profit_percent numeric(5, 1) not null default 8 check (profit_percent >= 0),
  updated_at timestamptz not null default now()
);

create type price_unit as enum ('m2', 'stunde', 'einsatz', 'monat', 'stueck');

-- Richtpreise: Orientierungswerte für Angebote, z. B. Glasreinigung pro m².
create table price_guides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  unit price_unit not null default 'm2',
  -- netto in Cent; bei m²-Preisen sind auch Bruchteile sinnvoll (0,35 €)
  price_cents integer not null check (price_cents >= 0),
  note text,
  created_at timestamptz not null default now()
);
create index price_guides_company on price_guides (company_id, title);

alter table calc_settings enable row level security;
alter table price_guides enable row level security;

create policy "Büro verwaltet Kalkulation" on calc_settings for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office());
create policy "Büro verwaltet Richtpreise" on price_guides for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office());
