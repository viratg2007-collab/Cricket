-- ============================================================
-- Tournament config (key/value) — used for the manual Round 2
-- group override so an admin change syncs to all viewers.
-- Run in the Supabase SQL editor.
-- ============================================================

create table if not exists tournament_config (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table tournament_config enable row level security;

drop policy if exists "public read config"  on tournament_config;
drop policy if exists "scorer insert config" on tournament_config;
drop policy if exists "scorer update config" on tournament_config;
drop policy if exists "scorer delete config" on tournament_config;

create policy "public read config"  on tournament_config for select using (true);
create policy "scorer insert config" on tournament_config for insert with check (true);
create policy "scorer update config" on tournament_config for update using (true) with check (true);
create policy "scorer delete config" on tournament_config for delete using (true);
