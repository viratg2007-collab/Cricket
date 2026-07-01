// End-to-end test of the men's scorer against Supabase via the REST (PostgREST)
// API — the same path the app uses to insert deliveries. Verifies the seed rows
// exist and that a men's delivery inserts through the full FK chain, then reads
// it back (the cross-device viewer path) and cleans up.
// Run: npx tsx scripts/testMensScorer.mts
import { readFileSync } from 'node:fs';
import {
  MENS_TEAMS, MENS_PLAYERS, MENS_MATCHES, mensPairs, getMensMatch,
} from '../src/lib/mensData';

const env = readFileSync('/Users/viratgandhi/cricket-scorer/.env.local', 'utf8');
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
const BASE = get('VITE_SUPABASE_URL').replace(/\/$/, '') + '/rest/v1';
const KEY = get('VITE_SUPABASE_ANON_KEY');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

let fail = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) fail++; };

async function countIn(table: string, ids: string[]) {
  const inList = `(${ids.map(i => `"${i}"`).join(',')})`;
  const res = await fetch(`${BASE}/${table}?id=in.${encodeURIComponent(inList)}&select=id`, { headers: H });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return (await res.json() as unknown[]).length;
}

(async () => {
  console.log(`\n── Seed verification ──`);
  check(await countIn('teams', MENS_TEAMS.map(t => t.id)) === MENS_TEAMS.length, `4 men's teams seeded`);
  check(await countIn('players', MENS_PLAYERS.map(p => p.id)) === MENS_PLAYERS.length, `${MENS_PLAYERS.length} men's players seeded`);
  check(await countIn('matches', MENS_MATCHES.map(m => m.match.id)) === MENS_MATCHES.length, `7 men's matches seeded`);
  const inns = MENS_MATCHES.flatMap(m => [m.innings1_id, m.innings2_id]);
  check(await countIn('innings', inns) === inns.length, `14 men's innings seeded`);
  const allPairIds = MENS_TEAMS.flatMap(t => mensPairs(t.id, MENS_MATCHES[0].match.id).map(p => p.id));
  check(await countIn('pairs', allPairIds) === allPairIds.length, `20 men's pairs seeded`);

  console.log(`\n── Live scoring simulation (Match 1: ${MENS_TEAMS[0].name} v ${MENS_TEAMS[1].name}) ──`);
  const rec = getMensMatch(MENS_MATCHES[0].match.id)!;
  const batPair = mensPairs(MENS_TEAMS[0].id, rec.match.id)[0];
  const bowler = MENS_PLAYERS.find(p => p.team_id === MENS_TEAMS[1].id)!;
  const testId = '00000000-0000-0000-00ff-000000000001';

  await fetch(`${BASE}/deliveries?id=eq.${testId}`, { method: 'DELETE', headers: H });

  const delivery = {
    id: testId, innings_id: rec.innings1_id, pair_id: batPair.id,
    over_number: 0, ball_in_over: 1, sequence_number: 1,
    striker_id: batPair.player1_id, non_striker_id: batPair.player2_id, bowler_id: bowler.id,
    runs_off_bat: 4, extra_type: 'none', extra_value: 0, legal_ball: true,
    is_wicket: false, net_run_effect: 4, strike_changed: false, is_deleted: false,
  };
  const ins = await fetch(`${BASE}/deliveries`, { method: 'POST', headers: H, body: JSON.stringify(delivery) });
  check(ins.ok, `insert delivery through men's FK chain (4 off the bat)${ins.ok ? '' : ' — ' + ins.status + ' ' + await ins.text()}`);

  const rb = await fetch(`${BASE}/deliveries?id=eq.${testId}&select=net_run_effect,striker_id`, { headers: H });
  const rows = await rb.json() as { net_run_effect: number; striker_id: string }[];
  const p = MENS_PLAYERS.find(x => x.id === rows[0]?.striker_id);
  check(rows[0]?.net_run_effect === 4, `read delivery back (cross-device path): ${p?.name} scored ${rows[0]?.net_run_effect}`);

  const del = await fetch(`${BASE}/deliveries?id=eq.${testId}`, { method: 'DELETE', headers: H });
  check(del.ok, `cleanup test delivery`);

  console.log(`\n${fail === 0 ? "🎉 ALL PASS — men's scorer is wired to Supabase correctly." : `⚠️  ${fail} check(s) failed.`}\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('❌ test threw:', e.message); process.exit(1); });
