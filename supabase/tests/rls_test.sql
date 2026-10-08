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
insert into sites (id, company_id, customer_id, name, address) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Praxis Dr. Meyer', 'Bahnhofstr. 8'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'Lager', 'Hof 1');
insert into site_billing values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'pauschale', 168000);
insert into visits (id, company_id, site_id, employee_id, date, start_time, planned_minutes) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '2026-10-12', '06:00', 90);

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
select pg_temp.expect('Mitarbeiterin sieht nur Objekte mit eigenem Einsatz', (select count(*) from sites), 1);
select pg_temp.expect('Mitarbeiterin sieht keine Preise', (select count(*) from site_billing), 0);
select pg_temp.expect('Mitarbeiterin sieht keine Rechnungen', (select count(*) from invoices), 0);

insert into time_entries (company_id, visit_id, employee_id)
  values ('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
update visits set status = 'laeuft' where id = '40000000-0000-0000-0000-000000000001';
select pg_temp.expect('Mitarbeiterin setzt Status', (select count(*) from visits where status = 'laeuft'), 1);

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

update time_entries set clock_out_at = now() + interval '90 minutes';
select pg_temp.expect('Ausstempeln klappt', (select count(*) from time_entries where clock_out_at is not null), 1);
update time_entries set clock_out_at = now() + interval '5 hours';
select pg_temp.expect('Zweites Ausstempeln ändert nichts', (select count(*) from time_entries where clock_out_at > now() + interval '4 hours'), 0);

-- Chef der eigenen Firma
set request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select pg_temp.expect('Chef sieht alle Zeiten', (select count(*) from time_entries), 1);
select pg_temp.expect('Chef sieht Preise', (select count(*) from site_billing), 1);
select pg_temp.expect('Chef sieht alle Objekte', (select count(*) from sites), 2);

reset role;
