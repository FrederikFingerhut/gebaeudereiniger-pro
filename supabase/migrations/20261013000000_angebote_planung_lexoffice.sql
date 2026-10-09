-- Angebote, Verschieben im Einsatzplan, Lexoffice-Anbindung ------------------------

-- Briefkopf für Angebote: Anschrift und Kontakt der Firma.
alter table companies
  add column address text,
  add column phone text,
  add column email text;

-- Angebote an Kunden. Preise, also nur für Büro und Chef.
create table offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  number text not null,
  customer_id uuid references customers (id) on delete set null,
  -- Empfänger wie im Adressfeld, mehrzeilig
  recipient text not null check (length(trim(recipient)) > 0),
  title text not null,
  -- Positionen: [{description, quantity, unit, unitPriceCents}]
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  note text,
  valid_until date,
  created_at timestamptz not null default now(),
  unique (company_id, number)
);
create index offers_company_created on offers (company_id, created_at desc);

alter table offers enable row level security;
create policy "Büro verwaltet Angebote" on offers for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office());

-- Einsatzplan: verschobene Einsätze merken sich ihren ursprünglichen Tag,
-- damit ensure_visits dort keinen neuen Einsatz aus der Serie anlegt.
alter table visits add column moved_from date;

create or replace function ensure_visits(p_from date, p_to date) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  added integer;
begin
  if current_company_id() is null then
    raise exception 'nicht_angemeldet';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'zeitraum_ungueltig';
  end if;
  insert into visits (company_id, site_id, employee_id, series_id, date, start_time, planned_minutes)
    select s.company_id, s.site_id, s.employee_id, s.id, d::date, s.start_time, s.planned_minutes
    from visit_series s
    cross join generate_series(greatest(p_from, s.valid_from), least(p_to, coalesce(s.valid_until, p_to)), interval '1 day') d
    where s.company_id = current_company_id()
      and extract(isodow from d)::smallint = any (s.weekdays)
      -- Krank oder Urlaub (genehmigt oder noch offen): keinen Einsatz anlegen.
      and not exists (
        select 1 from absences a
        where a.employee_id = s.employee_id and d::date between a.date_from and a.date_to
          and a.approved is distinct from false)
      -- Einsatz wurde von diesem Tag weg verschoben.
      and not exists (
        select 1 from visits v where v.series_id = s.id and v.moved_from = d::date)
  on conflict (series_id, date) do nothing;
  get diagnostics added = row_count;
  return added;
end $$;

-- Lexoffice: API-Schlüssel pro Firma. Eigene Tabelle, damit er nie mit den
-- Firmendaten an Mitarbeiter geht. Nur Büro und Chef.
create table company_integrations (
  company_id uuid primary key references companies (id) on delete cascade,
  lexoffice_api_key text,
  updated_at timestamptz not null default now()
);

alter table company_integrations enable row level security;
create policy "Büro verwaltet Anbindungen" on company_integrations for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office());
