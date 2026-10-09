-- Chat zwischen Mitarbeitern und Leitung (Objektleiter, Büro, Chef).
-- Jeder Mitarbeiter hat genau ein Gespräch mit der Leitung; alle aus der Leitung lesen und antworten darin.

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  -- Der Mitarbeiter, um dessen Gespräch es geht
  employee_id uuid not null references profiles (id) on delete cascade,
  author_id uuid references profiles (id) on delete set null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index chat_messages_thread on chat_messages (employee_id, created_at desc);
create index chat_messages_company on chat_messages (company_id, created_at desc);

alter table chat_messages enable row level security;
create policy "Chat lesen" on chat_messages for select
  using (company_id = current_company_id() and (is_manager() or employee_id = auth.uid()));
create policy "Chat schreiben" on chat_messages for insert
  with check (
    company_id = current_company_id() and author_id = auth.uid() and not is_customer()
    and (is_manager() or employee_id = auth.uid())
    and exists (select 1 from profiles p where p.id = employee_id and p.company_id = current_company_id() and p.role <> 'kunde')
  );

-- Bis wann jemand ein Gespräch gelesen hat (für die Zahl ungelesener Nachrichten).
create table chat_reads (
  user_id uuid not null references profiles (id) on delete cascade,
  employee_id uuid not null references profiles (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, employee_id)
);

alter table chat_reads enable row level security;
create policy "eigene Lesestände" on chat_reads for all
  using (user_id = auth.uid() and company_id = current_company_id())
  with check (user_id = auth.uid() and company_id = current_company_id() and (is_manager() or employee_id = auth.uid()));

-- Neue Nachricht: Push an die andere Seite. Höchstens eine Benachrichtigung
-- je Empfänger und Gespräch in 5 Minuten, damit ein Gespräch nicht dauernd klingelt.
create function notify_chat() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_params jsonb;
begin
  v_params := jsonb_build_object(
    'name', (select full_name from profiles where id = new.author_id),
    'text', left(new.body, 140),
    'thread', new.employee_id);
  insert into notifications (company_id, user_id, kind, params, url)
    select p.company_id, p.id, 'chat', v_params,
           case when p.id = new.employee_id then null else '/chat?mit=' || new.employee_id end
    from profiles p
    where p.company_id = new.company_id and p.active and p.id is distinct from new.author_id
      and case when new.author_id = new.employee_id
               then p.role in ('objektleiter', 'buero', 'chef')
               else p.id = new.employee_id end
      and not exists (
        select 1 from notifications n
        where n.user_id = p.id and n.kind = 'chat' and n.params ->> 'thread' = new.employee_id::text
          and n.created_at > now() - interval '5 minutes');
  return new;
end $$;

create trigger chat_messages_notify after insert on chat_messages
  for each row execute function notify_chat();
