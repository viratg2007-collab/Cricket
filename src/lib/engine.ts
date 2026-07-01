import type {
  Delivery,
  DerivedMatchState,
  FallOfWicket,
  MatchSettings,
  Pair,
} from './types';

export function deriveMatchState(
  allDeliveries: Delivery[],
  pairs: Pair[],
  settings: MatchSettings
): DerivedMatchState {
  const sortedPairs = [...pairs].sort((a, b) => a.pair_number - b.pair_number);
  const active = allDeliveries
    .filter(d => !d.is_deleted)
    .sort((a, b) => a.sequence_number - b.sequence_number);

  // Position derived purely from legal ball count
  const legalBallCount = active.filter(d => d.legal_ball).length;
  const totalBallsPerPair = settings.overs_per_pair * settings.balls_per_over;
  const rawPairIndex = Math.floor(legalBallCount / totalBallsPerPair);
  const pairIndex = Math.min(rawPairIndex, settings.num_pairs);
  const legalBallsInPairSet = legalBallCount % totalBallsPerPair;
  const overWithinPair = Math.floor(legalBallsInPairSet / settings.balls_per_over);
  const currentBallInOver = legalBallsInPairSet % settings.balls_per_over;
  const absoluteOver =
    pairIndex < settings.num_pairs
      ? pairIndex * settings.overs_per_pair + overWithinPair
      : settings.overs_per_innings;

  const isComplete = legalBallCount >= settings.num_pairs * totalBallsPerPair;

  // Re-bowl: last delivery has legal_ball=false (set when a pair's last ball is a wide/no-ball)
  const lastActive = active[active.length - 1];
  const awaitingRebowl = !isComplete && !!lastActive && !lastActive.legal_ball;

  // Current pair
  const currentPair = pairIndex < sortedPairs.length ? sortedPairs[pairIndex] : null;

  // Strike tracking: walk strike_changed flags for current pair
  let strikerId = currentPair?.player1_id ?? '';
  let nonStrikerId = currentPair?.player2_id ?? '';
  if (currentPair) {
    let strikerIsP1 = true;
    for (const d of active.filter(del => del.pair_id === currentPair.id)) {
      if (d.strike_changed) strikerIsP1 = !strikerIsP1;
    }
    strikerId = strikerIsP1 ? currentPair.player1_id : currentPair.player2_id;
    nonStrikerId = strikerIsP1 ? currentPair.player2_id : currentPair.player1_id;
  }

  // Aggregate stats
  let total = 0;
  let wickets = 0;
  const pairTotals: Record<string, number> = {};
  const pairBalls: Record<string, number> = {};
  const pairWickets: Record<string, number> = {};
  const batterRuns: Record<string, number> = {};
  const batterBalls: Record<string, number> = {};
  const batterDismissals: Record<string, number> = {};
  const batterFours: Record<string, number> = {};
  const batterSixes: Record<string, number> = {};
  const bowlerRuns: Record<string, number> = {};
  const bowlerWickets: Record<string, number> = {};
  const bowlerLegalBalls: Record<string, number> = {};
  const perOverRuns: Record<number, number> = {};
  const fallOfWickets: FallOfWicket[] = [];

  // Recompute the facing striker for each delivery by walking strike_changed per
  // pair (in sequence order) rather than trusting the stored striker_id, which
  // goes stale after a mid-innings delete shifts the strike parity. Mirrors the
  // current-striker walk above so normal play is unaffected.
  const facingStriker: Record<string, string> = {};
  {
    const byPair: Record<string, Delivery[]> = {};
    for (const d of active) {
      (byPair[d.pair_id] ??= []).push(d);
    }
    for (const [pid, dels] of Object.entries(byPair)) {
      const pair = sortedPairs.find(p => p.id === pid);
      let strikerIsP1 = true;
      for (const d of dels) {
        facingStriker[d.id] = pair
          ? (strikerIsP1 ? pair.player1_id : pair.player2_id)
          : d.striker_id; // fallback if pair unknown
        if (d.strike_changed) strikerIsP1 = !strikerIsP1;
      }
    }
  }

  for (const d of active) {
    // Skip strike_override sentinels from totals
    if (d.extra_type === 'strike_override') continue;

    const strikerId = facingStriker[d.id] ?? d.striker_id;

    total += d.net_run_effect;
    pairTotals[d.pair_id] = (pairTotals[d.pair_id] ?? 0) + d.net_run_effect;
    perOverRuns[d.over_number] = (perOverRuns[d.over_number] ?? 0) + d.net_run_effect;

    const isWideOrNoBall = d.extra_type === 'wide' || d.extra_type === 'no_ball';
    // Credit extra runs to batter only on legal wides/no-balls (not the final-ball re-bowl)
    const batterCredit = d.runs_off_bat + (isWideOrNoBall && d.legal_ball ? d.extra_value : 0);
    batterRuns[strikerId] = (batterRuns[strikerId] ?? 0) + batterCredit;
    if (d.runs_off_bat === 4) batterFours[strikerId] = (batterFours[strikerId] ?? 0) + 1;
    if (d.runs_off_bat === 6) batterSixes[strikerId] = (batterSixes[strikerId] ?? 0) + 1;
    if (d.legal_ball) {
      batterBalls[strikerId] = (batterBalls[strikerId] ?? 0) + 1;
      pairBalls[d.pair_id] = (pairBalls[d.pair_id] ?? 0) + 1;
    }

    bowlerRuns[d.bowler_id] = (bowlerRuns[d.bowler_id] ?? 0) + d.runs_off_bat + d.extra_value;
    if (d.legal_ball) {
      bowlerLegalBalls[d.bowler_id] = (bowlerLegalBalls[d.bowler_id] ?? 0) + 1;
    }

    if (d.is_wicket) {
      wickets++;
      pairWickets[d.pair_id] = (pairWickets[d.pair_id] ?? 0) + 1;
      batterDismissals[strikerId] = (batterDismissals[strikerId] ?? 0) + 1;
      bowlerWickets[d.bowler_id] = (bowlerWickets[d.bowler_id] ?? 0) + 1;
      fallOfWickets.push({
        total,
        wicket_num: wickets,
        over_display: `${d.over_number + 1}.${d.ball_in_over + 1}`,
        pair_id: d.pair_id,
        player_id: strikerId,
      });
    }
  }

  const bowlerOvers: Record<string, number> = {};
  const bowlerExtraBalls: Record<string, number> = {};
  for (const [id, balls] of Object.entries(bowlerLegalBalls)) {
    bowlerOvers[id] = Math.floor(balls / settings.balls_per_over);
    bowlerExtraBalls[id] = balls % settings.balls_per_over;
  }

  // This-over balls for live display
  const thisOverBalls = currentPair
    ? active.filter(
        d => d.pair_id === currentPair.id && d.over_number === absoluteOver &&
             d.extra_type !== 'strike_override'
      )
    : [];

  const nextBall: DerivedMatchState['next_ball'] = {
    pair_index: pairIndex,
    over_number: absoluteOver,
    ball_in_over: currentBallInOver,
    is_final_ball:
      pairIndex === settings.num_pairs - 1 &&
      overWithinPair === settings.overs_per_pair - 1 &&
      currentBallInOver === settings.balls_per_over - 1,
    is_last_ball_of_over: currentBallInOver === settings.balls_per_over - 1,
    is_last_ball_of_pair_set:
      overWithinPair === settings.overs_per_pair - 1 &&
      currentBallInOver === settings.balls_per_over - 1,
  };

  return {
    total,
    wickets,
    pair_index: pairIndex,
    current_absolute_over: absoluteOver,
    current_ball: currentBallInOver,
    balls_in_pair_set: legalBallsInPairSet,
    over_within_pair: overWithinPair,
    striker_id: strikerId,
    non_striker_id: nonStrikerId,
    this_over_balls: thisOverBalls,
    is_complete: isComplete,
    awaiting_rebowl: awaitingRebowl,
    next_ball: nextBall,
    bowler_overs: bowlerOvers,
    bowler_extra_balls: bowlerExtraBalls,
    pair_totals: pairTotals,
    batter_runs: batterRuns,
    batter_balls: batterBalls,
    batter_dismissals: batterDismissals,
    batter_fours: batterFours,
    batter_sixes: batterSixes,
    bowler_runs: bowlerRuns,
    bowler_wickets: bowlerWickets,
    fall_of_wickets: fallOfWickets,
    current_pair: currentPair,
    per_over_runs: perOverRuns,
    pair_balls: pairBalls,
    pair_wickets: pairWickets,
  };
}

// Reconstruct each pair's two players directly from the deliveries.
// Every delivery stores striker_id + non_striker_id, so the actual pairing
// can be rebuilt without relying on the pairs table being synced.
// Used by viewers (cross-device) where only deliveries are available.
export function reconstructPairs(deliveries: Delivery[], fallbackPairs: Pair[]): Pair[] {
  const sorted = [...deliveries]
    .filter(d => !d.is_deleted && d.extra_type !== 'strike_override')
    .sort((a, b) => a.sequence_number - b.sequence_number);

  const rebuilt = new Map<string, Pair>();
  for (const d of sorted) {
    if (rebuilt.has(d.pair_id)) continue;
    if (!d.striker_id || !d.non_striker_id) continue;
    const fb = fallbackPairs.find(p => p.id === d.pair_id);
    rebuilt.set(d.pair_id, {
      id: d.pair_id,
      match_id: fb?.match_id ?? '',
      team_id: fb?.team_id ?? '',
      pair_number: fb?.pair_number ?? rebuilt.size + 1,
      player1_id: d.striker_id,
      player2_id: d.non_striker_id,
    });
  }

  if (rebuilt.size === 0) return fallbackPairs;
  // Use reconstructed pairs where players have batted; keep fallback for the rest.
  return fallbackPairs.map(p => rebuilt.get(p.id) ?? p);
}

export function computeNetRunEffect(
  runsOffBat: number,
  extraValue: number,
  isWicket: boolean,
  settings: MatchSettings
): number {
  return runsOffBat + extraValue + (isWicket ? settings.dismissal_penalty : 0);
}

// Returns the suggested strike_changed value for a delivery.
// The scorer can override this in the UI before confirming.
export function computeStrikeChanged(
  runsOffBat: number,
  isWicket: boolean,
  isEndOfOver: boolean,
  manualFlip: boolean
): boolean {
  let changes = 0;
  if (runsOffBat % 2 === 1) changes++;
  if (isWicket) changes++;
  if (isEndOfOver) changes++;
  if (manualFlip) changes++;
  return changes % 2 === 1;
}

// Whether THIS delivery requires a re-bowl if it's an extra.
// mustBeLegal = the delivery is the last ball of a pair's set (girls format rule).
export function shouldReBowl(
  extraType: string,
  mustBeLegal: boolean,
  settings: MatchSettings
): boolean {
  if (!settings.final_ball_must_be_legal) return false;
  if (!mustBeLegal) return false;
  return extraType === 'wide' || extraType === 'no_ball';
}

export function formatOvers(legalBalls: number, ballsPerOver: number): string {
  return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`;
}

export function runRate(total: number, legalBalls: number, ballsPerOver: number): string {
  if (legalBalls === 0) return '0.00';
  return ((total / legalBalls) * ballsPerOver).toFixed(2);
}

export function bowlerFigures(
  overs: number,
  extraBalls: number,
  runs: number,
  wickets: number
): string {
  const overStr = extraBalls > 0 ? `${overs}.${extraBalls}` : `${overs}`;
  return `${overStr}-${runs}-${wickets}`;
}
