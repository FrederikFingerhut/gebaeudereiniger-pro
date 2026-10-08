-- Gebäudereiniger Pro: Grundgerüst der Datenbank (Stufe 1)
--
-- Mandantenfähig von Anfang an: jede Zeile gehört zu einer Firma (company_id).
-- Row Level Security sorgt dafür, dass jede Firma nur ihre eigenen Daten sieht
-- und Mitarbeiter nur ihre eigenen Einsätze.

create extension if not exists pgcrypto;

create type app_role as enum ('mitarbeiter', 'objektleiter', 'buero', 'chef');
create type visit_status as enum ('geplant', 'laeuft', 'erledigt', 'ausgefallen');
create type billing_mode as enum ('pauschale', 'pro_einsatz');
create type clock_method as enum ('gps', 'qr', 'nfc', 'manuell');
create type report_kind as enum ('problem', 'material', 'reklamation');
create type report_status as enum ('offen', 'erledigt');
create type absence_kind as enum ('krank', 'urlaub');
create type invoice_status as enum ('entwurf', 'uebergeben');

-- Firmen (Mandanten) ---------------------------------------------------------

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Ein Profil pro Login (auth.users), gehört zu genau einer Firma.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  full_name text not null,
  role app_role not null default 'mitarbeiter',
  language text not null default 'de' check (language in ('de', 'en', 'ru', 'uk')),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Hilfsfunktionen für die Zugriffsregeln. security definer, damit sie die
-- profiles-Tabelle lesen dürfen, ohne selbst an deren Regeln zu hängen.
create function current_company_id() returns uuid
  language sql stable security definer set search_path = public
  as $$ select company_id from profiles where id = auth.uid() $$;

create function current_app_role() returns app_role
  language sql stable security definer set search_path = public
  as $$ select role from profiles where id = auth.uid() $$;

-- Büro, Chef und Objektleiter verwalten die Firma; Mitarbeiter sehen nur Eigenes.
create function is_manager() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(current_app_role() in ('objektleiter', 'buero', 'chef'), false) $$;

create function is_office() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(current_app_role() in ('buero', 'chef'), false) $$;

-- Kunden und Objekte -----------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  address text,
  email text,
  phone text,
  lexoffice_contact_id text,
  created_at timestamptz not null default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete restrict,
  name text not null,
  address text not null,
  latitude double precision,
  longitude double precision,
  geofence_radius_m integer not null default 150,
  -- Wird als QR-Code/NFC-Aufkleber im Objekt angebracht.
  clock_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  access_notes text,
  contact text,
  special_notes text,
  planned_minutes integer not null default 60 check (planned_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Preise getrennt von den Objekten, damit Mitarbeiter sie nicht sehen.
create table site_billing (
  site_id uuid primary key references sites (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  billing_mode billing_mode not null default 'pauschale',
  -- Monatspauschale oder Preis pro Einsatz, netto in Cent
  price_cents integer not null default 0 check (price_cents >= 0)
);

-- Checkliste pro Objekt (Leistungsverzeichnis in kurz).
create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  position integer not null default 0,
  area text,
  -- Text je Sprache, z. B. {"de": "Böden wischen", "uk": "Помити підлогу"}
  title jsonb not null,
  active boolean not null default true
);

-- Einsatzplanung ---------------------------------------------------------------

create table visit_series (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  employee_id uuid not null references profiles (id) on delete cascade,
  weekdays smallint[] not null check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  start_time time not null,
  planned_minutes integer not null check (planned_minutes > 0),
  valid_from date not null,
  valid_until date,
  check (valid_until is null or valid_until >= valid_from)
);

create table visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  employee_id uuid references profiles (id) on delete set null,
  series_id uuid references visit_series (id) on delete set null,
  date date not null,
  start_time time not null,
  planned_minutes integer not null check (planned_minutes > 0),
  status visit_status not null default 'geplant',
  note text,
  unique (series_id, date)
);
create index visits_employee_date on visits (employee_id, date);
create index visits_company_date on visits (company_id, date);

-- Zeiterfassung ----------------------------------------------------------------

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  visit_id uuid references visits (id) on delete set null,
  employee_id uuid not null references profiles (id) on delete cascade,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  method clock_method not null default 'gps',
  clock_in_latitude double precision,
  clock_in_longitude double precision,
  -- Nachträgliche Korrekturen durch das Büro werden markiert.
  corrected_by uuid references profiles (id),
  check (clock_out_at is null or clock_out_at > clock_in_at)
);
create index time_entries_employee on time_entries (employee_id, clock_in_at);

create table checklist_checks (
  visit_id uuid not null references visits (id) on delete cascade,
  checklist_item_id uuid not null references checklist_items (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  checked_by uuid not null references profiles (id),
  checked_at timestamptz not null default now(),
  primary key (visit_id, checklist_item_id)
);

-- Meldungen und Abwesenheiten -------------------------------------------------

create table reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  site_id uuid references sites (id) on delete cascade,
  visit_id uuid references visits (id) on delete set null,
  author_id uuid not null references profiles (id),
  kind report_kind not null default 'problem',
  text text not null,
  -- Pfade im Supabase-Speicher (Bucket "fotos")
  photo_paths text[] not null default '{}',
  status report_status not null default 'offen',
  created_at timestamptz not null default now()
);

create table absences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  employee_id uuid not null references profiles (id) on delete cascade,
  kind absence_kind not null,
  date_from date not null,
  date_to date not null,
  note text,
  approved boolean,
  created_at timestamptz not null default now(),
  check (date_to >= date_from)
);

-- Rechnungen (werden an Lexoffice übergeben) ----------------------------------

create table extra_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  date date not null,
  description text not null,
  price_cents integer not null check (price_cents >= 0),
  invoice_id uuid
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete restrict,
  period date not null, -- erster Tag des Monats
  status invoice_status not null default 'entwurf',
  total_net_cents integer not null default 0,
  lexoffice_invoice_id text,
  handed_over_at timestamptz,
  created_at timestamptz not null default now(),
  unique (customer_id, period)
);

alter table extra_services
  add constraint extra_services_invoice_fk foreign key (invoice_id) references invoices (id) on delete set null;

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  position integer not null default 0,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price_cents integer not null
);

-- Zugriffsregeln (Row Level Security) -----------------------------------------

alter table companies enable row level security;
alter table profiles enable row level security;
alter table customers enable row level security;
alter table sites enable row level security;
alter table site_billing enable row level security;
alter table checklist_items enable row level security;
alter table visit_series enable row level security;
alter table visits enable row level security;
alter table time_entries enable row level security;
alter table checklist_checks enable row level security;
alter table reports enable row level security;
alter table absences enable row level security;
alter table extra_services enable row level security;
alter table invoices enable row level security;
alter table invoice_lines enable row level security;

create policy "eigene Firma lesen" on companies for select using (id = current_company_id());
create policy "Chef ändert Firma" on companies for update using (id = current_company_id() and current_app_role() = 'chef');

create policy "Kollegen sehen" on profiles for select using (company_id = current_company_id());
create policy "Büro verwaltet Mitarbeiter" on profiles for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office());
-- Rolle und Firma darf man nicht selbst ändern; das prüft der Trigger unten.
create policy "eigenes Profil ändern" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create function protect_profile_fields() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id and not is_office()
     and (new.role is distinct from old.role or new.company_id is distinct from old.company_id
          or new.active is distinct from old.active) then
    raise exception 'Rolle, Firma und Status kann nur das Büro ändern';
  end if;
  return new;
end $$;
create trigger profiles_protect before update on profiles
  for each row execute function protect_profile_fields();

-- Stammdaten: Leitung verwaltet, Mitarbeiter lesen nur Objekte mit eigenen Einsätzen.
create policy "Leitung verwaltet Kunden" on customers for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager());

create policy "Leitung verwaltet Objekte" on sites for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager());
create policy "Mitarbeiter sehen eigene Objekte" on sites for select
  using (company_id = current_company_id() and exists (
    select 1 from visits v where v.site_id = sites.id and v.employee_id = auth.uid()));

create policy "Leitung verwaltet Checklisten" on checklist_items for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager());
create policy "Mitarbeiter sehen Checklisten eigener Objekte" on checklist_items for select
  using (company_id = current_company_id() and exists (
    select 1 from visits v where v.site_id = checklist_items.site_id and v.employee_id = auth.uid()));

create policy "Leitung plant Serien" on visit_series for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager());

create policy "Leitung plant Einsätze" on visits for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager());
create policy "Mitarbeiter sehen eigene Einsätze" on visits for select
  using (company_id = current_company_id() and employee_id = auth.uid());
-- Status (läuft/erledigt) setzt die App beim Stempeln; andere Felder schützt der Trigger.
create policy "Mitarbeiter melden Status" on visits for update
  using (company_id = current_company_id() and employee_id = auth.uid())
  with check (company_id = current_company_id() and employee_id = auth.uid());

create function protect_visit_fields() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not is_manager() and (
       new.site_id is distinct from old.site_id or new.employee_id is distinct from old.employee_id
       or new.date is distinct from old.date or new.start_time is distinct from old.start_time
       or new.planned_minutes is distinct from old.planned_minutes
       or new.company_id is distinct from old.company_id) then
    raise exception 'Nur das Büro kann Einsätze umplanen';
  end if;
  return new;
end $$;
create trigger visits_protect before update on visits
  for each row execute function protect_visit_fields();

create policy "Leitung sieht und korrigiert Zeiten" on time_entries for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager());
create policy "Mitarbeiter sehen eigene Zeiten" on time_entries for select
  using (company_id = current_company_id() and employee_id = auth.uid());
create policy "Mitarbeiter stempeln ein" on time_entries for insert
  with check (company_id = current_company_id() and employee_id = auth.uid() and corrected_by is null);
-- Ausstempeln: nur offene eigene Einträge, und nur einmal.
create policy "Mitarbeiter stempeln aus" on time_entries for update
  using (company_id = current_company_id() and employee_id = auth.uid() and clock_out_at is null)
  with check (company_id = current_company_id() and employee_id = auth.uid() and corrected_by is null);

create policy "Leitung sieht Checklisten-Haken" on checklist_checks for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager());
create policy "Mitarbeiter haken eigene Einsätze ab" on checklist_checks for all
  using (company_id = current_company_id() and checked_by = auth.uid())
  with check (company_id = current_company_id() and checked_by = auth.uid() and exists (
    select 1 from visits v where v.id = checklist_checks.visit_id and v.employee_id = auth.uid()));

create policy "Leitung bearbeitet Meldungen" on reports for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager());
create policy "Mitarbeiter sehen eigene Meldungen" on reports for select
  using (company_id = current_company_id() and author_id = auth.uid());
create policy "Mitarbeiter melden" on reports for insert
  with check (company_id = current_company_id() and author_id = auth.uid());

create policy "Leitung verwaltet Abwesenheiten" on absences for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager());
create policy "Mitarbeiter sehen eigene Abwesenheiten" on absences for select
  using (company_id = current_company_id() and employee_id = auth.uid());
create policy "Mitarbeiter melden sich krank" on absences for insert
  with check (company_id = current_company_id() and employee_id = auth.uid() and approved is null);

-- Geld sehen nur Büro und Chef.
create policy "Büro verwaltet Preise" on site_billing for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office());
create policy "Büro verwaltet Sonderleistungen" on extra_services for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office());
create policy "Büro verwaltet Rechnungen" on invoices for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office());
create policy "Büro verwaltet Rechnungszeilen" on invoice_lines for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office());
