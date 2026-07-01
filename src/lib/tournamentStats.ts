import { ALL_MATCHES } from './matchData';
import { MENS_MATCHES } from './mensData';
import { supabase, supabaseEnabled } from './supabase';
import type { Delivery } from './types';

export type StatsScope = 'womens' | 'mens';
function matchesFor(scope: StatsScope) {
  return scope === 'mens'
    ? MENS_MATCHES.map(r => ({ match: { id: r.match.id }, innings1_id: r.innings1_id, innings2_id: r.innings2_id }))
    : ALL_MATCHES.map(r => ({ match: { id: r.match.id }, innings1_id: r.innings1_id, innings2_id: r.innings2_id }));
}
function inningsIdsFor(scope: StatsScope): Set<string> {
  return new Set(matchesFor(scope).flatMap(r => [r.innings1_id, r.innings2_id]));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BattingRow {
  player_id: string;
  runs: number;
  balls: number;
  dismissals: number;
  fours: number;
  sixes: number;
  innings_played: number;
  highest_score: number;
}

export interface BowlingRow {
  player_id: string;
  legal_balls: number;
  runs_conceded: number;
  wickets: number;
  innings_bowled: number;
  five_wicket_hauls: number;
}

export interface FieldingRow {
  player_id: string;
  catches: number;
  run_outs: number;
  stumpings: number;
  total: number;
}

export interface MVPRow {
  player_id: string;
  total: number;
  batting_pts: number;  // 2.5 per four, 3.5 per six
  bowling_pts: number;  // 3.5 per wicket, 1 per dot ball
  fielding_pts: number; // 2.5 per catch/run-out/stumping
}

export interface TournamentStats {
  batting: BattingRow[];
  bowling: BowlingRow[];
  fielding: FieldingRow[];
  mvp: MVPRow[];
  source: 'local' | 'supabase';
}

// ── Local (localStorage) path ─────────────────────────────────────────────────

function readAllLocalDeliveries(scope: StatsScope): Delivery[] {
  const out: Delivery[] = [];
  for (const rec of matchesFor(scope)) {
    for (const inning of [1, 2] as const) {
      try {
        const raw = localStorage.getItem(`cricket_match_${rec.match.id}_v2`);
        if (!raw) continue;
        const state = JSON.parse(raw) as {
          inn1?: { deliveries?: Delivery[] };
          inn2?: { deliveries?: Delivery[] };
        };
        const deliveries = (inning === 1 ? state.inn1?.deliveries : state.inn2?.deliveries) ?? [];
        out.push(...deliveries.filter(d => !d.is_deleted));
      } catch { /* skip */ }
    }
  }
  return out;
}

// ── Relay path (cross-device: viewer devices have no localStorage data) ───────

async function fetchRelayDeliveries(scope: StatsScope): Promise<Delivery[]> {
  if (supabaseEnabled) return [];
  const hostname = window.location.hostname;
  const results = await Promise.allSettled(
    matchesFor(scope).map(async ({ match: { id } }) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      try {
        const res = await fetch(`http://${hostname}:5180/state/${id}`, { signal: ctrl.signal });
        if (!res.ok) return [] as Delivery[];
        const data = await res.json() as {
          inn1?: { deliveries?: Delivery[] };
          inn2?: { deliveries?: Delivery[] };
        } | null;
        if (!data) return [] as Delivery[];
        return [
          ...(data.inn1?.deliveries ?? []).filter(d => !d.is_deleted),
          ...(data.inn2?.deliveries ?? []).filter(d => !d.is_deleted),
        ];
      } catch { return [] as Delivery[]; } finally { clearTimeout(t); }
    })
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

// ── Supabase path ─────────────────────────────────────────────────────────────

async function fetchAllSupabaseDeliveries(scope: StatsScope): Promise<Delivery[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('is_deleted', false);
  if (error) { console.error('[stats] fetch failed:', error.message); return []; }
  const valid = inningsIdsFor(scope);
  return ((data ?? []) as Delivery[]).filter(d => valid.has(d.innings_id));
}

// ── Core aggregation ──────────────────────────────────────────────────────────

function aggregate(deliveries: Delivery[]): Omit<TournamentStats, 'source'> {
  const batting: Record<string, BattingRow> = {};
  const bowling: Record<string, BowlingRow> = {};
  const fielding: Record<string, FieldingRow> = {};
  const mvpPts: Record<string, { bat: number; bowl: number; field: number }> = {};
  const battersPerInnings: Record<string, Set<string>> = {};
  const bowlersPerInnings: Record<string, Set<string>> = {};
  const inningsPlayerRuns: Record<string, number> = {};
  const inningsBowlerWickets: Record<string, Record<string, number>> = {};

  const mvp = (id: string) => {
    if (!mvpPts[id]) mvpPts[id] = { bat: 0, bowl: 0, field: 0 };
    return mvpPts[id];
  };

  // Recompute the facing striker per delivery (per innings+pair, walking
  // strike_changed) rather than trusting the stored striker_id, which goes stale
  // after a mid-innings delete. Keeps leaderboards consistent with the scorecard.
  const facingStriker: Record<string, string> = {};
  {
    const groups: Record<string, Delivery[]> = {};
    for (const d of deliveries) {
      (groups[`${d.innings_id}:${d.pair_id}`] ??= []).push(d);
    }
    for (const dels of Object.values(groups)) {
      const ordered = [...dels].sort((a, b) => a.sequence_number - b.sequence_number);
      const first = ordered.find(d => d.striker_id && d.non_striker_id);
      const p1 = first?.striker_id, p2 = first?.non_striker_id;
      let isP1 = true;
      for (const d of ordered) {
        facingStriker[d.id] = (p1 && p2) ? (isP1 ? p1 : p2) : d.striker_id;
        if (d.strike_changed) isP1 = !isP1;
      }
    }
  }

  for (const d of deliveries) {
    if (d.extra_type === 'strike_override') continue;

    const strikerId = facingStriker[d.id] ?? d.striker_id;

    // ── Batting ──────────────────────────────────────────────────────────────
    if (!batting[strikerId]) {
      batting[strikerId] = {
        player_id: strikerId, runs: 0, balls: 0,
        dismissals: 0, fours: 0, sixes: 0, innings_played: 0, highest_score: 0,
      };
    }
    const isWideOrNoBall = d.extra_type === 'wide' || d.extra_type === 'no_ball';
    const runsThisBall = d.runs_off_bat + (isWideOrNoBall && d.legal_ball ? d.extra_value : 0);
    batting[strikerId].runs += runsThisBall;
    if (d.legal_ball) batting[strikerId].balls++;
    if (d.runs_off_bat === 4) { batting[strikerId].fours++; mvp(strikerId).bat += 2.5; }
    if (d.runs_off_bat === 6) { batting[strikerId].sixes++; mvp(strikerId).bat += 3.5; }

    // Track per-innings runs for highest_score
    const ipKey = `${d.innings_id}:${strikerId}`;
    inningsPlayerRuns[ipKey] = (inningsPlayerRuns[ipKey] ?? 0) + runsThisBall;

    // Track innings played (unique innings per batter)
    if (!battersPerInnings[d.innings_id]) battersPerInnings[d.innings_id] = new Set();
    battersPerInnings[d.innings_id].add(strikerId);

    // Dismissals attributed to the dismissed (striker) player
    if (d.is_wicket) {
      if (!batting[strikerId]) {
        batting[strikerId] = {
          player_id: strikerId, runs: 0, balls: 0,
          dismissals: 0, fours: 0, sixes: 0, innings_played: 0, highest_score: 0,
        };
      }
      batting[strikerId].dismissals++;
    }

    // ── Bowling ──────────────────────────────────────────────────────────────
    if (!bowling[d.bowler_id]) {
      bowling[d.bowler_id] = {
        player_id: d.bowler_id, legal_balls: 0,
        runs_conceded: 0, wickets: 0, innings_bowled: 0, five_wicket_hauls: 0,
      };
    }
    bowling[d.bowler_id].runs_conceded += d.runs_off_bat + d.extra_value;
    if (d.legal_ball) bowling[d.bowler_id].legal_balls++;
    if (d.is_wicket) {
      bowling[d.bowler_id].wickets++;
      mvp(d.bowler_id).bowl += 3.5;
      if (!inningsBowlerWickets[d.innings_id]) inningsBowlerWickets[d.innings_id] = {};
      inningsBowlerWickets[d.innings_id][d.bowler_id] = (inningsBowlerWickets[d.innings_id][d.bowler_id] ?? 0) + 1;
    }
    // Dot ball: legal delivery, no runs off bat, no extras
    if (d.legal_ball && d.runs_off_bat === 0 && d.extra_type === 'none') {
      mvp(d.bowler_id).bowl += 1;
    }

    if (!bowlersPerInnings[d.innings_id]) bowlersPerInnings[d.innings_id] = new Set();
    bowlersPerInnings[d.innings_id].add(d.bowler_id);

    // ── Fielding ─────────────────────────────────────────────────────────────
    if (d.is_wicket && d.fielder_id && d.wicket_type) {
      if (!fielding[d.fielder_id]) {
        fielding[d.fielder_id] = { player_id: d.fielder_id, catches: 0, run_outs: 0, stumpings: 0, total: 0 };
      }
      if (d.wicket_type === 'caught')   { fielding[d.fielder_id].catches++;  fielding[d.fielder_id].total++; mvp(d.fielder_id).field += 2.5; }
      if (d.wicket_type === 'run_out')  { fielding[d.fielder_id].run_outs++; fielding[d.fielder_id].total++; mvp(d.fielder_id).field += 2.5; }
      if (d.wicket_type === 'stumped')  { fielding[d.fielder_id].stumpings++;fielding[d.fielder_id].total++; mvp(d.fielder_id).field += 2.5; }
    }
  }

  // Fill in 5-wicket hauls per bowler per innings
  for (const bowlerWkts of Object.values(inningsBowlerWickets)) {
    for (const [pid, wkts] of Object.entries(bowlerWkts)) {
      if (wkts >= 5 && bowling[pid]) bowling[pid].five_wicket_hauls++;
    }
  }

  // Fill in highest_score per player
  for (const [key, runs] of Object.entries(inningsPlayerRuns)) {
    const pid = key.split(':')[1];
    if (batting[pid]) batting[pid].highest_score = Math.max(batting[pid].highest_score, runs);
  }

  // Fill in innings_played / innings_bowled counts
  for (const [, players] of Object.entries(battersPerInnings)) {
    for (const pid of players) {
      if (batting[pid]) batting[pid].innings_played++;
    }
  }
  for (const [, bowlers] of Object.entries(bowlersPerInnings)) {
    for (const pid of bowlers) {
      if (bowling[pid]) bowling[pid].innings_bowled++;
    }
  }

  const mvpRows: MVPRow[] = Object.entries(mvpPts)
    .map(([pid, pts]) => ({
      player_id: pid,
      batting_pts: pts.bat,
      bowling_pts: pts.bowl,
      fielding_pts: pts.field,
      total: pts.bat + pts.bowl + pts.field,
    }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    batting: Object.values(batting).filter(r => r.balls > 0),
    bowling: Object.values(bowling).filter(r => r.legal_balls > 0),
    fielding: Object.values(fielding).filter(r => r.total > 0).sort((a, b) => b.total - a.total),
    mvp: mvpRows,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadTournamentStats(scope: StatsScope = 'womens'): Promise<TournamentStats> {
  if (supabaseEnabled && supabase) {
    const deliveries = await fetchAllSupabaseDeliveries(scope);
    if (deliveries.length > 0) {
      return { ...aggregate(deliveries), source: 'supabase' };
    }
  }

  const localDeliveries = readAllLocalDeliveries(scope);
  const relayDeliveries = await fetchRelayDeliveries(scope);
  // Use relay data if it has more deliveries (cross-device viewer case)
  const deliveries = relayDeliveries.length > localDeliveries.length
    ? relayDeliveries
    : localDeliveries;
  return { ...aggregate(deliveries), source: 'local' };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function fmtSR(runs: number, balls: number): string {
  return balls === 0 ? '—' : ((runs / balls) * 100).toFixed(1);
}

export function fmtOvers(legalBalls: number, bpo = 6): string {
  const o = Math.floor(legalBalls / bpo);
  const b = legalBalls % bpo;
  return b === 0 ? String(o) : `${o}.${b}`;
}

export function fmtEcon(runs: number, legalBalls: number, bpo = 6): string {
  if (legalBalls === 0) return '—';
  return ((runs / legalBalls) * bpo).toFixed(1);
}

export function fmtBowlSR(legalBalls: number, wickets: number): string {
  return wickets === 0 ? '—' : (legalBalls / wickets).toFixed(1);
}
