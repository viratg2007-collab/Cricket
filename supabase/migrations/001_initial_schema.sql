-- ============================================================
-- Community Cricket — Double-Wicket Scoring Schema
-- Run this in your Supabase SQL editor after creating a project
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- Core lookup tables
-- ============================================================

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text not null default '2026',
  created_at timestamptz default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade,
  name text not null,
  short_name text not null,
  created_at timestamptz default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  jersey_number int,
  role text not null default 'allrounder'
    check (role in ('batter','bowler','allrounder','wicketkeeper')),
  is_captain boolean not null default false,
  created_at timestamptz default now()
);
-- 14 players per team enforced at application layer; no DB constraint needed

-- ============================================================
-- Match settings stored as JSONB
-- Default values mirror DEFAULT_SETTINGS in types.ts
-- ============================================================

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete set null,
  home_team_id uuid not null references teams(id),
  away_team_id uuid not null references teams(id),
  name text not null,
  settings jsonb not null default '{
    "overs_per_innings": 12,
    "overs_per_pair": 2,
    "num_pairs": 6,
    "balls_per_over": 6,
    "wide_value": 2,
    "no_ball_value": 2,
    "extras_count_as_ball": true,
    "dismissal_penalty": -2,
    "max_overs_per_bowler": 2,
    "final_ball_must_be_legal": true,
    "custom_rules": {}
  }',
  status text not null default 'scheduled'
    check (status in ('scheduled','live','complete')),
  toss_winner_id uuid references teams(id),
  toss_decision text check (toss_decision in ('bat','field')),
  scorer_user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ============================================================
-- Batting pairs (6 per team per match)
-- ============================================================

create table if not exists pairs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_id uuid not null references teams(id),
  pair_number int not null check (pair_number between 1 and 6),
  player1_id uuid not null references players(id),
  player2_id uuid not null references players(id),
  created_at timestamptz default now(),
  unique (match_id, team_id, pair_number)
);

-- ============================================================
-- Innings
-- ============================================================

create table if not exists innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  innings_number int not null check (innings_number in (1,2)),
  batting_team_id uuid not null references teams(id),
  bowling_team_id uuid not null references teams(id),
  status text not null default 'not_started'
    check (status in ('not_started','live','complete')),
  created_at timestamptz default now(),
  unique (match_id, innings_number)
);

-- ============================================================
-- Deliveries — immutable ball-by-ball log
-- This is the single source of truth for all derived stats
-- ============================================================

create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references innings(id) on delete cascade,
  pair_id uuid not null references pairs(id),

  -- Ball position (both 0-indexed)
  over_number int not null,       -- 0–11 absolute across the innings
  ball_in_over int not null,      -- 0–5

  -- Monotonically increasing per innings; gaps are fine (undo leaves gaps)
  sequence_number int not null,

  -- Soft-delete for undo; all derived queries filter is_deleted = false
  is_deleted boolean not null default false,

  -- Personnel
  striker_id uuid not null references players(id),
  non_striker_id uuid not null references players(id),
  bowler_id uuid not null references players(id),

  -- Runs
  runs_off_bat int not null default 0 check (runs_off_bat >= 0),
  extra_type text not null default 'none'
    check (extra_type in ('none','wide','no_ball','bye','leg_bye','strike_override')),
  extra_value int not null default 0,

  -- Wicket
  is_wicket boolean not null default false,
  wicket_type text check (wicket_type in ('bowled','caught','run_out','stumped','hit_wicket','lbw','obstructing')),
  dismissed_player_id uuid references players(id),
  fielder_id uuid references players(id),

  -- Net effect on team total:
  --   runs_off_bat + extra_value + (is_wicket ? dismissal_penalty : 0)
  -- e.g. clean wicket → 0 + 0 + (−2) = −2 (total CAN go negative)
  -- e.g. wide → 0 + 2 + 0 = +2
  net_run_effect int not null,

  -- legal_ball is TRUE for almost every delivery in this format:
  -- wides and no-balls count as a ball (over advances normally).
  -- Set FALSE ONLY for a re-bowled final ball (over 11, ball 5) that was a wide/no-ball.
  legal_ball boolean not null default true,

  -- Net strike change for this delivery (odd runs ⊕ wicket ⊕ end-of-over ⊕ manual)
  strike_changed boolean not null default false,

  notes text,
  created_at timestamptz default now()
);

create index if not exists deliveries_innings_seq on deliveries (innings_id, sequence_number);
create index if not exists deliveries_pair on deliveries (pair_id, over_number, ball_in_over);

-- ============================================================
-- Derived views (read-only, used by viewer page)
-- ============================================================

-- Current total for an innings (allows negative)
create or replace view innings_totals as
select
  innings_id,
  sum(net_run_effect) as total,
  count(*) filter (where is_wicket) as wickets,
  count(*) filter (where legal_ball) as legal_balls
from deliveries
where is_deleted = false
  and extra_type != 'strike_override'
group by innings_id;

-- Per-pair totals
create or replace view pair_totals as
select
  pair_id,
  innings_id,
  sum(net_run_effect) as runs,
  count(*) filter (where is_wicket) as wickets,
  count(*) filter (where legal_ball) as balls
from deliveries
where is_deleted = false
  and extra_type != 'strike_override'
group by pair_id, innings_id;

-- Per-batter stats (runs credited to striker)
create or replace view batter_stats as
select
  innings_id,
  striker_id as player_id,
  sum(runs_off_bat) as runs,
  count(*) filter (where legal_ball) as balls_faced,
  count(*) filter (where dismissed_player_id = striker_id) as times_out
from deliveries
where is_deleted = false
  and extra_type != 'strike_override'
group by innings_id, striker_id;

-- Per-bowler stats
create or replace view bowler_stats as
select
  innings_id,
  bowler_id as player_id,
  count(*) filter (where legal_ball) as legal_balls,
  sum(runs_off_bat + extra_value) as runs_conceded,
  count(*) filter (where is_wicket) as wickets
from deliveries
where is_deleted = false
  and extra_type != 'strike_override'
group by innings_id, bowler_id;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table tournaments  enable row level security;
alter table teams        enable row level security;
alter table players      enable row level security;
alter table matches      enable row level security;
alter table pairs        enable row level security;
alter table innings      enable row level security;
alter table deliveries   enable row level security;

-- Public read (spectators)
create policy "public read tournaments"  on tournaments  for select using (true);
create policy "public read teams"        on teams        for select using (true);
create policy "public read players"      on players      for select using (true);
create policy "public read matches"      on matches      for select using (true);
create policy "public read pairs"        on pairs        for select using (true);
create policy "public read innings"      on innings      for select using (true);
create policy "public read deliveries"   on deliveries   for select using (true);

-- Scorer write: any authenticated user may insert/update deliveries.
-- scorer_user_id on matches is retained for future per-match access control (Phase 4).
create policy "scorer insert deliveries" on deliveries
  for insert
  with check (auth.uid() is not null);

create policy "scorer update deliveries" on deliveries
  for update
  using (auth.uid() is not null);

-- Admin (service role) can write everything else — handled by service key
