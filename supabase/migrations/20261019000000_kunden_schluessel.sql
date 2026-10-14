-- Kunden-Ordner (Verträge, Fotos, Notizen, Fristen) und Schlüsselübergaben -----------------

-- Kunden-Ordner: nur Büro und Chef (Verträge enthalten Preise). Dateien liegen im
-- privaten Speicher "dokumente" unter <company_id>/kunden/<customer_id>/<datei>.
alter table customers add column notes text;

create table customer_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  kind text not null default 'sonstiges' check (kind in ('vertrag', 'foto', 'sonstiges')),
  title text not null check (length(btrim(title)) between 1 and 200),
  path text not null,
  uploaded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index customer_files_customer on customer_files (customer_id, created_at desc);

alter table customer_files enable row level security;
create policy "Büro verwaltet Kunden-Ordner" on customer_files for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office()
              and path like company_id::text || '/kunden/' || customer_id::text || '/%'
              and exists (select 1 from customers c where c.id = customer_id and c.company_id = current_company_id()));

create table contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  starts_on date,
  ends_on date,
  notice_months integer check (notice_months between 0 and 36),
  auto_renew_months integer check (auto_renew_months between 1 and 120),
  -- Freie Erinnerung, z. B. Preiserhöhung ankündigen
  remind_on date,
  remind_note text,
  file_id uuid references customer_files (id) on delete set null,
  -- Wofür schon erinnert wurde (damit jede Frist nur einmal meldet)
  notice_reminded_for date,
  remind_sent_on date,
  created_at timestamptz not null default now()
);
create index contracts_customer on contracts (customer_id);

alter table contracts enable row level security;
create policy "Büro verwaltet Verträge" on contracts for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office()
              and exists (select 1 from customers c where c.id = customer_id and c.company_id = current_company_id()));

-- Letzter Kündigungstag ab heute; wie contractDates in packages/shared/src/contracts.ts.
create function contract_notice_by(c contracts, today date default berlin_today()) returns date
  language plpgsql stable as $$
declare
  e date := c.ends_on;
  notice integer := coalesce(c.notice_months, 0);
begin
  if e is null then
    return null;
  end if;
  if coalesce(c.auto_renew_months, 0) > 0 then
    while (e - make_interval(months => notice))::date < today loop
      e := (e + make_interval(months => c.auto_renew_months))::date;
    end loop;
  elsif e < today then
    return null;
  end if;
  if (e - make_interval(months => notice))::date < today then
    return null;
  end if;
  return (e - make_interval(months => notice))::date;
end $$;

-- Täglich: 30 Tage vor dem letzten Kündigungstag und am Tag einer freien Erinnerung meldet sich die App.
create function remind_contracts() returns integer
  language plpgsql security definer set search_path = public as $$
declare
  c contracts;
  deadline date;
  n integer := 0;
  customer_name text;
begin
  for c in select * from contracts loop
    customer_name := (select name from customers where id = c.customer_id);
    deadline := contract_notice_by(c);
    if deadline is not null and deadline - berlin_today() <= 30 and c.notice_reminded_for is distinct from deadline then
      perform notify_office(c.company_id, 'contract_deadline',
        jsonb_build_object('name', customer_name, 'text', c.title, 'date', deadline), '/kunden/' || c.customer_id);
      update contracts set notice_reminded_for = deadline where id = c.id;
      n := n + 1;
    end if;
    if c.remind_on is not null and c.remind_on <= berlin_today() and c.remind_sent_on is null then
      perform notify_office(c.company_id, 'contract_reminder',
        jsonb_build_object('name', customer_name, 'text', coalesce(nullif(c.remind_note, ''), c.title), 'date', c.remind_on), '/kunden/' || c.customer_id);
      update contracts set remind_sent_on = berlin_today() where id = c.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function remind_contracts() from public, anon, authenticated;

do $$ begin
  perform cron.schedule('vertraege-erinnern', '0 6 * * *', 'select public.remind_contracts()');
exception when others then
  raise notice 'pg_cron nicht verfügbar, keine Vertrags-Erinnerungen';
end $$;

-- Schlüssel ------------------------------------------------------------------------------
-- Jeder Schlüssel gehört zu einem Objekt. Wer ihn gerade hat, ergibt sich aus der letzten Übergabe.
create table site_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 120),
  count integer not null default 1 check (count between 1 and 99),
  holder_id uuid references profiles (id) on delete set null,
  holder_name text,
  created_at timestamptz not null default now()
);
create index site_keys_site on site_keys (site_id);

create table key_handovers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  key_id uuid not null references site_keys (id) on delete cascade,
  handed_at timestamptz not null default now(),
  from_name text not null check (length(btrim(from_name)) between 1 and 120),
  to_name text not null check (length(btrim(to_name)) between 1 and 120),
  to_profile uuid references profiles (id) on delete set null,
  count integer not null default 1 check (count between 1 and 99),
  note text,
  -- Unterschriften als PNG (data:image/png;base64,…)
  signature_from text check (signature_from is null or (signature_from like 'data:image/png;base64,%' and length(signature_from) < 300000)),
  signature_to text check (signature_to is null or (signature_to like 'data:image/png;base64,%' and length(signature_to) < 300000)),
  created_by uuid default auth.uid() references profiles (id) on delete set null
);
create index key_handovers_key on key_handovers (key_id, handed_at desc);

alter table site_keys enable row level security;
alter table key_handovers enable row level security;
create policy "Leitung verwaltet Schlüssel" on site_keys for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager()
              and exists (select 1 from sites s where s.id = site_id and s.company_id = current_company_id()));
create policy "Mitarbeiter sehen eigene Schlüssel" on site_keys for select
  using (company_id = current_company_id() and holder_id = auth.uid());
create policy "Leitung protokolliert Übergaben" on key_handovers for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager()
              and exists (select 1 from site_keys k where k.id = key_id and k.company_id = current_company_id()));
create policy "Mitarbeiter sehen eigene Übergaben" on key_handovers for select
  using (company_id = current_company_id() and to_profile = auth.uid());

-- Nach jeder Übergabe hat der Empfänger den Schlüssel.
create function key_handover_holder() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update site_keys set holder_id = new.to_profile, holder_name = new.to_name, count = new.count where id = new.key_id;
  return new;
end $$;
create trigger key_handovers_holder after insert on key_handovers
  for each row execute function key_handover_holder();
