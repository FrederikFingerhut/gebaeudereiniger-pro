-- Warnungen von selbst: Einsatz nicht gestempelt ------------------------------------------
-- Alle 15 Minuten prüft die Datenbank die Einsätze von heute. Ist ein Einsatz eine Stunde
-- nach Beginn noch nicht gestempelt, bekommt der Mitarbeiter eine Erinnerung und das Büro
-- eine Warnung (je Einsatz nur einmal). Verlust-Objekte und Überstunden zeigt das Büro-Web.

alter table visits add column not_clocked_warned_at timestamptz;

create function warn_unclocked_visits() returns integer
  language plpgsql security definer set search_path = public as $$
declare
  v visits;
  n integer := 0;
  params jsonb;
begin
  for v in
    update visits set not_clocked_warned_at = now()
    where status = 'geplant' and employee_id is not null and not_clocked_warned_at is null
      and date = berlin_today()
      and (date + start_time + interval '60 minutes') <= (now() at time zone 'Europe/Berlin')
      and not exists (select 1 from time_entries t where t.visit_id = visits.id)
    returning *
  loop
    params := visit_params(v) || jsonb_build_object('name', (select full_name from profiles where id = v.employee_id));
    perform notify_user(v.employee_id, 'clock_reminder', params);
    perform notify_office(v.company_id, 'visit_not_clocked', params, '/');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function warn_unclocked_visits() from public, anon, authenticated;

-- Zeitplan (pg_cron). Fehlt die Erweiterung (z. B. im lokalen Test), bleibt es bei der Anzeige im Büro-Web.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('warnungen-nicht-gestempelt', '*/15 * * * *', 'select public.warn_unclocked_visits()');
exception when others then
  raise notice 'pg_cron nicht verfügbar, keine automatischen Warnungen';
end $$;
