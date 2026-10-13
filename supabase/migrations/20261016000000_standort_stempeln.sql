-- Einstempeln per Standort robuster machen:
-- 1. Die Ungenauigkeit des Handy-GPS (in Gebäuden oft 50–150 m) wird bis 150 m mitgerechnet.
-- 2. Klappt es trotzdem nicht (z. B. falsch hinterlegter Standort), darf der Mitarbeiter
--    „trotzdem einstempeln“. Der Eintrag wird markiert, das Büro prüft ihn und kann den
--    Standort des Mitarbeiters als Objekt-Standort übernehmen.

alter table time_entries
  add column clock_in_distance_m integer,
  add column off_site boolean not null default false,
  add column off_site_checked boolean not null default false;

comment on column time_entries.off_site is 'Eingestempelt, obwohl der Standort nicht zum Objekt passte (oder keiner vorlag)';
comment on column time_entries.off_site_checked is 'Büro hat den Eintrag geprüft';

drop function clock_in(uuid, double precision, double precision, text, timestamptz);

create function clock_in(
  p_visit_id uuid,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_token text default null,
  p_at timestamptz default null,
  p_accuracy double precision default null,
  p_force boolean default false
) returns time_entries
  language plpgsql security definer set search_path = public as $$
declare
  v visits;
  s sites;
  m clock_method;
  dist double precision;
  away boolean := false;
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
    m := 'gps';
    if s.latitude is null or s.longitude is null then
      if not p_force then
        raise exception 'kein_standort';
      end if;
      away := true;
    else
      dist := distance_m(p_latitude, p_longitude, s.latitude, s.longitude);
      if dist > s.geofence_radius_m + least(greatest(coalesce(p_accuracy, 0), 0), 150) then
        if not p_force then
          raise exception 'nicht_am_objekt' using detail = round(dist)::text;
        end if;
        away := true;
      end if;
    end if;
  else
    raise exception 'standort_fehlt';
  end if;

  insert into time_entries (company_id, visit_id, employee_id, method, clock_in_latitude, clock_in_longitude,
                            clock_in_distance_m, off_site, clock_in_at, clock_in_late)
    values (v.company_id, v.id, auth.uid(), m, p_latitude, p_longitude,
            round(dist)::integer, away, t_at, p_at is not null and t_at < now() - interval '2 minutes')
    returning * into entry;
  update visits set status = 'laeuft' where id = v.id;
  if away then
    perform notify_office(v.company_id, 'clock_off_site',
      jsonb_build_object('name', (select full_name from profiles where id = auth.uid()), 'site', s.name), '/');
  end if;
  return entry;
end $$;

revoke execute on function clock_in(uuid, double precision, double precision, text, timestamptz, double precision, boolean) from public;
grant execute on function clock_in(uuid, double precision, double precision, text, timestamptz, double precision, boolean) to authenticated;
