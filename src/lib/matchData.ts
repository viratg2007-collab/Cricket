import type { Match, Pair, Delivery } from './types';
import { DEFAULT_SETTINGS } from './types';
import { TEAM, pairId, playerId } from './ids';
import { supabaseEnabled, fetchAllDeliveries, fetchBracketOverride, saveBracketOverride } from './supabase';
import type { BracketOverride } from './supabase';
import { PLAYERS } from './seedData';

// ── ID helpers ────────────────────────────────────────────────────────────────

function mkid(cat: number, n: number): string {
  return `00000000-0000-0000-${cat.toString(16).padStart(4, '0')}-${n.toString(16).padStart(12, '0')}`;
}

export function matchId(n: number): string { return mkid(4, n); }
export function inningsId(n: number): string { return mkid(5, n); }

// ── Team pair / player offsets ─────────────────────────────────────────────────
const PAIR_OFFSET: Record<string, number> = {
  [TEAM.SS]: 0, [TEAM.NA]: 6, [TEAM.AS]: 12,
  [TEAM.MS]: 18, [TEAM.KS]: 24, [TEAM.ATS]: 30,
};
const PLAYER_OFFSET: Record<string, number> = {
  [TEAM.SS]: 0, [TEAM.NA]: 14, [TEAM.AS]: 28,
  [TEAM.MS]: 42, [TEAM.KS]: 56, [TEAM.ATS]: 70,
};

export function getEmptyPairsForTeam(teamId: string, mId: string): Pair[] {
  const po = PAIR_OFFSET[teamId] ?? 0;
  return Array.from({ length: 6 }, (_, i) => ({
    id: pairId(po + i + 1), match_id: mId, team_id: teamId,
    pair_number: i + 1, player1_id: '', player2_id: '',
  }));
}

export function getPairsForTeam(teamId: string, mId: string): Pair[] {
  const po = PAIR_OFFSET[teamId] ?? 0;
  const pl = PLAYER_OFFSET[teamId] ?? 0;
  return Array.from({ length: 6 }, (_, i) => ({
    id: pairId(po + i + 1), match_id: mId, team_id: teamId,
    pair_number: i + 1, player1_id: playerId(pl + i * 2 + 1), player2_id: playerId(pl + i * 2 + 2),
  }));
}

// ── Tournament structure ────────────────────────────────────────────────────────
// Round 1: two groups of 3, round-robin (6 matches).
//   Group A: Kashvat, Anita, Sparkle   Group B: Anay, Modi, Nishant
// Round 2: reseed into groups C & D by round-1 finishing position, round-robin (6),
//   points carried forward.
//   Group C = 1st of A + 2nd of B + 3rd of B
//   Group D = 1st of B + 2nd of A + 3rd of A
// Final: winner of C vs winner of D (super over if tied).

export const GROUP_A = [TEAM.KS, TEAM.ATS, TEAM.SS];   // Kashvat, Anita, Sparkle
export const GROUP_B = [TEAM.AS, TEAM.MS, TEAM.NA];    // Anay, Modi, Nishant

export type Round = 1 | 2 | 'final';
export type GroupKey = 'A' | 'B' | 'C' | 'D';

// A slot is either a concrete team id (round 1) or a placeholder resolved from the bracket.
// Placeholders: A1,A2,A3 = round-1 group-A positions; B1..B3 = group-B positions;
//               CW = winner of group C; DW = winner of group D.
type Slot = string;

export interface MatchRecord {
  match: Match;
  innings1_id: string;
  innings2_id: string;
  round: Round;
  group?: GroupKey;      // which group this match belongs to (A/B round 1, C/D round 2)
  homeSlot: Slot;
  awaySlot: Slot;
  roundLabel: string;    // human label e.g. "Group A", "Group C", "Final"
}

const S = DEFAULT_SETTINGS;

interface Def { n: number; round: Round; group?: GroupKey; home: Slot; away: Slot; label: string; }

// Fixtures in exact play order (per the official schedule).
// Round 2 seeds: C1 = 1st Group A, C2 = 2nd Group B, C3 = 3rd Group B;
//                D1 = 1st Group B, D2 = 2nd Group A, D3 = 3rd Group A.
const DEFS: Def[] = [
  // ── Round 1 (alternating Group A / Group B) ──
  { n: 1, round: 1, group: 'A', home: TEAM.KS,  away: TEAM.ATS, label: 'Group A' }, // Kashvat v Anita
  { n: 2, round: 1, group: 'B', home: TEAM.AS,  away: TEAM.MS,  label: 'Group B' }, // Anay v Modi
  { n: 3, round: 1, group: 'A', home: TEAM.KS,  away: TEAM.SS,  label: 'Group A' }, // Kashvat v Sparkle
  { n: 4, round: 1, group: 'B', home: TEAM.AS,  away: TEAM.NA,  label: 'Group B' }, // Anay v Nishant
  { n: 5, round: 1, group: 'A', home: TEAM.ATS, away: TEAM.SS,  label: 'Group A' }, // Anita v Sparkle
  { n: 6, round: 1, group: 'B', home: TEAM.MS,  away: TEAM.NA,  label: 'Group B' }, // Modi v Nishant
  // ── Round 2 (play order: C1vC2, D2vD1, D3vD2, C1vC3, C2vC3, D1vD3) ──
  { n: 7,  round: 2, group: 'C', home: 'A1', away: 'B2', label: 'Group C' }, // C1 v C2
  { n: 8,  round: 2, group: 'D', home: 'A2', away: 'B1', label: 'Group D' }, // D2 v D1
  { n: 9,  round: 2, group: 'D', home: 'A3', away: 'A2', label: 'Group D' }, // D3 v D2
  { n: 10, round: 2, group: 'C', home: 'A1', away: 'B3', label: 'Group C' }, // C1 v C3
  { n: 11, round: 2, group: 'C', home: 'B2', away: 'B3', label: 'Group C' }, // C2 v C3
  { n: 12, round: 2, group: 'D', home: 'B1', away: 'A3', label: 'Group D' }, // D1 v D3
  // ── Final ──
  { n: 13, round: 'final', home: 'CW', away: 'DW', label: 'Final' },
];

// ── Bracket (resolves the placeholder slots from actual results) ──────────────────

export interface Bracket {
  aRank: string[];        // group-A team ids ranked 1st→3rd ([] until data exists)
  bRank: string[];
  groupC: string[];       // resolved membership [A1, B2, B3]
  groupD: string[];       // resolved membership [B1, A2, A3]
  cRank: string[];        // group-C ranked after round 2 (carry-forward)
  dRank: string[];
  round1Complete: boolean;
  round2Complete: boolean;
  finalHome: string;      // CW (winner of C) or ''
  finalAway: string;      // DW (winner of D) or ''
}

const EMPTY_BRACKET: Bracket = {
  aRank: [], bRank: [], groupC: [], groupD: [], cRank: [], dRank: [],
  round1Complete: false, round2Complete: false, finalHome: '', finalAway: '',
};

// Per-match result derived from deliveries. t1/t2 = the teams that actually batted
// innings 1 / innings 2 (from the strikers), so it's correct even if the toss flipped
// the batting order. Scores are innings totals.
export interface MatchResult { t1: string; t2: string; s1: number | null; s2: number | null; complete: boolean; }

export interface StandingRow {
  team_id: string;
  played: number; won: number; lost: number; tied: number;
  points: number; rf: number; ra: number; nrr: number;
}

function blankRow(team_id: string): StandingRow {
  return { team_id, played: 0, won: 0, lost: 0, tied: 0, points: 0, rf: 0, ra: 0, nrr: 0 };
}

// Accumulate a team's record across a set of match numbers.
function tableFor(teamIds: string[], matchNums: number[], results: Record<number, MatchResult>): StandingRow[] {
  const rows: Record<string, StandingRow> = {};
  const oversFor: Record<string, number> = {};
  const oversAgainst: Record<string, number> = {};
  for (const t of teamIds) { rows[t] = blankRow(t); oversFor[t] = 0; oversAgainst[t] = 0; }

  for (const n of matchNums) {
    const r = results[n];
    if (!r || !r.complete || r.s1 === null || r.s2 === null) continue;
    for (const [team, my, opp] of [[r.t1, r.s1, r.s2], [r.t2, r.s2, r.s1]] as [string, number, number][]) {
      if (!(team in rows)) continue;
      const row = rows[team];
      row.played++; row.rf += my; row.ra += opp;
      oversFor[team] += S.overs_per_innings; oversAgainst[team] += S.overs_per_innings;
      if (my > opp) { row.won++; row.points += 2; }
      else if (my < opp) { row.lost++; }
      else { row.tied++; row.points += 1; }
    }
  }
  for (const t of teamIds) {
    if (oversFor[t] > 0) rows[t].nrr = (rows[t].rf / oversFor[t]) - (rows[t].ra / oversAgainst[t]);
  }
  return sortTable(Object.values(rows));
}

function sortTable(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort((a, b) =>
    b.points !== a.points ? b.points - a.points :
    Math.abs(b.nrr - a.nrr) > 1e-9 ? b.nrr - a.nrr :
    b.won - a.won
  );
}

function allComplete(matchNums: number[], results: Record<number, MatchResult>): boolean {
  return matchNums.every(n => results[n]?.complete);
}

function buildBracket(results: Record<number, MatchResult>): Bracket {
  const round1Complete = allComplete([1, 2, 3, 4, 5, 6], results);

  // Manual override (admin fallback) forces the Round-1 finishing order → decides
  // the Round 2 groups regardless of the computed standings.
  const ovr = _override && _override.aRank?.length === 3 && _override.bRank?.length === 3 ? _override : null;

  let aRank: string[], bRank: string[];
  if (ovr) {
    aRank = ovr.aRank; bRank = ovr.bRank;
  } else if (round1Complete) {
    aRank = tableFor(GROUP_A, [1, 2, 3, 4, 5, 6], results).map(r => r.team_id);
    bRank = tableFor(GROUP_B, [1, 2, 3, 4, 5, 6], results).map(r => r.team_id);
  } else {
    // Until Round 1 is complete (and no override), keep ranks empty so the Round 2
    // slots show placeholders instead of resolving prematurely in default order.
    return EMPTY_BRACKET;
  }

  const groupC = [aRank[0], bRank[1], bRank[2]];
  const groupD = [bRank[0], aRank[1], aRank[2]];

  // Round-2 standings carry round-1 points forward: accumulate over all rounds.
  const cRank = tableFor(groupC, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], results).map(r => r.team_id);
  const dRank = tableFor(groupD, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], results).map(r => r.team_id);
  const round2Complete = allComplete([7, 8, 9, 10, 11, 12], results);

  return {
    aRank, bRank, groupC, groupD, cRank, dRank,
    round1Complete: !!ovr || round1Complete, round2Complete,
    finalHome: round2Complete ? cRank[0] : '',
    finalAway: round2Complete ? dRank[0] : '',
  };
}

// Resolve a slot placeholder to a concrete team id using the bracket (''=unresolved).
export function resolveSlot(slot: Slot, b: Bracket): string {
  switch (slot) {
    case 'A1': return b.aRank[0] ?? ''; case 'A2': return b.aRank[1] ?? ''; case 'A3': return b.aRank[2] ?? '';
    case 'B1': return b.bRank[0] ?? ''; case 'B2': return b.bRank[1] ?? ''; case 'B3': return b.bRank[2] ?? '';
    case 'CW': return b.finalHome; case 'DW': return b.finalAway;
    default: return slot; // already a concrete team id (round 1)
  }
}

// Human label for an unresolved slot.
export function slotLabel(slot: Slot): string {
  const map: Record<string, string> = {
    A1: '1st Group A', A2: '2nd Group A', A3: '3rd Group A',
    B1: '1st Group B', B2: '2nd Group B', B3: '3rd Group B',
    CW: 'Winner Group C', DW: 'Winner Group D',
  };
  return map[slot] ?? slot;
}

// ── Result sourcing (deliveries → per-match result) ───────────────────────────────

function battingTeamOf(strikerId: string | undefined): string {
  return PLAYERS.find(p => p.id === strikerId)?.team_id ?? '';
}

type InnData = { deliveries?: Delivery[] };

function scoreAndTeamFromDeliveries(dels: Delivery[] | undefined): { score: number | null; team: string; legal: number } {
  const active = (dels ?? []).filter(d => !d.is_deleted && d.extra_type !== 'strike_override');
  if (active.length === 0) return { score: null, team: '', legal: 0 };
  const sorted = [...active].sort((a, b) => a.sequence_number - b.sequence_number);
  const score = sorted.reduce((s, d) => s + d.net_run_effect, 0);
  const legal = sorted.filter(d => d.legal_ball).length;
  return { score, team: battingTeamOf(sorted[0].striker_id), legal };
}

const TARGET_BALLS = S.num_pairs * S.overs_per_pair * S.balls_per_over; // 72

// Build results from localStorage (scorer device has full data for matches it scored).
function localResults(): Record<number, MatchResult> {
  const out: Record<number, MatchResult> = {};
  for (const def of DEFS) {
    try {
      const raw = localStorage.getItem(`cricket_match_${matchId(def.n)}_v2`);
      if (!raw) continue;
      const st = JSON.parse(raw) as { inn1?: InnData; inn2?: InnData };
      const a = scoreAndTeamFromDeliveries(st.inn1?.deliveries);
      const b = scoreAndTeamFromDeliveries(st.inn2?.deliveries);
      if (a.score === null) continue;
      out[def.n] = { t1: a.team, t2: b.team, s1: a.score, s2: b.score, complete: a.legal >= TARGET_BALLS && b.legal >= TARGET_BALLS };
    } catch { /* skip */ }
  }
  return out;
}

// Build results from Supabase (source of truth cross-device).
async function supabaseResults(): Promise<Record<number, MatchResult>> {
  const all = await fetchAllDeliveries();
  const byInnings: Record<string, Delivery[]> = {};
  for (const d of all) {
    if (d.is_deleted || d.extra_type === 'strike_override') continue;
    (byInnings[d.innings_id] ??= []).push(d);
  }
  const out: Record<number, MatchResult> = {};
  for (const def of DEFS) {
    const i1 = inningsId((def.n - 1) * 2 + 1);
    const i2 = inningsId((def.n - 1) * 2 + 2);
    const a = scoreAndTeamFromDeliveries(byInnings[i1]);
    const b = scoreAndTeamFromDeliveries(byInnings[i2]);
    if (a.score === null) continue;
    out[def.n] = { t1: a.team, t2: b.team, s1: a.score, s2: b.score, complete: a.legal >= TARGET_BALLS && b.legal >= TARGET_BALLS };
  }
  return out;
}

// ── Manual bracket override (admin fallback) ──────────────────────────────────────
const OVERRIDE_KEY = 'cricket_bracket_override';
let _override: BracketOverride | null = loadOverrideLocal();

function loadOverrideLocal(): BracketOverride | null {
  try { const r = localStorage.getItem(OVERRIDE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
export function getOverride(): BracketOverride | null { return _override; }
function setOverrideLocal(o: BracketOverride | null) {
  _override = o;
  try { if (o) localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o)); else localStorage.removeItem(OVERRIDE_KEY); } catch { /* ignore */ }
}
// Save override everywhere (local device + cloud so viewers see it), then rebuild.
export async function saveOverride(o: BracketOverride | null): Promise<void> {
  setOverrideLocal(o);
  await saveBracketOverride(o);
  refreshBracketLocal();
}
// Pull the override from the cloud (so any device reflects an admin change).
export async function refreshOverride(): Promise<BracketOverride | null> {
  if (!supabaseEnabled) return _override;
  const o = await fetchBracketOverride();
  setOverrideLocal(o);
  return o;
}

// ── Cached bracket (kept in sync so getMatchRecord can resolve synchronously) ──────

const BRACKET_KEY = 'cricket_bracket_v1';
let _bracket: Bracket = loadCachedBracket();

function loadCachedBracket(): Bracket {
  try {
    const raw = localStorage.getItem(BRACKET_KEY);
    if (raw) return JSON.parse(raw) as Bracket;
  } catch { /* ignore */ }
  return EMPTY_BRACKET;
}

function setBracket(b: Bracket) {
  _bracket = b;
  try { localStorage.setItem(BRACKET_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

export function getBracket(): Bracket { return _bracket; }

// Recompute from localStorage synchronously (scorer device). Also refreshes the cache.
export function refreshBracketLocal(): Bracket {
  const b = buildBracket(localResults());
  setBracket(b);
  return b;
}

// Recompute from Supabase (cross-device). Falls back to local when Supabase is off.
export async function refreshBracket(): Promise<Bracket> {
  await refreshOverride();
  const results = supabaseEnabled ? await supabaseResults() : localResults();
  const b = buildBracket(results);
  setBracket(b);
  return b;
}

// ── Match records ─────────────────────────────────────────────────────────────

function buildRecord(def: Def, b: Bracket): MatchRecord {
  const home = resolveSlot(def.home, b);
  const away = resolveSlot(def.away, b);
  return {
    match: {
      id: matchId(def.n),
      name: `${def.label}`,
      home_team_id: home,
      away_team_id: away,
      settings: S,
      status: 'scheduled',
    },
    innings1_id: inningsId((def.n - 1) * 2 + 1),
    innings2_id: inningsId((def.n - 1) * 2 + 2),
    round: def.round,
    group: def.group,
    homeSlot: def.home,
    awaySlot: def.away,
    roundLabel: def.label,
  };
}

// Base catalogue (round-1 teams concrete; round-2/final resolved from cached bracket).
export const ALL_MATCHES: MatchRecord[] = DEFS.map(def => buildRecord(def, EMPTY_BRACKET));

export function getMatchRecord(mId: string): MatchRecord | undefined {
  const def = DEFS.find(d => matchId(d.n) === mId);
  if (!def) return undefined;
  // Resolve round-2/final teams. Prefer the cached bracket; if empty on this device
  // (e.g. scorer opening a round-2 match), recompute synchronously from localStorage.
  let b = _bracket;
  if (def.round !== 1 && !resolveSlot(def.home, b)) b = refreshBracketLocal();
  return buildRecord(def, b);
}

export function getDef(n: number): Def | undefined { return DEFS.find(d => d.n === n); }

// ── Match overviews (status + scores per match) for cross-device display ──────────

export type MatchStatus = 'live' | 'complete' | 'scheduled';
export interface MatchOverview { status: MatchStatus; s1: number | null; s2: number | null; t1: string; t2: string; }

function overviewFromResult(r: MatchResult | undefined): MatchOverview {
  if (!r || r.s1 === null) return { status: 'scheduled', s1: null, s2: null, t1: '', t2: '' };
  return { status: r.complete ? 'complete' : 'live', s1: r.s1, s2: r.s2, t1: r.t1, t2: r.t2 };
}

export async function computeMatchOverviews(): Promise<Record<string, MatchOverview>> {
  await refreshOverride();
  const results = supabaseEnabled ? await supabaseResults() : localResults();
  setBracket(buildBracket(results)); // keep cache fresh for getMatchRecord
  const out: Record<string, MatchOverview> = {};
  for (const def of DEFS) out[matchId(def.n)] = overviewFromResult(results[def.n]);
  return out;
}

// ── Group standings for display ───────────────────────────────────────────────────

export interface GroupTable { key: GroupKey; title: string; rows: StandingRow[]; teams: string[]; live: boolean; }

// Returns the tables to show for the current phase:
//  - Always: Group A, Group B (round 1)
//  - Once round 1 complete: Group C, Group D (round 2, carry-forward)
export async function computeGroupTables(): Promise<{ tables: GroupTable[]; bracket: Bracket }> {
  await refreshOverride();
  const results = supabaseEnabled ? await supabaseResults() : localResults();
  const bracket = buildBracket(results);
  setBracket(bracket);

  const tables: GroupTable[] = [
    { key: 'A', title: 'Group A', teams: GROUP_A, rows: tableFor(GROUP_A, [1, 2, 3, 4, 5, 6], results), live: !bracket.round1Complete },
    { key: 'B', title: 'Group B', teams: GROUP_B, rows: tableFor(GROUP_B, [1, 2, 3, 4, 5, 6], results), live: !bracket.round1Complete },
  ];
  if (bracket.round1Complete) {
    tables.push(
      { key: 'C', title: 'Group C', teams: bracket.groupC, rows: tableFor(bracket.groupC, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], results), live: !bracket.round2Complete },
      { key: 'D', title: 'Group D', teams: bracket.groupD, rows: tableFor(bracket.groupD, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], results), live: !bracket.round2Complete },
    );
  }
  return { tables, bracket };
}

// Average 1st-innings score across completed matches — the "par" for the win
// predictor. Defaults to 80 (a good score is ~75–85) until enough data exists,
// then tracks the real tournament average.
export async function computeParScore(): Promise<number> {
  const results = supabaseEnabled ? await supabaseResults() : localResults();
  const firstInnings = Object.values(results)
    .filter(r => r.complete && r.s1 != null)
    .map(r => r.s1 as number);
  if (firstInnings.length < 2) return 80;
  const avg = firstInnings.reduce((a, b) => a + b, 0) / firstInnings.length;
  return Math.max(60, Math.min(115, Math.round(avg)));
}

// Flat all-teams table (used by the /admin overview).
export async function computeStandingsAsync(): Promise<StandingRow[]> {
  const results = supabaseEnabled ? await supabaseResults() : localResults();
  return tableFor([...GROUP_A, ...GROUP_B], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], results);
}
