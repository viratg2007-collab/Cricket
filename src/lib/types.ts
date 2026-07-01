export interface MatchSettings {
  overs_per_innings: number;
  overs_per_pair: number;
  num_pairs: number;
  balls_per_over: number;
  wide_value: number;
  no_ball_value: number;
  extras_count_as_ball: boolean;
  dismissal_penalty: number;
  max_overs_per_bowler: number;
  final_ball_must_be_legal: boolean;
  custom_rules: Record<string, unknown>;
}

export const DEFAULT_SETTINGS: MatchSettings = {
  overs_per_innings: 12,
  overs_per_pair: 2,
  num_pairs: 6,
  balls_per_over: 6,
  wide_value: 2,
  no_ball_value: 2,
  extras_count_as_ball: true,
  dismissal_penalty: -2,
  max_overs_per_bowler: 2,
  final_ball_must_be_legal: true,
  custom_rules: {},
};

export type ExtraType = 'none' | 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'strike_override';
export type WicketType = 'bowled' | 'caught' | 'run_out' | 'stumped' | 'hit_wicket' | 'lbw';
export type PlayerRole = 'batter' | 'bowler' | 'allrounder' | 'wicketkeeper';

export interface Player {
  id: string;
  team_id: string;
  name: string;
  jersey_number?: number;
  role: PlayerRole;
  is_captain: boolean;
}

export interface Team {
  id: string;
  name: string;
  short_name: string;
}

export interface Pair {
  id: string;
  match_id: string;
  team_id: string;
  pair_number: number;
  player1_id: string;
  player2_id: string;
}

export interface Match {
  id: string;
  home_team_id: string;
  away_team_id: string;
  settings: MatchSettings;
  status: 'scheduled' | 'live' | 'complete';
  name: string;
}

export interface Innings {
  id: string;
  match_id: string;
  innings_number: number;
  batting_team_id: string;
  bowling_team_id: string;
  status: 'not_started' | 'live' | 'complete';
}

export interface Delivery {
  id: string;
  innings_id: string;
  pair_id: string;
  over_number: number;
  ball_in_over: number;
  sequence_number: number;
  is_deleted: boolean;
  striker_id: string;
  non_striker_id: string;
  bowler_id: string;
  runs_off_bat: number;
  extra_type: ExtraType;
  extra_value: number;
  is_wicket: boolean;
  wicket_type?: WicketType;
  dismissed_player_id?: string;
  fielder_id?: string;
  net_run_effect: number;
  legal_ball: boolean;
  strike_changed: boolean;
  notes?: string;
  created_at: string;
}

export interface FallOfWicket {
  total: number;
  wicket_num: number;
  over_display: string;
  pair_id: string;
  player_id: string;
}

export interface BallPosition {
  pair_index: number;
  over_number: number;
  ball_in_over: number;
  is_final_ball: boolean;
  is_last_ball_of_over: boolean;
  is_last_ball_of_pair_set: boolean;
}

export interface DerivedMatchState {
  total: number;
  wickets: number;
  pair_index: number;
  current_absolute_over: number;
  current_ball: number;
  balls_in_pair_set: number;
  over_within_pair: number;
  striker_id: string;
  non_striker_id: string;
  this_over_balls: Delivery[];
  is_complete: boolean;
  awaiting_rebowl: boolean;
  // Phase 3 stats
  per_over_runs: Record<number, number>;  // absolute over → net runs that over
  pair_balls: Record<string, number>;     // pair_id → legal balls faced
  pair_wickets: Record<string, number>;   // pair_id → dismissals in pair set
  batter_fours: Record<string, number>;
  batter_sixes: Record<string, number>;
  next_ball: BallPosition;
  bowler_overs: Record<string, number>;
  bowler_extra_balls: Record<string, number>;
  pair_totals: Record<string, number>;
  batter_runs: Record<string, number>;
  batter_balls: Record<string, number>;
  batter_dismissals: Record<string, number>;
  bowler_runs: Record<string, number>;
  bowler_wickets: Record<string, number>;
  fall_of_wickets: FallOfWicket[];
  current_pair: Pair | null;
}
