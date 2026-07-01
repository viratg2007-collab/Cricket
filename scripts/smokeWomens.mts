// Women's scoring smoke test on the LIVE cloud: toss → a few balls (real engine)
// → read back the viewer state → cleanup (soft-delete balls + clear toss).
// Run: npx tsx scripts/smokeWomens.mts
import { readFileSync } from 'node:fs';
import {
  deriveMatchState, computeNetRunEffect, computeStrikeChanged, shouldReBowl, formatOvers,
} from '../src/lib/engine';
import { ALL_MATCHES, getPairsForTeam } from '../src/lib/matchData';
import { PLAYERS, TEAMS } from '../src/lib/seedData';
import type { Delivery } from '../src/lib/types';

const env = readFileSync('/Users/viratgandhi/cricket-scorer/.env.local', 'utf8');
const gg = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
const BASE = gg('VITE_SUPABASE_URL').replace(/\/$/, '') + '/rest/v1';
const KEY = gg('VITE_SUPABASE_ANON_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const SENT = '00000000-0000-0000-00fb-';
const RUN = Math.floor(Math.random() * 0xffff);
const nm = (id: string) => PLAYERS.find(p => p.id === id)?.name ?? '?';
const short = (id: string) => nm(id).split(' ')[0];
const tName = (id: string) => TEAMS.find(t => t.id === id)?.name ?? id;
const tShort = (id: string) => TEAMS.find(t => t.id === id)?.short_name ?? '?';
const posted: string[] = [];

const rec = ALL_MATCHES[0]; // women's match 1
const settings = rec.match.settings;
const batTeam = rec.match.home_team_id;
const bowlTeam = rec.match.away_team_id;
const pairs = getPairsForTeam(batTeam, rec.match.id);
const bowler = PLAYERS.find(p => p.team_id === bowlTeam)!;

type Out = { r: number; extra?: 'wide' | 'no_ball'; wkt?: boolean; label: string };
const script: Out[] = [
  { r: 1, label: 'quick single' },
  { r: 4, label: 'FOUR through the covers' },
  { r: 0, label: 'dot ball' },
  { r: 0, extra: 'wide', label: 'WIDE (+2)' },
  { r: 6, label: 'SIX over midwicket' },
  { r: 1, label: 'single (end of over)' },
  { r: 0, wkt: true, label: 'CAUGHT! wicket (−2)' },
  { r: 2, label: 'two to deep' },
];

const post = async (d: Delivery) => {
  const res = await fetch(`${BASE}/deliveries`, { method: 'POST', headers: H, body: JSON.stringify(d) });
  if (!res.ok) throw new Error(`insert failed: ${res.status} ${await res.text()}`);
};

let fail = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) fail++; };

(async () => {
  console.log(`\n🏏  WOMEN'S SMOKE TEST — ${tName(batTeam)} vs ${tName(bowlTeam)} (${rec.roundLabel})`);
  console.log(`    Opening pair: ${nm(pairs[0].player1_id)} & ${nm(pairs[0].player2_id)}\n`);

  // toss
  await fetch(`${BASE}/matches?id=eq.${rec.match.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ toss_winner_id: batTeam, toss_decision: 'bat' }) });
  console.log(`🪙 TOSS: ${tShort(batTeam)} won, elected to bat.\n`);

  const dels: Delivery[] = [];
  let n = 0;
  for (const b of script) {
    const d0 = deriveMatchState(dels, pairs, settings);
    const nb = d0.next_ball;
    const isReBowl = shouldReBowl(b.extra ?? 'none', nb.is_last_ball_of_pair_set, settings);
    const legal_ball = !isReBowl;
    const isEndOfOver = legal_ball && nb.ball_in_over === settings.balls_per_over - 1;
    const extraValue = b.extra ? (isReBowl ? 1 : settings.wide_value) : 0;
    const isWicket = isReBowl ? false : !!b.wkt;
    const strike_changed = computeStrikeChanged(b.r, isWicket, isEndOfOver, false);
    const net = computeNetRunEffect(b.r, extraValue, isWicket, settings);
    n++;
    const d: Delivery = {
      id: SENT + (RUN * 0x10000 + n).toString(16).padStart(12, '0'),
      innings_id: rec.innings1_id, pair_id: d0.current_pair!.id,
      over_number: nb.over_number, ball_in_over: nb.ball_in_over, sequence_number: n, is_deleted: false,
      striker_id: d0.striker_id, non_striker_id: d0.non_striker_id, bowler_id: bowler.id,
      runs_off_bat: b.r, extra_type: b.extra ?? 'none', extra_value: extraValue,
      is_wicket: isWicket, wicket_type: isWicket ? 'caught' : undefined,
      dismissed_player_id: isWicket ? d0.striker_id : undefined, fielder_id: isWicket ? bowler.id : undefined,
      net_run_effect: net, legal_ball, strike_changed, created_at: new Date().toISOString(),
    };
    await post(d); posted.push(d.id); dels.push(d);
    const dd = deriveMatchState(dels, pairs, settings);
    console.log(`  Ov ${formatOvers(dds(dels), settings.balls_per_over).padEnd(4)} │ ${short(d.striker_id).padEnd(8)} │ ${b.label}  →  ${dd.total} for ${dd.wickets}`);
  }

  // read back from cloud (viewer path) + toss
  const inList = `(${posted.join(',')})`;
  const cloud = await (await fetch(`${BASE}/deliveries?id=in.${encodeURIComponent(inList)}&is_deleted=eq.false&select=*&order=sequence_number`, { headers: H })).json();
  const toss = await (await fetch(`${BASE}/matches?id=eq.${rec.match.id}&select=toss_winner_id,toss_decision`, { headers: H })).json() as { toss_winner_id: string | null; toss_decision: string | null }[];
  const cd = deriveMatchState(cloud as Delivery[], pairs, settings);
  console.log(`\n── Viewer reads back from Supabase ──`);
  check(Array.isArray(cloud) && (cloud as Delivery[]).length === script.length, `all ${script.length} balls synced to cloud`);
  check(cd.total === 14 && cd.wickets === 1, `derived score matches: ${cd.total} for ${cd.wickets} (expected 14 for 1)`);
  check(toss[0]?.toss_winner_id === batTeam && toss[0]?.toss_decision === 'bat', `toss synced: ${tShort(toss[0]?.toss_winner_id ?? '')} elected ${toss[0]?.toss_decision}`);

  await cleanup();
  console.log(`\n${fail === 0 ? "🎉 WOMEN'S SCORING SMOKE TEST PASSED — untouched and working." : `⚠️  ${fail} check(s) failed.`}\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(async e => { console.error('❌ threw:', e.message); await cleanup(); process.exit(1); });

async function cleanup() {
  if (posted.length) await fetch(`${BASE}/deliveries?id=in.(${posted.join(',')})`, { method: 'PATCH', headers: H, body: JSON.stringify({ is_deleted: true }) });
  await fetch(`${BASE}/matches?id=eq.${rec.match.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ toss_winner_id: null, toss_decision: null }) });
  const active = ((await (await fetch(`${BASE}/deliveries?innings_id=eq.${rec.innings1_id}&is_deleted=eq.false&select=id`, { headers: H })).json()) as unknown[]).length;
  const t = await (await fetch(`${BASE}/matches?id=eq.${rec.match.id}&select=toss_winner_id`, { headers: H })).json() as { toss_winner_id: string | null }[];
  check(active === 0 && !t[0]?.toss_winner_id, `cleanup — match 1 pristine (0 active, toss cleared)`);
}

function dds(list: Delivery[]) { return list.filter(d => !d.is_deleted && d.legal_ball).length; }
