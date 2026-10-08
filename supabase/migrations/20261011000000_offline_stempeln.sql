-- Offline stempeln ---------------------------------------------------------------
-- Im Keller oder Treppenhaus fehlt oft das Netz. Die App merkt sich dann Zeit und
-- Standort und schickt das Stempeln nach, sobald wieder Empfang da ist. Die
-- Datenbank nimmt die nachgereichte Zeit an, wenn sie höchstens 12 Stunden alt ist,
-- und markiert den Eintrag, damit das Büro es sieht.

alter table time_entries
  add column clock_in_late boolean not null default false,
  add column clock_out_late boolean not null default false;

comment on column time_entries.clock_in_late is 'Einstempeln wurde ohne Netz erfasst und später gesendet';
comment on column time_entries.clock_out_late is 'Ausstempeln wurde ohne Netz erfasst und später gesendet';

-- Prüft eine nachgereichte Zeit: nicht in der Zukunft, nicht älter als 12 Stunden.
create function checked_time(p_at timestamptz) returns timestamptz
  language plpgsql stable as $$
begin
  if p_at is null then
    return now();
  end if;
  if p_at > now() + interval '2 minutes' or p_at < now() - interval '12 hours' then
    raise exception 'zeit_ungueltig';
  end if;
  return least(p_at, now());
end $$;

drop function clock_in(uuid, double precision, double precision, text);
drop function clock_out(uuid);

create function clock_in(
  p_visit_id uuid,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_token text default null,
  p_at timestamptz default null
) returns time_entries
  language plpgsql security definer set search_path = public as $$
declare
  v visits;
  s sites;
  m clock_method;
  dist double precision;
  t_at timestamptz := checked_time(p_at);
  day date := (t_at at time zone 'Europe/Berlin')::date;
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
  if v.date not in (day, day - 1) then
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

  insert into time_entries (company_id, visit_id, employee_id, method, clock_in_latitude, clock_in_longitude, clock_in_at, clock_in_late)
    values (v.company_id, v.id, auth.uid(), m, p_latitude, p_longitude, t_at, p_at is not null and t_at < now() - interval '2 minutes')
    returning * into entry;
  update visits set status = 'laeuft' where id = v.id;
  return entry;
end $$;

create function clock_out(p_entry_id uuid, p_at timestamptz default null) returns time_entries
  language plpgsql security definer set search_path = public as $$
declare
  t_at timestamptz := checked_time(p_at);
  entry time_entries;
begin
  select * into entry from time_entries
    where id = p_entry_id and employee_id = auth.uid() and clock_out_at is null;
  if not found then
    raise exception 'nicht_eingestempelt';
  end if;
  -- Ausstempeln liegt immer mindestens eine Minute nach dem Einstempeln.
  t_at := greatest(t_at, entry.clock_in_at + interval '1 minute');
  update time_entries
    set clock_out_at = t_at, clock_out_late = p_at is not null and t_at < now() - interval '2 minutes'
    where id = entry.id
    returning * into entry;
  if entry.visit_id is not null then
    update visits set status = 'erledigt' where id = entry.visit_id;
  end if;
  return entry;
end $$;

revoke execute on function clock_in(uuid, double precision, double precision, text, timestamptz) from public;
revoke execute on function clock_out(uuid, timestamptz) from public;
grant execute on function clock_in(uuid, double precision, double precision, text, timestamptz) to authenticated;
grant execute on function clock_out(uuid, timestamptz) to authenticated;
