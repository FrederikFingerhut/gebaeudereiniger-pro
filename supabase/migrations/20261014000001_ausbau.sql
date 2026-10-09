-- Kundenportal, Urlaub und Krankmeldung, Benachrichtigungen, Qualitätskontrolle ----------

-- Kundenportal ------------------------------------------------------------------------
-- Ein Kunden-Login ist ein Profil mit Rolle 'kunde' und Verweis auf den Kunden.
alter table profiles add column customer_id uuid references customers (id) on delete cascade;
alter table profiles add constraint profiles_kunde_hat_kunden
  check ((role = 'kunde') = (customer_id is not null));

create function is_customer() returns boolean
  language sql stable security definer set search_path = public
  as $$ select coalesce(current_app_role() = 'kunde', false) $$;

create function current_customer_id() returns uuid
  language sql stable security definer set search_path = public
  as $$ select customer_id from profiles where id = auth.uid() and role = 'kunde' $$;

-- Objekte des angemeldeten Kunden. security definer, damit sich die Regeln von
-- sites und visits nicht gegenseitig aufrufen.
create function customer_site_ids() returns setof uuid
  language sql stable security definer set search_path = public
  as $$ select id from sites where customer_id = current_customer_id() $$;

-- Kunden sehen von den Profilen nur sich selbst, keine Mitarbeiterdaten.
drop policy "Kollegen sehen" on profiles;
create policy "Kollegen sehen" on profiles for select
  using (company_id = current_company_id() and (not is_customer() or id = auth.uid()));

create or replace function protect_profile_fields() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id and not is_office()
     and (new.role is distinct from old.role or new.company_id is distinct from old.company_id
          or new.active is distinct from old.active or new.customer_id is distinct from old.customer_id) then
    raise exception 'Rolle, Firma und Status kann nur das Büro ändern';
  end if;
  return new;
end $$;

create policy "Kunden sehen sich als Kunde" on customers for select
  using (company_id = current_company_id() and id = current_customer_id());
create policy "Kunden sehen eigene Objekte" on sites for select
  using (company_id = current_company_id() and id in (select customer_site_ids()));
create policy "Kunden sehen Einsätze ihrer Objekte" on visits for select
  using (company_id = current_company_id() and site_id in (select customer_site_ids()));

-- Meldungen: Kunden melden nur Reklamationen zu eigenen Objekten.
drop policy "Mitarbeiter melden" on reports;
create policy "Mitarbeiter melden" on reports for insert
  with check (
    company_id = current_company_id()
    and author_id = auth.uid()
    -- nur eigene Fotos der eigenen Firma (wie bisher)
    and not exists (
      select 1 from unnest(photo_paths) as p(path)
      where p.path not like company_id::text || '/' || auth.uid()::text || '/%'
    )
    and (not is_customer() or (kind = 'reklamation' and site_id in (select customer_site_ids())))
  );

drop policy "Mitarbeiter melden sich krank" on absences;
create policy "Mitarbeiter melden sich krank" on absences for insert
  with check (company_id = current_company_id() and employee_id = auth.uid() and approved is null and not is_customer());

-- Qualitätskontrolle --------------------------------------------------------------------
create table inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  inspector_id uuid references profiles (id) on delete set null,
  date date not null default current_date,
  -- Bewertete Punkte: [{title, grade (1 = sehr gut … 5 = mangelhaft), note}]
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  note text,
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index inspections_site_date on inspections (site_id, date desc);

alter table inspections enable row level security;
create policy "Leitung prüft Qualität" on inspections for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager());
create policy "Kunden sehen Prüfberichte" on inspections for select
  using (company_id = current_company_id() and site_id in (select customer_site_ids()));

-- Fotos aus Prüfberichten dürfen Kunden des Objekts ansehen.
create policy "Kunden sehen Prüffotos" on storage.objects for select to authenticated
  using (
    bucket_id = 'fotos' and is_customer()
    and exists (select 1 from inspections i where i.site_id in (select customer_site_ids()) and storage.objects.name = any (i.photo_paths))
  );

-- Urlaub und Krankmeldung: Einsätze werden frei --------------------------------------------
-- Interne Änderungen (z. B. durch Abwesenheiten) setzen app.system, damit der
-- Schutz-Trigger sie zulässt und keine Benachrichtigung je Einsatz verschickt wird.
create or replace function protect_visit_fields() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.system', true), '') <> 'on' and not is_manager() and (
       new.site_id is distinct from old.site_id or new.employee_id is distinct from old.employee_id
       or new.date is distinct from old.date or new.start_time is distinct from old.start_time
       or new.planned_minutes is distinct from old.planned_minutes
       or new.company_id is distinct from old.company_id) then
    raise exception 'Nur das Büro kann Einsätze umplanen';
  end if;
  return new;
end $$;

-- Krank (auch unbestätigt) oder bestätigter Urlaub: geplante Einsätze im Zeitraum
-- verlieren den Mitarbeiter und stehen im Plan unter „Nicht besetzt“.
create function absence_frees_visits() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.approved is true or (new.kind = 'krank' and new.approved is null) then
    perform set_config('app.system', 'on', true);
    update visits set employee_id = null
      where employee_id = new.employee_id and date between new.date_from and new.date_to and status = 'geplant';
    perform set_config('app.system', 'off', true);
  end if;
  return new;
end $$;
create trigger absences_free_visits after insert or update of approved, date_from, date_to on absences
  for each row execute function absence_frees_visits();

-- Benachrichtigungen -------------------------------------------------------------------
-- Text entsteht erst beim Anzeigen (in der Sprache des Empfängers) aus kind und params.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  params jsonb not null default '{}'::jsonb,
  url text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);
create index notifications_user_created on notifications (user_id, created_at desc);

alter table notifications enable row level security;
create policy "eigene Benachrichtigungen lesen" on notifications for select using (user_id = auth.uid());
create policy "eigene Benachrichtigungen abhaken" on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Push-Anmeldungen der Geräte (Web Push). Speichern nur über save_push_subscription.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy "eigene Geräte sehen" on push_subscriptions for select using (user_id = auth.uid());
create policy "eigene Geräte abmelden" on push_subscriptions for delete using (user_id = auth.uid());

create function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if current_company_id() is null then
    raise exception 'nicht_angemeldet';
  end if;
  -- Ein Gerät gehört immer dem, der zuletzt darauf angemeldet war.
  delete from push_subscriptions where endpoint = p_endpoint;
  insert into push_subscriptions (company_id, user_id, endpoint, p256dh, auth)
    values (current_company_id(), auth.uid(), p_endpoint, p_p256dh, p_auth);
end $$;
revoke execute on function save_push_subscription(text, text, text) from public, anon;
grant execute on function save_push_subscription(text, text, text) to authenticated;

create function notify_user(p_user uuid, p_kind text, p_params jsonb, p_url text default null) returns void
  language sql security definer set search_path = public as $$
  insert into notifications (company_id, user_id, kind, params, url)
    select company_id, id, p_kind, p_params, p_url from profiles where id = p_user and active;
$$;

create function notify_office(p_company uuid, p_kind text, p_params jsonb, p_url text default null) returns void
  language sql security definer set search_path = public as $$
  insert into notifications (company_id, user_id, kind, params, url)
    select company_id, id, p_kind, p_params, p_url from profiles
    where company_id = p_company and role in ('buero', 'chef') and active;
$$;
revoke execute on function notify_user(uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function notify_office(uuid, text, jsonb, text) from public, anon, authenticated;

create function berlin_today() returns date
  language sql stable as $$ select (now() at time zone 'Europe/Berlin')::date $$;

create function visit_params(v visits) returns jsonb
  language sql stable security definer set search_path = public as $$
  select jsonb_build_object('site', (select name from sites where id = v.site_id), 'date', v.date, 'time', to_char(v.start_time, 'HH24:MI'))
$$;

-- Einsatz umgeplant: neuer und alter Mitarbeiter erfahren es.
create function notify_visit_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.system', true), '') = 'on' or new.status <> 'geplant' or new.date < berlin_today() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- Einsätze aus Serien entstehen automatisch; dafür gibt es die Serien-Nachricht.
    if new.series_id is null and new.employee_id is not null then
      perform notify_user(new.employee_id, 'visit_new', visit_params(new));
    end if;
  elsif new.employee_id is distinct from old.employee_id then
    if old.employee_id is not null then
      perform notify_user(old.employee_id, 'visit_removed', visit_params(old));
    end if;
    if new.employee_id is not null then
      perform notify_user(new.employee_id, 'visit_new', visit_params(new));
    end if;
  elsif new.employee_id is not null and (new.date <> old.date or new.start_time <> old.start_time) then
    perform notify_user(new.employee_id, 'visit_changed', visit_params(new) || jsonb_build_object('oldDate', old.date));
  end if;
  return new;
end $$;
create trigger visits_notify after insert or update of employee_id, date, start_time on visits
  for each row execute function notify_visit_change();

create function notify_series() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform notify_user(new.employee_id, 'series_new', jsonb_build_object(
    'site', (select name from sites where id = new.site_id), 'weekdays', to_jsonb(new.weekdays), 'time', to_char(new.start_time, 'HH24:MI')));
  return new;
end $$;
create trigger visit_series_notify after insert on visit_series
  for each row execute function notify_series();

create function notify_report() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform notify_office(new.company_id, case when new.kind = 'reklamation' then 'complaint_new' else 'report_new' end,
    jsonb_build_object(
      'site', (select name from sites where id = new.site_id),
      'name', (select full_name from profiles where id = new.author_id),
      'text', left(new.text, 140)),
    '/');
  return new;
end $$;
create trigger reports_notify after insert on reports
  for each row execute function notify_report();

create function notify_absence() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  params jsonb := jsonb_build_object('kind', new.kind, 'from', new.date_from, 'to', new.date_to,
    'name', (select full_name from profiles where id = new.employee_id));
begin
  if tg_op = 'INSERT' then
    perform notify_office(new.company_id, 'absence_new', params, '/mitarbeiter');
  elsif old.approved is null and new.approved is not null then
    perform notify_user(new.employee_id, case when new.approved then 'absence_ok' else 'absence_no' end, params);
  end if;
  return new;
end $$;
create trigger absences_notify after insert or update of approved on absences
  for each row execute function notify_absence();

-- Jede neue Benachrichtigung geht sofort an die Push-Funktion (falls pg_net da ist).
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net nicht verfügbar, Push nur in der App';
end $$;

create function dispatch_push() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post') then
    execute 'select net.http_post(url := $1, body := $2)'
      using 'https://yvwykodhkkyyizajauln.supabase.co/functions/v1/push', jsonb_build_object('id', new.id);
  end if;
  return new;
end $$;
create trigger notifications_push after insert on notifications
  for each row execute function dispatch_push();

revoke execute on function absence_frees_visits() from public, anon, authenticated;
