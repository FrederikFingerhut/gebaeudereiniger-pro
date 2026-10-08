-- Prüft die Zugriffsregeln: Firmen sind getrennt, Mitarbeiter sehen nur Eigenes
-- und keine Preise. Bricht mit Fehler ab, sobald eine Regel nicht greift.
\set ON_ERROR_STOP 1
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;

insert into companies (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'Firma A'),
  ('00000000-0000-0000-0000-00000000000b', 'Firma B');
insert into auth.users values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003');
insert into profiles (id, company_id, full_name, role, language) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Chef A', 'chef', 'de'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Oksana', 'mitarbeiter', 'uk'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'Chef B', 'chef', 'de');
insert into customers (id, company_id, name) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Praxis');
insert into sites (id, company_id, customer_id, name, address, latitude, longitude) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Praxis Dr. Meyer', 'Bahnhofstr. 8', 52.3759, 9.7320),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Lager', 'Hof 1', null, null),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Büro', 'Hof 2', null, null);
insert into site_billing values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'pauschale', 168000);
insert into visits (id, company_id, site_id, employee_id, date, start_time, planned_minutes) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', (now() at time zone 'Europe/Berlin')::date, '06:00', 90),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', (now() at time zone 'Europe/Berlin')::date, '12:00', 60);
update site_clock_tokens set token = 'qr-lager' where site_id = '30000000-0000-0000-0000-000000000002';

create function pg_temp.expect(label text, actual bigint, expected bigint) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FEHLGESCHLAGEN: % (erwartet %, war %)', label, expected, actual;
  end if;
  raise notice 'ok: %', label;
end $$;

set role authenticated;

-- Andere Firma sieht nichts
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select pg_temp.expect('Firma B sieht keine Objekte von A', (select count(*) from sites), 0);
select pg_temp.expect('Firma B sieht keine Mitarbeiter von A', (select count(*) from profiles where company_id <> current_company_id()), 0);

-- Mitarbeiterin
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect('Mitarbeiterin sieht nur Objekte mit eigenem Einsatz', (select count(*) from sites), 2);
select pg_temp.expect('Mitarbeiterin sieht keine Preise', (select count(*) from site_billing), 0);
select pg_temp.expect('Mitarbeiterin sieht keine Rechnungen', (select count(*) from invoices), 0);

select pg_temp.expect('Mitarbeiterin sieht keine QR-Schlüssel', (select count(*) from site_clock_tokens), 0);

create function pg_temp.expect_error(label text, statement text, expected text) returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'FEHLGESCHLAGEN: % (kein Fehler)', label;
exception when others then
  if sqlerrm like 'FEHLGESCHLAGEN%' then raise; end if;
  if sqlerrm <> expected then
    raise exception 'FEHLGESCHLAGEN: % (erwartet %, war %)', label, expected, sqlerrm;
  end if;
  raise notice 'ok: %', label;
end $$;

-- Stempeln nur am Objekt
select pg_temp.expect_error('Direkt in time_entries schreiben blockiert',
  $q$insert into time_entries (company_id, employee_id) values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002')$q$,
  'new row violates row-level security policy for table "time_entries"');
select pg_temp.expect_error('Einstempeln ohne Standort blockiert',
  $q$select clock_in('40000000-0000-0000-0000-000000000001')$q$, 'standort_fehlt');
select pg_temp.expect_error('Einstempeln 2 km entfernt blockiert',
  $q$select clock_in('40000000-0000-0000-0000-000000000001', 52.3940, 9.7320)$q$, 'nicht_am_objekt');
select pg_temp.expect_error('Falscher QR-Code blockiert',
  $q$select clock_in('40000000-0000-0000-0000-000000000002', p_token => 'falsch')$q$, 'qr_falsch');
select pg_temp.expect_error('Objekt ohne Standort braucht QR-Code',
  $q$select clock_in('40000000-0000-0000-0000-000000000002', 52.3759, 9.7320)$q$, 'kein_standort');
select pg_temp.expect('Einstempeln am Objekt klappt',
  (select count(*) from clock_in('40000000-0000-0000-0000-000000000001', 52.3762, 9.7318) where method = 'gps'), 1);
select pg_temp.expect('Einsatz läuft', (select count(*) from visits where status = 'laeuft'), 1);
select pg_temp.expect_error('Doppelt einstempeln blockiert',
  $q$select clock_in('40000000-0000-0000-0000-000000000002', p_token => 'qr-lager')$q$, 'schon_eingestempelt');

do $$ begin
  update visits set date = '2026-10-13';
  raise exception 'FEHLGESCHLAGEN: Mitarbeiterin konnte Einsatz umplanen';
exception when raise_exception then
  if sqlerrm like 'FEHLGESCHLAGEN%' then raise; end if;
  raise notice 'ok: Umplanen blockiert';
end $$;

do $$ begin
  update profiles set role = 'chef' where id = auth.uid();
  raise exception 'FEHLGESCHLAGEN: Mitarbeiterin konnte sich zum Chef machen';
exception when raise_exception then
  if sqlerrm like 'FEHLGESCHLAGEN%' then raise; end if;
  raise notice 'ok: eigene Rolle ändern blockiert';
end $$;

do $$ begin
  insert into time_entries (company_id, employee_id) values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001');
  raise exception 'FEHLGESCHLAGEN: Mitarbeiterin konnte für Kollegen stempeln';
exception when insufficient_privilege then
  raise notice 'ok: für Kollegen stempeln blockiert';
end $$;

update time_entries set clock_in_at = now() - interval '90 minutes';
select pg_temp.expect('Zeiten selbst ändern blockiert', (select count(*) from time_entries where clock_in_at < now() - interval '1 hour'), 0);
-- clock_out_at muss nach clock_in_at liegen; in einer Transaktion ist now() gleich.
reset role;
update time_entries set clock_in_at = now() - interval '90 minutes';
set role authenticated;
select pg_temp.expect('Ausstempeln klappt',
  (select count(*) from clock_out((select id from time_entries where clock_out_at is null))), 1);
select pg_temp.expect('Einsatz erledigt', (select count(*) from visits where status = 'erledigt'), 1);
select pg_temp.expect_error('Zweites Ausstempeln blockiert',
  $q$select clock_out((select id from time_entries limit 1))$q$, 'nicht_eingestempelt');
select pg_temp.expect('Einstempeln per QR-Code klappt',
  (select count(*) from clock_in('40000000-0000-0000-0000-000000000002', p_token => 'qr-lager') where method = 'qr'), 1);
select pg_temp.expect_error('Mitarbeiterin legt keine zweite Firma an',
  $q$select create_company('Neu', 'Oksana')$q$, 'schon_in_firma');

-- Chef der eigenen Firma
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Chef sieht alle Zeiten', (select count(*) from time_entries), 2);
select pg_temp.expect('Chef sieht QR-Schlüssel', (select count(*) from site_clock_tokens), 3);
insert into visit_series (company_id, site_id, employee_id, weekdays, start_time, planned_minutes, valid_from)
  values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '{1,3,5}', '08:00', 60, '2026-10-01');
insert into absences (company_id, employee_id, kind, date_from, date_to)
  values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'krank', '2026-10-14', '2026-10-14');
select pg_temp.expect('Serie erzeugt Einsätze (Mi krank fällt weg)', ensure_visits('2026-10-12', '2026-10-18'), 2);
select pg_temp.expect('Zweiter Lauf erzeugt nichts doppelt', ensure_visits('2026-10-12', '2026-10-18'), 0);
select pg_temp.expect('Chef sieht Preise', (select count(*) from site_billing), 1);
select pg_temp.expect('Chef sieht alle Objekte', (select count(*) from sites), 3);

-- Neuer Nutzer ohne Firma registriert seine Firma
reset role;
insert into auth.users values ('10000000-0000-0000-0000-000000000009');
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000009';
select create_company('Firma C', 'Chefin C');
select pg_temp.expect('Neuer Chef sieht nur seine neue Firma', (select count(*) from companies where name = 'Firma C'), 1);
select pg_temp.expect('Neuer Chef ist Chef', (select count(*) from profiles where id = auth.uid() and role = 'chef'), 1);

reset role;
