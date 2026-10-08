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
