-- ============================================================
-- Allow scorer to write the toss result to the matches table.
-- Run in the Supabase SQL editor after 002_seed.sql.
-- ============================================================
-- The scorer authenticates via local auth (no Supabase session), so
-- auth.uid() is null. Match the open policy used for deliveries.

drop policy if exists "scorer update matches" on matches;

create policy "scorer update matches" on matches
  for update using (true) with check (true);
