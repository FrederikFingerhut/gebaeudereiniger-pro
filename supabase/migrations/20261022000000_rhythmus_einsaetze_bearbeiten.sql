-- Wiederkehrende Einsätze im Rhythmus „alle N Wochen“ (z. B. alle zwei Wochen).
-- Gezählt wird ab der Woche von valid_from: diese Woche ist immer dabei.
alter table visit_series
  add column interval_weeks smallint not null default 1 check (interval_weeks between 1 and 4);

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
      -- Nur jede N-te Woche, gezählt ab der Woche des Startdatums.
      and ((d::date - date_trunc('week', s.valid_from)::date) / 7) % s.interval_weeks = 0
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

-- Mitarbeiter erfahren auch von geänderten Serien, mit Rhythmus.
create or replace function notify_series() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.valid_until is not null and new.valid_until < berlin_today() then
    return new;
  end if;
  perform notify_user(new.employee_id, 'series_new', jsonb_build_object(
    'site', (select name from sites where id = new.site_id), 'weekdays', to_jsonb(new.weekdays),
    'time', to_char(new.start_time, 'HH24:MI'), 'weeks', new.interval_weeks));
  return new;
end $$;

drop trigger visit_series_notify on visit_series;
create trigger visit_series_notify after insert or update of employee_id, weekdays, start_time, interval_weeks on visit_series
  for each row execute function notify_series();
