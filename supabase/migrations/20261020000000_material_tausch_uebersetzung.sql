-- Material-Checkliste, Schichttausch und Chat-Übersetzung ---------------------------------

-- Material je Objekt ---------------------------------------------------------------------
-- Das Büro legt fest, was vor Ort sein muss. Der Mitarbeiter meldet beim Einsatz
-- „da“, „wird knapp“ oder „fehlt“. Der letzte Stand steht direkt am Eintrag.
create table material_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  position integer not null default 0,
  status text not null default 'ok' check (status in ('ok', 'wenig', 'fehlt')),
  status_note text check (status_note is null or length(status_note) <= 300),
  status_by uuid references profiles (id) on delete set null,
  status_at timestamptz,
  created_at timestamptz not null default now()
);
create index material_items_site on material_items (site_id, position);

alter table material_items enable row level security;
create policy "Leitung verwaltet Material" on material_items for all
  using (company_id = current_company_id() and is_manager())
  with check (company_id = current_company_id() and is_manager()
              and exists (select 1 from sites s where s.id = site_id and s.company_id = current_company_id()));
create policy "Mitarbeiter sehen Material eigener Objekte" on material_items for select
  using (company_id = current_company_id() and exists (
    select 1 from visits v where v.site_id = material_items.site_id and v.employee_id = auth.uid()));

-- Mitarbeiter ändern nur den Stand, nicht Name oder Objekt; deshalb eine Funktion statt Update-Recht.
create function set_material_status(p_item uuid, p_status text, p_note text default null) returns void
  language plpgsql security definer set search_path = public as $$
declare
  m material_items;
begin
  select * into m from material_items where id = p_item and company_id = current_company_id();
  if m.id is null or p_status not in ('ok', 'wenig', 'fehlt') then
    raise exception 'Material nicht gefunden';
  end if;
  if not is_manager() and not exists (select 1 from visits v where v.site_id = m.site_id and v.employee_id = auth.uid()) then
    raise exception 'Keine Berechtigung';
  end if;
  update material_items
    set status = p_status, status_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''), status_by = auth.uid(), status_at = now()
    where id = p_item;
  if p_status <> 'ok' and m.status is distinct from p_status then
    perform notify_office(m.company_id, 'material_missing', jsonb_build_object(
      'site', (select name from sites where id = m.site_id),
      'text', m.name,
      'kind', p_status,
      'name', (select full_name from profiles where id = auth.uid())), '/objekte/' || m.site_id);
  end if;
end $$;
revoke execute on function set_material_status(uuid, text, text) from public, anon;
grant execute on function set_material_status(uuid, text, text) to authenticated;

-- Schichttausch --------------------------------------------------------------------------
-- Ein Mitarbeiter bietet einen eigenen Einsatz an, ein Kollege übernimmt ihn,
-- die Leitung bestätigt. Erst dann wechselt der Einsatz den Mitarbeiter.
create table visit_swaps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  visit_id uuid not null references visits (id) on delete cascade,
  offered_by uuid not null references profiles (id) on delete cascade,
  taken_by uuid references profiles (id) on delete set null,
  note text check (note is null or length(note) <= 300),
  status text not null default 'offen' check (status in ('offen', 'angenommen', 'bestaetigt', 'abgelehnt', 'zurueckgezogen')),
  decided_by uuid references profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
-- Je Einsatz höchstens ein laufendes Angebot
create unique index visit_swaps_active on visit_swaps (visit_id) where status in ('offen', 'angenommen');
create index visit_swaps_company on visit_swaps (company_id, status);

alter table visit_swaps enable row level security;
create policy "Leitung sieht Tausch" on visit_swaps for select
  using (company_id = current_company_id() and is_manager());
create policy "Mitarbeiter sehen eigenen Tausch" on visit_swaps for select
  using (company_id = current_company_id() and (offered_by = auth.uid() or taken_by = auth.uid()));
-- Schreiben nur über die Funktionen unten.

create function offer_swap(p_visit uuid, p_note text default null) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v visits;
  new_id uuid;
begin
  select * into v from visits where id = p_visit and company_id = current_company_id();
  if v.id is null or v.employee_id is distinct from auth.uid() then
    raise exception 'Nur eigene Einsätze können abgegeben werden';
  end if;
  if v.status <> 'geplant' or v.date < berlin_today() then
    raise exception 'Der Einsatz ist schon vorbei oder begonnen';
  end if;
  insert into visit_swaps (company_id, visit_id, offered_by, note)
    values (v.company_id, v.id, auth.uid(), nullif(left(btrim(coalesce(p_note, '')), 300), ''))
    returning id into new_id;
  -- Alle anderen aktiven Mitarbeiter erfahren davon.
  insert into notifications (company_id, user_id, kind, params, url)
    select p.company_id, p.id, 'swap_offered', visit_params(v) || jsonb_build_object('name', (select full_name from profiles where id = auth.uid())), null
    from profiles p
    where p.company_id = v.company_id and p.active and p.role = 'mitarbeiter' and p.id <> auth.uid();
  return new_id;
end $$;

create function take_swap(p_swap uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  s visit_swaps;
  v visits;
begin
  select * into s from visit_swaps where id = p_swap and company_id = current_company_id() for update;
  if s.id is null or s.status <> 'offen' then
    raise exception 'Das Angebot ist nicht mehr offen';
  end if;
  if s.offered_by = auth.uid() or current_app_role() not in ('mitarbeiter', 'objektleiter') then
    raise exception 'Keine Berechtigung';
  end if;
  select * into v from visits where id = s.visit_id;
  update visit_swaps set taken_by = auth.uid(), status = 'angenommen' where id = p_swap;
  perform notify_office(s.company_id, 'swap_taken', visit_params(v) || jsonb_build_object(
    'name', (select full_name from profiles where id = s.offered_by),
    'text', (select full_name from profiles where id = auth.uid())), '/planung/tausch');
  perform notify_user(s.offered_by, 'swap_taken_you', visit_params(v) || jsonb_build_object('name', (select full_name from profiles where id = auth.uid())));
end $$;

create function withdraw_swap(p_swap uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  update visit_swaps set status = 'zurueckgezogen', decided_at = now()
    where id = p_swap and company_id = current_company_id() and offered_by = auth.uid() and status in ('offen', 'angenommen');
  if not found then
    raise exception 'Das Angebot kann nicht mehr zurückgezogen werden';
  end if;
end $$;

-- Leitung bestätigt oder lehnt ab. Beim Bestätigen wechselt der Einsatz den Mitarbeiter
-- (der Trigger am Einsatz benachrichtigt beide).
create function decide_swap(p_swap uuid, p_approve boolean) returns void
  language plpgsql security definer set search_path = public as $$
declare
  s visit_swaps;
  v visits;
begin
  if not is_manager() then
    raise exception 'Keine Berechtigung';
  end if;
  select * into s from visit_swaps where id = p_swap and company_id = current_company_id() for update;
  if s.id is null or s.status not in ('offen', 'angenommen') then
    raise exception 'Die Anfrage ist schon erledigt';
  end if;
  select * into v from visits where id = s.visit_id;
  if p_approve then
    if s.status <> 'angenommen' or s.taken_by is null then
      raise exception 'Noch hat kein Kollege übernommen';
    end if;
    if v.status <> 'geplant' or v.employee_id is distinct from s.offered_by then
      raise exception 'Der Einsatz wurde inzwischen geändert';
    end if;
    update visits set employee_id = s.taken_by where id = v.id;
    update visit_swaps set status = 'bestaetigt', decided_by = auth.uid(), decided_at = now() where id = p_swap;
  else
    update visit_swaps set status = 'abgelehnt', decided_by = auth.uid(), decided_at = now() where id = p_swap;
    perform notify_user(s.offered_by, 'swap_declined', visit_params(v));
    if s.taken_by is not null then
      perform notify_user(s.taken_by, 'swap_declined', visit_params(v));
    end if;
  end if;
end $$;

-- Offene Angebote für Kollegen. Einsätze anderer sind sonst nicht sichtbar, deshalb eine Funktion,
-- die nur das Nötige zeigt (Objekt, Adresse, Zeit, wer abgibt).
create function open_swaps() returns table (
  id uuid, visit_id uuid, site_name text, site_address text, date date, start_time time,
  planned_minutes integer, offered_by_name text, note text
)
  language sql stable security definer set search_path = public as $$
  select s.id, v.id, st.name, st.address, v.date, v.start_time, v.planned_minutes, p.full_name, s.note
  from visit_swaps s
  join visits v on v.id = s.visit_id
  join sites st on st.id = v.site_id
  join profiles p on p.id = s.offered_by
  where s.company_id = current_company_id() and s.status = 'offen' and s.offered_by <> auth.uid()
    and v.date >= berlin_today() and v.status = 'geplant' and not is_customer()
  order by v.date, v.start_time
$$;

revoke execute on function offer_swap(uuid, text) from public, anon;
revoke execute on function take_swap(uuid) from public, anon;
revoke execute on function withdraw_swap(uuid) from public, anon;
revoke execute on function decide_swap(uuid, boolean) from public, anon;
revoke execute on function open_swaps() from public, anon;
grant execute on function offer_swap(uuid, text) to authenticated;
grant execute on function take_swap(uuid) to authenticated;
grant execute on function withdraw_swap(uuid) to authenticated;
grant execute on function decide_swap(uuid, boolean) to authenticated;
grant execute on function open_swaps() to authenticated;

-- Chat-Übersetzung -----------------------------------------------------------------------
-- DeepL-Schlüssel legt das Büro selbst ab (wie den Lexoffice-Schlüssel).
alter table company_integrations add column deepl_api_key text;

-- Zwischenspeicher, damit jede Nachricht je Sprache nur einmal übersetzt wird.
-- body null = Nachricht ist schon in dieser Sprache. Schreiben nur die Funktion "translate".
create table chat_translations (
  message_id uuid not null references chat_messages (id) on delete cascade,
  lang text not null check (lang in ('de', 'en', 'ru', 'uk')),
  company_id uuid not null references companies (id) on delete cascade,
  body text,
  created_at timestamptz not null default now(),
  primary key (message_id, lang)
);

alter table chat_translations enable row level security;
create policy "Übersetzungen lesen wie den Chat" on chat_translations for select
  using (company_id = current_company_id() and exists (select 1 from chat_messages m where m.id = message_id));
