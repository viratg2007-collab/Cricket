// Generates the men's +50 Supabase seed SQL directly from mensData.ts so all
// deterministic UUIDs match the app exactly. Run: npx tsx scripts/genMensSeed.ts
import { MENS_TEAMS, MENS_PLAYERS, MENS_MATCHES, mensPairs, mMatchId, mInningsId } from '../src/lib/mensData';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const out: string[] = [];

out.push(`-- ============================================================
-- MEN'S +50 TOURNAMENT — Seed Data (auto-generated from mensData.ts)
-- Run in Supabase SQL editor AFTER 001_initial_schema.sql.
-- Idempotent: safe to re-run.
-- ============================================================
`);

// Teams
out.push('insert into teams (id, name, short_name) values');
out.push(MENS_TEAMS.map(t => `  (${q(t.id)}, ${q(t.name)}, ${q(t.short_name)})`).join(',\n') + '\non conflict (id) do nothing;\n');

// Players
out.push('insert into players (id, team_id, name, jersey_number, role, is_captain) values');
out.push(MENS_PLAYERS.map(p => `  (${q(p.id)}, ${q(p.team_id)}, ${q(p.name)}, ${p.jersey_number}, ${q(p.role)}, ${p.is_captain})`).join(',\n') + '\non conflict (id) do nothing;\n');

// Matches — final (unknown finalists) uses placeholder teams for the FK only.
const ph1 = MENS_TEAMS[0].id, ph2 = MENS_TEAMS[1].id;
out.push('insert into matches (id, home_team_id, away_team_id, name, status) values');
out.push(MENS_MATCHES.map(r => {
  const home = r.match.home_team_id || ph1;
  const away = r.match.away_team_id || ph2;
  return `  (${q(r.match.id)}, ${q(home)}, ${q(away)}, ${q(r.match.name)}, 'scheduled')`;
}).join(',\n') + '\non conflict (id) do nothing;\n');

// Innings — 2 per match. Placeholder teams for the final.
out.push('insert into innings (id, match_id, innings_number, batting_team_id, bowling_team_id, status) values');
const innRows: string[] = [];
MENS_MATCHES.forEach((r) => {
  const home = r.match.home_team_id || ph1;
  const away = r.match.away_team_id || ph2;
  innRows.push(`  (${q(r.innings1_id)}, ${q(r.match.id)}, 1, ${q(home)}, ${q(away)}, 'not_started')`);
  innRows.push(`  (${q(r.innings2_id)}, ${q(r.match.id)}, 2, ${q(away)}, ${q(home)}, 'not_started')`);
});
out.push(innRows.join(',\n') + '\non conflict (id) do nothing;\n');

// Pairs — 5 per team, canonical match_id = men's match 1 (FK requirement only).
const canonicalMatch = mMatchId(1);
out.push('insert into pairs (id, match_id, team_id, pair_number, player1_id, player2_id) values');
const pairRows: string[] = [];
MENS_TEAMS.forEach(t => {
  for (const p of mensPairs(t.id, canonicalMatch)) {
    pairRows.push(`  (${q(p.id)}, ${q(canonicalMatch)}, ${q(t.id)}, ${p.pair_number}, ${q(p.player1_id)}, ${q(p.player2_id)})`);
  }
});
out.push(pairRows.join(',\n') + '\non conflict (id) do nothing;\n');

// Ensure realtime + RLS already set by women's seed; re-assert insert/update policy harmlessly.
out.push(`-- RLS policies for deliveries were created by the women's seed; men's shares them.
`);

void mInningsId;
console.log(out.join('\n'));
