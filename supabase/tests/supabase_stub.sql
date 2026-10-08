-- Bildet das Nötigste von Supabase nach (auth.uid(), Rolle "authenticated"),
-- damit die Migration in einer normalen Postgres-Datenbank getestet werden kann.
drop database if exists gp;
create database gp;
\c gp
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
grant usage on schema auth to authenticated;

-- Speicher (Storage) in der Form, wie Supabase ihn anlegt; RLS ist dort schon an.
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id), name text not null, owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[]
  language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to authenticated;
grant all on storage.objects to authenticated;
