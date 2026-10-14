-- Arbeitszeitkonto und Lohnabrechnungen ----------------------------------------------
-- Wochenstunden und Jahresurlaub pro Mitarbeiter; daraus rechnen App und Büro-Web
-- Soll, Überstunden und Resturlaub. Lohnabrechnungen lädt das Büro als Datei hoch,
-- der Mitarbeiter sieht nur seine eigenen.

alter table profiles
  add column weekly_hours numeric(4, 1) check (weekly_hours between 0 and 60),
  add column vacation_days numeric(4, 1) not null default 0 check (vacation_days between 0 and 60);

comment on column profiles.weekly_hours is 'Vertragliche Wochenstunden (Soll); leer = kein Soll';
comment on column profiles.vacation_days is 'Urlaubstage pro Kalenderjahr';

-- Wochenstunden und Urlaub legt nur das Büro fest.
create or replace function protect_profile_fields() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.id and not is_office()
     and (new.role is distinct from old.role or new.company_id is distinct from old.company_id
          or new.active is distinct from old.active or new.customer_id is distinct from old.customer_id
          or new.weekly_hours is distinct from old.weekly_hours or new.vacation_days is distinct from old.vacation_days) then
    raise exception 'Rolle, Firma und Status kann nur das Büro ändern';
  end if;
  return new;
end $$;

-- Dokumente (Lohnabrechnungen, später Kundenordner) im privaten Speicher "dokumente".
-- Pfad: <company_id>/<bereich>/<…>/<datei>. Das Büro verwaltet alles der eigenen Firma.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dokumente', 'dokumente', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Büro verwaltet Dokumente" on storage.objects for all to authenticated
  using (bucket_id = 'dokumente' and (storage.foldername(name))[1] = current_company_id()::text and is_office())
  with check (bucket_id = 'dokumente' and (storage.foldername(name))[1] = current_company_id()::text and is_office());

create table payslips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  employee_id uuid not null references profiles (id) on delete cascade,
  period date not null check (extract(day from period) = 1), -- erster Tag des Monats
  path text not null,
  created_at timestamptz not null default now(),
  unique (employee_id, period)
);

alter table payslips enable row level security;
create policy "Büro verwaltet Lohnabrechnungen" on payslips for all
  using (company_id = current_company_id() and is_office())
  with check (company_id = current_company_id() and is_office()
              and path like company_id::text || '/lohn/%'
              and exists (select 1 from profiles p where p.id = employee_id and p.company_id = current_company_id() and p.role <> 'kunde'));
create policy "Mitarbeiter sehen eigene Lohnabrechnungen" on payslips for select
  using (company_id = current_company_id() and employee_id = auth.uid());

create policy "Mitarbeiter laden eigene Lohnabrechnungen" on storage.objects for select to authenticated
  using (bucket_id = 'dokumente' and exists (
    select 1 from payslips p where p.path = storage.objects.name and p.employee_id = auth.uid()));

-- Neue Lohnabrechnung: der Mitarbeiter bekommt eine Nachricht.
create function notify_payslip() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform notify_user(new.employee_id, 'payslip_new', jsonb_build_object('month', to_char(new.period, 'YYYY-MM')));
  return new;
end $$;
create trigger payslips_notify after insert on payslips
  for each row execute function notify_payslip();
