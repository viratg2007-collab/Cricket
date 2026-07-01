import type { Delivery, MatchSettings } from './types';

// ── Live win predictor (heuristic, not an ML model) ──────────────────────────────
// This format is unusual: both teams bat the full innings and wickets are −2 (no one
// is bowled out), so the net-run rate already bakes in wicket cost. We project each
// side's finish from its current net-run rate blended with recent momentum, compare
// to the target (chase) or a par score (1st innings), and convert the margin to a
// probability whose confidence sharpens as balls run out.

export interface WinPrediction {
  first: number;   // P(team batting 1st wins), 0–100 (integer)
  second: number;  // P(team batting 2nd wins), 0–100 (integer)
  resolved: boolean;
}

const BASE_RPB = 1.2;          // baseline net runs/ball for a competitive innings
const RECENT_WINDOW = 12;      // "momentum" window = last 2 overs of legal balls

function legalBalls(dels: Delivery[]): number {
  return dels.filter(d => !d.is_deleted && d.legal_ball).length;
}

// Net runs over the last N legal balls (captures a surge or collapse).
function recentRate(dels: Delivery[], window: number): number {
  const active = dels
    .filter(d => !d.is_deleted && d.extra_type !== 'strike_override')
    .sort((a, b) => a.sequence_number - b.sequence_number);
  let legal = 0, runs = 0;
  for (let i = active.length - 1; i >= 0 && legal < window; i--) {
    runs += active[i].net_run_effect;
    if (active[i].legal_ball) legal++;
  }
  return legal > 0 ? runs / legal : BASE_RPB;
}

// Expected net runs/ball for the rest of the innings: overall rate blended with recent
// momentum (recent weighted more as the innings progresses).
function expectedRpb(dels: Delivery[], total: number, totalBalls: number): number {
  const balls = legalBalls(dels);
  if (balls < 6) return BASE_RPB;
  const overall = total / balls;
  const recent = recentRate(dels, RECENT_WINDOW);
  const w = Math.min(0.6, balls / totalBalls);      // momentum weight, up to 60%
  return Math.max(0.2, (1 - w) * overall + w * recent);
}

// Standard normal CDF via an erf approximation (Abramowitz & Stegun 7.1.26).
function erf(x: number): number {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
function phi(z: number): number { return 0.5 * (1 + erf(z / Math.SQRT2)); }

function pack(first: number, resolved: boolean): WinPrediction {
  const f = Math.round(Math.max(0, Math.min(100, first)));
  return { first: f, second: 100 - f, resolved };
}

// ── Player form (captains are the best players; in-form batters lift the chase) ──
export interface BatterForm { runs: number; balls: number; isCaptain: boolean; }

// Form multiplier ~0.88–1.15 for the two batters currently at the crease. Neutral (1.0)
// early on when there's no data; captains carry a small prior. Grows more meaningful as
// tournament stats accumulate.
export function batterFormOf(
  playerId: string,
  batting: { player_id: string; runs: number; balls: number }[],
  isCaptain: boolean,
): BatterForm {
  const row = batting.find(r => r.player_id === playerId);
  return { runs: row?.runs ?? 0, balls: row?.balls ?? 0, isCaptain };
}

export function battingFormFactor(striker?: BatterForm, nonStriker?: BatterForm): number {
  const FIELD_SR = 110; // baseline expected strike rate for this format
  const individual = (b?: BatterForm): number | null => {
    if (!b) return null;
    const cap = b.isCaptain ? 1.03 : 1.0;      // captains = best players → small prior
    if (b.balls < 6) return b.isCaptain ? 1.03 : null; // not enough data yet
    const sr = (b.runs / b.balls) * 100;
    return Math.max(0.8, Math.min(1.25, sr / FIELD_SR)) * cap;
  };
  const vals = [individual(striker), individual(nonStriker)].filter((v): v is number => v != null);
  if (vals.length === 0) return 1.0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(0.88, Math.min(1.15, avg));
}

export function predictWin(
  inn1: { total: number; deliveries: Delivery[] },
  inn2: { total: number; deliveries: Delivery[] },
  activeInnings: 1 | 2,
  settings: MatchSettings,
  formFactor = 1,   // form of the batting team's current pair (1 = neutral)
  par = 80,         // par 1st-innings score (default ~80; adjusts as the tournament runs)
): WinPrediction {
  const totalBalls = settings.num_pairs * settings.overs_per_pair * settings.balls_per_over;

  if (activeInnings === 1) {
    const balls1 = legalBalls(inn1.deliveries);
    const left1 = totalBalls - balls1;
    const proj1 = inn1.total + left1 * expectedRpb(inn1.deliveries, inn1.total, totalBalls) * formFactor;
    const sigma = 1.1 * Math.sqrt(totalBalls + left1);      // whole 2nd innings unknown → wide
    let pFirst = phi((proj1 - par) / sigma);
    pFirst = 0.5 + (pFirst - 0.5) * 0.6;                     // keep it mild in the 1st innings
    return pack(Math.max(2, Math.min(98, pFirst * 100)), false);
  }

  // 2nd innings — the chase
  const target = inn1.total + 1;
  const balls2 = legalBalls(inn2.deliveries);
  const left2 = totalBalls - balls2;
  if (left2 <= 0) {
    return pack(inn2.total >= target ? 0 : 100, true);      // innings done → decided
  }
  const achieved = expectedRpb(inn2.deliveries, inn2.total, totalBalls); // blends momentum
  const requiredRate = (target - inn2.total) / left2;
  // A chasing side pushes toward what it needs, up to ~25% above its own rate — and an
  // in-form pair (formFactor > 1) can push harder / hold up better, raising win chance.
  const base = requiredRate <= achieved ? achieved : Math.min(requiredRate, achieved * 1.25);
  const proj2 = inn2.total + left2 * base * formFactor;
  const sigma = Math.max(2, 1.35 * Math.sqrt(left2));
  const pSecond = phi((proj2 - target) / sigma);
  return pack(Math.max(2, Math.min(98, (1 - pSecond) * 100)), false);
}
