// Manual scoring walkthrough on the LIVE men's Match 1. Faithfully replays the
// app reducer (deriveMatchState + computeNetRunEffect/computeStrikeChanged/
// shouldReBowl), POSTs each ball to Supabase (the real cross-device path), prints
// the viewer's derived state after every ball, then hard-deletes everything so the
// match is pristine for the tournament. Run: npx tsx scripts/walkthroughMens.mts
import { readFileSync } from 'node:fs';
import {
  deriveMatchState, computeNetRunEffect, computeStrikeChanged, shouldReBowl, formatOvers,
} from '../src/lib/engine';
import { MENS_PLAYERS, mensPairs, getMensMatch, mMatchId } from '../src/lib/mensData';
import type { Delivery } from '../src/lib/types';

const env = readFileSync('/Users/viratgandhi/cricket-scorer/.env.local', 'utf8');
const g = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
const BASE = g('VITE_SUPABASE_URL').replace(/\/$/, '') + '/rest/v1';
const KEY = g('VITE_SUPABASE_ANON_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const SENT = '00000000-0000-0000-00fe-';
// per-run nonce so re-runs never collide on the primary key (soft-deleted rows keep their PK)
const RUN = Math.floor(Math.random() * 0xffffff);
const sentId = (n: number) => SENT + (RUN * 256 + n).toString(16).padStart(12, '0');
const nm = (id: string) => MENS_PLAYERS.find(p => p.id === id)?.name ?? '?';
const short = (id: string) => nm(id).split(' ')[0];

const posted: string[] = [];
const rec = getMensMatch(mMatchId(1))!;
const settings = rec.match.settings;
const pairs = mensPairs(rec.match.home_team_id, rec.match.id); // MN Warriors bat first
const bowlers = MENS_PLAYERS.filter(p => p.team_id === rec.match.away_team_id).slice(0, 2); // SUN

type Ball = { r: number; extra?: 'wide' | 'no_ball'; wkt?: boolean; label: string };
const script: Ball[] = [
  { r: 1, label: 'pushed to long-on, quick single' },
  { r: 4, label: 'CRACKED through covers — FOUR' },
  { r: 0, label: 'defended, dot ball' },
  { r: 0, extra: 'wide', label: 'down leg — WIDE (+2)' },
  { r: 6, label: 'launched over midwicket — SIX!' },
  { r: 1, label: 'tucked to fine leg, single (end of over)' },
  { r: 0, label: 'beaten outside off, dot' },
  { r: 0, wkt: true, label: 'edged — CAUGHT! Wicket (−2)' },
  { r: 2, label: 'worked into the gap for two' },
  { r: 4, label: 'driven past mid-off — FOUR' },
  { r: 1, label: 'single to deep point' },
  { r: 3, label: 'last ball of the pair set — three runs' },
];

async function post(d: Delivery) {
  const res = await fetch(`${BASE}/deliveries`, { method: 'POST', headers: H, body: JSON.stringify(d) });
  if (!res.ok) throw new Error(`insert failed: ${res.status} ${await res.text()}`);
}

(async () => {
  console.log(`\n🏏  MEN'S MATCH 1 — ${'MN Warriors'} vs Antwerp Sunrisers  (10 overs / 5 pairs)`);
  console.log(`    Opening pair: ${nm(pairs[0].player1_id)} & ${nm(pairs[0].player2_id)}\n`);

  const dels: Delivery[] = [];
  let n = 0;
  for (const b of script) {
    const d0 = deriveMatchState(dels, pairs, settings);
    const nb = d0.next_ball;
    const bowler = bowlers[Math.floor(d0.current_absolute_over) % 2];

    const isReBowl = shouldReBowl(b.extra ?? 'none', nb.is_last_ball_of_pair_set, settings);
    const legal_ball = !isReBowl;
    const isEndOfOver = legal_ball && nb.ball_in_over === settings.balls_per_over - 1;
    const extraValue = b.extra ? (isReBowl ? 1 : settings.wide_value) : 0;
    const isWicket = isReBowl ? false : !!b.wkt;
    const strike_changed = computeStrikeChanged(b.r, isWicket, isEndOfOver, false);
    const net = computeNetRunEffect(b.r, extraValue, isWicket, settings);

    n++;
    const d: Delivery = {
      id: sentId(n),
      innings_id: rec.innings1_id,
      pair_id: d0.current_pair!.id,
      over_number: nb.over_number,
      ball_in_over: nb.ball_in_over,
      sequence_number: n,
      is_deleted: false,
      striker_id: d0.striker_id,
      non_striker_id: d0.non_striker_id,
      bowler_id: bowler.id,
      runs_off_bat: b.r,
      extra_type: b.extra ?? 'none',
      extra_value: extraValue,
      is_wicket: isWicket,
      wicket_type: isWicket ? 'caught' : undefined,
      dismissed_player_id: isWicket ? d0.striker_id : undefined,
      fielder_id: isWicket ? bowlers[1].id : undefined,
      net_run_effect: net,
      legal_ball,
      strike_changed,
      created_at: new Date().toISOString(),
    };
    await post(d);
    dels.push(d);
    posted.push(d.id);

    const dd = deriveMatchState(dels, pairs, settings);
    const ov = formatOvers(dds(dels), settings.balls_per_over);
    const bowlerTag = short(bowler.id);
    console.log(`  Ov ${ov.padEnd(4)} │ ${short(d.striker_id).padEnd(8)} vs ${bowlerTag.padEnd(8)} │ ${b.label}`);
    console.log(`         └─ ${dd.total} for ${dd.wickets}   (on strike: ${short(dd.striker_id)}, non-striker: ${short(dd.non_striker_id)})`);
  }

  // Read back from the cloud exactly as a viewer device would (in-list, not like:
  // the id column is uuid, which has no ~~ operator).
  const inList = `(${posted.join(',')})`;
  const rb = await fetch(`${BASE}/deliveries?id=in.${encodeURIComponent(inList)}&is_deleted=eq.false&select=*&order=sequence_number`, { headers: H });
  const cloud = await rb.json();
  if (!Array.isArray(cloud)) throw new Error(`read-back not an array: ${JSON.stringify(cloud)}`);
  const cloudDels = cloud as Delivery[];
  const cloudDerived = deriveMatchState(cloudDels, pairs, settings);

  console.log(`\n── Viewer sees (read back from Supabase, ${cloudDels.length} balls) ──`);
  console.log(`   SCORE: ${cloudDerived.total} for ${cloudDerived.wickets}  in  ${formatOvers(dds(cloudDels), settings.balls_per_over)} overs`);
  console.log(`   ${short(pairs[0].player1_id)}: ${cloudDerived.batter_runs[pairs[0].player1_id] ?? 0} (${cloudDerived.batter_balls[pairs[0].player1_id] ?? 0})   ` +
              `${short(pairs[0].player2_id)}: ${cloudDerived.batter_runs[pairs[0].player2_id] ?? 0} (${cloudDerived.batter_balls[pairs[0].player2_id] ?? 0})`);
  console.log(`   Pair rotated to pair #${cloudDerived.pair_index + 1}: ${cloudDerived.pair_index === 1 ? 'yes ✅' : 'no'}`);
})()
  .then(() => cleanup(0))
  .catch(async e => { console.error('\n❌ walkthrough threw:', e.message); await cleanup(1); });

// Cleanup ALWAYS runs — soft-delete (RLS permits UPDATE, not DELETE), like the app's reset.
async function cleanup(code: number) {
  if (posted.length) {
    const inList = `(${posted.join(',')})`;
    await fetch(`${BASE}/deliveries?id=in.${encodeURIComponent(inList)}`, { method: 'PATCH', headers: H, body: JSON.stringify({ is_deleted: true }) });
  }
  const verify = await fetch(`${BASE}/deliveries?innings_id=eq.${rec.innings1_id}&is_deleted=eq.false&select=id`, { headers: H });
  const remaining = ((await verify.json()) as unknown[]).length;
  console.log(`\n🧹 Cleanup: soft-deleted ${posted.length} walkthrough balls; Match 1 now has ${remaining} ACTIVE deliveries → ${remaining === 0 ? 'PRISTINE ✅' : '⚠️ not empty'}\n`);
  process.exit(remaining === 0 ? code : 1);
}

// legal-ball count helper for over display
function dds(list: Delivery[]) { return list.filter(d => !d.is_deleted && d.legal_ball).length; }
