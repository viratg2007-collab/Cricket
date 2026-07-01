// FULL men's match, start to finish, on the live cloud: toss → innings 1 (60
// balls) → innings 2 chase (60 balls) → result → standings. Faithfully replays the
// app reducer (deriveMatchState + net-run/strike/rebowl helpers). Cleans up
// everything (soft-delete all balls + clear toss) so the match is pristine after.
// Run: npx tsx scripts/fullMatchMens.mts
import { readFileSync } from 'node:fs';
import {
  deriveMatchState, computeNetRunEffect, computeStrikeChanged, shouldReBowl, formatOvers,
} from '../src/lib/engine';
import {
  MENS_PLAYERS, MENS_TEAMS, mensPairs, getMensMatch, mMatchId, mensTeamName, mensTeamShort,
  computeMensStandings,
} from '../src/lib/mensData';
import type { Delivery, Pair } from '../src/lib/types';

const env = readFileSync('/Users/viratgandhi/cricket-scorer/.env.local', 'utf8');
const gg = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
const BASE = gg('VITE_SUPABASE_URL').replace(/\/$/, '') + '/rest/v1';
const KEY = gg('VITE_SUPABASE_ANON_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const SENT = '00000000-0000-0000-00fc-';
const RUN = Math.floor(Math.random() * 0xffff);
const nm = (id: string) => MENS_PLAYERS.find(p => p.id === id)?.name ?? '?';
const short = (id: string) => nm(id).split(' ')[0];
const posted: string[] = [];

const rec = getMensMatch(mMatchId(1))!;
const settings = rec.match.settings;
const homeTeam = rec.match.home_team_id; // MN Warriors bat first
const awayTeam = rec.match.away_team_id; // Antwerp Sunrisers

// Seeded RNG for a realistic-but-repeatable innings.
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

type Out = { r: number; extra?: 'wide' | 'no_ball'; wkt?: boolean };
// Generate one outcome. `last` = last ball of the pair set (must stay legal).
function genOutcome(last: boolean, aggression: number): Out {
  const x = rnd();
  if (!last && x < 0.06) return { r: 0, extra: 'wide' };
  if (x < 0.04) return { r: 0, wkt: true };
  const y = rnd() * aggression;
  if (y > 0.93) return { r: 6 };
  if (y > 0.80) return { r: 4 };
  if (y > 0.60) return { r: 2 };
  if (y > 0.30) return { r: 1 };
  return { r: 0 };
}

async function post(d: Delivery) {
  const res = await fetch(`${BASE}/deliveries`, { method: 'POST', headers: H, body: JSON.stringify(d) });
  if (!res.ok) throw new Error(`insert failed: ${res.status} ${await res.text()}`);
}

async function scoreInnings(inningsId: string, battingTeam: string, bowlingTeam: string, aggression: number, label: string) {
  const pairs: Pair[] = mensPairs(battingTeam, rec.match.id);
  const bowlers = MENS_PLAYERS.filter(p => p.team_id === bowlingTeam);
  const dels: Delivery[] = [];
  let seq = 0;
  console.log(`\n━━ ${label}: ${mensTeamName(battingTeam)} batting ━━`);

  while (true) {
    const d0 = deriveMatchState(dels, pairs, settings);
    if (d0.is_complete) break;
    const nb = d0.next_ball;
    const bowler = bowlers[Math.floor(d0.current_absolute_over) % 5];
    const out = genOutcome(nb.is_last_ball_of_pair_set, aggression);

    const isReBowl = shouldReBowl(out.extra ?? 'none', nb.is_last_ball_of_pair_set, settings);
    const legal_ball = !isReBowl;
    const isEndOfOver = legal_ball && nb.ball_in_over === settings.balls_per_over - 1;
    const extraValue = out.extra ? (isReBowl ? 1 : settings.wide_value) : 0;
    const isWicket = isReBowl ? false : !!out.wkt;
    const strike_changed = computeStrikeChanged(out.r, isWicket, isEndOfOver, false);
    const net = computeNetRunEffect(out.r, extraValue, isWicket, settings);

    seq++;
    const d: Delivery = {
      id: SENT + (RUN * 0x10000 + (inningsId.endsWith('5') ? 0 : 0x8000) + seq).toString(16).padStart(12, '0'),
      innings_id: inningsId, pair_id: d0.current_pair!.id,
      over_number: nb.over_number, ball_in_over: nb.ball_in_over, sequence_number: seq,
      is_deleted: false,
      striker_id: d0.striker_id, non_striker_id: d0.non_striker_id, bowler_id: bowler.id,
      runs_off_bat: out.r, extra_type: out.extra ?? 'none', extra_value: extraValue,
      is_wicket: isWicket, wicket_type: isWicket ? 'caught' : undefined,
      dismissed_player_id: isWicket ? d0.striker_id : undefined,
      fielder_id: isWicket ? bowlers[(seq) % bowlers.length].id : undefined,
      net_run_effect: net, legal_ball, strike_changed, created_at: new Date().toISOString(),
    };
    await post(d);
    posted.push(d.id);
    dels.push(d);
  }

  const dd = deriveMatchState(dels, pairs, settings);
  const legal = dels.filter(d => !d.is_deleted && d.legal_ball).length;
  console.log(`   FINAL: ${dd.total} for ${dd.wickets}  in ${formatOvers(legal, settings.balls_per_over)} overs  (complete: ${dd.is_complete ? 'yes ✅' : 'NO'})`);
  // top scorers
  const bat = Object.entries(dd.batter_runs).map(([id, r]) => ({ id, r, b: dd.batter_balls[id] ?? 0 }))
    .sort((a, b) => b.r - a.r).slice(0, 3);
  console.log(`   Top: ` + bat.map(x => `${short(x.id)} ${x.r}(${x.b})`).join(', '));
  return dd.total;
}

(async () => {
  console.log(`\n🏏  FULL MEN'S MATCH — ${mensTeamName(homeTeam)} vs ${mensTeamName(awayTeam)}`);
  console.log(`    Format: ${settings.num_pairs} pairs × ${settings.overs_per_pair} overs = ${settings.overs_per_innings} overs / ${settings.num_pairs * settings.overs_per_pair * settings.balls_per_over} balls per innings`);

  // ── TOSS ──
  await fetch(`${BASE}/matches?id=eq.${rec.match.id}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ toss_winner_id: homeTeam, toss_decision: 'bat' }),
  });
  console.log(`\n🪙 TOSS: ${mensTeamShort(homeTeam)} won the toss and elected to BAT first.`);

  // ── INNINGS 1 ──
  const s1 = await scoreInnings(rec.innings1_id, homeTeam, awayTeam, 1.0, 'INNINGS 1');
  console.log(`\n   🎯 ${mensTeamShort(awayTeam)} need ${s1 + 1} to win.`);

  // ── INNINGS 2 (chase) ──
  const s2 = await scoreInnings(rec.innings2_id, awayTeam, homeTeam, 1.06, 'INNINGS 2');

  // ── RESULT ──
  console.log(`\n══════════ RESULT ══════════`);
  console.log(`   ${mensTeamShort(homeTeam)} ${s1}   |   ${mensTeamShort(awayTeam)} ${s2}`);
  if (s2 > s1) console.log(`   🏆 ${mensTeamName(awayTeam)} won by ${countBatters()} (chasing) — margin ${s2 - s1}`);
  else if (s1 > s2) console.log(`   🏆 ${mensTeamName(homeTeam)} won by ${s1 - s2} runs`);
  else console.log(`   🤝 Match tied`);

  // ── STANDINGS (reads the cloud; this completed match now counts) ──
  const st = await computeMensStandings();
  console.log(`\n── Points table (live from cloud) ──`);
  console.log(`   ${'Team'.padEnd(20)} P  W  L   Pts   NRR`);
  for (const r of st.rows) {
    console.log(`   ${mensTeamName(r.team_id).padEnd(20)} ${r.played}  ${r.won}  ${r.lost}   ${String(r.points).padStart(3)}   ${(r.nrr >= 0 ? '+' : '') + r.nrr.toFixed(2)}`);
  }
})()
  .then(() => cleanup(0))
  .catch(async e => { console.error('\n❌ full match threw:', e.message); await cleanup(1); });

function countBatters() { return 'the chase'; }

async function cleanup(code: number) {
  // soft-delete every ball we posted (chunked), and clear the toss
  for (let i = 0; i < posted.length; i += 50) {
    const chunk = posted.slice(i, i + 50);
    await fetch(`${BASE}/deliveries?id=in.(${chunk.join(',')})`, { method: 'PATCH', headers: H, body: JSON.stringify({ is_deleted: true }) });
  }
  await fetch(`${BASE}/matches?id=eq.${rec.match.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ toss_winner_id: null, toss_decision: null }) });
  const active = ((await (await fetch(`${BASE}/deliveries?is_deleted=eq.false&select=id`, { headers: H })).json()) as unknown[]).length;
  const toss = await (await fetch(`${BASE}/matches?id=eq.${rec.match.id}&select=toss_winner_id`, { headers: H })).json() as { toss_winner_id: string | null }[];
  console.log(`\n🧹 Cleanup: soft-deleted ${posted.length} balls, cleared toss. DB active deliveries: ${active}, toss: ${toss[0]?.toss_winner_id ?? 'null'} → ${active === 0 && !toss[0]?.toss_winner_id ? 'PRISTINE ✅' : '⚠️'}\n`);
  void MENS_TEAMS;
  process.exit(active === 0 && !toss[0]?.toss_winner_id ? code : 1);
}
