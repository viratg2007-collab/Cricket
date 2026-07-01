// Seeds a realistic men's tournament state on the cloud for a homepage walkthrough:
// Match 1 COMPLETE (both innings full), Match 2 LIVE (mid-2nd-innings chase) + toss.
// All balls use sentinel ids (00000000-0000-0000-00fa-*) for exact cleanup.
// Usage: npx tsx scripts/seedDemoState.mts seed   |   npx tsx scripts/seedDemoState.mts clean
import { readFileSync } from 'node:fs';
import { deriveMatchState, computeNetRunEffect, computeStrikeChanged, shouldReBowl } from '../src/lib/engine';
import { MENS_MATCHES, MENS_PLAYERS, mensPairs, getMensMatch } from '../src/lib/mensData';
import type { Delivery } from '../src/lib/types';

const env = readFileSync('/Users/viratgandhi/cricket-scorer/.env.local', 'utf8');
const gg = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
const BASE = gg('VITE_SUPABASE_URL').replace(/\/$/, '') + '/rest/v1';
const KEY = gg('VITE_SUPABASE_ANON_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const SENT = '00000000-0000-0000-00fa-';
let idc = 0;
const nextId = () => SENT + (idc++).toString(16).padStart(12, '0');
const posted: string[] = [];

let seed = 999;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

async function scoreInnings(inningsId: string, batTeam: string, bowlTeam: string, maxLegal: number, aggr: number) {
  const pairs = mensPairs(batTeam, inningsId);
  const bowlers = MENS_PLAYERS.filter(p => p.team_id === bowlTeam);
  const dels: Delivery[] = [];
  let n = 0;
  while (true) {
    const d0 = deriveMatchState(dels, pairs, mensSettings);
    const legal = dels.filter(d => d.legal_ball).length;
    if (d0.is_complete || legal >= maxLegal) break;
    const nb = d0.next_ball;
    const bowler = bowlers[Math.floor(d0.current_absolute_over) % 5];
    const x = rnd();
    const wide = !nb.is_last_ball_of_pair_set && x < 0.05;
    const wkt = !wide && x > 0.955;
    const y = rnd() * aggr;
    const r = wide || wkt ? 0 : y > 0.92 ? 6 : y > 0.8 ? 4 : y > 0.58 ? 2 : y > 0.28 ? 1 : 0;
    const isReBowl = shouldReBowl(wide ? 'wide' : 'none', nb.is_last_ball_of_pair_set, mensSettings);
    const legal_ball = !isReBowl;
    const isEndOfOver = legal_ball && nb.ball_in_over === mensSettings.balls_per_over - 1;
    const extraValue = wide ? (isReBowl ? 1 : mensSettings.wide_value) : 0;
    const isWicket = isReBowl ? false : wkt;
    n++;
    const d: Delivery = {
      id: nextId(), innings_id: inningsId, pair_id: d0.current_pair!.id,
      over_number: nb.over_number, ball_in_over: nb.ball_in_over, sequence_number: n, is_deleted: false,
      striker_id: d0.striker_id, non_striker_id: d0.non_striker_id, bowler_id: bowler.id,
      runs_off_bat: r, extra_type: wide ? 'wide' : 'none', extra_value: extraValue,
      is_wicket: isWicket, wicket_type: isWicket ? 'caught' : undefined,
      dismissed_player_id: isWicket ? d0.striker_id : undefined, fielder_id: isWicket ? bowler.id : undefined,
      net_run_effect: computeNetRunEffect(r, extraValue, isWicket, mensSettings),
      legal_ball, strike_changed: computeStrikeChanged(r, isWicket, isEndOfOver, false),
      created_at: new Date().toISOString(),
    };
    const res = await fetch(`${BASE}/deliveries`, { method: 'POST', headers: H, body: JSON.stringify(d) });
    if (!res.ok) throw new Error(await res.text());
    posted.push(d.id); dels.push(d);
  }
  return deriveMatchState(dels, pairs, mensSettings).total;
}

const mensSettings = MENS_MATCHES[0].match.settings;

async function clean() {
  // soft-delete any sentinel balls (find by innings across men's matches) + clear tosses
  for (const r of MENS_MATCHES) {
    const rows = await (await fetch(`${BASE}/deliveries?innings_id=in.(${r.innings1_id},${r.innings2_id})&select=id`, { headers: H })).json() as { id: string }[];
    const sent = rows.filter(x => x.id.startsWith(SENT)).map(x => x.id);
    for (let i = 0; i < sent.length; i += 50) {
      await fetch(`${BASE}/deliveries?id=in.(${sent.slice(i, i + 50).join(',')})`, { method: 'PATCH', headers: H, body: JSON.stringify({ is_deleted: true }) });
    }
    await fetch(`${BASE}/matches?id=eq.${r.match.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ toss_winner_id: null, toss_decision: null }) });
  }
  const active = ((await (await fetch(`${BASE}/deliveries?is_deleted=eq.false&select=id`, { headers: H })).json()) as unknown[]).length;
  console.log(`cleaned — active deliveries in DB: ${active}`);
}

(async () => {
  const mode = process.argv[2];
  if (mode === 'clean') { await clean(); return; }

  // Match 1 — COMPLETE
  const m1 = getMensMatch(MENS_MATCHES[0].match.id)!;
  await fetch(`${BASE}/matches?id=eq.${m1.match.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ toss_winner_id: m1.match.home_team_id, toss_decision: 'bat' }) });
  const a = await scoreInnings(m1.innings1_id, m1.match.home_team_id, m1.match.away_team_id, 60, 1.0);
  const b = await scoreInnings(m1.innings2_id, m1.match.away_team_id, m1.match.home_team_id, 60, 1.05);
  console.log(`Match 1 complete: MNW ${a} vs SUN ${b}`);

  // Match 2 — LIVE (2nd innings chase in progress) + toss
  const m2 = getMensMatch(MENS_MATCHES[1].match.id)!;
  await fetch(`${BASE}/matches?id=eq.${m2.match.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ toss_winner_id: m2.match.home_team_id, toss_decision: 'bat' }) });
  const c = await scoreInnings(m2.innings1_id, m2.match.home_team_id, m2.match.away_team_id, 60, 1.0);
  await scoreInnings(m2.innings2_id, m2.match.away_team_id, m2.match.home_team_id, 34, 1.1); // ~5.4 overs in
  console.log(`Match 2 live: MI ${c} — SPK chasing`);
  console.log('SEED DONE');
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
