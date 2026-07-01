// Proves a men's match and a women's match can be scored SIMULTANEOUSLY from
// different devices without interfering. Fires one men's ball and one women's ball
// concurrently, then verifies each tournament's tournament-scoped read sees ONLY
// its own ball (the same innings-id scoping loadTournamentStats uses). Cleans up.
// Run: npx tsx scripts/testConcurrent.mts
import { readFileSync } from 'node:fs';
import { ALL_MATCHES, getPairsForTeam } from '../src/lib/matchData';
import { PLAYERS } from '../src/lib/seedData';
import { MENS_MATCHES, mensPairs, MENS_PLAYERS } from '../src/lib/mensData';
import type { Delivery } from '../src/lib/types';

const env = readFileSync('/Users/viratgandhi/cricket-scorer/.env.local', 'utf8');
const g = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
const BASE = g('VITE_SUPABASE_URL').replace(/\/$/, '') + '/rest/v1';
const KEY = g('VITE_SUPABASE_ANON_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

let fail = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) fail++; };

// innings-id sets exactly like tournamentStats.matchesFor()
const womensInns = new Set(ALL_MATCHES.flatMap(r => [r.innings1_id, r.innings2_id]));
const mensInns = new Set(MENS_MATCHES.flatMap(r => [r.innings1_id, r.innings2_id]));

// Women's ball: match 1, home team batting
const wRec = ALL_MATCHES[0];
const wPair = getPairsForTeam(wRec.match.home_team_id, wRec.match.id)[0];
const wBowler = PLAYERS.find(p => p.team_id === wRec.match.away_team_id)!;
const wId = '00000000-0000-0000-00fd-000000000001';
const wBall: Delivery = {
  id: wId, innings_id: wRec.innings1_id, pair_id: wPair.id,
  over_number: 0, ball_in_over: 0, sequence_number: 1,
  striker_id: wPair.player1_id, non_striker_id: wPair.player2_id, bowler_id: wBowler.id,
  runs_off_bat: 6, extra_type: 'none', extra_value: 0, legal_ball: true,
  is_wicket: false, net_run_effect: 6, strike_changed: false, is_deleted: false,
};

// Men's ball: match 2, home team batting
const mRec = MENS_MATCHES[1];
const mPair = mensPairs(mRec.match.home_team_id, mRec.match.id)[0];
const mBowler = MENS_PLAYERS.find(p => p.team_id === mRec.match.away_team_id)!;
const mId = '00000000-0000-0000-00fd-000000000002';
const mBall: Delivery = {
  id: mId, innings_id: mRec.innings1_id, pair_id: mPair.id,
  over_number: 0, ball_in_over: 0, sequence_number: 1,
  striker_id: mPair.player1_id, non_striker_id: mPair.player2_id, bowler_id: mBowler.id,
  runs_off_bat: 4, extra_type: 'none', extra_value: 0, legal_ball: true,
  is_wicket: false, net_run_effect: 4, strike_changed: false, is_deleted: false,
};

const post = (d: Delivery) => fetch(`${BASE}/deliveries`, { method: 'POST', headers: H, body: JSON.stringify(d) });

(async () => {
  console.log(`\nScoring CONCURRENTLY:`);
  console.log(`  👩 Women's ${wRec.roundLabel} (match 1) — 6 off the bat`);
  console.log(`  👨 Men's Match 2 — 4 off the bat`);
  console.log(`  (both POSTed in the same instant via Promise.all)\n`);

  // fire both at the exact same time
  const [wRes, mRes] = await Promise.all([post(wBall), post(mBall)]);
  check(wRes.ok && mRes.ok, `both balls inserted concurrently${wRes.ok && mRes.ok ? '' : ' — ' + wRes.status + '/' + mRes.status}`);

  // read everything back and scope each tournament exactly like the app's stats do
  const all = await (await fetch(`${BASE}/deliveries?is_deleted=eq.false&select=innings_id,net_run_effect,id`, { headers: H })).json() as Delivery[];
  const wSeen = all.filter(d => womensInns.has(d.innings_id));
  const mSeen = all.filter(d => mensInns.has(d.innings_id));

  console.log(`\n── Tournament-scoped reads ──`);
  check(wSeen.length === 1 && wSeen[0].id === wId, `women's scope sees ONLY the women's ball (${wSeen.length} row, ${wSeen[0]?.net_run_effect} runs)`);
  check(mSeen.length === 1 && mSeen[0].id === mId, `men's scope sees ONLY the men's ball (${mSeen.length} row, ${mSeen[0]?.net_run_effect} runs)`);
  check(!wSeen.some(d => d.id === mId), `men's ball did NOT leak into women's scope`);
  check(!mSeen.some(d => d.id === wId), `women's ball did NOT leak into men's scope`);

  // cleanup (soft-delete both by exact id)
  await fetch(`${BASE}/deliveries?id=in.(${wId},${mId})`, { method: 'PATCH', headers: H, body: JSON.stringify({ is_deleted: true }) });
  const remaining = ((await (await fetch(`${BASE}/deliveries?is_deleted=eq.false&select=id`, { headers: H })).json()) as unknown[]).length;
  check(remaining === 0, `cleanup complete — DB back to 0 active deliveries`);

  console.log(`\n${fail === 0 ? '🎉 CONCURRENT SCORING IS FULLY ISOLATED.' : `⚠️  ${fail} check(s) failed.`}\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('❌ threw:', e.message); process.exit(1); });
