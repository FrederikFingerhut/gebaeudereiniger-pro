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
  ('40000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', berlin_today() + 1, '07:00', 60);
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
insert into absences (company_id, employee_id, kind, date_from, date_to)
  values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'krank', berlin_today() + 1, berlin_today() + 1);
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Einsatz bei Krankheit frei', (select count(*) from visits where id = '40000000-0000-0000-0000-000000000009' and employee_id is null), 1);
select pg_temp.expect('Büro erfährt von Krankmeldung', (select count(*) from notifications where kind = 'absence_new' and params->>'from' = (berlin_today() + 1)::text), 1);
-- Chef gibt den Einsatz an jemand anderen: der bekommt eine Nachricht
update visits set employee_id = '10000000-0000-0000-0000-000000000001' where id = '40000000-0000-0000-0000-000000000009';
select pg_temp.expect('Neuer Mitarbeiter wird benachrichtigt', (select count(*) from notifications where kind = 'visit_new'), 1);
update absences set approved = true where employee_id = '10000000-0000-0000-0000-000000000002' and date_from = berlin_today() + 1;
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
