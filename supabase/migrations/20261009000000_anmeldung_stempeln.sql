-- Stufe 1, Teil 2: Anmeldung, echtes Stempeln am Objekt, Einsätze aus Serien.
--
-- Stempeln läuft nur noch über die Funktionen clock_in/clock_out. Die prüfen,
-- ob der Mitarbeiter wirklich am Objekt ist (GPS im Umkreis oder QR-Code des
-- Objekts). Direktes Schreiben in time_entries ist für Mitarbeiter gesperrt.
--
-- Fehler werfen kurze Schlüssel (z. B. 'nicht_am_objekt'), die Apps übersetzen
-- sie in die Sprache des Mitarbeiters.

-- QR-Code-Schlüssel aus den Objekten herauslösen ------------------------------
-- Mitarbeiter dürfen Objekte lesen. Läge der Schlüssel dort, könnte man ihn
-- abfragen und von zu Hause stempeln. Deshalb eigene Tabelle nur für die Leitung.

create table site_clock_tokens (
  site_id uuid primary key references sites (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(12), 'hex')
);
insert into site_clock_tokens (site_id, company_id, token) select id, company_id, clock_token from sites;
alter table sites drop column clock_token;

alter table site_clock_tokens enable row level security;
create policy "Leitung verwaltet QR-Codes" on site_clock_tokens for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager());

-- Jedes neue Objekt bekommt automatisch einen QR-Schlüssel.
create function create_site_clock_token() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into site_clock_tokens (site_id, company_id) values (new.id, new.company_id);
  return new;
end $$;
create trigger sites_clock_token after insert on sites
  for each row execute function create_site_clock_token();

-- Mitarbeiter stempeln nur noch über clock_in/clock_out ------------------------

drop policy "Mitarbeiter stempeln ein" on time_entries;
drop policy "Mitarbeiter stempeln aus" on time_entries;

-- Höchstens ein offener Zeiteintrag pro Mitarbeiter.
create unique index time_entries_one_open on time_entries (employee_id) where clock_out_at is null;

-- Entfernung zweier Punkte in Metern (Haversine).
create function distance_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
  returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
$$;

create function clock_in(
  p_visit_id uuid,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_token text default null
) returns time_entries
  language plpgsql security definer set search_path = public as $$
declare
  v visits;
  s sites;
  m clock_method;
  dist double precision;
  today date := (now() at time zone 'Europe/Berlin')::date;
  entry time_entries;
begin
  select * into v from visits
    where id = p_visit_id and employee_id = auth.uid() and company_id = current_company_id();
  if not found then
    raise exception 'einsatz_unbekannt';
  end if;
  if v.status in ('erledigt', 'ausgefallen') then
    raise exception 'einsatz_abgeschlossen';
  end if;
  -- Nachtschichten: Einsatz von gestern darf noch begonnen werden.
  if v.date not in (today, today - 1) then
    raise exception 'falscher_tag';
  end if;
  if exists (select 1 from time_entries where employee_id = auth.uid() and clock_out_at is null) then
    raise exception 'schon_eingestempelt';
  end if;

  select * into s from sites where id = v.site_id;

  if p_token is not null then
    if not exists (select 1 from site_clock_tokens where site_id = s.id and token = p_token) then
      raise exception 'qr_falsch';
    end if;
    m := 'qr';
  elsif p_latitude is not null and p_longitude is not null then
    if s.latitude is null or s.longitude is null then
      raise exception 'kein_standort';
    end if;
    dist := distance_m(p_latitude, p_longitude, s.latitude, s.longitude);
    if dist > s.geofence_radius_m then
      raise exception 'nicht_am_objekt' using detail = round(dist)::text;
    end if;
    m := 'gps';
  else
    raise exception 'standort_fehlt';
  end if;

  insert into time_entries (company_id, visit_id, employee_id, method, clock_in_latitude, clock_in_longitude)
    values (v.company_id, v.id, auth.uid(), m, p_latitude, p_longitude)
    returning * into entry;
  update visits set status = 'laeuft' where id = v.id;
  return entry;
end $$;

create function clock_out(p_entry_id uuid) returns time_entries
  language plpgsql security definer set search_path = public as $$
declare
  entry time_entries;
begin
  update time_entries set clock_out_at = now()
    where id = p_entry_id and employee_id = auth.uid() and clock_out_at is null
    returning * into entry;
  if not found then
    raise exception 'nicht_eingestempelt';
  end if;
  if entry.visit_id is not null then
    update visits set status = 'erledigt' where id = entry.visit_id;
  end if;
  return entry;
end $$;

-- Firma anlegen (Registrierung des Chefs) -------------------------------------

create function create_company(p_company_name text, p_full_name text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'nicht_angemeldet';
  end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'schon_in_firma';
  end if;
  if coalesce(trim(p_company_name), '') = '' or coalesce(trim(p_full_name), '') = '' then
    raise exception 'name_fehlt';
  end if;
  insert into companies (name) values (trim(p_company_name)) returning id into new_id;
  insert into profiles (id, company_id, full_name, role) values (auth.uid(), new_id, trim(p_full_name), 'chef');
  return new_id;
end $$;

-- Einsätze aus Serien erzeugen -------------------------------------------------
-- Legt für die eigene Firma die konkreten Einsätze im Zeitraum an. Kann beliebig
-- oft laufen (vorhandene werden übersprungen). Büro-Web und App rufen sie auf.

create function ensure_visits(p_from date, p_to date) returns integer
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
  on conflict (series_id, date) do nothing;
  get diagnostics added = row_count;
  return added;
end $$;

-- Nur angemeldete Nutzer dürfen die Funktionen aufrufen.
revoke execute on function clock_in(uuid, double precision, double precision, text) from public;
revoke execute on function clock_out(uuid) from public;
revoke execute on function create_company(text, text) from public;
revoke execute on function ensure_visits(date, date) from public;
grant execute on function clock_in(uuid, double precision, double precision, text) to authenticated;
grant execute on function clock_out(uuid) to authenticated;
grant execute on function create_company(text, text) to authenticated;
grant execute on function ensure_visits(date, date) to authenticated;
