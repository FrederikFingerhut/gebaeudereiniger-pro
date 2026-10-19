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
  update visits set date = date + 7;
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
insert into visit_series (company_id, site_id, employee_id, weekdays, start_time, planned_minutes, valid_from, interval_weeks)
  values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '{2}', '07:15', 60, '2026-08-12', 2);
-- Zeitraum vor den anderen Serien, damit hier keine Einsätze für heute entstehen.
select ensure_visits('2026-08-10', '2026-09-13');
select pg_temp.expect('Alle zwei Wochen: nur jede zweite Woche ab Startwoche',
  (select count(*) from visits where site_id = '30000000-0000-0000-0000-000000000003' and start_time = '07:15' and date in ('2026-08-25', '2026-09-08')), 2);
select pg_temp.expect('Alle zwei Wochen: Zwischenwochen bleiben frei',
  (select count(*) from visits where site_id = '30000000-0000-0000-0000-000000000003' and start_time = '07:15'), 2);
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

-- Fotos bei Meldungen
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
insert into storage.objects (bucket_id, name)
  values ('fotos', '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000002/kaputt.jpg');
select pg_temp.expect_error('Foto in fremden Ordner blockiert',
  $q$insert into storage.objects (bucket_id, name) values ('fotos', '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000001/x.jpg')$q$,
  'new row violates row-level security policy for table "objects"');
select pg_temp.expect_error('Foto in fremde Firma blockiert',
  $q$insert into storage.objects (bucket_id, name) values ('fotos', '00000000-0000-0000-0000-00000000000b/10000000-0000-0000-0000-000000000002/x.jpg')$q$,
  'new row violates row-level security policy for table "objects"');
insert into reports (company_id, site_id, author_id, kind, text, photo_paths) values
  ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'material', 'Seife leer',
   '{00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000002/kaputt.jpg}');
select pg_temp.expect('Meldung mit eigenem Foto klappt', (select count(*) from reports where cardinality(photo_paths) = 1), 1);
select pg_temp.expect_error('Meldung mit fremdem Foto blockiert',
  $q$insert into reports (company_id, author_id, text, photo_paths) values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'x', '{00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000001/x.jpg}')$q$,
  'new row violates row-level security policy for table "reports"');

set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
insert into storage.objects (bucket_id, name)
  values ('fotos', '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000001/chef.jpg');
select pg_temp.expect('Chef sieht alle Fotos der Firma', (select count(*) from storage.objects), 2);

set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect('Mitarbeiterin sieht nur eigene Fotos', (select count(*) from storage.objects), 1);
delete from storage.objects;
reset role;
select pg_temp.expect('Mitarbeiterin löscht keine Fotos', (select count(*) from storage.objects), 2);
set role authenticated;

set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select pg_temp.expect('Firma B sieht keine Fotos von A', (select count(*) from storage.objects), 0);
reset role;

-- Offline stempeln: Zeit wird nachgereicht
insert into visits (id, company_id, site_id, employee_id, date, start_time, planned_minutes) values
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', ((now() - interval '3 hours') at time zone 'Europe/Berlin')::date, '18:00', 60);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect_error('Ausstempeln in der Zukunft blockiert',
  $q$select clock_out((select id from time_entries where clock_out_at is null), now() + interval '1 hour')$q$, 'zeit_ungueltig');
select pg_temp.expect_error('Ausstempeln vor 13 Stunden blockiert',
  $q$select clock_out((select id from time_entries where clock_out_at is null), now() - interval '13 hours')$q$, 'zeit_ungueltig');
select clock_out((select id from time_entries where clock_out_at is null));
select pg_temp.expect('Nachgereichtes Einstempeln wird markiert',
  (select count(*) from clock_in('40000000-0000-0000-0000-000000000003', 52.3762, 9.7318, p_at => now() - interval '3 hours')
   where clock_in_late and clock_in_at < now() - interval '2 hours'), 1);
select pg_temp.expect('Nachgereichtes Ausstempeln wird markiert',
  (select count(*) from clock_out((select id from time_entries where clock_out_at is null), now() - interval '1 hour')
   where clock_out_late and clock_out_at > clock_in_at), 1);
select pg_temp.expect('Normales Stempeln ist nicht markiert',
  (select count(*) from time_entries where method = 'qr' and not clock_in_late and not clock_out_late), 1);
reset role;

-- Kalkulation und Richtpreise: nur Büro und Chef
grant all on all tables in schema public to authenticated;
insert into price_guides (company_id, title, unit, price_cents) values
  ('00000000-0000-0000-0000-00000000000a', 'Glasreinigung', 'm2', 150),
  ('00000000-0000-0000-0000-00000000000b', 'Treppenhaus', 'einsatz', 4500);
insert into calc_settings (company_id) values ('00000000-0000-0000-0000-00000000000a');
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect('Mitarbeiterin sieht keine Richtpreise', (select count(*) from price_guides), 0);
select pg_temp.expect('Mitarbeiterin sieht keine Kalkulation', (select count(*) from calc_settings), 0);
select pg_temp.expect_error('Mitarbeiterin legt keine Richtpreise an',
  $q$insert into price_guides (company_id, title, price_cents) values ('00000000-0000-0000-0000-00000000000a', 'x', 1)$q$,
  'new row violates row-level security policy for table "price_guides"');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Chef sieht nur eigene Richtpreise', (select count(*) from price_guides), 1);
select pg_temp.expect('Chef sieht Kalkulation', (select count(*) from calc_settings), 1);
insert into price_guides (company_id, title, unit, price_cents) values ('00000000-0000-0000-0000-00000000000a', 'Grundreinigung', 'stunde', 3500);
select pg_temp.expect('Chef legt Richtpreis an', (select count(*) from price_guides), 2);
reset role;

-- Angebote und Lexoffice-Schlüssel: nur Büro und Chef
grant all on all tables in schema public to authenticated;
insert into offers (company_id, number, recipient, title) values
  ('00000000-0000-0000-0000-00000000000a', 'A-1', 'Kunde A', 'Unterhaltsreinigung'),
  ('00000000-0000-0000-0000-00000000000b', 'A-1', 'Kunde B', 'Glasreinigung');
insert into company_integrations (company_id, lexoffice_api_key) values
  ('00000000-0000-0000-0000-00000000000a', 'geheim-a'),
  ('00000000-0000-0000-0000-00000000000b', 'geheim-b');
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect('Mitarbeiterin sieht keine Angebote', (select count(*) from offers), 0);
select pg_temp.expect('Mitarbeiterin sieht keinen Lexoffice-Schlüssel', (select count(*) from company_integrations), 0);
select pg_temp.expect_error('Mitarbeiterin legt keine Angebote an',
  $q$insert into offers (company_id, number, recipient, title) values ('00000000-0000-0000-0000-00000000000a', 'A-2', 'x', 'x')$q$,
  'new row violates row-level security policy for table "offers"');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Chef sieht nur eigene Angebote', (select count(*) from offers), 1);
select pg_temp.expect('Chef sieht nur eigenen Schlüssel', (select count(*) from company_integrations where lexoffice_api_key = 'geheim-a'), 1);
select pg_temp.expect('Chef sieht keinen fremden Schlüssel', (select count(*) from company_integrations where lexoffice_api_key = 'geheim-b'), 0);
reset role;

-- Verschobener Serien-Einsatz wird nicht neu angelegt
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
update visits set moved_from = date, date = '2026-10-13'
  where series_id is not null and date = '2026-10-12';
select pg_temp.expect('Verschobener Einsatz kommt nicht doppelt', ensure_visits('2026-10-12', '2026-10-18'), 0);
select pg_temp.expect('Einsatz liegt am neuen Tag', (select count(*) from visits where series_id is not null and date = '2026-10-13'), 1);
reset role;

-- Kundenportal: Kunde sieht nur eigene Objekte, Einsätze und Prüfberichte
grant all on all tables in schema public to authenticated;
insert into customers (id, company_id, name) values
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Autohaus');
insert into sites (id, company_id, customer_id, name, address) values
  ('30000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002', 'Autohaus Halle', 'Ring 1');
insert into auth.users values ('10000000-0000-0000-0000-000000000005');
insert into profiles (id, company_id, full_name, role, customer_id) values
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'Frau Praxis', 'kunde', '20000000-0000-0000-0000-000000000001');
select pg_temp.expect_error('Kunden-Login braucht einen Kunden',
  $q$insert into profiles (id, company_id, full_name, role) values ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', 'x', 'kunde')$q$,
  'new row for relation "profiles" violates check constraint "profiles_kunde_hat_kunden"');
insert into inspections (company_id, site_id, items, photo_paths) values
  ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '[{"title":"Böden","grade":1}]', '{00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000001/pruef.jpg}'),
  ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000009', '[]', '{}');
insert into storage.objects (bucket_id, name) values ('fotos', '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000001/pruef.jpg');
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
select pg_temp.expect('Kunde sieht nur eigene Objekte', (select count(*) from sites), 3);
select pg_temp.expect('Kunde sieht kein fremdes Objekt', (select count(*) from sites where name = 'Autohaus Halle'), 0);
select pg_temp.expect('Kunde sieht Einsätze seiner Objekte', (select count(*) > 0 from visits)::int, 1);
select pg_temp.expect('Kunde sieht keine Mitarbeiterprofile', (select count(*) from profiles), 1);
select pg_temp.expect('Kunde sieht keine Preise', (select count(*) from site_billing), 0);
select pg_temp.expect('Kunde sieht keine Zeiten', (select count(*) from time_entries), 0);
select pg_temp.expect('Kunde sieht keine anderen Kunden', (select count(*) from customers), 1);
select pg_temp.expect('Kunde sieht eigenen Prüfbericht', (select count(*) from inspections), 1);
select pg_temp.expect('Kunde sieht Prüffoto', (select count(*) from storage.objects where name like '%pruef.jpg'), 1);
insert into reports (company_id, site_id, author_id, kind, text) values
  ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'reklamation', 'Mülleimer nicht geleert');
select pg_temp.expect('Kunde meldet Reklamation', (select count(*) from reports where kind = 'reklamation'), 1);
select pg_temp.expect_error('Kunde meldet nicht für fremdes Objekt',
  $q$insert into reports (company_id, site_id, author_id, kind, text) values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000005', 'reklamation', 'x')$q$,
  'new row violates row-level security policy for table "reports"');
select pg_temp.expect_error('Kunde meldet nur Reklamationen',
  $q$insert into reports (company_id, site_id, author_id, kind, text) values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'problem', 'x')$q$,
  'new row violates row-level security policy for table "reports"');
select pg_temp.expect_error('Kunde ändert seine Rolle nicht',
  $q$update profiles set role = 'chef', customer_id = null where id = '10000000-0000-0000-0000-000000000005'$q$,
  'Rolle, Firma und Status kann nur das Büro ändern');
reset role;

-- Benachrichtigungen: Reklamation landet beim Chef, nicht bei der Mitarbeiterin
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Chef bekommt Reklamation', (select count(*) from notifications where kind = 'complaint_new'), 1);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect('Mitarbeiterin sieht keine Büro-Nachrichten', (select count(*) from notifications where kind in ('complaint_new', 'report_new')), 0);
select pg_temp.expect_error('Benachrichtigungen nicht selbst erzeugen',
  $q$select notify_user('10000000-0000-0000-0000-000000000001', 'x', '{}')$q$,
  'permission denied for function notify_user');
select save_push_subscription('https://push.example/abc', 'p', 'a');
select pg_temp.expect('Gerät für Push angemeldet', (select count(*) from push_subscriptions), 1);
reset role;

-- Krankmeldung: geplante Einsätze werden frei, Büro und Mitarbeiterin werden informiert
insert into visits (id, company_id, site_id, employee_id, date, start_time, planned_minutes) values
  ('40000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', berlin_today() + 20, '07:00', 60);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
insert into absences (company_id, employee_id, kind, date_from, date_to)
  values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'krank', berlin_today() + 20, berlin_today() + 20);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Einsatz bei Krankheit frei', (select count(*) from visits where id = '40000000-0000-0000-0000-000000000009' and employee_id is null), 1);
select pg_temp.expect('Büro erfährt von Krankmeldung', (select count(*) from notifications where kind = 'absence_new' and params->>'from' = (berlin_today() + 20)::text), 1);
-- Chef gibt den Einsatz an jemand anderen: der bekommt eine Nachricht
update visits set employee_id = '10000000-0000-0000-0000-000000000001' where id = '40000000-0000-0000-0000-000000000009';
select pg_temp.expect('Neuer Mitarbeiter wird benachrichtigt', (select count(*) from notifications where kind = 'visit_new'), 1);
update absences set approved = true where employee_id = '10000000-0000-0000-0000-000000000002' and date_from = berlin_today() + 20;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect('Mitarbeiterin erfährt Bestätigung', (select count(*) from notifications where kind = 'absence_ok'), 1);
reset role;

-- Chat: Mitarbeiterin schreibt der Leitung, sieht nur ihr eigenes Gespräch
insert into auth.users values ('10000000-0000-0000-0000-000000000006');
insert into profiles (id, company_id, full_name, role, language) values
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', 'Pawel', 'mitarbeiter', 'ru');
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
insert into chat_messages (company_id, employee_id, author_id, body) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Schlüssel fehlt im Lager');
insert into chat_messages (company_id, employee_id, author_id, body) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Bin jetzt drin');
select pg_temp.expect_error('Mitarbeiterin schreibt nicht in fremdes Gespräch',
  $q$insert into chat_messages (company_id, employee_id, author_id, body) values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'x')$q$,
  'new row violates row-level security policy for table "chat_messages"');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Chef liest Chat', (select count(*) from chat_messages), 2);
select pg_temp.expect('Chef bekommt eine Chat-Benachrichtigung', (select count(*) from notifications where kind = 'chat'), 1);
insert into chat_messages (company_id, employee_id, author_id, body) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Danke, Hausmeister ist informiert');
insert into chat_reads (user_id, employee_id, company_id) values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect('Mitarbeiterin bekommt Antwort', (select count(*) from notifications where kind = 'chat'), 1);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000006';
select pg_temp.expect('Kollege sieht fremden Chat nicht', (select count(*) from chat_messages), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
select pg_temp.expect('Kunde sieht keinen Chat', (select count(*) from chat_messages), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select pg_temp.expect('Andere Firma sieht keinen Chat', (select count(*) from chat_messages), 0);
reset role;

-- Einstempeln per Standort: GPS-Ungenauigkeit zählt mit, „trotzdem einstempeln“ wird markiert
insert into visits (id, company_id, site_id, employee_id, date, start_time, planned_minutes) values
  ('40000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006', berlin_today(), '06:00', 60),
  ('40000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000006', berlin_today(), '09:00', 60);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000006';
select pg_temp.expect_error('200 m entfernt ohne Ungenauigkeit blockiert',
  $q$select clock_in('40000000-0000-0000-0000-000000000021', 52.3777, 9.7320)$q$, 'nicht_am_objekt');
select pg_temp.expect('200 m entfernt mit 80 m Ungenauigkeit erlaubt',
  (select count(*) from clock_in('40000000-0000-0000-0000-000000000021', 52.3777, 9.7320, p_accuracy => 80) where not off_site), 1);
select clock_out((select id from time_entries where employee_id = '10000000-0000-0000-0000-000000000006' and clock_out_at is null));
select pg_temp.expect('Trotzdem einstempeln wird markiert',
  (select count(*) from clock_in('40000000-0000-0000-0000-000000000022', 52.4000, 9.8000, p_force => true) where off_site), 1);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Büro erfährt vom Einstempeln außerhalb', (select count(*) from notifications where kind = 'clock_off_site'), 1);
reset role;

-- Arbeitszeitkonto und Lohnabrechnungen
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect_error('Mitarbeiterin ändert eigene Urlaubstage nicht',
  $q$update profiles set vacation_days = 60 where id = '10000000-0000-0000-0000-000000000002'$q$,
  'Rolle, Firma und Status kann nur das Büro ändern');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
update profiles set weekly_hours = 20, vacation_days = 28 where id = '10000000-0000-0000-0000-000000000002';
insert into storage.objects (bucket_id, name) values
  ('dokumente', '00000000-0000-0000-0000-00000000000a/lohn/10000000-0000-0000-0000-000000000002/2026-10.pdf'),
  ('dokumente', '00000000-0000-0000-0000-00000000000a/lohn/10000000-0000-0000-0000-000000000006/2026-10.pdf');
insert into payslips (company_id, employee_id, period, path) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', '2026-10-01', '00000000-0000-0000-0000-00000000000a/lohn/10000000-0000-0000-0000-000000000002/2026-10.pdf'),
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000006', '2026-10-01', '00000000-0000-0000-0000-00000000000a/lohn/10000000-0000-0000-0000-000000000006/2026-10.pdf');
select pg_temp.expect_error('Lohnabrechnung mit fremdem Pfad blockiert',
  $q$insert into payslips (company_id, employee_id, period, path) values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', '2026-09-01', '00000000-0000-0000-0000-00000000000b/lohn/x.pdf')$q$,
  'new row violates row-level security policy for table "payslips"');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect('Mitarbeiterin sieht nur eigene Lohnabrechnung', (select count(*) from payslips), 1);
select pg_temp.expect('Mitarbeiterin lädt nur eigene Lohnabrechnung', (select count(*) from storage.objects where bucket_id = 'dokumente'), 1);
select pg_temp.expect('Mitarbeiterin erfährt von Lohnabrechnung', (select count(*) from notifications where kind = 'payslip_new'), 1);
select pg_temp.expect_error('Mitarbeiterin lädt keine Dokumente hoch',
  $q$insert into storage.objects (bucket_id, name) values ('dokumente', '00000000-0000-0000-0000-00000000000a/lohn/10000000-0000-0000-0000-000000000002/x.pdf')$q$,
  'new row violates row-level security policy for table "objects"');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
select pg_temp.expect('Kunde sieht keine Lohnabrechnungen', (select count(*) from payslips) + (select count(*) from storage.objects where bucket_id = 'dokumente'), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select pg_temp.expect('Andere Firma sieht keine Lohnabrechnungen', (select count(*) from payslips) + (select count(*) from storage.objects where bucket_id = 'dokumente'), 0);
reset role;

-- Warnung: Einsatz eine Stunde nach Beginn nicht gestempelt
insert into visits (id, company_id, site_id, employee_id, date, start_time, planned_minutes) values
  ('40000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000006', berlin_today(), '00:00', 60);
-- Kurz nach Mitternacht ist die Stunde noch nicht um; dann darf es keine Warnung geben.
select pg_temp.expect('Nicht gestempelter Einsatz wird gemeldet', warn_unclocked_visits(),
  case when (now() at time zone 'Europe/Berlin')::time >= '01:00' then 1 else 0 end);
select pg_temp.expect('Nur einmal je Einsatz', warn_unclocked_visits(), 0);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000006';
select pg_temp.expect_error('Mitarbeiter kann die Prüfung nicht auslösen', 'select warn_unclocked_visits()', 'permission denied for function warn_unclocked_visits');
select pg_temp.expect('Mitarbeiter bekommt Erinnerung', (select count(*) from notifications where kind = 'clock_reminder'),
  case when (now() at time zone 'Europe/Berlin')::time >= '01:00' then 1 else 0 end);
reset role;

-- Kunden-Ordner, Verträge und Schlüssel
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
insert into customer_files (company_id, customer_id, kind, title, path) values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'vertrag', 'Reinigungsvertrag', '00000000-0000-0000-0000-00000000000a/kunden/20000000-0000-0000-0000-000000000001/vertrag.pdf');
select pg_temp.expect_error('Kunden-Datei mit fremdem Pfad blockiert',
  $q$insert into customer_files (company_id, customer_id, title, path) values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'x', '00000000-0000-0000-0000-00000000000a/lohn/x.pdf')$q$,
  'new row violates row-level security policy for table "customer_files"');
-- Frist in 20 Tagen: meldet sich; Vertrag mit Verlängerung, dessen Frist weit weg ist: nicht
insert into contracts (company_id, customer_id, title, ends_on, notice_months) values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Unterhaltsreinigung', (berlin_today() + 20 + interval '3 months')::date, 3);
insert into contracts (company_id, customer_id, title, ends_on, notice_months, auto_renew_months, remind_on, remind_note) values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Glasreinigung', berlin_today() - 10, 1, 12, berlin_today(), 'Preiserhöhung ankündigen');
select pg_temp.expect('Verlängerter Vertrag hat neue Frist', (select count(*) from contracts where title = 'Glasreinigung' and contract_notice_by(contracts) > berlin_today() + 300), 1);
reset role;
select pg_temp.expect('Fristen und Erinnerungen melden sich', remind_contracts(), 2);
select pg_temp.expect('Jede Frist nur einmal', remind_contracts(), 0);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Büro erfährt von der Frist', (select count(*) from notifications where kind in ('contract_deadline', 'contract_reminder')), 2);

insert into site_keys (id, company_id, site_id, label) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'Haupteingang');
insert into key_handovers (company_id, key_id, from_name, to_name, to_profile, signature_to) values
  ('00000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'Chef A', 'Oksana', '10000000-0000-0000-0000-000000000002', 'data:image/png;base64,iVBORw0KGgo=');
select pg_temp.expect_error('Unterschrift muss ein Bild sein',
  $q$insert into key_handovers (company_id, key_id, from_name, to_name, signature_to) values ('00000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'a', 'b', 'javascript:alert(1)')$q$,
  'new row for relation "key_handovers" violates check constraint "key_handovers_signature_to_check"');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect('Mitarbeiterin sieht ihren Schlüssel', (select count(*) from site_keys where holder_name = 'Oksana'), 1);
select pg_temp.expect('Mitarbeiterin sieht keine Kunden-Ordner und Verträge', (select count(*) from customer_files) + (select count(*) from contracts), 0);
select pg_temp.expect_error('Mitarbeiterin protokolliert keine Übergabe',
  $q$insert into key_handovers (company_id, key_id, from_name, to_name) values ('00000000-0000-0000-0000-00000000000a', '50000000-0000-0000-0000-000000000001', 'Oksana', 'Pawel')$q$,
  'new row violates row-level security policy for table "key_handovers"');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000006';
select pg_temp.expect('Kollege sieht fremde Schlüssel nicht', (select count(*) from site_keys) + (select count(*) from key_handovers), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
select pg_temp.expect('Kunde sieht weder Ordner noch Schlüssel', (select count(*) from customer_files) + (select count(*) from contracts) + (select count(*) from site_keys), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select pg_temp.expect('Andere Firma sieht nichts davon', (select count(*) from customer_files) + (select count(*) from contracts) + (select count(*) from site_keys) + (select count(*) from key_handovers), 0);
reset role;

-- Material-Checkliste
insert into sites (id, company_id, customer_id, name, address) values
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Halle', 'Hof 3');
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
insert into material_items (id, company_id, site_id, name) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', 'Müllbeutel'),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000004', 'Glasreiniger');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect('Mitarbeiterin sieht Material eigener Objekte', (select count(*) from material_items), 1);
select set_material_status('60000000-0000-0000-0000-000000000001', 'fehlt', 'Rolle leer');
select pg_temp.expect('Material als fehlend gemeldet', (select count(*) from material_items where status = 'fehlt' and status_by = auth.uid()), 1);
select pg_temp.expect_error('Material an fremdem Objekt blockiert',
  $q$select set_material_status('60000000-0000-0000-0000-000000000002', 'fehlt')$q$, 'Keine Berechtigung');
update material_items set name = 'x';
select pg_temp.expect('Mitarbeiterin benennt Material nicht um', (select count(*) from material_items where name = 'x'), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Büro erfährt von fehlendem Material', (select count(*) from notifications where kind = 'material_missing'), 1);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
select pg_temp.expect('Kunde sieht kein Material', (select count(*) from material_items), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select pg_temp.expect('Andere Firma sieht kein Material', (select count(*) from material_items), 0);
reset role;

-- Schichttausch
insert into visits (id, company_id, site_id, employee_id, date, start_time, planned_minutes) values
  ('40000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', berlin_today() + 3, '08:00', 60);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000006';
select pg_temp.expect_error('Fremden Einsatz abgeben blockiert',
  $q$select offer_swap('40000000-0000-0000-0000-000000000041')$q$, 'Nur eigene Einsätze können abgegeben werden');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect_error('Direkt in visit_swaps schreiben blockiert',
  $q$insert into visit_swaps (company_id, visit_id, offered_by) values ('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000002')$q$,
  'new row violates row-level security policy for table "visit_swaps"');
select pg_temp.expect('Einsatz angeboten', (select count(*) from offer_swap('40000000-0000-0000-0000-000000000041', 'Arzttermin')), 1);
select pg_temp.expect('Eigenes Angebot erscheint nicht in der Liste', (select count(*) from open_swaps()), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000006';
select pg_temp.expect('Kollege sieht das Angebot', (select count(*) from open_swaps() where site_name = 'Lager'), 1);
select pg_temp.expect('Kollege wird benachrichtigt', (select count(*) from notifications where kind = 'swap_offered'), 1);
select take_swap((select id from open_swaps() limit 1));
select pg_temp.expect('Einsatz bleibt bis zur Bestätigung bei Oksana', (select count(*) from visits where id = '40000000-0000-0000-0000-000000000041'), 0);
select pg_temp.expect_error('Mitarbeiter bestätigt nicht selbst',
  $q$select decide_swap((select id from visit_swaps limit 1), true)$q$, 'Keine Berechtigung');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
select pg_temp.expect('Kunde sieht keine Tauschangebote', (select count(*) from open_swaps()) + (select count(*) from visit_swaps), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select pg_temp.expect('Andere Firma sieht keinen Tausch', (select count(*) from visit_swaps), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Büro erfährt von der Übernahme', (select count(*) from notifications where kind = 'swap_taken'), 1);
select decide_swap((select id from visit_swaps where status = 'angenommen'), true);
select pg_temp.expect('Nach Bestätigung hat Pawel den Einsatz',
  (select count(*) from visits where id = '40000000-0000-0000-0000-000000000041' and employee_id = '10000000-0000-0000-0000-000000000006'), 1);
select pg_temp.expect_error('Erledigte Anfrage nicht doppelt bestätigen',
  $q$select decide_swap((select id from visit_swaps limit 1), true)$q$, 'Die Anfrage ist schon erledigt');
reset role;

-- Chat-Übersetzung
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect_error('Übersetzung nicht selbst schreiben',
  $q$insert into chat_translations (message_id, lang, company_id, body) select id, 'de', company_id, 'x' from chat_messages limit 1$q$,
  'new row violates row-level security policy for table "chat_translations"');
reset role;
insert into chat_translations (message_id, lang, company_id, body)
  select id, 'de', company_id, 'übersetzt' from chat_messages where employee_id = '10000000-0000-0000-0000-000000000002';
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000006';
select pg_temp.expect('Kollege sieht fremde Übersetzungen nicht', (select count(*) from chat_translations), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect('Mitarbeiterin sieht Übersetzungen ihres Chats', least((select count(*) from chat_translations), 1), 1);
select pg_temp.expect('Mitarbeiterin sieht keine Anbindungen (DeepL-Schlüssel)', (select count(*) from company_integrations), 0);
reset role;

-- Mitarbeiter verschieben eigene Einsätze
insert into visits (id, company_id, site_id, employee_id, date, start_time, planned_minutes) values
  ('40000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', berlin_today() + 2, '18:00', 60);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000006';
select pg_temp.expect_error('Fremden Einsatz verschieben blockiert',
  $q$select reschedule_visit('40000000-0000-0000-0000-000000000051', berlin_today() + 3, '07:00')$q$, 'einsatz_unbekannt');
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect_error('Nicht in die Vergangenheit verschieben',
  $q$select reschedule_visit('40000000-0000-0000-0000-000000000051', berlin_today() - 1, '07:00')$q$, 'neuer_tag_ungueltig');
select pg_temp.expect_error('Höchstens 14 Tage im Voraus',
  $q$select reschedule_visit('40000000-0000-0000-0000-000000000051', berlin_today() + 15, '07:00')$q$, 'neuer_tag_ungueltig');
select pg_temp.expect_error('Direkt umplanen bleibt blockiert',
  $q$update visits set date = berlin_today() + 3 where id = '40000000-0000-0000-0000-000000000051'$q$, 'Nur das Büro kann Einsätze umplanen');
select reschedule_visit('40000000-0000-0000-0000-000000000051', berlin_today() + 3, '07:30');
select pg_temp.expect('Einsatz verschoben',
  (select count(*) from visits where id = '40000000-0000-0000-0000-000000000051' and date = berlin_today() + 3 and start_time = '07:30'), 1);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Büro erfährt vom Verschieben', (select count(*) from notifications where kind = 'visit_moved'), 1);
reset role;
update visits set status = 'erledigt' where id = '40000000-0000-0000-0000-000000000051';
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select pg_temp.expect_error('Erledigten Einsatz nicht verschieben',
  $q$select reschedule_visit('40000000-0000-0000-0000-000000000051', berlin_today() + 4, '07:30')$q$, 'einsatz_abgeschlossen');
reset role;

-- Krankmeldung mit Foto: nur eigene Mitarbeiterin und Büro
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
insert into storage.objects (bucket_id, name)
  values ('dokumente', '00000000-0000-0000-0000-00000000000a/krank/10000000-0000-0000-0000-000000000002/au.jpg');
select pg_temp.expect_error('Krankmeldung in fremden Ordner blockiert',
  $q$insert into storage.objects (bucket_id, name) values ('dokumente', '00000000-0000-0000-0000-00000000000a/krank/10000000-0000-0000-0000-000000000006/au.jpg')$q$,
  'new row violates row-level security policy for table "objects"');
select pg_temp.expect_error('Mitarbeiterin lädt nichts in andere Dokumente',
  $q$insert into storage.objects (bucket_id, name) values ('dokumente', '00000000-0000-0000-0000-00000000000a/lohn/x.pdf')$q$,
  'new row violates row-level security policy for table "objects"');
insert into absences (company_id, employee_id, kind, date_from, date_to, attachment_paths) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'krank', berlin_today() + 20, berlin_today() + 21,
   '{00000000-0000-0000-0000-00000000000a/krank/10000000-0000-0000-0000-000000000002/au.jpg}');
select pg_temp.expect('Krankmeldung mit Foto gespeichert', (select count(*) from absences where cardinality(attachment_paths) = 1), 1);
select pg_temp.expect_error('Krankmeldung mit fremdem Foto blockiert',
  $q$insert into absences (company_id, employee_id, kind, date_from, date_to, attachment_paths) values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'krank', berlin_today() + 30, berlin_today() + 30, '{00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000002/kaputt.jpg}')$q$,
  'new row violates row-level security policy for table "absences"');
select pg_temp.expect('Mitarbeiterin sieht eigene Krankmeldung', (select count(*) from storage.objects where name like '%/krank/%'), 1);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000006';
select pg_temp.expect('Kollege sieht fremde Krankmeldung nicht', (select count(*) from storage.objects where name like '%/krank/%'), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select pg_temp.expect('Andere Firma sieht Krankmeldung nicht', (select count(*) from storage.objects where name like '%/krank/%'), 0);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Chef sieht Krankmeldung', (select count(*) from storage.objects where name like '%/krank/%'), 1);
reset role;
