import type { Match, Pair, Player, Team, Delivery, MatchSettings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { supabaseEnabled, fetchAllDeliveries } from './supabase';

// ══════════════════════════════════════════════════════════════════════════════
// MEN'S +50 TOURNAMENT — fully isolated data module.
// Double-wicket, but 5 pairs / 10 overs (60 legal balls). 4 teams, round-robin
// + final. All IDs use n>=100 so they never collide with the women's data.
// ══════════════════════════════════════════════════════════════════════════════

function mkid(cat: number, n: number): string {
  return `00000000-0000-0000-${cat.toString(16).padStart(4, '0')}-${n.toString(16).padStart(12, '0')}`;
}
export function mMatchId(n: number): string { return mkid(4, 100 + n); }
export function mInningsId(n: number): string { return mkid(5, 100 + n); }
const teamId = (i: number) => mkid(1, 101 + i);          // 4 teams
const playerId = (i: number, j: number) => mkid(2, 100 + i * 20 + j); // team i, player j (1-based)
const pairId = (i: number, p: number) => mkid(3, 100 + i * 10 + p);   // team i, pair p (1-based)

// Men's format settings: 5 pairs, 2 overs each = 10 overs / 60 legal balls.
export const MENS_SETTINGS: MatchSettings = {
  ...DEFAULT_SETTINGS,
  num_pairs: 5,
  overs_per_pair: 2,
  overs_per_innings: 10,
  balls_per_over: 6,
};

// ── Teams & squads (captain = first listed) ────────────────────────────────────
const SQUADS: { name: string; short: string; players: string[] }[] = [
  {
    name: 'MN Warriors', short: 'MNW',
    players: ['Manish Mehta', 'Yatish Shah', 'Sunil Jhaveri', 'Bobby', 'Siddharth Kothari', 'Ankur Shah', 'Sanjay Parakh', 'Naresh Shah', 'Samir Patel', 'Shasin Choksi', 'Mansukh Patel', 'Shailesh Shah'],
  },
  {
    name: 'Antwerp Sunrisers', short: 'SUN',
    players: ['Naresh Jain', 'Ketan Khimani', 'Promit Shah', 'Arpan Javeri', 'Mihir D Navin', 'Rajiv Kothari', 'Samir Bhansali', 'Sanjiv Mehta', 'Pankaj Shah', 'Divyesh Shah', 'Himanshu Shah'],
  },
  {
    name: 'Mumbai Indians', short: 'MI',
    players: ['Kishore Kakadiya', 'Bunty', 'Nimesh Modi', 'Manish Shah', 'Vimesh', 'Samir Seth', 'Samir Javeri', 'Rahul Zaveri', 'MK', 'Milan'],
  },
  {
    name: 'Sparkle Strikers', short: 'SPK',
    players: ['Nimish Daftary', 'Ashish Parikh', 'Haresh Mehta', 'Bhavesh Morakhia', 'Ketan Kediam', 'Chetan Shah', 'Pankaj Parekh', 'Chetan Mehta', 'Jitu Bagadia', 'Mukesh Shah', 'Sandeep Shah', 'Ajit Barmecha'],
  },
];

export const MENS_TEAMS: Team[] = SQUADS.map((s, i) => ({ id: teamId(i), name: s.name, short_name: s.short }));

export const MENS_PLAYERS: Player[] = SQUADS.flatMap((s, i) =>
  s.players.map((name, j) => ({
    id: playerId(i, j + 1),
    team_id: teamId(i),
    name,
    jersey_number: j + 1,
    role: 'allrounder' as const,
    is_captain: j === 0, // default: first listed
  }))
);

// team index helper
const TI: Record<string, number> = { MNW: 0, SUN: 1, MI: 2, SPK: 3 };

// ── Pair helpers (5 pairs per team) ─────────────────────────────────────────────
function teamIndexOf(tid: string): number { return MENS_TEAMS.findIndex(t => t.id === tid); }

export function mensEmptyPairs(tid: string, matchId: string): Pair[] {
  const i = teamIndexOf(tid);
  return Array.from({ length: 5 }, (_, p) => ({
    id: pairId(i, p + 1), match_id: matchId, team_id: tid,
    pair_number: p + 1, player1_id: '', player2_id: '',
  }));
}
export function mensPairs(tid: string, matchId: string): Pair[] {
  const i = teamIndexOf(tid);
  return Array.from({ length: 5 }, (_, p) => ({
    id: pairId(i, p + 1), match_id: matchId, team_id: tid,
    pair_number: p + 1,
    player1_id: playerId(i, p * 2 + 1), player2_id: playerId(i, p * 2 + 2),
  }));
}

// ── Match catalogue: 6 round-robin (schedule order) + final ─────────────────────
export type MRound = 'rr' | 'final';
export interface MensMatchRecord {
  match: Match; innings1_id: string; innings2_id: string;
  round: MRound; homeSlot: string; awaySlot: string; roundLabel: string;
}

interface MDef { n: number; round: MRound; home: string; away: string; label: string; }
const MDEFS: MDef[] = [
  { n: 1, round: 'rr', home: TI.MNW + '', away: TI.SUN + '', label: 'Round Robin' }, // MN Warriors v Antwerp Sunrisers
  { n: 2, round: 'rr', home: TI.MI + '',  away: TI.SPK + '', label: 'Round Robin' }, // Mumbai Indians v Sparkle Strikers
  { n: 3, round: 'rr', home: TI.MNW + '', away: TI.MI + '',  label: 'Round Robin' }, // MN Warriors v Mumbai Indians
  { n: 4, round: 'rr', home: TI.SUN + '', away: TI.SPK + '', label: 'Round Robin' }, // Antwerp Sunrisers v Sparkle Strikers
  { n: 5, round: 'rr', home: TI.SUN + '', away: TI.MI + '',  label: 'Round Robin' }, // Antwerp Sunrisers v Mumbai Indians
  { n: 6, round: 'rr', home: TI.MNW + '', away: TI.SPK + '', label: 'Round Robin' }, // MN Warriors v Sparkle Strikers
  { n: 7, round: 'final', home: 'F1', away: 'F2', label: 'Final' },                   // 1st v 2nd
];

// Resolve a slot to a team id. RR slots are team indices; F1/F2 come from standings.
export interface MensStandingRow {
  team_id: string; played: number; won: number; lost: number; tied: number;
  points: number; rf: number; ra: number; nrr: number;
}

function resolveMensSlot(slot: string, finalists: string[]): string {
  if (slot === 'F1') return finalists[0] ?? '';
  if (slot === 'F2') return finalists[1] ?? '';
  return teamId(parseInt(slot, 10));
}

function buildMensRecord(def: MDef, finalists: string[]): MensMatchRecord {
  return {
    match: {
      id: mMatchId(def.n),
      name: def.label,
      home_team_id: resolveMensSlot(def.home, finalists),
      away_team_id: resolveMensSlot(def.away, finalists),
      settings: MENS_SETTINGS,
      status: 'scheduled',
    },
    innings1_id: mInningsId((def.n - 1) * 2 + 1),
    innings2_id: mInningsId((def.n - 1) * 2 + 2),
    round: def.round,
    homeSlot: def.home,
    awaySlot: def.away,
    roundLabel: def.label,
  };
}

// ── Results (from deliveries) ───────────────────────────────────────────────────
export interface MensResult { t1: string; t2: string; s1: number | null; s2: number | null; complete: boolean; }
type InnData = { deliveries?: Delivery[] };
const TARGET = MENS_SETTINGS.num_pairs * MENS_SETTINGS.overs_per_pair * MENS_SETTINGS.balls_per_over; // 60

function teamOfPlayer(pid: string | undefined): string {
  return MENS_PLAYERS.find(p => p.id === pid)?.team_id ?? '';
}
function scoreTeam(dels: Delivery[] | undefined): { score: number | null; team: string; legal: number } {
  const active = (dels ?? []).filter(d => !d.is_deleted && d.extra_type !== 'strike_override');
  if (active.length === 0) return { score: null, team: '', legal: 0 };
  const sorted = [...active].sort((a, b) => a.sequence_number - b.sequence_number);
  return {
    score: sorted.reduce((s, d) => s + d.net_run_effect, 0),
    team: teamOfPlayer(sorted[0].striker_id),
    legal: sorted.filter(d => d.legal_ball).length,
  };
}

function mensLocalResults(): Record<number, MensResult> {
  const out: Record<number, MensResult> = {};
  for (const def of MDEFS) {
    try {
      const raw = localStorage.getItem(`cricket_match_${mMatchId(def.n)}_v2`);
      if (!raw) continue;
      const st = JSON.parse(raw) as { inn1?: InnData; inn2?: InnData };
      const a = scoreTeam(st.inn1?.deliveries), b = scoreTeam(st.inn2?.deliveries);
      if (a.score === null) continue;
      out[def.n] = { t1: a.team, t2: b.team, s1: a.score, s2: b.score, complete: a.legal >= TARGET && b.legal >= TARGET };
    } catch { /* skip */ }
  }
  return out;
}

async function mensSupabaseResults(): Promise<Record<number, MensResult>> {
  const all = await fetchAllDeliveries();
  const byInn: Record<string, Delivery[]> = {};
  for (const d of all) {
    if (d.is_deleted || d.extra_type === 'strike_override') continue;
    (byInn[d.innings_id] ??= []).push(d);
  }
  const out: Record<number, MensResult> = {};
  for (const def of MDEFS) {
    const a = scoreTeam(byInn[mInningsId((def.n - 1) * 2 + 1)]);
    const b = scoreTeam(byInn[mInningsId((def.n - 1) * 2 + 2)]);
    if (a.score === null) continue;
    out[def.n] = { t1: a.team, t2: b.team, s1: a.score, s2: b.score, complete: a.legal >= TARGET && b.legal >= TARGET };
  }
  return out;
}

// ── Standings (round robin over matches 1-6) ────────────────────────────────────
function standingsFrom(results: Record<number, MensResult>): MensStandingRow[] {
  const rows: Record<string, MensStandingRow> = {};
  const of: Record<string, number> = {}, oa: Record<string, number> = {};
  for (const t of MENS_TEAMS) { rows[t.id] = { team_id: t.id, played: 0, won: 0, lost: 0, tied: 0, points: 0, rf: 0, ra: 0, nrr: 0 }; of[t.id] = 0; oa[t.id] = 0; }
  for (let n = 1; n <= 6; n++) {
    const r = results[n];
    if (!r || !r.complete || r.s1 === null || r.s2 === null) continue;
    for (const [team, my, opp] of [[r.t1, r.s1, r.s2], [r.t2, r.s2, r.s1]] as [string, number, number][]) {
      if (!rows[team]) continue;
      const row = rows[team];
      row.played++; row.rf += my; row.ra += opp; of[team] += MENS_SETTINGS.overs_per_innings; oa[team] += MENS_SETTINGS.overs_per_innings;
      if (my > opp) { row.won++; row.points += 2; } else if (my < opp) row.lost++; else { row.tied++; row.points++; }
    }
  }
  for (const t of MENS_TEAMS) if (of[t.id] > 0) rows[t.id].nrr = rows[t.id].rf / of[t.id] - rows[t.id].ra / oa[t.id];
  return Object.values(rows).sort((a, b) =>
    b.points !== a.points ? b.points - a.points :
    Math.abs(b.nrr - a.nrr) > 1e-9 ? b.nrr - a.nrr : b.won - a.won);
}

function finalistsFrom(results: Record<number, MensResult>): string[] {
  const rrDone = [1, 2, 3, 4, 5, 6].every(n => results[n]?.complete);
  if (!rrDone) return [];
  const s = standingsFrom(results);
  return [s[0].team_id, s[1].team_id];
}

// ── Cached finalists (so getMensMatch can resolve synchronously) ────────────────
const FKEY = 'cricket_mens_finalists_v1';
let _finalists: string[] = (() => { try { return JSON.parse(localStorage.getItem(FKEY) ?? '[]'); } catch { return []; } })();
function setFinalists(f: string[]) { _finalists = f; try { localStorage.setItem(FKEY, JSON.stringify(f)); } catch { /* ignore */ } }

export const MENS_MATCHES: MensMatchRecord[] = MDEFS.map(d => buildMensRecord(d, []));

export function getMensMatch(mId: string): MensMatchRecord | undefined {
  const def = MDEFS.find(d => mMatchId(d.n) === mId);
  if (!def) return undefined;
  let f = _finalists;
  if (def.round === 'final' && (!f[0] || !f[1])) f = finalistsFrom(mensLocalResults());
  return buildMensRecord(def, f);
}

// ── Public API for the men's views ──────────────────────────────────────────────
export type MensStatus = 'live' | 'complete' | 'scheduled';
export interface MensOverview { status: MensStatus; s1: number | null; s2: number | null; t1: string; t2: string; }

export async function computeMensOverviews(): Promise<Record<string, MensOverview>> {
  const results = supabaseEnabled ? await mensSupabaseResults() : mensLocalResults();
  setFinalists(finalistsFrom(results));
  const out: Record<string, MensOverview> = {};
  for (const def of MDEFS) {
    const r = results[def.n];
    out[mMatchId(def.n)] = (!r || r.s1 === null)
      ? { status: 'scheduled', s1: null, s2: null, t1: '', t2: '' }
      : { status: r.complete ? 'complete' : 'live', s1: r.s1, s2: r.s2, t1: r.t1, t2: r.t2 };
  }
  return out;
}

export async function computeMensStandings(): Promise<{ rows: MensStandingRow[]; finalists: string[] }> {
  const results = supabaseEnabled ? await mensSupabaseResults() : mensLocalResults();
  setFinalists(finalistsFrom(results));
  return { rows: standingsFrom(results), finalists: finalistsFrom(results) };
}

export async function computeMensParScore(): Promise<number> {
  const results = supabaseEnabled ? await mensSupabaseResults() : mensLocalResults();
  const first = Object.values(results).filter(r => r.complete && r.s1 != null).map(r => r.s1 as number);
  if (first.length < 2) return 65; // ~good score for 10 overs until data builds
  return Math.max(45, Math.min(100, Math.round(first.reduce((a, b) => a + b, 0) / first.length)));
}

export function mensTeamName(id: string) { return MENS_TEAMS.find(t => t.id === id)?.name ?? id; }
export function mensTeamShort(id: string) { return MENS_TEAMS.find(t => t.id === id)?.short_name ?? '?'; }
export function mensPlayer(id: string) { return MENS_PLAYERS.find(p => p.id === id); }
export function mensSlotLabel(slot: string): string {
  if (slot === 'F1') return '1st place'; if (slot === 'F2') return '2nd place';
  return mensTeamName(teamId(parseInt(slot, 10)));
}
export function mensResolveSlot(slot: string): string {
  if (slot === 'F1') return _finalists[0] ?? ''; if (slot === 'F2') return _finalists[1] ?? '';
  return teamId(parseInt(slot, 10));
}
